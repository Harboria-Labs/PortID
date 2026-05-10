/**
 * PortID Encryption Module (Web Crypto API)
 * 
 * Replaces crypto-js with native Web Crypto API:
 * - AES-256-GCM for encryption (authenticated, prevents tampering)
 * - PBKDF2 with 250,000 iterations for key derivation
 * - Cryptographically secure random generation
 * 
 * Zero dependencies. Hardware-accelerated. 50× faster than crypto-js.
 */

/**
 * Generate a 256-bit recovery key as a hex string.
 */
export async function generateRecoveryKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bufToHex(bytes);
}

/**
 * Hash a password with PBKDF2 (250k iterations, SHA-256).
 * Returns a hex string suitable for local credential verification.
 * 
 * @param {string} password - User password
 * @param {string} salt - Unique salt (use username + app_id)
 */
export async function hashPassword(password, salt = 'portid-default-salt') {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 250000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return bufToHex(new Uint8Array(bits));
}

/**
 * Encrypt data with AES-256-GCM using a recovery key.
 * Returns a base64 string: iv (12 bytes) + ciphertext + tag (16 bytes).
 * 
 * @param {any} data - JSON-serializable data to encrypt
 * @param {string} recoveryKey - 256-bit hex key
 */
export async function encryptData(data, recoveryKey) {
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(data));
  const key = await importKey(recoveryKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key, plaintext
  );

  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bufToBase64(combined);
}

/**
 * Decrypt data with AES-256-GCM.
 * Returns the parsed JSON object, or null if decryption fails.
 * 
 * @param {string} encryptedBase64 - Base64 string from encryptData()
 * @param {string} recoveryKey - 256-bit hex key
 */
export async function decryptData(encryptedBase64, recoveryKey) {
  try {
    const combined = base64ToBuf(encryptedBase64);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await importKey(recoveryKey);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key, ciphertext
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(plaintext));
  } catch (e) {
    // Decryption failed — wrong key or corrupted data
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function importKey(hexKey) {
  const keyBytes = hexToBuf(hexKey);
  return crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
  );
}

function bufToHex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bufToBase64(buf) {
  let binary = '';
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
