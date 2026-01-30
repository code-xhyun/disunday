// /run command - Execute terminal commands directly from Discord.
// Supports immediate execution and background mode with dual notifications.

import {
  ChannelType,
  EmbedBuilder,
  type ThreadChannel,
  type TextChannel,
} from 'discord.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { CommandContext } from './types.js'
import { getChannelDirectory, getRunConfig } from '../database.js'
import {
  resolveTextChannel,
  SILENT_MESSAGE_FLAGS,
  NOTIFY_MESSAGE_FLAGS,
} from '../discord-utils.js'
import { getBashWhitelist } from '../config.js'
import { createLogger, LogPrefix } from '../logger.js'

const execAsync = promisify(exec)
const logger = createLogger(LogPrefix.DISCORD)

const MAX_TIMEOUT_MS = 300_000
const MAX_OUTPUT_LENGTH = 1900

const backgroundJobs = new Map<
  string,
  {
    command: string
    startTime: number
    threadId: string
    userId: string
  }
>()

function validateCommand(command: string): { valid: boolean; reason?: string } {
  const trimmed = command.trim()
  if (!trimmed) {
    return { valid: false, reason: 'Empty command' }
  }

  // Extract the base command (first word, handle paths)
  const firstWord = trimmed.split(/\s+/)[0] || ''
  const baseCommand = firstWord.split('/').pop() || firstWord

  const whitelist = getBashWhitelist()

  // Check if wildcard is allowed
  if (whitelist.includes('*')) {
    return { valid: true }
  }

  if (!whitelist.includes(baseCommand)) {
    return {
      valid: false,
      reason: `Command \`${baseCommand}\` is not in the whitelist.\nAllowed: ${whitelist.slice(0, 10).join(', ')}${whitelist.length > 10 ? '...' : ''}`,
    }
  }

  return { valid: true }
}

async function sendSystemNotification({
  title,
  message,
}: {
  title: string
  message: string
}): Promise<void> {
  if (process.platform === 'darwin') {
    const escapedTitle = title.replace(/"/g, '\\"')
    const escapedMessage = message.replace(/"/g, '\\"')
    try {
      await execAsync(
        `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}"'`,
      )
    } catch {
      // Ignore notification failures
    }
  }
  // Terminal bell
  process.stdout.write('\x07')
}

async function sendWebhook({
  url,
  payload,
}: {
  url: string
  payload: object
}): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Ignore webhook failures
  }
}

function createResultEmbed({
  command,
  stdout,
  stderr,
  exitCode,
  durationMs,
  background,
}: {
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
  background?: boolean
}): EmbedBuilder {
  const success = exitCode === 0
  const durationSec = (durationMs / 1000).toFixed(1)

  const embed = new EmbedBuilder()
    .setColor(success ? 0x00ff00 : 0xff0000)
    .setTitle(
      `${success ? '✅' : '❌'} ${background ? '[BG] ' : ''}${command.slice(0, 50)}${command.length > 50 ? '...' : ''}`,
    )
    .setFooter({ text: `Exit: ${exitCode ?? 'killed'} | ${durationSec}s` })
    .setTimestamp()

  const output = stdout || stderr || '(no output)'
  const truncated =
    output.length > MAX_OUTPUT_LENGTH
      ? output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (truncated)'
      : output

  embed.setDescription(`\`\`\`\n${truncated}\n\`\`\``)

  return embed
}

