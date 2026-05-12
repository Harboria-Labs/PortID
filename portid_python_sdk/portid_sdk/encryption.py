"""
PortID Encryption Module (Python)

Cross-compatible with the JS SDK v0.2.0:
- AES-256-GCM for encryption (authenticated)
- PBKDF2 with 250,000 iterations for password hashing
- 256-bit recovery keys

The encrypted format is: base64(iv[12] + ciphertext + tag[16])
This is identical to the JS SDK so data encrypted in browser
can be decrypted in Python and vice versa.
"""

import os
import json
import base64
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes


def generate_recovery_key() -> str:
    """Generate a 256-bit recovery key as a hex string."""
    return os.urandom(32).hex()


def hash_password(password: str, salt: str = "portid-default-salt") -> str:
    """
    Hash a password with PBKDF2 (250k iterations, SHA-256).
    Returns a hex string. Compatible with JS SDK hashPassword().
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt.encode("utf-8"),
        iterations=250000,
    )
    derived = kdf.derive(password.encode("utf-8"))
    return derived.hex()


def encrypt_data(data, recovery_key: str) -> str:
    """
    Encrypt data with AES-256-GCM.
    Returns base64 string: iv(12) + ciphertext + tag(16).
    Cross-compatible with JS SDK encryptData().
    """
    key_bytes = bytes.fromhex(recovery_key)
    plaintext = json.dumps(data).encode("utf-8")
    iv = os.urandom(12)

    aesgcm = AESGCM(key_bytes)
    # AES-GCM returns ciphertext + tag concatenated
    ciphertext_and_tag = aesgcm.encrypt(iv, plaintext, None)

    # Prepend IV
    combined = iv + ciphertext_and_tag
    return base64.b64encode(combined).decode("utf-8")


def decrypt_data(encrypted_base64: str, recovery_key: str):
    """
    Decrypt data with AES-256-GCM.
    Returns parsed JSON object, or None if decryption fails.
    Cross-compatible with JS SDK decryptData().
    """
    try:
        key_bytes = bytes.fromhex(recovery_key)
        combined = base64.b64decode(encrypted_base64)
        iv = combined[:12]
        ciphertext_and_tag = combined[12:]

        aesgcm = AESGCM(key_bytes)
        plaintext = aesgcm.decrypt(iv, ciphertext_and_tag, None)
        return json.loads(plaintext.decode("utf-8"))
    except Exception:
        return None
