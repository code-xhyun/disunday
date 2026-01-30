# Kimaki Discord Bot Security Improvements

## TL;DR

> **Quick Summary**: Implement security hardening for Kimaki Discord bot - encrypting sensitive data at rest, adding bash command whitelisting, sanitizing error messages, and adding rate limiting.
>
> **Deliverables**:
>
> - Encrypted storage for bot tokens and API keys in SQLite
> - Configurable bash command whitelist for OpenCode sessions
> - Error sanitization to prevent internal details leaking to Discord
> - Input sanitization for username/prompt injection prevention
> - File attachment size and type validation
> - Per-user rate limiting for abuse prevention
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (security.ts) → Task 2 (database encryption) → Task 6 (integration)

---

## Context

### Original Request

Implement security improvements for Kimaki Discord bot across 6 areas:

- P0 Critical: Encrypt sensitive data, Bash permission whitelisting
- P1 Medium: Error message sanitization, Username/prompt sanitization
- P2 Lower: File attachment validation, Rate limiting

### Interview Summary

**Key Discussions**:

- Encryption: AES-256-GCM with machine-derived key and random salt stored in data directory
- Migration: Auto-migrate plaintext tokens on startup (transparent to user)
- Bash whitelist: Global configuration with sane defaults, not per-channel
- Rate limiting: Conservative defaults (5 msg/min, 10 cmd/min per user)

**Research Findings**:

- Codebase uses `errore` library for tagged errors - extend this pattern
- `crypto.randomBytes()` already in use for Discord customId
- Image processing with size limits exists in `image-utils.ts`
- `SILENT_MESSAGE_FLAGS` used throughout for error messages
- Config pattern established in `config.ts`

### Self-Review: Gap Analysis

**Guardrails Identified**:

1. Encryption key must never be logged or exposed
2. Error sanitization must preserve full error in logs
3. Bash whitelist must have secure defaults (deny by default)
4. Rate limiting must not block legitimate rapid usage during active sessions

**Assumptions Made**:

1. Machine ID (hostname + MAC) is stable enough for key derivation
2. SQLite database file permissions provide baseline protection
3. Discord.js handles its own rate limiting for API calls

**Edge Cases to Handle**:

1. First-run scenario with no existing salt file
2. Migration from plaintext to encrypted data
3. Corrupted encrypted data (decryption failure)
4. Rate limit reset across bot restarts (in-memory = resets)

---

## Work Objectives

### Core Objective

Harden Kimaki's security posture by protecting sensitive data at rest, restricting dangerous operations, and preventing information leakage to Discord users.

### Concrete Deliverables

- `discord/src/security.ts` - New encryption and sanitization module
- Modified `discord/src/database.ts` - Encrypted token storage
- Modified `discord/src/config.ts` - Security configuration
- Modified `discord/src/opencode.ts` - Bash whitelist integration
- Modified `discord/src/errors.ts` - Error sanitization utilities
- Modified `discord/src/discord-bot.ts` - Sanitized error replies, escaped usernames
- Modified `discord/src/message-formatting.ts` - File validation

### Definition of Done

- [ ] `bun run typecheck` passes in discord package
- [ ] Bot starts successfully with existing plaintext database
- [ ] New tokens are stored encrypted (verify in SQLite browser)
- [ ] Error messages to Discord do not contain stack traces
- [ ] Bash commands not in whitelist are rejected
- [ ] Large file attachments (>10MB) are rejected with user message

### Must Have

- AES-256-GCM encryption for tokens with proper IV and auth tag
- Auto-migration of plaintext tokens on startup
- Error sanitization distinguishing AppError from internal errors
- XML character escaping in prefixWithDiscordUser
- File size limit (10MB default)
- Basic rate limiting structure

### Must NOT Have (Guardrails)

- No hardcoded encryption keys in source code
- No logging of decrypted tokens or keys
- No exposing internal error messages to Discord users
- No use of `eval()` or `Function()` for any validation
- No breaking changes to existing database schema structure
- No external dependencies for core security functions (use node:crypto)

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (bun test via vitest)
- **User wants tests**: Manual verification (no explicit TDD request)
- **Framework**: bun test / vitest
- **QA approach**: Manual verification with specific commands

