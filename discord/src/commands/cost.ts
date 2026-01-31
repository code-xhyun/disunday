import { ChannelType, type ThreadChannel } from 'discord.js'
import type { CommandContext } from './types.js'
import { getDatabase } from '../database.js'
import {
  resolveTextChannel,
  getDisundayMetadata,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { initializeOpencodeForDirectory } from '../opencode.js'

export async function handleCostCommand({
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
  const { projectDirectory: directory } = getDisundayMetadata(textChannel)

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
      content: `Failed to get cost: ${getClient.message}`,
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
    const assistantMessages = messages.filter(
      (m) => m.info.role === 'assistant',
    ).length

    const estimatedInputTokens = messageCount * 500
    const estimatedOutputTokens = assistantMessages * 1000

    const inputCost = (estimatedInputTokens / 1_000_000) * 3
    const outputCost = (estimatedOutputTokens / 1_000_000) * 15
    const totalCost = inputCost + outputCost

    const costMessage = [
      '💰 **Session Cost Estimate**',
      '',
      `**Messages:** ${messageCount}`,
      `**Est. Input Tokens:** ~${estimatedInputTokens.toLocaleString()}`,
      `**Est. Output Tokens:** ~${estimatedOutputTokens.toLocaleString()}`,
      '',
      `**Estimated Cost:** ~$${totalCost.toFixed(4)}`,
      '',
      '_Based on Claude Sonnet pricing ($3/M input, $15/M output)_',
    ].join('\n')

    await command.reply({
      content: costMessage,
      flags: SILENT_MESSAGE_FLAGS,
    })
  } catch (error) {
    await command.reply({
      content: `Failed to get cost: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
  }
}
