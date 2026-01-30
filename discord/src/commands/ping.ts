import type { CommandContext } from './types.js'
import { SILENT_MESSAGE_FLAGS } from '../discord-utils.js'

export async function handlePingCommand({
  command,
}: CommandContext): Promise<void> {
  const sent = await command.reply({
    content: '🏓 Pinging...',
    fetchReply: true,
    flags: SILENT_MESSAGE_FLAGS,
  })

  const latency = sent.createdTimestamp - command.createdTimestamp
  const wsLatency = command.client.ws.ping

  await command.editReply({
    content: `🏓 **Pong!**\n\n**Roundtrip:** ${latency}ms\n**WebSocket:** ${wsLatency}ms`,
  })
}
