import { ChannelType, type ThreadChannel } from 'discord.js'
import type { CommandContext } from './types.js'
import { getDatabase, getThreadWorktree } from '../database.js'
import { initializeOpencodeForDirectory } from '../opencode.js'
import {
  resolveTextChannel,
  getDisundayMetadata,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { createLogger, LogPrefix } from '../logger.js'

const logger = createLogger(LogPrefix.SESSION)

export async function handleRenameCommand({
  command,
}: CommandContext): Promise<void> {
  const newTitle = command.options.getString('title', true)
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
      await command.editReply(`Failed to rename: ${getClient.message}`)
      return
    }

    await getClient().session.update({
      path: { id: sessionId },
      body: { title: newTitle },
      query: { directory: sdkDirectory },
    })

    await thread.setName(newTitle.slice(0, 100)).catch(() => {})

    await command.editReply(`✅ Session renamed to: **${newTitle}**`)
    logger.log(`[RENAME] Session ${sessionId} renamed to "${newTitle}"`)
  } catch (error) {
    logger.error('[RENAME] Error:', error)
    await command.editReply(
      `Failed to rename: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}
