import {
  ChannelType,
  ThreadAutoArchiveDuration,
  type TextChannel,
  type ThreadChannel,
} from 'discord.js'
import fs from 'node:fs'
import type { CommandContext, AutocompleteContext } from './types.js'
import { getDatabase, getChannelDirectory } from '../database.js'
import { initializeOpencodeForDirectory } from '../opencode.js'
import {
  sendThreadMessage,
  resolveTextChannel,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { collectLastAssistantParts } from '../message-formatting.js'
import { createLogger, LogPrefix } from '../logger.js'
import * as errore from 'errore'

const logger = createLogger(LogPrefix.RESUME)

type SessionInfo = { id: string; title: string; updated: number }
const sessionCache = new Map<
  string,
  { sessions: SessionInfo[]; timestamp: number }
>()
const CACHE_TTL = 30_000

export async function refreshSessionCache(
  projectDirectory: string,
): Promise<SessionInfo[]> {
  const getClient = await initializeOpencodeForDirectory(projectDirectory)
  if (getClient instanceof Error) {
    return []
  }

  try {
    const response = await getClient().session.list({
      query: { directory: projectDirectory },
    })
    const sessions: SessionInfo[] = (response.data || []).map((s) => ({
      id: s.id,
      title: s.title,
      updated: new Date(s.time.updated).getTime(),
    }))
    sessionCache.set(projectDirectory, { sessions, timestamp: Date.now() })
    return sessions
  } catch {
    return sessionCache.get(projectDirectory)?.sessions || []
  }
}

export async function handleResumeCommand({
  command,
  appId,
}: CommandContext): Promise<void> {
  await command.deferReply({ ephemeral: false })

  const sessionId = command.options.getString('session', true)

  if (sessionId === '__refresh__') {
    const channelConfig = getChannelDirectory(command.channelId)
    if (channelConfig?.directory) {
      await refreshSessionCache(channelConfig.directory)
    }
    await command.editReply(
      '🔄 Session list refreshed! Run `/resume` again to see updated list.',
    )
    return
  }

  if (sessionId.startsWith('__header_')) {
    await command.editReply('Please select a session, not a header.')
    return
  }

  const channel = command.channel

  const isThread =
    channel &&
    [
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
    ].includes(channel.type)

  if (isThread) {
    await command.editReply(
      'This command can only be used in project channels, not threads',
    )
    return
  }

  if (!channel || channel.type !== ChannelType.GuildText) {
    await command.editReply('This command can only be used in text channels')
    return
  }

  const textChannel = channel as TextChannel

  const channelConfig = getChannelDirectory(textChannel.id)
  const projectDirectory = channelConfig?.directory
  const channelAppId = channelConfig?.appId || undefined

  if (channelAppId && channelAppId !== appId) {
    await command.editReply('This channel is not configured for this bot')
    return
  }

  if (!projectDirectory) {
    await command.editReply(
      'This channel is not configured with a project directory',
    )
    return
  }

  if (!fs.existsSync(projectDirectory)) {
    await command.editReply(`Directory does not exist: ${projectDirectory}`)
    return
  }

  try {
    const getClient = await initializeOpencodeForDirectory(projectDirectory)
    if (getClient instanceof Error) {
      await command.editReply(getClient.message)
      return
    }

    const sessionResponse = await getClient().session.get({
      path: { id: sessionId },
    })

    if (!sessionResponse.data) {
      await command.editReply(
        `Session not found: \`${sessionId}\`\n\nMake sure the session ID is correct. You can find it with \`opencode session list\` in terminal.`,
      )
      return
    }

    const sessionTitle = sessionResponse.data.title

    const thread = await textChannel.threads.create({
      name: `Resume: ${sessionTitle}`.slice(0, 100),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: `Resuming session ${sessionId}`,
    })

    await thread.members.add(command.user.id)

    getDatabase()
      .prepare(
        'INSERT OR REPLACE INTO thread_sessions (thread_id, session_id) VALUES (?, ?)',
      )
      .run(thread.id, sessionId)

    logger.log(`[RESUME] Created thread ${thread.id} for session ${sessionId}`)

    const terminalCmd = `opencode -s ${sessionId} ${projectDirectory}`
    const sessionInfoContent = `📋 **Session Info**\n**ID:** \`${sessionId}\`\n**Terminal:**\n\`\`\`\n${terminalCmd}\n\`\`\``
    const infoMessage = await sendThreadMessage(thread, sessionInfoContent)
    await infoMessage.pin().catch(() => {})

    const messagesResponse = await getClient().session.messages({
      path: { id: sessionId },
    })

    if (!messagesResponse.data) {
      throw new Error('Failed to fetch session messages')
    }

    const messages = messagesResponse.data

    await command.editReply(
      `Resumed session "${sessionTitle}" in ${thread.toString()}`,
    )

    await sendThreadMessage(
      thread,
      `📂 **Resumed session:** ${sessionTitle}\n📅 **Created:** ${new Date(sessionResponse.data.time.created).toLocaleString()}\n\n*Loading ${messages.length} messages...*`,
    )

    const { partIds, content, skippedCount } = collectLastAssistantParts({
      messages,
    })

    if (skippedCount > 0) {
      await sendThreadMessage(
        thread,
        `*Skipped ${skippedCount} older assistant parts...*`,
      )
    }

    if (content.trim()) {
      const discordMessage = await sendThreadMessage(thread, content)

      const stmt = getDatabase().prepare(
        'INSERT OR REPLACE INTO part_messages (part_id, message_id, thread_id) VALUES (?, ?, ?)',
      )

      const transaction = getDatabase().transaction((ids: string[]) => {
        for (const partId of ids) {
          stmt.run(partId, discordMessage.id, thread.id)
        }
      })

      transaction(partIds)
    }

    const messageCount = messages.length

    await sendThreadMessage(
      thread,
      `✅ **Session resumed!** Loaded ${messageCount} messages.\n\nYou can now continue the conversation by sending messages in this thread.`,
    )
  } catch (error) {
    logger.error('[RESUME] Error:', error)
    await command.editReply(
      `Failed to resume session: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'older'

function getDateGroup(timestamp: number): DateGroup {
  const now = new Date()
  const date = new Date(timestamp)

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

  if (date >= todayStart) {
    return 'today'
  }
  if (date >= yesterdayStart) {
    return 'yesterday'
  }
  if (date >= weekStart) {
    return 'thisWeek'
  }
  return 'older'
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)

  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  if (hours < 24) {
    return `${hours}h ago`
  }

  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const GROUP_LABELS: Record<DateGroup, string> = {
  today: '📅 Today',
  yesterday: '📆 Yesterday',
  thisWeek: '🗓️ This Week',
  older: '📁 Older',
}

export async function handleResumeAutocomplete({
  interaction,
  appId,
}: AutocompleteContext): Promise<void> {
  const focusedValue = interaction.options.getFocused()

  let projectDirectory: string | undefined

  if (interaction.channel) {
    const textChannel = await resolveTextChannel(
      interaction.channel as TextChannel | ThreadChannel | null,
    )
    if (textChannel) {
      const channelConfig = getChannelDirectory(textChannel.id)
      if (channelConfig?.appId && channelConfig.appId !== appId) {
        await interaction.respond([])
        return
      }
      projectDirectory = channelConfig?.directory
    }
  }

  if (!projectDirectory) {
    await interaction.respond([])
    return
  }

  try {
    const cached = sessionCache.get(projectDirectory)
    let sessions: SessionInfo[]

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      sessions = cached.sessions
    } else {
      const timeoutPromise = new Promise<SessionInfo[]>((resolve) => {
        setTimeout(() => {
          resolve(cached?.sessions || [])
        }, 2000)
      })
      sessions = await Promise.race([
        refreshSessionCache(projectDirectory),
        timeoutPromise,
      ])
    }

    const filtered = sessions
      .filter((session) => {
        return session.title.toLowerCase().includes(focusedValue.toLowerCase())
      })
      .sort((a, b) => {
        return b.updated - a.updated
      })

    const grouped = new Map<DateGroup, SessionInfo[]>()
    for (const session of filtered) {
      const group = getDateGroup(session.updated)
      if (!grouped.has(group)) {
        grouped.set(group, [])
      }
      grouped.get(group)!.push(session)
    }

    const choices: { name: string; value: string }[] = [
      {
        name: '🔄 Refresh list (type session ID if not shown)',
        value: '__refresh__',
      },
    ]

    const groupOrder: DateGroup[] = ['today', 'yesterday', 'thisWeek', 'older']
    let totalItems = 1

    for (const group of groupOrder) {
      const groupSessions = grouped.get(group)
      if (!groupSessions || groupSessions.length === 0) {
        continue
      }

      if (totalItems >= 25) {
        break
      }

      choices.push({
        name: `── ${GROUP_LABELS[group]} ──`,
        value: `__header_${group}__`,
      })
      totalItems++

      for (const session of groupSessions) {
        if (totalItems >= 25) {
          break
        }

        const timeStr = formatRelativeTime(session.updated)
        const prefix = '   '
        const suffix = ` (${timeStr})`
        const maxTitleLength = 100 - prefix.length - suffix.length

        let title = session.title
        if (title.length > maxTitleLength) {
          title = title.slice(0, Math.max(0, maxTitleLength - 1)) + '…'
        }

        choices.push({
          name: `${prefix}${title}${suffix}`,
          value: session.id,
        })
        totalItems++
      }
    }

    await interaction.respond(choices)
  } catch (error) {
    logger.error('[AUTOCOMPLETE] Error fetching sessions:', error)
    await interaction.respond([]).catch(() => {})
  }
}
