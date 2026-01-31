// Discord channel and category management.
// Creates and manages Kimaki project channels (text + voice pairs),
// extracts channel metadata from topic tags, and ensures category structure.

import {
  ChannelType,
  type CategoryChannel,
  type Guild,
  type TextChannel,
} from 'discord.js'
import path from 'node:path'
import { getDatabase, getChannelDirectory } from './database.js'

export async function ensureDisundayCategory(
  guild: Guild,
  botName?: string,
): Promise<CategoryChannel> {
  // Skip appending bot name if it's already "disunday" to avoid "Disunday disunday"
  const isDisundayBot = botName?.toLowerCase() === 'disunday'
  const categoryName =
    botName && !isDisundayBot ? `Disunday ${botName}` : 'Disunday'

  const existingCategory = guild.channels.cache.find(
    (channel): channel is CategoryChannel => {
      if (channel.type !== ChannelType.GuildCategory) {
        return false
      }

      return channel.name.toLowerCase() === categoryName.toLowerCase()
    },
  )

  if (existingCategory) {
    return existingCategory
  }

  return guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
  })
}

export async function ensureDisundayAudioCategory(
  guild: Guild,
  botName?: string,
): Promise<CategoryChannel> {
  // Skip appending bot name if it's already "disunday" to avoid "Disunday Audio disunday"
  const isDisundayBot = botName?.toLowerCase() === 'disunday'
  const categoryName =
    botName && !isDisundayBot ? `Disunday Audio ${botName}` : 'Disunday Audio'

  const existingCategory = guild.channels.cache.find(
    (channel): channel is CategoryChannel => {
      if (channel.type !== ChannelType.GuildCategory) {
        return false
      }

      return channel.name.toLowerCase() === categoryName.toLowerCase()
    },
  )

  if (existingCategory) {
    return existingCategory
  }

  return guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
  })
}

export async function createProjectChannels({
  guild,
  projectDirectory,
  appId,
  botName,
  enableVoiceChannels = false,
}: {
  guild: Guild
  projectDirectory: string
  appId: string
  botName?: string
  enableVoiceChannels?: boolean
}): Promise<{
  textChannelId: string
  voiceChannelId: string | null
  channelName: string
}> {
  const baseName = path.basename(projectDirectory)
  const channelName = `${baseName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 100)

  const disundayCategory = await ensureDisundayCategory(guild, botName)

  const textChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: disundayCategory,
    // Channel configuration is stored in SQLite, not in the topic
  })

  getDatabase()
    .prepare(
      'INSERT OR REPLACE INTO channel_directories (channel_id, directory, channel_type, app_id) VALUES (?, ?, ?, ?)',
    )
    .run(textChannel.id, projectDirectory, 'text', appId)

  let voiceChannelId: string | null = null

  if (enableVoiceChannels) {
    const disundayAudioCategory = await ensureDisundayAudioCategory(guild, botName)

    const voiceChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: disundayAudioCategory,
    })

    getDatabase()
      .prepare(
        'INSERT OR REPLACE INTO channel_directories (channel_id, directory, channel_type, app_id) VALUES (?, ?, ?, ?)',
      )
      .run(voiceChannel.id, projectDirectory, 'voice', appId)

    voiceChannelId = voiceChannel.id
  }

  return {
    textChannelId: textChannel.id,
    voiceChannelId,
    channelName,
  }
}

export type ChannelWithTags = {
  id: string
  name: string
  description: string | null
  disundayDirectory?: string
  disundayApp?: string
}

export async function getChannelsWithDescriptions(
  guild: Guild,
): Promise<ChannelWithTags[]> {
  const channels: ChannelWithTags[] = []

  guild.channels.cache
    .filter((channel) => channel.isTextBased())
    .forEach((channel) => {
      const textChannel = channel as TextChannel
      const description = textChannel.topic || null

      // Get channel config from database instead of parsing XML from topic
      const channelConfig = getChannelDirectory(textChannel.id)

      channels.push({
        id: textChannel.id,
        name: textChannel.name,
        description,
        disundayDirectory: channelConfig?.directory,
        disundayApp: channelConfig?.appId || undefined,
      })
    })

  return channels
}
