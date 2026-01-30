import {
  ChatInputCommandInteraction,
  ChannelType,
  type ThreadChannel,
} from 'discord.js'
import {
  getChannelTheme,
  setChannelTheme,
  type ThemeType,
} from '../database.js'
import { createLogger, LogPrefix } from '../logger.js'

const themeLogger = createLogger(LogPrefix.THEME)

export async function handleThemeCommand({
  command,
  appId,
}: {
  command: ChatInputCommandInteraction
  appId: string
}): Promise<void> {
  themeLogger.log('[THEME] Command called')

  const channel = command.channel
  if (!channel) {
    await command.reply({
      content: 'Could not determine channel.',
      ephemeral: true,
    })
    return
  }

  const channelId = (() => {
    if (channel.type === ChannelType.GuildText) {
      return channel.id
    }
    if (
      channel.type === ChannelType.PublicThread ||
      channel.type === ChannelType.PrivateThread ||
      channel.type === ChannelType.AnnouncementThread
    ) {
      return (channel as ThreadChannel).parentId || channel.id
    }
    return channel.id
  })()

  const theme = command.options.getString('style', true) as ThemeType
  const currentTheme = getChannelTheme(channelId)

  if (currentTheme === theme) {
    await command.reply({
      content: `Theme is already set to **${theme}** for this channel.`,
      ephemeral: true,
    })
    return
  }

  setChannelTheme(channelId, theme)
  themeLogger.log(`[THEME] Set channel ${channelId} to ${theme}`)

  const description = (() => {
    switch (theme) {
      case 'minimal':
        return 'Minimal formatting with reduced bullets and no emoji. Thinking is hidden.'
      case 'detailed':
        return 'Rich formatting with emoji icons for different message types.'
      case 'plain':
        return 'Text-based formatting using brackets like [file], [tool], [edit].'
      default:
        return 'Default formatting with diamond bullets and emoji icons.'
    }
  })()

  await command.reply({
    content: `Theme set to **${theme}** for this channel.\n${description}\nThis is a per-channel setting and applies immediately, including any active sessions.`,
    ephemeral: true,
  })
}
