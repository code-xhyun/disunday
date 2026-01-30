import {
  ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
} from 'discord.js'
import { getBotSettings, setBotSettings } from '../database.js'
import { createLogger, LogPrefix } from '../logger.js'

const settingsLogger = createLogger(LogPrefix.SETTINGS)

export async function handleSettingsCommand({
  command,
  appId,
}: {
  command: ChatInputCommandInteraction
  appId: string
}): Promise<void> {
  const subcommand = command.options.getSubcommand()

  switch (subcommand) {
    case 'hub-channel': {
      await handleHubChannelSetting({ command, appId })
      return
    }
    case 'view': {
      await handleViewSettings({ command, appId })
      return
    }
    default: {
      await command.reply({
        content: `Unknown setting: ${subcommand}`,
        ephemeral: true,
      })
    }
  }
}

async function handleHubChannelSetting({
  command,
  appId,
}: {
  command: ChatInputCommandInteraction
  appId: string
}): Promise<void> {
  const channel = command.options.getChannel('channel')
  const clear = command.options.getBoolean('clear')

  if (clear) {
    setBotSettings(appId, { hub_channel_id: null })
    settingsLogger.log(`[SETTINGS] Cleared hub channel for app ${appId}`)
    await command.reply({
      content: '✓ Hub channel cleared. Session completion notifications will no longer be sent to a central channel.',
      ephemeral: true,
    })
    return
  }

  if (!channel) {
    const currentSettings = getBotSettings(appId)
    if (currentSettings.hub_channel_id) {
      await command.reply({
        content: `Current hub channel: <#${currentSettings.hub_channel_id}>`,
        ephemeral: true,
      })
    } else {
      await command.reply({
        content: 'No hub channel configured. Use `/settings hub-channel channel:#channel` to set one.',
        ephemeral: true,
      })
    }
    return
  }

  if (channel.type !== ChannelType.GuildText) {
    await command.reply({
      content: 'Hub channel must be a text channel.',
      ephemeral: true,
    })
    return
  }

  setBotSettings(appId, { hub_channel_id: channel.id })
  settingsLogger.log(`[SETTINGS] Set hub channel to ${channel.id} for app ${appId}`)

  await command.reply({
    content: `✓ Hub channel set to <#${channel.id}>.\nSession completion notifications will be sent here.`,
    ephemeral: true,
  })
}

async function handleViewSettings({
  command,
  appId,
}: {
  command: ChatInputCommandInteraction
  appId: string
}): Promise<void> {
  const settings = getBotSettings(appId)

  const embed = new EmbedBuilder()
    .setTitle('Bot Settings')
    .setColor(0x5865f2)
    .addFields({
      name: 'Hub Channel',
      value: settings.hub_channel_id
        ? `<#${settings.hub_channel_id}>`
        : '_Not configured_',
      inline: true,
    })
    .setFooter({ text: `App ID: ${appId}` })
    .setTimestamp()

  await command.reply({
    embeds: [embed],
    ephemeral: true,
  })
}
