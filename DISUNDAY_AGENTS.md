# Restarting the Discord Bot

ONLY restart the discord bot if the user explicitly asks for it.

To restart the discord bot process so it uses the new code, send a SIGUSR2 signal to it.

1. Find the process ID (PID) of the disunday discord bot (e.g., using `ps aux | grep disunday` or searching for "disunday" in process list).
2. Send the signal: `kill -SIGUSR2 <PID>`

The bot will wait 1000ms and then restart itself with the same arguments.

## SQLite

This project uses SQLite to preserve state between runs. The database should never have breaking changes - new disunday versions should keep working with old SQLite databases created by an older version.

If breaking changes are needed, specifically ask the user how to proceed, asking if it is ok to add migration at startup so users with existing databases can still use disunday without data loss.

Database location: `~/.disunday/discord-sessions.db` (or custom path via `--data-dir`)

## errore

errore is a submodule. Should always be on main branch. Make sure it is never in detached state.

It is a package for using errors as values in TypeScript.

## OpenCode

If I ask you questions about OpenCode you can opensrc it from `anomalyco/opencode`

## Key Files

| File                                 | Purpose                                  |
| ------------------------------------ | ---------------------------------------- |
| `discord/src/cli.ts`                 | CLI entry, slash command registration    |
| `discord/src/interaction-handler.ts` | Routes slash commands to handlers        |
| `discord/src/session-handler.ts`     | Main session logic, OpenCode integration |
| `discord/src/commands/*.ts`          | Individual command handlers              |
| `discord/src/config.ts`              | Data directory, defaults                 |
| `discord/src/database.ts`            | SQLite operations                        |
| `discord/src/discord-bot.ts`         | Core bot module, message handling        |

## Environment Variables

| Variable             | Description                                |
| -------------------- | ------------------------------------------ |
| `DISUNDAY_BOT_TOKEN` | Discord bot token (primary)                |
| `KIMAKI_BOT_TOKEN`   | Discord bot token (fallback for migration) |

## Discord Roles

| Role          | Effect                               |
| ------------- | ------------------------------------ |
| `disunday`    | Grants access to use the bot         |
| `no-disunday` | Blocks access even for admins/owners |
