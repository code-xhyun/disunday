// /run-config command - Configure notification settings for /run command.

import { ChannelType, type ThreadChannel } from 'discord.js'
import type { CommandContext } from './types.js'
import { getRunConfig, setRunConfig } from '../database.js'
import { resolveTextChannel, SILENT_MESSAGE_FLAGS } from '../discord-utils.js'

export async function handleRunConfigCommand({
  command,
}: CommandContext): Promise<void> {
  const channel = command.channel

  if (!channel) {
    await command.reply({
      content: 'This command can only be used in a channel',
      ephemeral: true,
    })
    return
  }

  const subcommand = command.options.getSubcommand()

  const isThread = [
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ].includes(channel.type)

  let channelId = channel.id
  if (isThread) {
    const textChannel = await resolveTextChannel(channel as ThreadChannel)
    if (textChannel) {
      channelId = textChannel.id
    }
  }

  const currentConfig = getRunConfig(channelId)

  if (subcommand === 'show') {
    const discordStatus = currentConfig.notify_discord ? '✅' : '❌'
    const systemStatus = currentConfig.notify_system ? '✅' : '❌'
    const webhookStatus = currentConfig.webhook_url
      ? `\`${currentConfig.webhook_url.slice(0, 30)}...\``
      : '(not set)'

    await command.reply({
      content: [
        '**Run Notification Settings**',
        '',
        `${discordStatus} Discord notifications`,
        `${systemStatus} System notifications`,
        `🔗 Webhook: ${webhookStatus}`,
      ].join('\n'),
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  if (subcommand === 'discord') {
    const enabled = command.options.getBoolean('enabled', true)
    setRunConfig(channelId, { notify_discord: enabled ? 1 : 0 })
    await command.reply({
      content: `${enabled ? '✅' : '❌'} Discord notifications ${enabled ? 'enabled' : 'disabled'}`,
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  if (subcommand === 'system') {
    const enabled = command.options.getBoolean('enabled', true)
    setRunConfig(channelId, { notify_system: enabled ? 1 : 0 })
    await command.reply({
      content: `${enabled ? '✅' : '❌'} System notifications ${enabled ? 'enabled' : 'disabled'}`,
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  if (subcommand === 'webhook') {
    const url = command.options.getString('url')
    setRunConfig(channelId, { webhook_url: url || null })
    await command.reply({
      content: url
        ? `🔗 Webhook URL set to \`${url.slice(0, 30)}...\``
        : '🔗 Webhook URL cleared',
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }
}