### Automated Verification

Each TODO includes executable verification procedures:

**For Encryption:**

```bash
# Verify encryption works
bun -e "import { encrypt, decrypt, getEncryptionKey } from './discord/src/security.js'; const key = getEncryptionKey(); const enc = encrypt('test-token', key); const dec = decrypt(enc, key); console.log(dec === 'test-token' ? 'PASS' : 'FAIL')"
```

**For Database:**

```bash
# Verify token is encrypted in database
sqlite3 ~/.kimaki/discord-sessions.db "SELECT token FROM bot_tokens LIMIT 1" | grep -v "^xoxb-\|^[A-Za-z0-9._-]*$" && echo "ENCRYPTED" || echo "PLAINTEXT"
```

**For Typecheck:**

```bash
cd discord && bun run typecheck
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Create security.ts module (encryption + sanitization)
├── Task 3: Add security config to config.ts
└── Task 5: Add file validation to message-formatting.ts

Wave 2 (After Wave 1):
├── Task 2: Integrate encryption in database.ts (depends: 1, 3)
├── Task 4: Add bash whitelist to opencode.ts (depends: 3)
└── Task 7: Add error sanitization to errors.ts (depends: 1)

Wave 3 (After Wave 2):
└── Task 6: Update discord-bot.ts with all integrations (depends: 1, 7)

Critical Path: Task 1 → Task 2 → Task 6
Parallel Speedup: ~40% faster than sequential
```

### Dependency Matrix

| Task | Depends On    | Blocks  | Can Parallelize With |
| ---- | ------------- | ------- | -------------------- |
| 1    | None          | 2, 6, 7 | 3, 5                 |
| 2    | 1, 3          | 6       | 4, 7                 |
| 3    | None          | 2, 4    | 1, 5                 |
| 4    | 3             | 6       | 2, 7                 |
| 5    | None          | 6       | 1, 3                 |
| 6    | 1, 2, 4, 5, 7 | None    | None (final)         |
| 7    | 1             | 6       | 2, 4                 |

### Agent Dispatch Summary

| Wave | Tasks   | Recommended Approach                     |
| ---- | ------- | ---------------------------------------- |
| 1    | 1, 3, 5 | Independent modules, can run in parallel |
| 2    | 2, 4, 7 | Integration tasks, depend on Wave 1      |
| 3    | 6       | Final integration, depends on all        |

---

## TODOs

- [ ] 1. Create security.ts module with encryption and sanitization utilities

  **What to do**:
  - Create new file `discord/src/security.ts`
  - Implement `getEncryptionKey()` using machine ID + stored salt
  - Implement `encrypt(plaintext, key)` using AES-256-GCM
  - Implement `decrypt(encrypted, key)` with proper error handling
  - Implement `sanitizeForXml(text)` to escape `< > & " '`
  - Implement `isEncrypted(value)` to detect encrypted vs plaintext data
  - Generate and store salt in `<dataDir>/encryption.salt` on first use
  - Export `EncryptionError` tagged error class

  **Must NOT do**:
  - Do not log decrypted values or encryption keys
  - Do not use deprecated crypto methods
  - Do not hardcode any secrets

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Security-critical cryptographic code requiring careful implementation
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commits of security module
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser-related
    - `frontend-ui-ux`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 5)
  - **Blocks**: Tasks 2, 6, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `discord/src/image-utils.ts:22-35` - Pattern for lazy-loading optional modules
  - `discord/src/config.ts:17-22` - getDataDir() pattern for data directory access

  **Type References**:
  - `discord/src/errors.ts:5` - createTaggedError pattern for new error classes

  **External References**:
  - Node.js crypto docs: AES-256-GCM with proper IV (12 bytes) and authTag (16 bytes)
  - Use `crypto.scryptSync()` for key derivation from machine fingerprint

  **WHY Each Reference Matters**:
  - `image-utils.ts` shows lazy module loading pattern used in this codebase
  - `config.ts` shows how to access the data directory for salt storage
  - `errors.ts` shows how to create tagged errors for this project

  **Acceptance Criteria**:

  ```bash
  # Verify module compiles
  cd discord && bun run typecheck
  # Assert: No errors in security.ts

  # Verify encryption roundtrip
  bun -e "
    import { encrypt, decrypt, getEncryptionKey } from './src/security.js';
    const key = await getEncryptionKey();
    const enc = encrypt('my-secret-token', key);
    console.log('Encrypted:', typeof enc.iv, typeof enc.authTag, typeof enc.encrypted);
    const dec = decrypt(enc, key);
    console.log(dec === 'my-secret-token' ? 'ROUNDTRIP: PASS' : 'ROUNDTRIP: FAIL');
  "
  # Assert: Output shows ROUNDTRIP: PASS

  # Verify salt file created
  ls -la ~/.kimaki/encryption.salt
  # Assert: File exists with 32+ bytes

  # Verify XML sanitization
  bun -e "
    import { sanitizeForXml } from './src/security.js';
    const result = sanitizeForXml('<script>alert(\"xss\")</script>');
    console.log(result.includes('<') ? 'FAIL' : 'PASS');
  "
  # Assert: Output is PASS
  ```

  **Commit**: YES
  - Message: `feat(security): add encryption and sanitization utilities`
  - Files: `discord/src/security.ts`
  - Pre-commit: `cd discord && bun run typecheck`

