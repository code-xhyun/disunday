import type { ChatInputCommandInteraction, ThreadChannel } from 'discord.js'
import {
  createScheduledMessage,
  getSchedulesByChannel,
  getScheduleById,
  cancelSchedule,
} from '../database.js'
import { SILENT_MESSAGE_FLAGS } from '../discord-utils.js'
import { createLogger, LogPrefix } from '../logger.js'

const scheduleLogger = createLogger(LogPrefix.INTERACTION)

function parseTimeInput(input: string): number | null {
  const now = Date.now()

  const relativeMatch = input.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i)
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1]!, 10)
    const unit = relativeMatch[2]!.toLowerCase()

    const multipliers: Record<string, number> = {
      s: 1000,
      sec: 1000,
      second: 1000,
      seconds: 1000,
      m: 60 * 1000,
      min: 60 * 1000,
      minute: 60 * 1000,
      minutes: 60 * 1000,
      h: 60 * 60 * 1000,
      hr: 60 * 60 * 1000,
      hour: 60 * 60 * 1000,
      hours: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
    }

    const multiplier = multipliers[unit]
    if (multiplier) {
      return now + value * multiplier
    }
  }

  const timeMatch = input.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i)
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]!, 10)
    const minutes = parseInt(timeMatch[2]!, 10)
    const meridiem = timeMatch[3]?.toLowerCase()

    if (meridiem === 'pm' && hours < 12) {
      hours += 12
    }
    if (meridiem === 'am' && hours === 12) {
      hours = 0
    }

    const target = new Date()
    target.setHours(hours, minutes, 0, 0)

    if (target.getTime() <= now) {
      target.setDate(target.getDate() + 1)
    }

    return target.getTime()
  }

  return null
}

function formatScheduleTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = Date.now()
  const diff = timestamp - now

  const relative = (() => {
    if (diff < 60000) {
      return `${Math.ceil(diff / 1000)}s`
    }
    if (diff < 3600000) {
      return `${Math.ceil(diff / 60000)}m`
    }
    if (diff < 86400000) {
      return `${Math.ceil(diff / 3600000)}h`
    }
    return `${Math.ceil(diff / 86400000)}d`
  })()

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return `${timeStr} (in ${relative})`
}

export async function handleScheduleCommand({
  command,
  appId,
}: {
  command: ChatInputCommandInteraction
  appId: string
}): Promise<void> {
  const subcommand = command.options.getSubcommand()

  switch (subcommand) {
    case 'add': {
      const prompt = command.options.getString('prompt', true)
      const time = command.options.getString('time', true)

      const scheduledAt = parseTimeInput(time)
      if (!scheduledAt) {
        await command.reply({
          content: `❌ Invalid time format. Use:\n• Relative: \`30m\`, \`2h\`, \`1d\`\n• Absolute: \`3:00pm\`, \`14:30\``,
          ephemeral: true,
        })
        return
      }

      if (scheduledAt <= Date.now()) {
        await command.reply({
          content: '❌ Scheduled time must be in the future',
          ephemeral: true,
        })
        return
      }

      const channelId = command.channelId
      const isThread = command.channel?.isThread()
      const threadId = isThread ? command.channelId : undefined
      const parentChannelId = isThread ? (command.channel as ThreadChannel).parentId : null

      const id = createScheduledMessage({
        channelId: parentChannelId || channelId,
        threadId,
        prompt,
        scheduledAt,
        createdBy: command.user.id,
      })

      scheduleLogger.log(
        `[SCHEDULE] Created schedule #${id} for ${formatScheduleTime(scheduledAt)}`,
      )

      await command.reply({
        content: `⏰ Scheduled **#${id}** for ${formatScheduleTime(scheduledAt)}\n\`\`\`\n${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}\n\`\`\``,
        flags: SILENT_MESSAGE_FLAGS,
      })
      return
    }

    case 'list': {
      const channelId = command.channelId
      const schedules = getSchedulesByChannel(channelId)

      if (schedules.length === 0) {
        await command.reply({
          content: '📭 No pending schedules in this channel',
          ephemeral: true,
        })
        return
      }

      const lines = schedules.map((s) => {
        const time = formatScheduleTime(s.scheduled_at)
        const preview = s.prompt.slice(0, 40) + (s.prompt.length > 40 ? '...' : '')
        return `**#${s.id}** ${time}\n└ ${preview}`
      })

      await command.reply({
        content: `📋 **Pending Schedules**\n\n${lines.join('\n\n')}`,
        ephemeral: true,
      })
      return
    }

    case 'cancel': {
      const id = command.options.getInteger('id', true)
      const schedule = getScheduleById(id)

      if (!schedule) {
        await command.reply({
          content: `❌ Schedule #${id} not found`,
          ephemeral: true,
        })
        return
      }

      if (schedule.status !== 'pending') {
        await command.reply({
          content: `❌ Schedule #${id} is already ${schedule.status}`,
          ephemeral: true,
        })
        return
      }

      const cancelled = cancelSchedule(id, command.user.id)
      if (cancelled) {
        scheduleLogger.log(`[SCHEDULE] Cancelled schedule #${id}`)
        await command.reply({
          content: `✅ Cancelled schedule **#${id}**`,
          flags: SILENT_MESSAGE_FLAGS,
        })
      } else {
        await command.reply({
          content: `❌ Failed to cancel schedule #${id}`,
          ephemeral: true,
        })
      }
      return
    }
  }
}
