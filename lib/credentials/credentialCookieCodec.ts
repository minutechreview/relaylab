import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { SessionCredentials } from "./sessionCredentials";

/**
 * Encrypts/decrypts a `SessionCredentials` payload for embedding directly in
 * the session cookie, so credential state survives across independent
 * serverless function instances (no shared process memory to rely on).
 *
 * AES-256-GCM keyed by SHA-256(SESSION_ENCRYPTION_KEY). Without that env var
 * set, encoding is skipped entirely — callers degrade to the pre-existing
 * in-memory-only behavior (correct on a single long-running process, lossy
 * across instances) rather than falling back to something insecure.
 */

function deriveKey(): Buffer | null {
  const secret = process.env.SESSION_ENCRYPTION_KEY;
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

export function encodeCredentialsCookiePayload(credentials: SessionCredentials): string | null {
  const key = deriveKey();
  if (!key) return null;
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf-8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

export function decodeCredentialsCookiePayload(payload: string): SessionCredentials | null {
  const key = deriveKey();
  if (!key) return null;
  try {
    const raw = Buffer.from(payload, "base64url");
    if (raw.length < 12 + 16) return null;
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed: unknown = JSON.parse(plaintext.toString("utf-8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as SessionCredentials;
  } catch {
    return null;
  }
}
