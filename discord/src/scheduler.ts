import type { Client, TextChannel, ThreadChannel } from 'discord.js'
import { ChannelType } from 'discord.js'
import * as errore from 'errore'
import {
  getPendingSchedules,
  updateScheduleStatus,
  runScheduleMigrations,
  getChannelDirectory,
  getBotSettings,
} from './database.js'
import { handleOpencodeSession } from './session-handler.js'
import { sendThreadMessage, SILENT_MESSAGE_FLAGS } from './discord-utils.js'
import { createLogger, LogPrefix } from './logger.js'

const schedulerLogger = createLogger(LogPrefix.SESSION)

let schedulerInterval: NodeJS.Timeout | null = null

export function startScheduler(client: Client): void {
  runScheduleMigrations()

  if (schedulerInterval) {
    clearInterval(schedulerInterval)
  }

  schedulerInterval = setInterval(() => {
    void processSchedules(client)
  }, 10_000)

  schedulerLogger.log('[SCHEDULER] Started (checking every 10s)')
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    schedulerLogger.log('[SCHEDULER] Stopped')
  }
}

async function processSchedules(client: Client): Promise<void> {
  const pendingSchedules = getPendingSchedules()

  for (const schedule of pendingSchedules) {
    schedulerLogger.log(`[SCHEDULER] Processing schedule #${schedule.id}`)

    const result = await errore.tryAsync(async () => {
      const targetChannelId = schedule.thread_id || schedule.channel_id
      const channel = await client.channels.fetch(targetChannelId)

      if (!channel) {
        throw new Error(`Channel ${targetChannelId} not found`)
      }

      const isThread = [
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.AnnouncementThread,
      ].includes(channel.type)

      if (isThread) {
        const thread = channel as ThreadChannel
        const parentId = thread.parentId

        if (!parentId) {
          throw new Error('Thread has no parent channel')
        }

        const channelConfig = getChannelDirectory(parentId)
        if (!channelConfig?.directory) {
          throw new Error(`No project directory configured for channel ${parentId}`)
        }

        await sendThreadMessage(
          thread,
          `⏰ **Scheduled message** (from <@${schedule.created_by}>):\n${schedule.prompt}`,
        )

        await handleOpencodeSession({
          prompt: schedule.prompt,
          thread,
          projectDirectory: channelConfig.directory,
          channelId: parentId,
        })
      } else if (channel.type === ChannelType.GuildText) {
        const textChannel = channel as TextChannel
        const channelConfig = getChannelDirectory(textChannel.id)

        if (!channelConfig?.directory) {
          throw new Error(`No project directory configured for channel ${textChannel.id}`)
        }

        const starterMessage = await textChannel.send({
          content: `⏰ **Scheduled** (from <@${schedule.created_by}>): ${schedule.prompt.slice(0, 100)}${schedule.prompt.length > 100 ? '...' : ''}`,
          flags: SILENT_MESSAGE_FLAGS,
        })

        const thread = await starterMessage.startThread({
          name: `Scheduled: ${schedule.prompt.slice(0, 50)}${schedule.prompt.length > 50 ? '...' : ''}`,
          autoArchiveDuration: 1440,
        })

        await handleOpencodeSession({
          prompt: schedule.prompt,
          thread,
          projectDirectory: channelConfig.directory,
          channelId: textChannel.id,
        })
      } else {
        throw new Error(`Unsupported channel type: ${channel.type}`)
      }
    })

    if (result instanceof Error) {
      schedulerLogger.error(`[SCHEDULER] Failed schedule #${schedule.id}:`, result)
      updateScheduleStatus(schedule.id, 'failed', result.message)
      await sendScheduleNotification(client, schedule, 'failed', result.message)
    } else {
      schedulerLogger.log(`[SCHEDULER] Completed schedule #${schedule.id}`)
      updateScheduleStatus(schedule.id, 'completed')
      await sendScheduleNotification(client, schedule, 'completed')
    }
  }
}

async function sendScheduleNotification(
  client: Client,
  schedule: { id: number; channel_id: string; prompt: string; created_by: string },
  status: 'completed' | 'failed',
  errorMessage?: string,
): Promise<void> {
  const appId = client.application?.id
  if (!appId) {
    return
  }

  const settings = getBotSettings(appId)
  if (!settings.hub_channel_id) {
    return
  }

  const hubChannel = await errore.tryAsync(() => {
    return client.channels.fetch(settings.hub_channel_id!)
  })

  if (hubChannel instanceof Error || !hubChannel?.isTextBased() || !('send' in hubChannel)) {
    return
  }

  const promptPreview = schedule.prompt.slice(0, 50) + (schedule.prompt.length > 50 ? '...' : '')
  const emoji = status === 'completed' ? '✅' : '❌'
  const statusText = status === 'completed' ? 'completed' : 'failed'

  const content = (() => {
    if (status === 'failed') {
      return `${emoji} Schedule **#${schedule.id}** ${statusText}\n📍 <#${schedule.channel_id}>\n💬 ${promptPreview}\n⚠️ ${errorMessage}`
    }
    return `${emoji} Schedule **#${schedule.id}** ${statusText}\n📍 <#${schedule.channel_id}>\n💬 ${promptPreview}`
  })()

  try {
    await hubChannel.send({ content, flags: SILENT_MESSAGE_FLAGS })
  } catch {}
}
