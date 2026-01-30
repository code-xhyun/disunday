import { ChannelType, type ThreadChannel, AttachmentBuilder } from 'discord.js'
import type { CommandContext } from './types.js'
import { getDatabase } from '../database.js'
import {
  resolveTextChannel,
  getKimakiMetadata,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { initializeOpencodeForDirectory } from '../opencode.js'

export async function handleExportCommand({
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

  await command.deferReply({ flags: SILENT_MESSAGE_FLAGS })

  const getClient = await initializeOpencodeForDirectory(directory)
  if (getClient instanceof Error) {
    await command.editReply({
      content: `Failed to export: ${getClient.message}`,
    })
    return
  }

  try {
    const [sessionResponse, messagesResponse] = await Promise.all([
      getClient().session.get({ path: { id: row.session_id } }),
      getClient().session.messages({ path: { id: row.session_id } }),
    ])

    const session = sessionResponse.data
    const messages = messagesResponse.data || []

    let markdown = `# Session Export\n\n`
    markdown += `**Session ID:** ${row.session_id}\n`
    markdown += `**Title:** ${session?.title || 'Untitled'}\n`
    markdown += `**Directory:** ${directory}\n`
    markdown += `**Messages:** ${messages.length}\n`
    markdown += `**Exported:** ${new Date().toISOString()}\n\n`
    markdown += `---\n\n`

    for (const msg of messages) {
      const role = msg.info.role === 'user' ? '👤 User' : '🤖 Assistant'
      markdown += `## ${role}\n\n`

      for (const part of msg.parts) {
        if (part.type === 'text' && 'text' in part && part.text) {
          markdown += part.text + '\n\n'
        } else if (part.type === 'reasoning' && 'text' in part && part.text) {
          markdown += `_Thinking: ${part.text}_\n\n`
        } else if (part.type === 'tool' && 'tool' in part) {
          markdown += `\`Tool: ${part.tool}\`\n\n`
        }
      }

      markdown += `---\n\n`
    }

    const attachment = new AttachmentBuilder(Buffer.from(markdown, 'utf-8'), {
      name: `session-${row.session_id.slice(0, 8)}.md`,
    })

    await command.editReply({
      content: '📄 **Session exported to Markdown**',
      files: [attachment],
    })
  } catch (error) {
    await command.editReply({
      content: `Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}
