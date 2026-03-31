// netlify/functions/crypto.mjs
// Shared AES-256-GCM encryption helpers used by settings.mjs and calendar-connections.mjs.
//
// Requires SETTINGS_ENCRYPTION_KEY env var — a 32-byte (64 hex char) secret.
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Set in Netlify UI → Site → Environment variables.
//
// Ciphertext format stored in DB: "<iv_hex>:<tag_hex>:<ciphertext_hex>"

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

export function getEncryptionKey() {
    const raw = process.env.SETTINGS_ENCRYPTION_KEY || '';
    if (!raw) throw new Error('SETTINGS_ENCRYPTION_KEY is not set');
    // Accept hex string (64 chars) or raw string — hash to 32 bytes either way
    return createHash('sha256').update(raw).digest();
}

export function encrypt(plaintext) {
    if (!plaintext) return null;
    const key = getEncryptionKey();
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(stored) {
    if (!stored) return null;
    try {
        const key = getEncryptionKey();
        const parts = stored.split(':');
        if (parts.length !== 3) return null;
        const iv        = Buffer.from(parts[0], 'hex');
        const tag       = Buffer.from(parts[1], 'hex');
        const encrypted = Buffer.from(parts[2], 'hex');
        const decipher  = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return decipher.update(encrypted) + decipher.final('utf8');
    } catch (err) {
        console.error('Decryption failed:', err.message);
        return null;
    }
}
