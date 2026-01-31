import { ChannelType, type ThreadChannel, type TextChannel } from 'discord.js'
import type { CommandContext } from './types.js'
import { getDatabase, getThreadWorktree } from '../database.js'
import {
  resolveTextChannel,
  getDisundayMetadata,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { initializeOpencodeForDirectory } from '../opencode.js'

export async function handleStatusCommand({
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

  let sessionInfo = ''
  let worktreeInfo = ''
  let serverStatus = '🔴 Not connected'

  if (isThread) {
    const textChannel = await resolveTextChannel(channel as ThreadChannel)
    const { projectDirectory: directory } = getDisundayMetadata(textChannel)

    if (directory) {
      const row = getDatabase()
        .prepare('SELECT session_id FROM thread_sessions WHERE thread_id = ?')
        .get(channel.id) as { session_id: string } | undefined

      if (row?.session_id) {
        sessionInfo = `\n**Session ID:** \`${row.session_id}\``

        const worktree = getThreadWorktree(channel.id)
        if (worktree?.status === 'ready' && worktree.worktree_directory) {
          worktreeInfo = `\n**Worktree:** \`${worktree.worktree_directory}\``
        }
      }

      const getClient = await initializeOpencodeForDirectory(directory)
      if (!(getClient instanceof Error)) {
        try {
          await getClient().session.list({})
          serverStatus = '🟢 Connected'
        } catch {
          serverStatus = '🟡 Server error'
        }
      }
    }
  } else {
    const { projectDirectory: directory } = getDisundayMetadata(
      channel as TextChannel,
    )
    if (directory) {
      const getClient = await initializeOpencodeForDirectory(directory)
      if (!(getClient instanceof Error)) {
        try {
          await getClient().session.list({})
          serverStatus = '🟢 Connected'
        } catch {
          serverStatus = '🟡 Server error'
        }
      }
    }
  }

  const statusMessage = [
    '📊 **Bot Status**',
    '',
    `**OpenCode Server:** ${serverStatus}`,
    sessionInfo,
    worktreeInfo,
    '',
    `**Channel:** ${isThread ? 'Thread' : 'Channel'}`,
  ]
    .filter(Boolean)
    .join('\n')

  await command.reply({
    content: statusMessage,
    flags: SILENT_MESSAGE_FLAGS,
  })
}
