import { ChannelType, type ThreadChannel, type TextChannel } from 'discord.js'
import type { CommandContext } from './types.js'
import {
  resolveTextChannel,
  getKimakiMetadata,
  SILENT_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { getThreadWorktree } from '../database.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export async function handleDiffCommand({
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
    const metadata = getKimakiMetadata(textChannel)
    directory = metadata.projectDirectory

    const worktree = getThreadWorktree(channel.id)
    if (worktree?.status === 'ready' && worktree.worktree_directory) {
      directory = worktree.worktree_directory
    }
  } else {
    const metadata = getKimakiMetadata(channel as TextChannel)
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
    const { stdout: diffOutput } = await execAsync(
      'git diff --stat HEAD~5..HEAD 2>/dev/null || git diff --stat',
      {
        cwd: directory,
        maxBuffer: 1024 * 1024,
      },
    )

    const { stdout: statusOutput } = await execAsync('git status --short', {
      cwd: directory,
      maxBuffer: 1024 * 1024,
    })

    let message = '📝 **Recent Changes**\n\n'

    if (statusOutput.trim()) {
      message +=
        '**Uncommitted:**\n```\n' + statusOutput.slice(0, 500) + '\n```\n\n'
    }

    if (diffOutput.trim()) {
      message +=
        '**Last 5 commits:**\n```\n' + diffOutput.slice(0, 800) + '\n```'
    }

    if (!statusOutput.trim() && !diffOutput.trim()) {
      message = '📝 **No recent changes**\n\nWorking directory is clean.'
    }

    await command.reply({
      content: message.slice(0, 2000),
      flags: SILENT_MESSAGE_FLAGS,
    })
  } catch (error) {
    await command.reply({
      content: `Failed to get diff: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
  }
}