---

- [ ] 2. Integrate encryption in database.ts for tokens and API keys

  **What to do**:
  - Import encryption functions from `security.ts`
  - Modify token storage functions to encrypt before INSERT
  - Modify token retrieval functions to decrypt after SELECT
  - Add auto-migration: detect plaintext tokens and encrypt them
  - Handle `EncryptionError` gracefully (log and return undefined)
  - Update `getBotToken()`, `setBotToken()`, `getBotApiKeys()`, `setBotApiKeys()`

  **Must NOT do**:
  - Do not change the database schema (columns remain TEXT)
  - Do not break existing callers of these functions
  - Do not log decrypted token values

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Database migration with encryption requires careful handling
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commits
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser-related

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `discord/src/database.ts:53-58` - bot_tokens table schema
  - `discord/src/database.ts:87-94` - bot_api_keys table schema
  - `discord/src/database.ts:166-172` - getChannelModel pattern for retrieval
  - `discord/src/database.ts:178-184` - setChannelModel pattern for INSERT OR REPLACE

  **Type References**:
  - `discord/src/security.ts` - EncryptedData interface (created in Task 1)

  **WHY Each Reference Matters**:
  - Lines 53-58 and 87-94 show exact tables to modify
  - Lines 166-172 show the getter pattern to follow
  - Lines 178-184 show the setter pattern with INSERT OR REPLACE

  **Acceptance Criteria**:

  ```bash
  # Verify typecheck passes
  cd discord && bun run typecheck
  # Assert: No errors

  # Start bot once to trigger migration, then check database
  # (Manual: Start bot, let it initialize, check SQLite)
  sqlite3 ~/.kimaki/discord-sessions.db "SELECT token FROM bot_tokens LIMIT 1"
  # Assert: Output is NOT a plaintext Discord token (not starting with letters/numbers only)

  # Verify encrypted format (should be JSON with iv, authTag, encrypted)
  sqlite3 ~/.kimaki/discord-sessions.db "SELECT token FROM bot_tokens LIMIT 1" | grep -q '"iv"' && echo "ENCRYPTED FORMAT: PASS" || echo "ENCRYPTED FORMAT: FAIL"
  # Assert: ENCRYPTED FORMAT: PASS
  ```

  **Commit**: YES
  - Message: `feat(database): encrypt bot tokens and API keys at rest`
  - Files: `discord/src/database.ts`
  - Pre-commit: `cd discord && bun run typecheck`

---

