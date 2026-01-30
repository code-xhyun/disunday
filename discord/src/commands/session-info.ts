import { ChannelType, type ThreadChannel } from 'discord.js'
import type { CommandContext } from './types.js'
import { getDatabase, getThreadWorktree } from '../database.js'
import {
  resolveTextChannel,
  getKimakiMetadata,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'

export async function handleSessionInfoCommand({
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

  const textChannel = await resolveTextChannel(channel as ThreadChannel)
  const { projectDirectory: directory } = getKimakiMetadata(textChannel)

  if (!directory) {
    await command.reply({
      content: 'Could not determine project directory for this channel',
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  const row = getDatabase()
    .prepare('SELECT session_id FROM thread_sessions WHERE thread_id = ?')
    .get(channel.id) as { session_id: string } | undefined

  if (!row?.session_id) {
    await command.reply({
      content: 'No active session in this thread',
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  const sessionId = row.session_id
  const worktreeInfo = getThreadWorktree(channel.id)
  const sdkDirectory =
    worktreeInfo?.status === 'ready' && worktreeInfo.worktree_directory
      ? worktreeInfo.worktree_directory
      : directory

  const terminalCmd = `opencode -s ${sessionId} ${sdkDirectory}`

  await command.reply({
    content: `📋 **Session Info**\n\n**Session ID:** \`${sessionId}\`\n**Directory:** \`${sdkDirectory}\`\n\n**Terminal command:**\n\`\`\`\n${terminalCmd}\n\`\`\``,
    flags: SILENT_MESSAGE_FLAGS,
  })
}
