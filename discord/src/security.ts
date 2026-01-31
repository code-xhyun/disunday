// Security utilities for Disunday Discord bot.
// Provides encryption for sensitive data at rest and sanitization for user input.
// Uses AES-256-GCM with machine-derived keys for token/API key encryption.

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createTaggedError } from 'errore'
import { getDataDir } from './config.js'

// ═══════════════════════════════════════════════════════════════════════════
// ERROR DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export class EncryptionError extends createTaggedError({
  name: 'EncryptionError',
  message: 'Encryption operation failed: $reason',
}) {}

export class DecryptionError extends createTaggedError({
  name: 'DecryptionError',
  message: 'Decryption operation failed: $reason',
}) {}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type EncryptedData = {
  iv: string // Base64 encoded IV
  authTag: string // Base64 encoded auth tag
  encrypted: string // Base64 encoded ciphertext
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM recommended IV length
const SALT_LENGTH = 32
const KEY_LENGTH = 32 // 256 bits
const SALT_FILENAME = 'encryption.salt'
const APP_IDENTIFIER = 'com.disunday.discord'

// Scrypt parameters (memory-hard, resistant to GPU attacks)
const SCRYPT_OPTIONS = {
  N: 16384, // CPU/memory cost
  r: 8, // Block size
  p: 1, // Parallelization
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// Cache derived key in memory to avoid re-deriving on every operation
let cachedKey: Buffer | null = null

/**
 * Get or create the encryption salt.
 * Salt is stored in <dataDir>/encryption.salt and generated once per installation.
 */
function getOrCreateSalt(): Buffer {
  const dataDir = getDataDir()
  const saltPath = path.join(dataDir, SALT_FILENAME)

  if (fs.existsSync(saltPath)) {
    return fs.readFileSync(saltPath)
  }

  // Generate new salt on first use
  const salt = crypto.randomBytes(SALT_LENGTH)

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  fs.writeFileSync(saltPath, salt, { mode: 0o600 }) // Read/write only for owner
  return salt
}

/**
 * Derive machine fingerprint for key generation.
 * Combines stable machine-specific values with app identifier.
 */
function getMachineFingerprint(): string {
  return [
    os.platform(),
    os.homedir(),
    os.userInfo().username,
    APP_IDENTIFIER,
  ].join(':')
}

/**
 * Get the encryption key, deriving it from machine data if not cached.
 * Uses scrypt for key derivation (memory-hard, resistant to brute force).
 */
export function getEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey
  }

  const machineData = getMachineFingerprint()
  const salt = getOrCreateSalt()

  cachedKey = crypto.scryptSync(machineData, salt, KEY_LENGTH, SCRYPT_OPTIONS)
  return cachedKey
}

/**
 * Clear the cached encryption key.
 * Useful for testing or when the salt file changes.
 */
export function clearKeyCache(): void {
  cachedKey = null
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION / DECRYPTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns an object with IV, auth tag, and ciphertext (all base64 encoded).
 */
export function encrypt({
  plaintext,
  key,
}: {
  plaintext: string
  key: Buffer
}): EncryptedData {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encrypted: encrypted.toString('base64'),
  }
}

/**
 * Decrypt an encrypted data object using AES-256-GCM.
 * Throws DecryptionError if decryption fails (wrong key, corrupted data, etc).
 */
export function decrypt({
  data,
  key,
}: {
  data: EncryptedData
  key: Buffer
}): string {
  try {
    const iv = Buffer.from(data.iv, 'base64')
    const authTag = Buffer.from(data.authTag, 'base64')
    const encrypted = Buffer.from(data.encrypted, 'base64')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  } catch (error) {
    throw new DecryptionError({
      reason: error instanceof Error ? error.message : 'Unknown error',
      cause: error,
    })
  }
}

/**
 * Serialize encrypted data to a string for database storage.
 * Format: iv:authTag:encrypted (all base64)
 */
export function serializeEncrypted(data: EncryptedData): string {
  return `${data.iv}:${data.authTag}:${data.encrypted}`
}

/**
 * Deserialize encrypted data from database storage format.
 * Returns null if the format is invalid.
 */
export function deserializeEncrypted(serialized: string): EncryptedData | null {
  const parts = serialized.split(':')
  if (parts.length !== 3) {
    return null
  }

  const [iv, authTag, encrypted] = parts
  if (!iv || !authTag || !encrypted) {
    return null
  }

  return { iv, authTag, encrypted }
}

/**
 * Check if a string appears to be encrypted data.
 * Encrypted data has format: base64:base64:base64
 */
export function isEncrypted(value: string): boolean {
  if (!value || !value.includes(':')) {
    return false
  }

  const parts = value.split(':')
  if (parts.length !== 3) {
    return false
  }

  // Check if all parts look like base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/
  return parts.every((part) => {
    return part.length > 0 && base64Regex.test(part)
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sanitize text for safe use in XML/HTML contexts.
 * Escapes: < > & " '
 */
export function sanitizeForXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Sanitize text for safe use in Discord messages.
 * Escapes markdown special characters to prevent formatting injection.
 */
export function sanitizeForDiscord(text: string): string {
  return text.replace(/([*_~`|\\])/g, '\\$1')
}