- [ ] 3. Add security configuration to config.ts

  **What to do**:
  - Add `BashWhitelist` configuration with default allowed commands
  - Add `RateLimitConfig` with default values (5 msg/min, 10 cmd/min)
  - Add `FileValidationConfig` with max size (10MB) and allowed MIME types
  - Implement getter/setter functions following existing pattern
  - Default bash whitelist: `['git', 'npm', 'pnpm', 'bun', 'node', 'cat', 'ls', 'pwd', 'echo', 'grep', 'find', 'head', 'tail', 'wc']`

  **Must NOT do**:
  - Do not remove existing config functions
  - Do not make breaking changes to existing patterns

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple config additions following existing patterns
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commits
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser-related

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 5)
  - **Blocks**: Tasks 2, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `discord/src/config.ts:17-22` - getDataDir/setDataDir pattern
  - `discord/src/config.ts:51-59` - getDefaultVerbosity/setDefaultVerbosity pattern

  **WHY Each Reference Matters**:
  - Shows exact getter/setter pattern used in this codebase
  - Module-level variables with lazy initialization

  **Acceptance Criteria**:

  ```bash
  # Verify typecheck
  cd discord && bun run typecheck
  # Assert: No errors

  # Verify exports work
  bun -e "
    import { getBashWhitelist, getRateLimitConfig, getFileValidationConfig } from './src/config.js';
    console.log('Bash whitelist:', getBashWhitelist().length, 'commands');
    console.log('Rate limit:', getRateLimitConfig());
    console.log('File validation:', getFileValidationConfig());
  "
  # Assert: Shows reasonable defaults without errors
  ```

  **Commit**: YES
  - Message: `feat(config): add security configuration options`
  - Files: `discord/src/config.ts`
  - Pre-commit: `cd discord && bun run typecheck`

---

- [ ] 4. Integrate bash whitelist in opencode.ts

  **What to do**:
  - Import `getBashWhitelist()` from config
  - Modify `OPENCODE_CONFIG_CONTENT` to use whitelist instead of `'allow'`
  - If whitelist is empty or contains `'*'`, use `'allow'` (escape hatch)
  - Add type for bash permission: `'allow' | 'deny' | string[]`

  **Must NOT do**:
  - Do not change other permission settings (edit, webfetch)
  - Do not break existing server spawning logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small targeted change to config construction
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commits
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser-related

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `discord/src/opencode.ts:115-128` - Current OPENCODE_CONFIG_CONTENT construction
  - `discord/src/config.ts` - getBashWhitelist() function (created in Task 3)

  **External References**:
  - OpenCode Config schema: Check `@opencode-ai/sdk` types for permission format

  **WHY Each Reference Matters**:
  - Lines 115-128 show exact location to modify for bash permissions
  - Need to understand OpenCode's expected permission format

  **Acceptance Criteria**:

  ```bash
  # Verify typecheck
  cd discord && bun run typecheck
  # Assert: No errors

  # Verify config structure (inspect the generated config)
  bun -e "
    import { getBashWhitelist } from './src/config.js';
    const whitelist = getBashWhitelist();
    const config = {
      permission: {
        bash: whitelist.includes('*') ? 'allow' : whitelist
      }
    };
    console.log('Bash permission:', JSON.stringify(config.permission.bash));
  "
  # Assert: Shows array of commands or 'allow'
  ```

  **Commit**: YES
  - Message: `feat(opencode): integrate bash command whitelist`
  - Files: `discord/src/opencode.ts`
  - Pre-commit: `cd discord && bun run typecheck`

---

- [ ] 5. Add file validation to message-formatting.ts

  **What to do**:
  - Import `getFileValidationConfig()` from config
  - Add size validation before fetching attachment (use `attachment.size`)
  - Validate MIME type against whitelist
  - Return descriptive error for rejected files
  - Log rejected files for debugging

  **Must NOT do**:
  - Do not change the return type of `getFileAttachments()`
  - Do not break existing image processing flow

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small validation additions to existing function
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commits
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser-related

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 6
  - **Blocked By**: None (but logically after Task 3 for config)

  **References**:

  **Pattern References**:
  - `discord/src/message-formatting.ts:187-234` - getFileAttachments function
  - `discord/src/image-utils.ts:9` - MAX_DIMENSION constant pattern

  **Type References**:
  - `discord.js` Attachment type: `attachment.size` property exists

  **WHY Each Reference Matters**:
  - Lines 187-234 show exact function to modify
  - image-utils.ts shows pattern for size limits in this codebase

  **Acceptance Criteria**:

  ```bash
  # Verify typecheck
  cd discord && bun run typecheck
  # Assert: No errors

  # Verify size limit constant exists
  grep -n "maxSize\|MAX_SIZE\|maxFileSize" discord/src/message-formatting.ts
  # Assert: Shows line with size limit

  # Verify MIME whitelist check exists
  grep -n "allowedMimeTypes\|mimeWhitelist\|isAllowedMime" discord/src/message-formatting.ts
  # Assert: Shows line with MIME validation
  ```

  **Commit**: YES
  - Message: `feat(attachments): add file size and type validation`
  - Files: `discord/src/message-formatting.ts`
  - Pre-commit: `cd discord && bun run typecheck`

