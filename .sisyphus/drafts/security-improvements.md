# Draft: Kimaki Discord Bot Security Improvements

## Requirements (confirmed from context)

### P0 - Critical Priority

1. **Encrypt sensitive data in SQLite**
   - `bot_tokens` table: `token TEXT NOT NULL` (plaintext)
   - `bot_api_keys` table: `gemini_api_key TEXT`, `xai_api_key TEXT` (plaintext)
   - Need: Symmetric encryption using node:crypto with machine-derived key

2. **Bash permission whitelisting**
   - Current: `permission: { bash: 'allow' }` in `opencode.ts:117-126`
   - Need: Configurable whitelist of allowed commands/patterns

### P1 - Medium Priority

3. **Error message sanitization**
   - Locations: `discord-bot.ts:553-554`, `session-handler.ts`, commands
   - Pattern: `await message.reply({ content: \`Error: ${errMsg}\` })`
   - Need: Wrapper to sanitize internal errors before Discord

4. **Username/prompt sanitization**
   - Location: `discord-bot.ts:80-82` - `prefixWithDiscordUser()`
   - Pattern: `${prompt}\n<discord-user name="${username}" />`
   - Need: Escape special characters to prevent XML injection

### P2 - Lower Priority

5. **File attachment validation**
   - Location: `message-formatting.ts:187-234` - `getFileAttachments()`
   - Current: Only MIME type filter (images + PDFs)
   - Need: Size limits, type whitelist validation

6. **Rate limiting**
   - Currently: No rate limiting exists
   - Need: Per-user rate limiting for commands/messages

## Research Findings

### Existing Patterns Found

- Uses `crypto.randomBytes()` for Discord customId generation
- Uses `errore` for tagged error handling with specific error classes
- Existing error types in `errors.ts` well-structured
- Image processing with size limits exists in `image-utils.ts` (MAX_DIMENSION = 1500)
- `SILENT_MESSAGE_FLAGS` used to hide error messages from other users

### Database Schema (database.ts:53-94)

```typescript
// bot_tokens - Discord bot tokens
CREATE TABLE IF NOT EXISTS bot_tokens (
  app_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,  // <-- PLAINTEXT - needs encryption
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

// bot_api_keys - API keys for AI services
CREATE TABLE IF NOT EXISTS bot_api_keys (
  app_id TEXT PRIMARY KEY,
  gemini_api_key TEXT,  // <-- PLAINTEXT - needs encryption
  xai_api_key TEXT,     // <-- PLAINTEXT - needs encryption
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Current Bash Permission (opencode.ts:117-126)

```typescript
OPENCODE_CONFIG_CONTENT: JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  lsp: false,
  formatter: false,
  permission: {
    edit: 'allow',
    bash: 'allow',      // <-- OPEN - needs whitelisting
    webfetch: 'allow',
  },
} satisfies Config),
```

### Error Reply Pattern (discord-bot.ts:550-560)

```typescript
} catch (error) {
  voiceLogger.error('Discord handler error:', error)
  try {
    const errMsg = error instanceof Error ? error.message : String(error)
    await message.reply({ content: `Error: ${errMsg}`, flags: SILENT_MESSAGE_FLAGS })
    // ^^ Exposes internal error messages to users
  } catch (sendError) {
    // ...
  }
}
```

### prefixWithDiscordUser Pattern (discord-bot.ts:80-82)

```typescript
function prefixWithDiscordUser({
  username,
  prompt,
}: {
  username: string
  prompt: string
}): string {
  return `${prompt}\n<discord-user name="${username}" />`
  // ^^ No escaping of username or prompt - XML injection possible
}
```

### getFileAttachments Pattern (message-formatting.ts:187-234)

```typescript
export async function getFileAttachments(
  message: Message,
): Promise<DiscordFileAttachment[]> {
  const fileAttachments = Array.from(message.attachments.values()).filter(
    (attachment) => {
      const contentType = attachment.contentType || ''
      return (
        contentType.startsWith('image/') || contentType === 'application/pdf'
      )
      // ^^ No size validation
    },
  )
  // ...
}
```

## Technical Decisions

### Encryption Approach

- Algorithm: AES-256-GCM (authenticated encryption)
- Key derivation: scrypt from machine ID + salt
- Machine ID: hostname + MAC address hash (portable, not requiring root)
- Salt: Stored in data directory (per-instance)
- Migration: Detect plaintext on read, encrypt on write

### Bash Whitelist Approach

- Config-based whitelist in `config.ts`
- Default to restrictive list (git, npm, pnpm, bun, etc.)
- Support glob patterns for flexibility
- Passthrough flag for power users who want `allow`

### Error Sanitization Approach

- New `sanitizeErrorForUser()` function in `errors.ts`
- AppError subclass for user-safe messages
- Generic "Something went wrong" for internal errors
- Preserve full error in logs

### Input Sanitization Approach

- Escape XML special characters: `< > & " '`
- Apply to username and prompt content
- Centralized function in `security.ts`

### File Validation Approach

- Max size: 10MB (configurable)
- Whitelist: images (png, jpg, gif, webp) + pdf
- Validate MIME against extension for spoofing

### Rate Limiting Approach

- In-memory Map with sliding window
- Per-user (by Discord user ID)
- Separate limits for messages vs commands
- Configurable in `config.ts`

## Scope Boundaries

### INCLUDE

- Encryption for bot_tokens and bot_api_keys tables
- Bash command whitelisting mechanism
- Error message sanitization wrapper
- Username/prompt XML escaping
- File attachment size/type validation
- Basic per-user rate limiting

### EXCLUDE

- Web interface for security settings
- Complex role-based permission system
- Audit logging of security events
- External key management (KMS)
- File content scanning/virus detection

## Open Questions

1. Should bash whitelist be per-channel or global?
2. Rate limit values: what's appropriate for Discord bots?
3. Should we add a migration command or auto-migrate on startup?