export async function handleRunCommand({
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

  // Get options
  const cmdString = command.options.getString('command', true)
  const background = command.options.getBoolean('background') ?? false
  const timeoutSec = command.options.getInteger('timeout') ?? 30
  const subdirectory = command.options.getString('directory')

  // Validate command against whitelist
  const validation = validateCommand(cmdString)
  if (!validation.valid) {
    await command.reply({
      content: `❌ ${validation.reason}`,
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  // Get project directory
  let projectDirectory: string | undefined

  const isThread = [
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ].includes(channel.type)

  if (isThread) {
    const textChannel = await resolveTextChannel(channel as ThreadChannel)
    if (textChannel) {
      const config = getChannelDirectory(textChannel.id)
      projectDirectory = config?.directory
    }
  } else if (channel.type === ChannelType.GuildText) {
    const config = getChannelDirectory(channel.id)
    projectDirectory = config?.directory
  }

  if (!projectDirectory) {
    await command.reply({
      content: 'Could not determine project directory for this channel',
      ephemeral: true,
      flags: SILENT_MESSAGE_FLAGS,
    })
    return
  }

  const cwd = subdirectory
    ? `${projectDirectory}/${subdirectory}`
    : projectDirectory

  const timeoutMs = Math.min(timeoutSec * 1000, MAX_TIMEOUT_MS)
  const runConfig = getRunConfig(channel.id)

  const sendableChannel = channel as TextChannel | ThreadChannel

  if (background) {
    await command.reply({
      content: `⏳ Running in background: \`${cmdString}\``,
      flags: SILENT_MESSAGE_FLAGS,
    })

    const jobId = `${channel.id}-${Date.now()}`
    backgroundJobs.set(jobId, {
      command: cmdString,
      startTime: Date.now(),
      threadId: channel.id,
      userId: command.user.id,
    })

    const startTime = Date.now()

    exec(
      cmdString,
      { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      async (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime
        const exitCode = error?.code ?? (error ? 1 : 0)

        backgroundJobs.delete(jobId)

        const embed = createResultEmbed({
          command: cmdString,
          stdout,
          stderr,
          exitCode,
          durationMs,
          background: true,
        })

        if (runConfig.notify_discord) {
          try {
            await sendableChannel.send({
              content: `<@${command.user.id}>`,
              embeds: [embed],
              flags: NOTIFY_MESSAGE_FLAGS,
            })
          } catch (e) {
            logger.error('Failed to send background result:', e)
          }
        }

        if (runConfig.notify_system) {
          const status = exitCode === 0 ? '✅ Success' : '❌ Failed'
          await sendSystemNotification({
            title: 'Kimaki',
            message: `${status}: ${cmdString.slice(0, 30)}`,
          })
        }

        if (runConfig.webhook_url) {
          await sendWebhook({
            url: runConfig.webhook_url,
            payload: {
              type: 'run_complete',
              command: cmdString,
              exitCode,
              durationMs,
              stdout: stdout.slice(0, 1000),
              stderr: stderr.slice(0, 1000),
              userId: command.user.id,
              channelId: channel.id,
            },
          })
        }
      },
    )
  } else {
    // Immediate execution
    await command.deferReply()

    const startTime = Date.now()

    try {
      const { stdout, stderr } = await execAsync(cmdString, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      })

      const durationMs = Date.now() - startTime
      const embed = createResultEmbed({
        command: cmdString,
        stdout,
        stderr,
        exitCode: 0,
        durationMs,
      })

      await command.editReply({ embeds: [embed] })
    } catch (error) {
      const durationMs = Date.now() - startTime
      const execError = error as {
        code?: number
        stdout?: string
        stderr?: string
        killed?: boolean
      }

      const embed = createResultEmbed({
        command: cmdString,
        stdout: execError.stdout || '',
        stderr:
          execError.stderr || (error instanceof Error ? error.message : ''),
        exitCode: execError.killed ? null : (execError.code ?? 1),
        durationMs,
      })

      await command.editReply({ embeds: [embed] })
    }
  }
}

export async function handleRunAutocomplete({
  interaction,
}: {
  interaction: {
    options: { getFocused: () => string }
    respond: (choices: { name: string; value: string }[]) => Promise<void>
  }
}): Promise<void> {
  const focused = interaction.options.getFocused()
  const whitelist = getBashWhitelist()

  const suggestions = whitelist
    .filter((cmd) => {
      return cmd.toLowerCase().startsWith(focused.toLowerCase())
    })
    .slice(0, 25)
    .map((cmd) => {
      return { name: cmd, value: cmd }
    })

  await interaction.respond(suggestions)
}