---

- [ ] 6. Update discord-bot.ts with sanitized errors and escaped usernames

  **What to do**:
  - Import `sanitizeForXml()` from security.ts
  - Import `sanitizeErrorForUser()` from errors.ts
  - Update `prefixWithDiscordUser()` to escape username and prompt
  - Update error catch blocks (lines 550-560) to use sanitized errors
  - Update worktree error messages similarly

  **Must NOT do**:
  - Do not change business logic of message handling
  - Do not remove SILENT_MESSAGE_FLAGS usage
  - Do not suppress errors entirely (keep logging)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Integration of utilities into existing code
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commits
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser-related

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final integration)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 1, 2, 4, 5, 7

  **References**:

  **Pattern References**:
  - `discord/src/discord-bot.ts:80-82` - prefixWithDiscordUser function
  - `discord/src/discord-bot.ts:550-560` - Error catch block pattern
  - `discord/src/discord-bot.ts:262-266` - Worktree error message pattern

  **Type References**:
  - `discord/src/security.ts` - sanitizeForXml (created in Task 1)
  - `discord/src/errors.ts` - sanitizeErrorForUser (created in Task 7)

  **WHY Each Reference Matters**:
  - Lines 80-82 show exact function needing XML escaping
  - Lines 550-560 show error handling pattern to modify
  - Lines 262-266 show additional error messages to sanitize

  **Acceptance Criteria**:

  ```bash
  # Verify typecheck
  cd discord && bun run typecheck
  # Assert: No errors

  # Verify sanitization is imported and used
  grep -n "sanitizeForXml\|sanitizeErrorForUser" discord/src/discord-bot.ts
  # Assert: Shows import and usage lines

  # Verify prefixWithDiscordUser uses sanitization
  grep -A5 "function prefixWithDiscordUser" discord/src/discord-bot.ts | grep "sanitize"
  # Assert: Shows sanitization call
  ```

  **Commit**: YES
  - Message: `feat(discord): sanitize errors and escape user input`
  - Files: `discord/src/discord-bot.ts`
  - Pre-commit: `cd discord && bun run typecheck`

---

- [ ] 7. Add error sanitization utilities to errors.ts

  **What to do**:
  - Create `UserSafeError` class extending Error (for intentionally user-visible messages)
  - Create `sanitizeErrorForUser(error: unknown): string` function
  - Return user-safe message for `UserSafeError` instances
  - Return generic "Something went wrong" for other errors
  - Preserve original error in return for logging purposes

  **Must NOT do**:
  - Do not modify existing error classes
  - Do not expose internal error details in sanitized output

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility additions following existing patterns
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commits
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser-related

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (conceptually, though could start earlier)

  **References**:

  **Pattern References**:
  - `discord/src/errors.ts:11-14` - DirectoryNotAccessibleError pattern
  - `discord/src/errors.ts:121-128` - Union types for function signatures

  **WHY Each Reference Matters**:
  - Lines 11-14 show createTaggedError pattern for new error classes
  - Lines 121-128 show how to create union types for return signatures

  **Acceptance Criteria**:

  ```bash
  # Verify typecheck
  cd discord && bun run typecheck
  # Assert: No errors

  # Verify sanitization function
  bun -e "
    import { sanitizeErrorForUser, UserSafeError } from './src/errors.js';

    const safe = new UserSafeError('Token expired, please login again');
    const internal = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed');

    console.log('Safe error:', sanitizeErrorForUser(safe));
    console.log('Internal error:', sanitizeErrorForUser(internal));
  "
  # Assert: Safe error shows original message, internal shows generic message
  ```

  **Commit**: YES
  - Message: `feat(errors): add error sanitization utilities`
  - Files: `discord/src/errors.ts`
  - Pre-commit: `cd discord && bun run typecheck`

