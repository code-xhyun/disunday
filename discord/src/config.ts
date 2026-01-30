// Runtime configuration for Kimaki bot.
// Stores data directory path and provides accessors for other modules.
// Must be initialized before database or other path-dependent modules are used.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.disunday')

let dataDir: string | null = null

/**
 * Get the data directory path.
 * Falls back to ~/.disunday if not explicitly set.
 */
export function getDataDir(): string {
  if (!dataDir) {
    dataDir = DEFAULT_DATA_DIR
  }
  return dataDir
}

/**
 * Set the data directory path.
 * Creates the directory if it doesn't exist.
 * Must be called before any database or path-dependent operations.
 */
export function setDataDir(dir: string): void {
  const resolvedDir = path.resolve(dir)

  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true })
  }

  dataDir = resolvedDir
}

/**
 * Get the projects directory path (for /create-new-project command).
 * Returns <dataDir>/projects
 */
export function getProjectsDir(): string {
  return path.join(getDataDir(), 'projects')
}

// Default verbosity for channels that haven't set a per-channel override.
// Set via --verbosity CLI flag at startup.
import type { VerbosityLevel } from './database.js'

let defaultVerbosity: VerbosityLevel = 'tools-and-text'

export function getDefaultVerbosity(): VerbosityLevel {
  return defaultVerbosity
}

export function setDefaultVerbosity(level: VerbosityLevel): void {
  defaultVerbosity = level
}

const DEFAULT_LOCK_PORT = 29988

/**
 * Derive a lock port from the data directory path.
 * Returns 29988 for the default ~/.disunday directory (backwards compatible).
 * For custom data dirs, uses a hash to generate a port in the range 30000-39999.
 */
export function getLockPort(): number {
  const dir = getDataDir()

  // Use original port for default data dir (backwards compatible)
  if (dir === DEFAULT_DATA_DIR) {
    return DEFAULT_LOCK_PORT
  }

  // Hash-based port for custom data dirs
  let hash = 0
  for (let i = 0; i < dir.length; i++) {
    const char = dir.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  // Map to port range 30000-39999
  return 30000 + (Math.abs(hash) % 10000)
}

// Bash command whitelist for OpenCode sessions
// Default allowed bash commands for security
const DEFAULT_BASH_WHITELIST = [
  'git',
  'npm',
  'pnpm',
  'bun',
  'node',
  'npx',
  'bunx',
  'cat',
  'ls',
  'pwd',
  'echo',
  'grep',
  'find',
  'head',
  'tail',
  'wc',
  'tree',
  'which',
  'env',
  'printenv',
  'date',
  'uname',
  'mkdir',
  'touch',
  'cp',
  'mv',
  'rm', // file operations
  'curl',
  'wget', // network
  'tsc',
  'eslint',
  'prettier',
  'vitest',
  'jest', // dev tools
]

let bashWhitelist: string[] = DEFAULT_BASH_WHITELIST

export function getBashWhitelist(): string[] {
  return bashWhitelist
}

export function setBashWhitelist(whitelist: string[]): void {
  bashWhitelist = whitelist
}

// Rate limit configuration for Discord interactions
export type RateLimitConfig = {
  messagesPerMinute: number
  commandsPerMinute: number
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  messagesPerMinute: 10,
  commandsPerMinute: 20,
}

let rateLimitConfig: RateLimitConfig = DEFAULT_RATE_LIMIT

export function getRateLimitConfig(): RateLimitConfig {
  return rateLimitConfig
}

export function setRateLimitConfig(config: RateLimitConfig): void {
  rateLimitConfig = config
}

// File validation configuration for uploaded files
export type FileValidationConfig = {
  maxFileSizeBytes: number
  allowedMimeTypes: string[]
}

const DEFAULT_FILE_VALIDATION: FileValidationConfig = {
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
  ],
}

let fileValidationConfig: FileValidationConfig = DEFAULT_FILE_VALIDATION

export function getFileValidationConfig(): FileValidationConfig {
  return fileValidationConfig
}

export function setFileValidationConfig(config: FileValidationConfig): void {
  fileValidationConfig = config
}
