import {
  Events,
  type Client,
  type MessageReaction,
  type User,
  type PartialMessageReaction,
  type PartialUser,
  ChannelType,
  type ThreadChannel,
} from 'discord.js'
import * as errore from 'errore'
import { getDatabase } from './database.js'
import { abortSession } from './session-handler.js'
import { createLogger, LogPrefix } from './logger.js'
import { hasRequiredPermissions, getKimakiMetadata, resolveTextChannel } from './discord-utils.js'

const reactionLogger = createLogger(LogPrefix.REACTION)

const REACTION_COMMANDS = {
  '🔄': 'retry',
  '❌': 'abort',
  '📌': 'pin',
} as const

type ReactionCommand = (typeof REACTION_COMMANDS)[keyof typeof REACTION_COMMANDS]

export function registerReactionHandler({
  discordClient,
  appId,
}: {
  discordClient: Client
  appId: string
}): void {
  discordClient.on(
    Events.MessageReactionAdd,
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) => {
      try {
        if (user.bot) {
          return
        }

        if (reaction.partial) {
          const fetched = await errore.tryAsync(() => reaction.fetch())
          if (fetched instanceof Error) {
            return
          }
          reaction = fetched
        }

        const emoji = reaction.emoji.name
        if (!emoji || !(emoji in REACTION_COMMANDS)) {
          return
        }

        const command = REACTION_COMMANDS[emoji as keyof typeof REACTION_COMMANDS]
        const message = reaction.message

        if (message.partial) {
          const fetched = await errore.tryAsync(() => message.fetch())
          if (fetched instanceof Error) {
            return
          }
        }

        const channel = message.channel
        const isThread = [
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread,
        ].includes(channel.type)

        if (!isThread) {
          return
        }

        const thread = channel as ThreadChannel
        const member = await errore.tryAsync(() =>
          thread.guild.members.fetch(user.id),
        )
        if (member instanceof Error) {
          return
        }

        const hasPerms = hasRequiredPermissions(member, thread.guild)
        if (!hasPerms) {
          return
        }

        reactionLogger.log(
          `[REACTION] ${command} triggered by ${user.username} in thread ${thread.id}`,
        )

        switch (command) {
          case 'abort':
            await handleAbortReaction(thread, appId)
            break
          case 'retry':
            await handleRetryReaction(thread, message, appId)
            break
          case 'pin':
            await handlePinReaction(message)
            break
        }

        await reaction.users.remove(user.id).catch(() => {})
      } catch (error) {
        reactionLogger.error('[REACTION] Error handling reaction:', error)
      }
    },
  )

  reactionLogger.log('[REACTION] Handler registered')
}

async function handleAbortReaction(
  thread: ThreadChannel,
  appId: string,
): Promise<void> {
  const row = getDatabase()
    .prepare('SELECT session_id FROM thread_sessions WHERE thread_id = ?')
    .get(thread.id) as { session_id: string } | undefined

  if (!row?.session_id) {
    return
  }

  const aborted = abortSession(row.session_id)
  if (aborted) {
    await thread.send('⏹️ Session aborted via reaction')
    reactionLogger.log(`[REACTION] Aborted session ${row.session_id}`)
  }
}

async function handleRetryReaction(
  thread: ThreadChannel,
  message: any,
  appId: string,
): Promise<void> {
  const textChannel = await resolveTextChannel(thread)
  const { projectDirectory } = getKimakiMetadata(textChannel)

  if (!projectDirectory) {
    return
  }

  const row = getDatabase()
    .prepare(
      `SELECT session_id FROM thread_sessions WHERE thread_id = ?`,
    )
    .get(thread.id) as { session_id: string } | undefined

  if (!row?.session_id) {
    return
  }

  const lastUserMessage = await findLastUserMessage(thread)
  if (!lastUserMessage) {
    await thread.send('❌ No previous message to retry')
    return
  }

  const { handleOpencodeSession } = await import('./session-handler.js')
  await thread.send(`🔄 Retrying: "${lastUserMessage.slice(0, 50)}${lastUserMessage.length > 50 ? '...' : ''}"`)

  await handleOpencodeSession({
    prompt: lastUserMessage,
    thread,
    projectDirectory,
  })
}

async function handlePinReaction(message: any): Promise<void> {
  const pinResult = await errore.tryAsync(() => message.pin())
  if (pinResult instanceof Error) {
    reactionLogger.log(`[REACTION] Could not pin message: ${pinResult.message}`)
  } else {
    reactionLogger.log(`[REACTION] Pinned message ${message.id}`)
  }
}

async function findLastUserMessage(thread: ThreadChannel): Promise<string | null> {
  const messages = await thread.messages.fetch({ limit: 20 })
  const userMessages = messages.filter((m) => !m.author.bot && m.content?.trim())
  const lastUserMsg = userMessages.first()
  return lastUserMsg?.content || null
}
