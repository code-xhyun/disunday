<div align='center'>
    <br/>
    <img src="assets/logo.png" alt="disunday" width="480" />
    <br/>
    <br/>
</div>

Disunday is a Discord bot that lets you control [OpenCode](https://opencode.ai) coding sessions from Discord. Send a message in a Discord channel → an AI agent edits code on your machine.

> **Fun fact:** This project is being developed using Disunday itself - lying on a couch, controlling OpenCode through Discord on a phone.

## Quick Start

```bash
npx disunday
```

The CLI will guide you through:
1. Creating a Discord bot at [discord.com/developers](https://discord.com/developers/applications)
2. Enabling required intents (Message Content, Server Members)
3. Installing the bot to your server
4. Linking project directories

### AI Setup Prompt

Copy this prompt to your AI coding agent (Claude Code, Cursor, OpenCode, etc.):

```
Set up Disunday Discord bot for me by running `npx disunday`.

The CLI will guide me through Discord bot setup, but help me with:
- Creating a Discord bot at https://discord.com/developers/applications
- Enabling "MESSAGE CONTENT INTENT" and "SERVER MEMBERS INTENT" in Bot settings
- Generating invite URL with Administrator permissions
- Getting the bot token

If any errors occur, help me troubleshoot.
```

### Development Installation

For contributing or development:

```bash
git clone https://github.com/code-xhyun/disunday
cd disunday
pnpm install
cd discord && pnpm dev
```

## What is Disunday?

Disunday connects Discord to OpenCode, a coding agent similar to Claude Code. Each Discord channel is linked to a project directory on your machine. When you send a message in that channel, Disunday starts an OpenCode session that can:

- Read and edit files
- Run terminal commands
- Search your codebase

## Installation Options

| Method                                      | Description              | Recommended For           |
| ------------------------------------------- | ------------------------ | ------------------------- |
| [npx disunday](#quick-start)                | One command install      | Most users                |
| [Development Install](#development-installation) | `git clone` + `pnpm dev` | Contributors              |
| [Auto-Start](#auto-start-on-boot)           | Auto-run on login        | Always-on personal PC     |
| [Docker](#docker)                           | Run in container         | 24/7 server, VPS deploy   |

Think of it as texting your codebase. You describe what you want, the AI does it.

Keep the CLI running. It's the bridge between Discord and your machine.

## Auto-Start on Boot

Run the bot automatically when your computer starts:

```bash
./scripts/install-service.sh
```

**macOS**: Installs LaunchAgent (starts on login)
**Linux**: Installs systemd user service

### Service Commands

**macOS:**

```bash
launchctl start com.disunday.bot   # Start
launchctl stop com.disunday.bot    # Stop
tail -f ~/.disunday/logs/disunday.log  # Logs
./scripts/uninstall-service.sh     # Uninstall
```

**Linux:**

```bash
systemctl --user start disunday    # Start
systemctl --user stop disunday     # Stop
journalctl --user -u disunday -f   # Logs
./scripts/uninstall-service.sh     # Uninstall
```

## Docker

### When to Use Docker?

| Situation                      | Recommended                |
| ------------------------------ | -------------------------- |
| Developing on my PC            | **Local install** (`pnpm dev`) |
| Run bot only when PC is on     | **Auto-Start script**      |
| 24/7 server operation          | **Docker**                 |
| Run without Node.js installed  | **Docker**                 |
| VPS/cloud server deployment    | **Docker**                 |

### Quick Start

```bash
# Build and run
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Volume Mounts

| Path          | Description               |
| ------------- | ------------------------- |
| `~/.disunday` | Bot credentials, database |
| `~/projects`  | Your project directories  |

Edit `docker-compose.yml` to change mounted directories:

```yaml
volumes:
  - ~/.disunday:/root/.disunday
  - ~/my-projects:/projects # Change this
```

### Manual Docker Run

```bash
docker build -t disunday .

docker run -d \
  --name disunday \
  --restart unless-stopped \
  -v ~/.disunday:/root/.disunday \
  -v ~/projects:/projects \
  disunday
```

## Architecture: One Bot Per Machine

**Each Discord bot you create is tied to one machine.** This is by design.

When you run `disunday` on a computer, it spawns OpenCode servers for projects on that machine. The bot can only access directories on the machine where it's running.

To control multiple machines:

1. Create a separate Discord bot for each machine
2. Run `disunday` on each machine with its own bot token
3. Add all bots to the same Discord server

Each channel shows which bot (machine) it's connected to. You can have channels from different machines in the same server, controlled by different bots.

## Running Multiple Instances

By default, Disunday stores its data in `~/.disunday`. To run multiple bot instances on the same machine (e.g., for different teams or projects), use the `--data-dir` option:

```bash
# Instance 1 - uses default ~/.disunday
cd discord && pnpm dev

# Instance 2 - separate data directory
cd discord && pnpm dev -- --data-dir ~/work-bot

# Instance 3 - another separate instance
cd discord && pnpm dev -- --data-dir ~/personal-bot
```

Each instance has its own:

- **Database** - Bot credentials, channel mappings, session history
- **Projects directory** - Where `/create-new-project` creates new folders
- **Lock port** - Derived from the data directory path, so instances don't conflict

This lets you run completely isolated bots on the same machine, each with their own Discord app and configuration.

### Migration from Kimaki

If you previously used [Kimaki](https://github.com/remorses/kimaki), Disunday automatically detects existing data at `~/.kimaki` on first run and offers to migrate it to `~/.disunday`.

**What gets migrated:**
- Bot token and credentials
- Channel-to-directory mappings
- API keys (Gemini, etc.)

**Manual migration (if needed):**
```bash
cp -r ~/.kimaki ~/.disunday
```

After migration, your existing Discord channels will continue to work with Disunday.

## Multiple Discord Servers

A single Disunday instance can serve multiple Discord servers. Install the bot in each server using the install URL shown during setup, then add project channels to each server.

### Method 1: Use `/add-project` command

1. Run `pnpm dev` once to set up the bot
2. Install the bot in both servers using the install URL
3. In **Server A**: run `/add-project` and select your project
4. In **Server B**: run `/add-project` and select your project

The `/add-project` command creates channels in whichever server you run it from.

### Method 2: Re-run CLI with `--add-channels`

1. Run `pnpm dev` - set up bot, install in both servers, create channels in first server
2. Run `pnpm dev -- --add-channels` - select projects for the second server

The setup wizard lets you pick one server at a time.

You can even link the same project to channels in multiple servers - both will point to the same directory on your machine.

## Best Practices

**Create a dedicated Discord server for your agents.** This keeps your coding sessions separate from other servers and gives you full control over permissions.

**Add all your bots to that server.** One server, multiple machines. Each channel is clearly labeled with its project directory.

**Use the "Disunday" role for team access.** Create a role named "Disunday" (case-insensitive) and assign it to users who should be able to trigger sessions.

**Send long prompts as file attachments.** Discord has character limits for messages. Tap the plus icon and use "Send message as file" for longer prompts. Disunday reads file attachments as your message.

## Required Permissions

Only users with these Discord permissions can interact with the bot:

- **Server Owner** - Full access
- **Administrator** - Full access
- **Manage Server** - Full access
- **"Disunday" role** - Create a role with this name and assign to trusted users

Messages from users without these permissions are ignored.

### Blocking Access with "no-disunday" Role

Create a role named **"no-disunday"** (case-insensitive) to block specific users from using the bot, even if they have other permissions like Server Owner or Administrator.

This implements the "four-eyes principle" - it adds friction to prevent accidental usage. Even if you're a server owner, you must remove this role to interact with the bot.

**Use cases:**

- Prevent accidental bot triggers by owners who share servers
- Temporarily disable access for specific users
- Break-glass scenario: removing the role is a deliberate action

## Features

### Text Messages

Send any message in a channel linked to a project. Disunday creates a thread and starts an OpenCode session.

### File Attachments

Attach images, code files, or any other files to your message. Disunday includes them in the session context.

### Voice Messages

Record a voice message in Discord. Disunday transcribes it using Google's Gemini API and processes it as text. The transcription uses your project's file tree for accuracy, recognizing function names and file paths you mention.

Requires a Gemini API key (prompted during setup).

### Session Management

- **Resume sessions** - Continue where you left off with `/resume`
- **Fork sessions** - Branch from any message in the conversation with `/fork`
- **Share sessions** - Generate public URLs to share your session with `/share`
- **Rename sessions** - Change session title with `/rename` (syncs thread name)
- **Session info** - Get session ID and terminal command with `/session-info`

### Terminal ↔ Discord Sync

Work seamlessly between Discord and terminal:

- **Continue in terminal**: Use `/session-info` to get the `opencode -s <session_id>` command
- **Sync back to Discord**: After working in terminal, use `/sync` to pull recent messages back to Discord
- Session titles renamed in terminal are automatically synced to Discord thread names

### Message Queue

Use `/queue <message>` to queue a follow-up message while the AI is still responding. The queued message sends automatically when the current response finishes. If no response is in progress, it sends immediately. Useful for chaining tasks without waiting.

### Scheduled Messages (Beta)

Schedule prompts to run at a specific time:

```
/schedule add prompt:"Run tests and deploy" time:3:00pm
/schedule add prompt:"Daily standup summary" time:30m
/schedule list
/schedule cancel id:5
```

**Time formats:**
- Relative: `30m`, `2h`, `1d` (minutes, hours, days from now)
- Absolute: `3:00pm`, `14:30` (runs today, or tomorrow if time has passed)

Schedules persist across bot restarts. Use `/schedule list` to see pending schedules and `/schedule cancel` to remove them.

### Run Commands

Execute whitelisted terminal commands directly from Discord with `/run`. Useful for quick operations like `git status`, `pnpm test`, or deployment scripts.

- Configure notifications with `/run-config`
- Run in background for long-running commands
- Get Discord, system, or webhook notifications on completion

### Bot Settings

Configure bot-wide settings using `/settings`:

| Setting      | Command                                  | Description                                          |
| ------------ | ---------------------------------------- | ---------------------------------------------------- |
| Hub Channel  | `/settings hub-channel channel:#channel` | Central notification channel for session completions |
| View         | `/settings view`                         | View current bot settings                            |

When a hub channel is configured, session completions send notifications:

```
✅ **project-name** completed
⏱ 28.6s · 73% · claude-opus-4-5
🧵 thread-name (link)
```

### Reaction Commands (Beta)

Add emoji reactions to messages in threads to trigger quick actions:

| Reaction | Action |
| -------- | ------ |
| 🔄 | Retry the last user prompt |
| ❌ | Abort the current session |
| 📌 | Pin the message |

To use: manually add the emoji reaction to any message in the thread. The bot detects the reaction and performs the action. Reactions are automatically removed after the action is triggered.

### Context Menu Commands (Beta)

Right-click (or long-press on mobile) on any message in a session thread, then select **Apps** to access:

- **Retry this prompt** - Re-run the selected user message
- **Fork from here** - Create a new session branching from the selected AI response

Note: Context menu commands may take up to 1 hour to appear after bot restart due to Discord's global command sync.

### Progress Indicator (Beta)

During long sessions, periodic updates show elapsed time:

```
⏳ Working... (45s)
⏳ Working... (1m 15s)
```

Updates appear every 30 seconds while the AI is processing.

## Commands Reference

### Text Interaction

Just send a message in any channel linked to a project. Disunday handles the rest.

### Slash Commands

| Command                      | Description                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| `/new-session <prompt>`      | Start a new session with an initial prompt                                 |
| `/resume <session>`          | Resume a previous session (with autocomplete)                              |
| `/abort` or `/stop`          | Stop the current running session                                           |
| `/compact`                   | Summarize conversation history to reduce context                           |
| `/add-project <project>`     | Create channels for an existing OpenCode project                           |
| `/remove-project <project>`  | Remove Discord channels for a project                                      |
| `/create-new-project <name>` | Create a new project folder and start a session                            |
| `/new-worktree <name>`       | Create a git worktree and start a session (⬦ prefix)                       |
| `/merge-worktree`            | Merge worktree branch into default branch                                  |
| `/toggle-worktrees`          | Toggle automatic worktree creation for new sessions                        |
| `/model`                     | Change the AI model for this channel or session                            |
| `/agent`                     | Change the agent for this channel or session                               |
| `/login`                     | Authenticate with an AI provider (OAuth or API key)                        |
| `/share`                     | Generate a public URL to share the current session                         |
| `/fork`                      | Fork the session from a previous message                                   |
| `/rename <title>`            | Rename the current session (also renames thread)                           |
| `/session-info`              | Show session ID and terminal command to continue                           |
| `/sync`                      | Sync recent terminal activity to Discord thread                            |
| `/queue <message>`           | Queue a message to send after current response finishes                    |
| `/clear-queue`               | Clear all queued messages in this thread                                   |
| `/schedule add` *(Beta)*     | Schedule a message to run at a specific time                               |
| `/schedule list` *(Beta)*    | List pending schedules in this channel                                     |
| `/schedule cancel <id>` *(Beta)* | Cancel a scheduled message                                             |
| `/undo`                      | Undo the last assistant message (revert file changes)                      |
| `/redo`                      | Redo the last undone message                                               |
| `/run <command>`             | Execute a terminal command                                                 |
| `/run-config`                | Configure /run notification settings                                       |
| `/verbosity <level>`         | Set output verbosity (tools-and-text, text-and-essential-tools, text-only) |
| `/theme <style>`             | Set message formatting theme (default, minimal, detailed, plain)           |
| `/restart-opencode-server`   | Restart the OpenCode server for this channel                               |
| `/status`                    | Check bot and session status                                               |
| `/help`                      | Show available commands                                                    |
| `/ping`                      | Check connection latency                                                   |
| `/context`                   | Show context window usage for current session                              |
| `/cost`                      | Show estimated API cost for current session                                |
| `/diff`                      | Show recent file changes in project                                        |
| `/export`                    | Export session to markdown file                                            |
| `/files`                     | List project files                                                         |

### CLI Commands

All commands run from the `discord` directory:

```bash
# Start the bot (interactive setup on first run)
pnpm dev

# Upload files to a Discord thread
pnpm tsx src/cli.ts upload-to-discord --session <session-id> <file1> [file2...]

# Start a session programmatically (useful for CI/automation)
pnpm tsx src/cli.ts send --channel <channel-id> --prompt "your prompt"

# Send notification without starting AI session (reply to start session later)
pnpm tsx src/cli.ts send --channel <channel-id> --prompt "User cancelled subscription" --notify-only

# Create Discord channels for a project directory (without starting a session)
pnpm tsx src/cli.ts add-project [directory]
```

## Add Project Channels

Create Discord channels for a project directory without starting a session. Useful for automation and scripting.

```bash
# Add current directory as a project
pnpm tsx src/cli.ts add-project

# Add a specific directory
pnpm tsx src/cli.ts add-project /path/to/project

# Specify guild when bot is in multiple servers
pnpm tsx src/cli.ts add-project ./myproject --guild 123456789

# In CI with env var for bot token
DISUNDAY_BOT_TOKEN=xxx pnpm tsx src/cli.ts add-project --app-id 987654321
```

### Options

| Option                  | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `[directory]`           | Project directory path (defaults to current directory)              |
| `-g, --guild <guildId>` | Discord guild/server ID (auto-detects if bot is in only one server) |
| `-a, --app-id <appId>`  | Bot application ID (reads from database if available)               |

## Programmatically Start Sessions

You can start Disunday sessions from CI pipelines, cron jobs, or any automation. The `send` command creates a Discord thread, and the running bot on your machine picks it up.

### Environment Variables

| Variable             | Required    | Description       |
| -------------------- | ----------- | ----------------- |
| `DISUNDAY_BOT_TOKEN` | Yes (in CI) | Discord bot token |

### CLI Options

```bash
pnpm tsx src/cli.ts send \
  --channel <channel-id>  # Required: Discord channel ID
  --prompt <prompt>       # Required: Message content
  --name <name>           # Optional: Thread name (defaults to prompt preview)
  --app-id <app-id>       # Optional: Bot application ID for validation
  --notify-only           # Optional: Create notification thread without starting AI session
```

### Example: GitHub Actions on New Issues

This workflow starts a Disunday session whenever a new issue is opened:

```yaml
# .github/workflows/investigate-issues.yml
name: Investigate New Issues

on:
  issues:
    types: [opened]

jobs:
  investigate:
    runs-on: ubuntu-latest
    steps:
      - name: Clone Disunday
        run: git clone https://github.com/code-xhyun/disunday.git
      - name: Install dependencies
        run: cd disunday && pnpm install
      - name: Start Disunday Session
        env:
          DISUNDAY_BOT_TOKEN: ${{ secrets.DISUNDAY_BOT_TOKEN }}
        run: |
          cd disunday/discord && pnpm tsx src/cli.ts send \
            --channel "1234567890123456789" \
            --prompt "Investigate issue ${{ github.event.issue.html_url }} using gh cli. Try fixing it in a new worktree ./${{ github.event.issue.number }}" \
            --name "Issue #${{ github.event.issue.number }}"
```

**Setup:**

1. Add `DISUNDAY_BOT_TOKEN` to your repository secrets (Settings → Secrets → Actions)
2. Replace `1234567890123456789` with your Discord channel ID (right-click channel → Copy Channel ID)
3. Make sure the Disunday bot is running on your machine

### How It Works

1. **CI runs `send`** → Creates a Discord thread with your prompt
2. **Running bot detects thread** → Automatically starts a session
3. **Bot starts OpenCode session** → Uses the prompt from the thread
4. **AI investigates** → Runs on your machine with full codebase access

Use `--notify-only` for notifications that don't need immediate AI response (e.g., subscription events). Reply to the thread later to start a session with the notification as context.

## How It Works

**SQLite Database** - Disunday stores state in `<data-dir>/discord-sessions.db` (default: `~/.disunday/discord-sessions.db`). This maps Discord threads to OpenCode sessions, channels to directories, and stores your bot credentials. Use `--data-dir` to change the location.

**OpenCode Servers** - When you message a channel, Disunday spawns (or reuses) an OpenCode server for that project directory. The server handles the actual AI coding session.

**Channel Metadata** - Each channel's topic contains XML metadata linking it to a directory and bot:

```xml
<disunday><directory>/path/to/project</directory><app>bot_id</app></disunday>
```

**Session Cache** - On startup, Disunday pre-fetches session lists for all projects, making `/resume` autocomplete fast from the first use.

**Voice Processing** - Voice features run in a worker thread. Audio flows: Discord Opus → Decoder → Downsample (48kHz→16kHz) → Gemini API → Response → Upsample → Opus → Discord.

**Graceful Restart** - Send `SIGUSR2` to restart the bot with new code without losing connections.

## Model & Agent Configuration

Set the AI model in your project's `opencode.json`:

```json
{
  "model": "anthropic/claude-sonnet-4-20250514"
}
```

Format: `provider/model-name`

**Examples:**

- `anthropic/claude-sonnet-4-20250514` - Claude Sonnet 4
- `anthropic/claude-opus-4-20250514` - Claude Opus 4
- `openai/gpt-4o` - GPT-4o
- `google/gemini-2.5-pro` - Gemini 2.5 Pro

Or use these Discord commands to change settings per channel/session:

- `/model` - Select a different AI model
- `/agent` - Select a different agent (if you have multiple agents configured in your project)
- `/login` - Authenticate with providers via OAuth or API key

---

## Credits

Originally forked from [kimaki](https://github.com/remorses/kimaki)
