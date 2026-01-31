import {
  type MessageContextMenuCommandInteraction,
  ChannelType,
  ThreadAutoArchiveDuration,
  type ThreadChannel,
} from 'discord.js'
import * as errore from 'errore'
import { getDatabase } from '../database.js'
import { getKimakiMetadata, resolveTextChannel, SILENT_MESSAGE_FLAGS } from '../discord-utils.js'
import { createLogger, LogPrefix } from '../logger.js'
import { handleOpencodeSession } from '../session-handler.js'

const contextMenuLogger = createLogger(LogPrefix.INTERACTION)

export async function handleRetryContextMenu({
  interaction,
  appId,
}: {
  interaction: MessageContextMenuCommandInteraction
  appId: string
}): Promise<void> {
  const channel = interaction.channel
  if (!channel) {
    await interaction.reply({
      content: '❌ Could not access channel',
      ephemeral: true,
    })
    return
  }

  const isThread = [
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ].includes(channel.type)

  if (!isThread) {
    await interaction.reply({
      content: '❌ This command only works in session threads',
      ephemeral: true,
    })
    return
  }

  const thread = channel as ThreadChannel
  const message = interaction.targetMessage

  if (message.author.bot) {
    await interaction.reply({
      content: '❌ Cannot retry a bot message. Select a user message to retry.',
      ephemeral: true,
    })
    return
  }

  const prompt = message.content
  if (!prompt?.trim()) {
    await interaction.reply({
      content: '❌ Selected message has no text content',
      ephemeral: true,
    })
    return
  }

  const textChannel = await resolveTextChannel(thread)
  const { projectDirectory } = getKimakiMetadata(textChannel)

  if (!projectDirectory) {
    await interaction.reply({
      content: '❌ Could not find project directory for this channel',
      ephemeral: true,
    })
    return
  }

  await interaction.reply({
    content: `🔄 Retrying: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`,
    flags: SILENT_MESSAGE_FLAGS,
  })

  contextMenuLogger.log(`[CONTEXT-MENU] Retry triggered for message ${message.id}`)

  const result = await errore.tryAsync(() => {
    return handleOpencodeSession({
      prompt,
      thread,
      projectDirectory,
    })
  })

  if (result instanceof Error) {
    contextMenuLogger.error('[CONTEXT-MENU] Retry failed:', result)
  }
}

export async function handleForkContextMenu({
  interaction,
  appId,
}: {
  interaction: MessageContextMenuCommandInteraction
  appId: string
}): Promise<void> {
  const channel = interaction.channel
  if (!channel) {
    await interaction.reply({
      content: '❌ Could not access channel',
      ephemeral: true,
    })
    return
  }

  const isThread = [
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ].includes(channel.type)

  if (!isThread) {
    await interaction.reply({
      content: '❌ This command only works in session threads',
      ephemeral: true,
    })
    return
  }

  const thread = channel as ThreadChannel
  const message = interaction.targetMessage

  const textChannel = await resolveTextChannel(thread)
  const { projectDirectory } = getKimakiMetadata(textChannel)

  if (!projectDirectory) {
    await interaction.reply({
      content: '❌ Could not find project directory for this channel',
      ephemeral: true,
    })
    return
  }

  const row = getDatabase()
    .prepare('SELECT session_id FROM thread_sessions WHERE thread_id = ?')
    .get(thread.id) as { session_id: string } | undefined

  if (!row?.session_id) {
    await interaction.reply({
      content: '❌ No session found for this thread',
      ephemeral: true,
    })
    return
  }

  const partRow = getDatabase()
    .prepare('SELECT part_id FROM part_messages WHERE message_id = ?')
    .get(message.id) as { part_id: string } | undefined

  if (!partRow?.part_id) {
    await interaction.reply({
      content: '❌ This message is not linked to a session part. Select a message from the AI response.',
      ephemeral: true,
    })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const { initializeOpencodeForDirectory } = await import('../opencode.js')
  const getClient = await initializeOpencodeForDirectory(projectDirectory)

  if (getClient instanceof Error) {
    await interaction.editReply({
      content: `❌ ${getClient.message}`,
    })
    return
  }

  const forkResult = await errore.tryAsync(() => {
    return getClient().session.fork({
      path: { id: row.session_id },
      body: { messageID: partRow.part_id },
      query: { directory: projectDirectory },
    })
  })

  if (forkResult instanceof Error) {
    await interaction.editReply({
      content: `❌ Fork failed: ${forkResult.message}`,
    })
    return
  }

  const forkedSession = forkResult.data
  if (!forkedSession) {
    await interaction.editReply({
      content: '❌ Fork returned no session data',
    })
    return
  }

  const parentTextChannel = await resolveTextChannel(thread)
  if (!parentTextChannel) {
    await interaction.editReply({
      content: '❌ Could not find parent channel',
    })
    return
  }

  const newThread = await parentTextChannel.threads.create({
    name: `Fork: ${forkedSession.title || 'Untitled'}`.slice(0, 100),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    reason: 'Session fork via context menu',
  })

  getDatabase()
    .prepare(
      'INSERT OR REPLACE INTO thread_sessions (thread_id, session_id) VALUES (?, ?)',
    )
    .run(newThread.id, forkedSession.id)

  await interaction.editReply({
    content: `✅ Forked session to ${newThread}`,
  })

  contextMenuLogger.log(
    `[CONTEXT-MENU] Forked session ${row.session_id} to ${forkedSession.id} in thread ${newThread.id}`,
  )
}
