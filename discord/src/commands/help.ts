import type { CommandContext } from './types.js'
import { SILENT_MESSAGE_FLAGS } from '../discord-utils.js'

export async function handleHelpCommand({
  command,
}: CommandContext): Promise<void> {
  const helpMessage = `# Disunday Commands

## Session Management
- \`/new-session\` - Start a new OpenCode session
- \`/resume\` - Resume a previous session
- \`/abort\` or \`/stop\` - Stop the current session
- \`/fork\` - Fork session from a previous message
- \`/compact\` - Summarize conversation history

## Session Info
- \`/status\` - Check bot and session status
- \`/session-info\` - Get session ID and terminal command
- \`/context\` - Show context window usage
- \`/share\` - Generate a public share URL
- \`/export\` - Export session to markdown

## Code & Files
- \`/diff\` - Show recent file changes
- \`/files\` - List project files
- \`/run\` - Execute a terminal command
- \`/undo\` / \`/redo\` - Undo/redo changes

## Worktrees
- \`/new-worktree\` - Create a git worktree
- \`/merge-worktree\` - Merge worktree branch
- \`/toggle-worktrees\` - Toggle auto-worktree

## Configuration
- \`/model\` - Change AI model
- \`/agent\` - Change agent
- \`/login\` - Authenticate with provider
- \`/verbosity\` - Set output detail level
- \`/run-config\` - Configure /run notifications

## Project Management
- \`/add-project\` - Add project channels
- \`/remove-project\` - Remove project channels
- \`/create-new-project\` - Create new project

## Utilities
- \`/ping\` - Check connection latency
- \`/help\` - Show this help message
- \`/queue\` - Queue a follow-up message
- \`/clear-queue\` - Clear message queue
- \`/sync\` - Sync terminal activity to Discord
- \`/rename\` - Rename current session`

  await command.reply({
    content: helpMessage,
    ephemeral: true,
    flags: SILENT_MESSAGE_FLAGS,
  })
}
