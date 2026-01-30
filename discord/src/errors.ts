// TaggedError definitions for type-safe error handling with errore.
// Errors are grouped by category: infrastructure, domain, and validation.
// Use errore.matchError() for exhaustive error handling in command handlers.

import { createTaggedError } from 'errore'

// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE ERRORS - Server, filesystem, external services
// ═══════════════════════════════════════════════════════════════════════════

export class DirectoryNotAccessibleError extends createTaggedError({
  name: 'DirectoryNotAccessibleError',
  message: 'Directory does not exist or is not accessible: $directory',
}) {}

export class ServerStartError extends createTaggedError({
  name: 'ServerStartError',
  message: 'Server failed to start on port $port: $reason',
}) {}

export class ServerNotFoundError extends createTaggedError({
  name: 'ServerNotFoundError',
  message: 'OpenCode server not found for directory: $directory',
}) {}

export class ServerNotReadyError extends createTaggedError({
  name: 'ServerNotReadyError',
  message:
    'OpenCode server for directory "$directory" is in an error state (no client available)',
}) {}

export class ApiKeyMissingError extends createTaggedError({
  name: 'ApiKeyMissingError',
  message: '$service API key is required',
}) {}

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN ERRORS - Sessions, messages, transcription
// ═══════════════════════════════════════════════════════════════════════════

export class SessionNotFoundError extends createTaggedError({
  name: 'SessionNotFoundError',
  message: 'Session $sessionId not found',
}) {}

export class SessionCreateError extends createTaggedError({
  name: 'SessionCreateError',
  message: '$message',
}) {}

export class MessagesNotFoundError extends createTaggedError({
  name: 'MessagesNotFoundError',
  message: 'No messages found for session $sessionId',
}) {}

export class TranscriptionError extends createTaggedError({
  name: 'TranscriptionError',
  message: 'Transcription failed: $reason',
}) {}

export class GrepSearchError extends createTaggedError({
  name: 'GrepSearchError',
  message: 'Grep search failed for pattern: $pattern',
}) {}

export class GlobSearchError extends createTaggedError({
  name: 'GlobSearchError',
  message: 'Glob search failed for pattern: $pattern',
}) {}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION ERRORS - Input validation, format checks
// ═══════════════════════════════════════════════════════════════════════════

export class InvalidAudioFormatError extends createTaggedError({
  name: 'InvalidAudioFormatError',
  message: 'Invalid audio format',
}) {}

export class EmptyTranscriptionError extends createTaggedError({
  name: 'EmptyTranscriptionError',
  message: 'Model returned empty transcription',
}) {}

export class NoResponseContentError extends createTaggedError({
  name: 'NoResponseContentError',
  message: 'No response content from model',
}) {}

export class NoToolResponseError extends createTaggedError({
  name: 'NoToolResponseError',
  message: 'No valid tool responses',
}) {}

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK ERRORS - Fetch and HTTP
// ═══════════════════════════════════════════════════════════════════════════

export class FetchError extends createTaggedError({
  name: 'FetchError',
  message: 'Fetch failed for $url',
}) {}

// ═══════════════════════════════════════════════════════════════════════════
// API ERRORS - External service responses
// ═══════════════════════════════════════════════════════════════════════════

export class DiscordApiError extends createTaggedError({
  name: 'DiscordApiError',
  message: 'Discord API error: $status $body',
}) {}

export class OpenCodeApiError extends createTaggedError({
  name: 'OpenCodeApiError',
  message: 'OpenCode API error ($status): $body',
}) {}

// ═══════════════════════════════════════════════════════════════════════════
// UNION TYPES - For function signatures
// ═══════════════════════════════════════════════════════════════════════════

export type TranscriptionErrors =
  | ApiKeyMissingError
  | InvalidAudioFormatError
  | TranscriptionError
  | EmptyTranscriptionError
  | NoResponseContentError
  | NoToolResponseError

export type OpenCodeErrors =
  | DirectoryNotAccessibleError
  | ServerStartError
  | ServerNotFoundError
  | ServerNotReadyError

export type SessionErrors =
  | SessionNotFoundError
  | MessagesNotFoundError
  | OpenCodeApiError

// ═══════════════════════════════════════════════════════════════════════════
// USER-SAFE ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error class for messages that are safe to show to users.
 * Use this when you want the error message to be displayed verbatim.
 */
export class UserSafeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserSafeError'
  }
}

/**
 * Generic error message shown to users when we can't expose internal details.
 */
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/**
 * Patterns that indicate sensitive information in error messages.
 */
const SENSITIVE_PATTERNS = [
  /SQLITE/i,
  /database/i,
  /token/i,
  /api.?key/i,
  /secret/i,
  /password/i,
  /credential/i,
  /at\s+\S+:\d+:\d+/, // Stack trace lines
  /node_modules/i,
  /internal\//i,
]

/**
 * Check if an error message contains sensitive information.
 */
function containsSensitiveInfo(message: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => {
    return pattern.test(message)
  })
}

/**
 * Sanitize an error for display to Discord users.
 *
 * - UserSafeError: Returns the original message (it's explicitly safe)
 * - Tagged errors (from errore): Returns the error name and message
 * - Other errors with safe messages: Returns the message
 * - Errors with sensitive info: Returns generic message
 */
export function sanitizeErrorForUser(error: unknown): string {
  // UserSafeError is explicitly safe to show
  if (error instanceof UserSafeError) {
    return error.message
  }

  // Not an error object
  if (!(error instanceof Error)) {
    return GENERIC_ERROR_MESSAGE
  }

  const message: string = error.message || ''

  // Check for sensitive patterns
  if (containsSensitiveInfo(message)) {
    return GENERIC_ERROR_MESSAGE
  }

  // Tagged errors (from errore) are generally safe - they have structured messages
  if (
    '_tag' in error &&
    typeof (error as { _tag: unknown })._tag === 'string'
  ) {
    return message
  }

  // Short, simple error messages are probably safe
  if (message.length < 100 && message.indexOf('\n') === -1) {
    return message
  }

  // Default to generic message for safety
  return GENERIC_ERROR_MESSAGE
}

/**
 * Create a log-safe version of an error (preserves full details for logging).
 * Returns the original error message and stack trace.
 */
export function getErrorForLogging(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message
  }
  return String(error)
}
