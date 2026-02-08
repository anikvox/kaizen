/**
 * PII Anonymizer for Opik traces using @cdssnc/sanitize-pii.
 * Sanitizes sensitive data before logging to Opik.
 */

import { PiiSanitizer, sanitizePii } from "@cdssnc/sanitize-pii";

// Global sanitizer instance with custom configuration
let sanitizer: PiiSanitizer | null = null;

/**
 * Get or create the sanitizer instance
 */
function getSanitizer(): PiiSanitizer {
  if (!sanitizer) {
    // Use default patterns from the library
    sanitizer = new PiiSanitizer({
      replacementTemplate: "[REDACTED:{name}]",
    });
  }
  return sanitizer;
}

/**
 * Add custom PII patterns to the sanitizer
 */
export function addAnonymizeRules(
  patterns: Array<{ name: string; regex: RegExp }>,
): void {
  sanitizer = new PiiSanitizer({
    replacementTemplate: "[REDACTED:{name}]",
    patterns,
  });
}

/**
 * Reset to default sanitizer configuration
 */
export function clearAnonymizeRules(): void {
  sanitizer = null;
}

/**
 * Anonymize a string value using sanitize-pii
 */
export function anonymizeText(text: string): string {
  if (!text || typeof text !== "string") {
    return text;
  }

  // Use the global sanitizer or the simple function
  if (sanitizer) {
    return sanitizer.sanitize(text);
  }

  return sanitizePii(text);
}

/**
 * Recursively anonymize an object (for trace input/output/metadata)
 */
export function anonymizeData<T>(data: T, maxDepth = 10): T {
  if (maxDepth <= 0) {
    return data;
  }

  if (typeof data === "string") {
    return anonymizeText(data) as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => anonymizeData(item, maxDepth - 1)) as T;
  }

  if (data && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Redact sensitive keys entirely
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = anonymizeData(value, maxDepth - 1);
      }
    }
    return result as T;
  }

  return data;
}

/**
 * Anonymize only user input data, not system outputs.
 * Use this for trace inputs where user data might be present.
 */
export function anonymizeInput<T>(data: T): T {
  return anonymizeData(data);
}

/**
 * Keep output data as-is (don't anonymize LLM responses).
 * Only redact sensitive keys.
 */
export function anonymizeOutput<T>(data: T, maxDepth = 10): T {
  if (maxDepth <= 0) {
    return data;
  }

  // Don't anonymize strings in outputs - we want to see LLM responses
  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => anonymizeOutput(item, maxDepth - 1)) as T;
  }

  if (data && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Only redact sensitive keys, don't anonymize the actual content
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = anonymizeOutput(value, maxDepth - 1);
      }
    }
    return result as T;
  }

  return data;
}

/**
 * Check if a key name suggests sensitive data
 */
function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = [
    /^userId$/i,
    /^user[_-]?id$/i,
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /auth/i,
    /credential/i,
    /private[_-]?key/i,
  ];

  return sensitivePatterns.some((pattern) => pattern.test(key));
}
