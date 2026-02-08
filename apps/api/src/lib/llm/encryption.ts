import crypto from "crypto";
import { env } from "../env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * Key must be 32 bytes (256 bits) for AES-256.
 */
function getKey(): Buffer {
  if (!env.encryptionKey) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  // If key is hex-encoded (64 chars = 32 bytes)
  if (env.encryptionKey.length === 64) {
    return Buffer.from(env.encryptionKey, "hex");
  }

  // If key is base64-encoded
  if (env.encryptionKey.length === 44) {
    return Buffer.from(env.encryptionKey, "base64");
  }

  // Otherwise, derive a 32-byte key using SHA-256
  return crypto.createHash("sha256").update(env.encryptionKey).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing: IV + ciphertext + auth tag
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine IV + ciphertext + auth tag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded encrypted string using AES-256-GCM.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  // Extract IV, ciphertext, and auth tag
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH,
  );

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Safely decrypt an API key, returning null if decryption fails or key is empty.
 */
export function decryptApiKey(
  encryptedKey: string | null | undefined,
): string | null {
  if (!encryptedKey) return null;

  try {
    return decrypt(encryptedKey);
  } catch (error) {
    console.error("Failed to decrypt API key:", error);
    return null;
  }
}