---

- [ ] 8. Add rate limiting to discord-bot.ts

  **What to do**:
  - Import rate limit config from config.ts
  - Create in-memory rate limit tracker (Map<userId, { count, resetTime }>)
  - Add `checkRateLimit(userId: string, type: 'message' | 'command')` function
  - Apply rate limit check before processing messages (after permission check)
  - Reply with rate limit warning when exceeded

  **Must NOT do**:
  - Do not persist rate limits (in-memory is acceptable)
  - Do not block bot owners or admins
  - Do not interfere with existing permission checks

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple in-memory rate limiting logic
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commits
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser-related

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6 if done after Task 3)
  - **Parallel Group**: Wave 3 (or parallel with Task 6)
  - **Blocks**: None
  - **Blocked By**: Task 3 (for config), preferably after Task 6

  **References**:

  **Pattern References**:
  - `discord/src/discord-bot.ts:195-226` - Permission check pattern (rate limit goes after)
  - `discord/src/session-handler.ts:121-144` - messageQueue Map pattern for in-memory state

  **Type References**:
  - `discord/src/config.ts` - getRateLimitConfig() (created in Task 3)

  **WHY Each Reference Matters**:
  - Lines 195-226 show where to insert rate limit check in message flow
  - session-handler.ts shows Map-based state pattern used in codebase

  **Acceptance Criteria**:

  ```bash
  # Verify typecheck
  cd discord && bun run typecheck
  # Assert: No errors

  # Verify rate limit check function exists
  grep -n "checkRateLimit\|rateLimitTracker" discord/src/discord-bot.ts
  # Assert: Shows rate limit implementation

  # Verify rate limit is applied in message handler
  grep -B5 -A5 "checkRateLimit" discord/src/discord-bot.ts | grep "message.reply"
  # Assert: Shows rate limit reply message
  ```

  **Commit**: YES
  - Message: `feat(discord): add per-user rate limiting`
  - Files: `discord/src/discord-bot.ts`
  - Pre-commit: `cd discord && bun run typecheck`

---

## Commit Strategy

| After Task | Message                                                     | Files                 | Verification |
| ---------- | ----------------------------------------------------------- | --------------------- | ------------ |
| 1          | `feat(security): add encryption and sanitization utilities` | security.ts           | typecheck    |
| 2          | `feat(database): encrypt bot tokens and API keys at rest`   | database.ts           | typecheck    |
| 3          | `feat(config): add security configuration options`          | config.ts             | typecheck    |
| 4          | `feat(opencode): integrate bash command whitelist`          | opencode.ts           | typecheck    |
| 5          | `feat(attachments): add file size and type validation`      | message-formatting.ts | typecheck    |
| 6          | `feat(discord): sanitize errors and escape user input`      | discord-bot.ts        | typecheck    |
| 7          | `feat(errors): add error sanitization utilities`            | errors.ts             | typecheck    |
| 8          | `feat(discord): add per-user rate limiting`                 | discord-bot.ts        | typecheck    |

---

## Success Criteria

### Verification Commands

```bash
# Full typecheck
cd discord && bun run typecheck
# Expected: No errors

# Verify encryption module
bun -e "import './src/security.js'"
# Expected: No errors

# Verify bot starts (manual)
bun run start
# Expected: Bot connects to Discord successfully
```

### Final Checklist

- [ ] All tokens encrypted in database
- [ ] Bash whitelist active in OpenCode config
- [ ] Error messages to Discord sanitized
- [ ] Username/prompt XML injection prevented
- [ ] File attachments validated for size and type
- [ ] Rate limiting prevents abuse
- [ ] No regression in existing functionality
- [ ] `bun run typecheck` passes
