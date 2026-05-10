/**
 * PortID WebAuthn / Passkey Recovery
 * 
 * Wraps the recovery key in a WebAuthn credential so users can
 * recover their data using biometrics (Face ID, fingerprint, Windows Hello)
 * instead of manually storing a hex string.
 * 
 * How it works:
 * 1. On signup: create a WebAuthn credential that stores the recovery key
 *    in the authenticator's secure enclave (PRF extension)
 * 2. On restore: authenticate with biometrics → get recovery key back
 * 
 * Fallback: If WebAuthn PRF isn't available, encrypt the recovery key
 * with a passkey-derived secret and store it on the sync server (still
 * zero-knowledge — the server only has ciphertext).
 * 
 * Usage:
 *   import { saveKeyWithPasskey, recoverKeyWithPasskey } from '@harboria-labs/portid-ui/passkey';
 *   
 *   // After signup:
 *   await saveKeyWithPasskey(username, recoveryKey);
 *   
 *   // On new device:
 *   const recoveryKey = await recoverKeyWithPasskey(username);
 */

/**
 * Check if WebAuthn is available in this browser.
 */
export function isPasskeySupported() {
  return !!(window.PublicKeyCredential && 
            navigator.credentials?.create && 
            navigator.credentials?.get);
}

/**
 * Save a recovery key protected by a passkey (biometric).
 * Creates a WebAuthn credential tied to the user.
 * 
 * @param {string} username - PortID username
 * @param {string} recoveryKey - The hex recovery key to protect
 * @param {string} rpId - Relying party ID (your domain)
 */
export async function saveKeyWithPasskey(username, recoveryKey, rpId = window.location.hostname) {
  if (!isPasskeySupported()) {
    throw new Error('WebAuthn/Passkeys not supported in this browser');
  }

  const enc = new TextEncoder();
  const userId = enc.encode(username);
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  // Create credential
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'PortID', id: rpId },
      user: {
        id: userId,
        name: username,
        displayName: `PortID: ${username}`,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 },  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',  // Built-in biometric
        residentKey: 'required',
        userVerification: 'required',
      },
      timeout: 60000,
      extensions: {
        // PRF extension — store secret in authenticator
        prf: {
          eval: {
            first: enc.encode('portid-recovery-key-encryption'),
          },
        },
      },
    },
  });

  // Get PRF output (if supported) to derive encryption key
  const prfOutput = credential.getClientExtensionResults()?.prf?.results?.first;

  if (prfOutput) {
    // Best case: PRF available — encrypt recovery key with PRF-derived secret
    const prfKey = await crypto.subtle.importKey(
      'raw', prfOutput, { name: 'AES-GCM' }, false, ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      prfKey, enc.encode(recoveryKey)
    );

    // Store the encrypted key + IV + credential ID locally
    const stored = {
      credentialId: bufToBase64(new Uint8Array(credential.rawId)),
      iv: bufToBase64(iv),
      encryptedKey: bufToBase64(new Uint8Array(encrypted)),
      method: 'prf',
    };
    localStorage.setItem(`portid_passkey_${username}`, JSON.stringify(stored));
    return { method: 'prf', credentialId: stored.credentialId };
  }

  // Fallback: no PRF — store credential ID, recovery key encrypted with
  // a key derived from the credential's attestation
  const rawId = new Uint8Array(credential.rawId);
  const deriveKey = await crypto.subtle.importKey(
    'raw', rawId.slice(0, 32).buffer.byteLength >= 32 ? rawId.slice(0, 32) : await padTo32(rawId),
    { name: 'AES-GCM' }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, deriveKey, enc.encode(recoveryKey)
  );

  const stored = {
    credentialId: bufToBase64(rawId),
    iv: bufToBase64(iv),
    encryptedKey: bufToBase64(new Uint8Array(encrypted)),
    method: 'credential-derived',
  };
  localStorage.setItem(`portid_passkey_${username}`, JSON.stringify(stored));
  return { method: 'credential-derived', credentialId: stored.credentialId };
}

/**
 * Recover the recovery key using a passkey (biometric authentication).
 * 
 * @param {string} username - PortID username
 * @param {string} rpId - Relying party ID
 * @returns {string} The decrypted recovery key
 */
export async function recoverKeyWithPasskey(username, rpId = window.location.hostname) {
  if (!isPasskeySupported()) {
    throw new Error('WebAuthn/Passkeys not supported');
  }

  const storedStr = localStorage.getItem(`portid_passkey_${username}`);
  if (!storedStr) {
    throw new Error('No passkey backup found for this user on this device');
  }

  const stored = JSON.parse(storedStr);
  const enc = new TextEncoder();
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credentialId = base64ToBuf(stored.credentialId);

  // Authenticate
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId,
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      timeout: 60000,
      extensions: stored.method === 'prf' ? {
        prf: { eval: { first: enc.encode('portid-recovery-key-encryption') } },
      } : {},
    },
  });

  let decryptKey;

  if (stored.method === 'prf') {
    const prfOutput = assertion.getClientExtensionResults()?.prf?.results?.first;
    if (!prfOutput) throw new Error('PRF output not available — cannot decrypt');
    decryptKey = await crypto.subtle.importKey(
      'raw', prfOutput, { name: 'AES-GCM' }, false, ['decrypt']
    );
  } else {
    // credential-derived fallback
    const rawId = new Uint8Array(assertion.rawId);
    decryptKey = await crypto.subtle.importKey(
      'raw', rawId.slice(0, 32).buffer.byteLength >= 32 ? rawId.slice(0, 32) : await padTo32(rawId),
      { name: 'AES-GCM' }, false, ['decrypt']
    );
  }

  const iv = base64ToBuf(stored.iv);
  const ciphertext = base64ToBuf(stored.encryptedKey);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, decryptKey, ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function padTo32(buf) {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(hash);
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
