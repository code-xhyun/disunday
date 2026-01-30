import { ChannelType, type ThreadChannel } from 'discord.js'
import type { CommandContext } from './types.js'
import { getDatabase } from '../database.js'
import {
  resolveTextChannel,
  getKimakiMetadata,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { initializeOpencodeForDirectory } from '../opencode.js'

export async function handleContextCommand({
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

  const getClient = await initializeOpencodeForDirectory(directory)
  if (getClient instanceof Error) {
    await command.reply({
      content: `Failed to get context: ${getClient.message}`,
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  try {
    const messagesResponse = await getClient().session.messages({
      path: { id: row.session_id },
    })

    const messages = messagesResponse.data || []
    const messageCount = messages.length
    const userMessages = messages.filter((m) => m.info.role === 'user').length
    const assistantMessages = messages.filter(
      (m) => m.info.role === 'assistant',
    ).length

    const contextMessage = [
      '📊 **Context Usage**',
      '',
      `**Session:** \`${row.session_id.slice(0, 8)}...\``,
      `**Total Messages:** ${messageCount}`,
      `**User:** ${userMessages} | **Assistant:** ${assistantMessages}`,
      '',
      messageCount > 50
        ? '⚠️ Consider using `/compact` to reduce context'
        : '✅ Context size is healthy',
    ].join('\n')

    await command.reply({
      content: contextMessage,
      flags: SILENT_MESSAGE_FLAGS,
    })
  } catch (error) {
    await command.reply({
      content: `Failed to get context: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
  }
}
