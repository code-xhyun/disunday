import { ChannelType, type ThreadChannel, type TextChannel } from 'discord.js'
import type { CommandContext } from './types.js'
import {
  resolveTextChannel,
  getDisundayMetadata,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { getThreadWorktree } from '../database.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export async function handleFilesCommand({
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

  let directory: string | undefined

  if (isThread) {
    const textChannel = await resolveTextChannel(channel as ThreadChannel)
    const metadata = getDisundayMetadata(textChannel)
    directory = metadata.projectDirectory

    const worktree = getThreadWorktree(channel.id)
    if (worktree?.status === 'ready' && worktree.worktree_directory) {
      directory = worktree.worktree_directory
    }
  } else {
    const metadata = getDisundayMetadata(channel as TextChannel)
    directory = metadata.projectDirectory
  }

  if (!directory) {
    await command.reply({
      content: 'Could not determine project directory for this channel',
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  try {
    const { stdout } = await execAsync('git ls-files | head -50', {
      cwd: directory,
      maxBuffer: 1024 * 1024,
    })

    const files = stdout.trim().split('\n').filter(Boolean)
    const fileCount = files.length

    let message = `📁 **Project Files** (\`${directory}\`)\n\n`

    if (fileCount === 0) {
      message += '_No tracked files found_'
    } else {
      message += '```\n' + files.join('\n') + '\n```'
      if (fileCount === 50) {
        message += '\n_Showing first 50 files_'
      }
    }

    await command.reply({
      content: message.slice(0, 2000),
      flags: SILENT_MESSAGE_FLAGS,
    })
  } catch (error) {
    await command.reply({
      content: `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
  }
}
