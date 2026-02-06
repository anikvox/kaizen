import { Storage } from "@plasmohq/storage"
import { ATTENTION_TRACKING_IGNORE_LIST } from "./default-settings"

const storage = new Storage()

/**
 * Check if a URL should be ignored based on the user's ignore list.
 * Supports:
 * - Plain text matching (checks if URL contains the pattern)
 * - Glob patterns with * wildcard
 * - Regex patterns (wrapped in /.../)
 */
export async function shouldIgnoreUrl(url: string): Promise<boolean> {
  const ignoreList = await storage.get<string | null>(ATTENTION_TRACKING_IGNORE_LIST.key)

  if (!ignoreList) {
    return false
  }

  const patterns = ignoreList
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("#")) // Skip empty lines and comments

  for (const pattern of patterns) {
    if (matchesPattern(url, pattern)) {
      return true
    }
  }

  return false
}

/**
 * Check if a URL matches a single pattern.
 */
function matchesPattern(url: string, pattern: string): boolean {
  // Regex pattern (wrapped in /.../)
  if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
    try {
      const regex = new RegExp(pattern.slice(1, -1))
      return regex.test(url)
    } catch {
      // Invalid regex, treat as plain text
      return url.includes(pattern)
    }
  }

  // Regex pattern with flags (e.g., /pattern/i)
  const regexWithFlags = pattern.match(/^\/(.+)\/([gimsuy]*)$/)
  if (regexWithFlags) {
    try {
      const regex = new RegExp(regexWithFlags[1], regexWithFlags[2])
      return regex.test(url)
    } catch {
      // Invalid regex, treat as plain text
      return url.includes(pattern)
    }
  }

  // Glob pattern with * wildcard
  if (pattern.includes("*")) {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars except *
      .replace(/\*/g, ".*") // Convert * to .*
    try {
      const regex = new RegExp(`^${regexPattern}$`, "i")
      return regex.test(url)
    } catch {
      return url.includes(pattern)
    }
  }

  // Plain text - check if URL contains the pattern (case-insensitive)
  return url.toLowerCase().includes(pattern.toLowerCase())
}

/**
 * Synchronously check URL against a pre-loaded ignore list.
 * Use this when you already have the ignore list loaded.
 */
export function shouldIgnoreUrlSync(url: string, ignoreList: string | null): boolean {
  if (!ignoreList) {
    return false
  }

  const patterns = ignoreList
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("#"))

  for (const pattern of patterns) {
    if (matchesPattern(url, pattern)) {
      return true
    }
  }

  return false
}
