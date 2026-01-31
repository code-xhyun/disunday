import { ChannelType, type ThreadChannel } from 'discord.js'
import type { CommandContext } from './types.js'
import { getDatabase, getThreadWorktree } from '../database.js'
import { initializeOpencodeForDirectory } from '../opencode.js'
import {
  resolveTextChannel,
  getDisundayMetadata,
  sendThreadMessage,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { collectLastAssistantParts } from '../message-formatting.js'
import { createLogger, LogPrefix } from '../logger.js'

const logger = createLogger(LogPrefix.SESSION)

export async function handleSyncCommand({
  command,
}: CommandContext): Promise<void> {
  const channel = command.channel

  if (!channel) {
    await command.reply({
      content: 'This command can only be used in a channel',
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  const isThread = [
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ].includes(channel.type)

  if (!isThread) {
    await command.reply({
      content:
        'This command can only be used in a thread with an active session',
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  await command.deferReply({ flags: SILENT_MESSAGE_FLAGS })

  const thread = channel as ThreadChannel
  const textChannel = await resolveTextChannel(thread)
  const { projectDirectory: directory } = getDisundayMetadata(textChannel)

  if (!directory) {
    await command.editReply(
      'Could not determine project directory for this channel',
    )
    return
  }

  const row = getDatabase()
    .prepare('SELECT session_id FROM thread_sessions WHERE thread_id = ?')
    .get(channel.id) as { session_id: string } | undefined

  if (!row?.session_id) {
    await command.editReply('No active session in this thread')
    return
  }

  const sessionId = row.session_id
  const worktreeInfo = getThreadWorktree(channel.id)
  const sdkDirectory =
    worktreeInfo?.status === 'ready' && worktreeInfo.worktree_directory
      ? worktreeInfo.worktree_directory
      : directory

  try {
    const getClient = await initializeOpencodeForDirectory(directory)
    if (getClient instanceof Error) {
      await command.editReply(`Failed to sync: ${getClient.message}`)
      return
    }

    const [sessionResponse, messagesResponse] = await Promise.all([
      getClient().session.get({
        path: { id: sessionId },
        query: { directory: sdkDirectory },
      }),
      getClient().session.messages({
        path: { id: sessionId },
        query: { directory: sdkDirectory },
      }),
    ])

    const sessionTitle = sessionResponse.data?.title
    const originalThreadName = thread.name
    let wasRenamed = false

    logger.log(
      `[SYNC] Session title: "${sessionTitle}", Thread name: "${originalThreadName}"`,
    )

    if (sessionTitle && sessionTitle !== originalThreadName) {
      const renameResult = await thread
        .setName(sessionTitle.slice(0, 100))
        .then(() => true)
        .catch((err) => {
          logger.error(`[SYNC] Failed to rename thread: ${err}`)
          return false
        })
      wasRenamed = renameResult
      if (wasRenamed) {
        logger.log(
          `[SYNC] Updated thread name to "${sessionTitle}" for session ${sessionId}`,
        )
      }
    }

    if (!messagesResponse.data) {
      await command.editReply('Failed to fetch session messages')
      return
    }

    const messages = messagesResponse.data

    const { partIds, content, skippedCount } = collectLastAssistantParts({
      messages,
      limit: 3,
    })

    if (!content.trim()) {
      const titleNote = wasRenamed
        ? ` (thread renamed to "${sessionTitle}")`
        : ''
      await command.editReply(
        `No recent assistant messages to sync${titleNote}`,
      )
      return
    }

    const titleNote = wasRenamed ? ` | renamed to "${sessionTitle}"` : ''
    await command.editReply(
      `🔄 **Synced from terminal** (${messages.length} total messages${titleNote})`,
    )

    if (skippedCount > 0) {
      await sendThreadMessage(
        thread,
        `*Skipped ${skippedCount} older assistant parts...*`,
      )
    }

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

    logger.log(
      `[SYNC] Synced ${partIds.length} parts from session ${sessionId}`,
    )
  } catch (error) {
    logger.error('[SYNC] Error:', error)
    await command.editReply(
      `Failed to sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}
