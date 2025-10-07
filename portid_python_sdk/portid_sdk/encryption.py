"""
Encryption utilities for PortID SDK.
"""

from typing import Dict, Any
from Crypto.Cipher import AES
from Crypto.Hash import SHA256
from Crypto.Random import get_random_bytes
import json
import base64

# AES block size is 16 bytes
BLOCK_SIZE = 16

def _pad(data: bytes) -> bytes:
    """Pads data to AES block size using PKCS#7 padding."""
    padding_len = BLOCK_SIZE - len(data) % BLOCK_SIZE
    padding = bytes([padding_len]) * padding_len
    return data + padding

def _unpad(data: bytes) -> bytes:
    """Removes PKCS#7 padding from decrypted data."""
    padding_len = data[-1]
    return data[:-padding_len]

def generate_recovery_key() -> str:
    """Generates a new, secure 32-byte random key and returns it as a hex string."""
    return get_random_bytes(32).hex()

def hash_password(password: str) -> str:
    """Hashes a password using SHA256 and returns the hex digest."""
    h = SHA256.new()
    h.update(password.encode('utf-8'))
    return h.hexdigest()

def encrypt_data(data_dict: Dict[str, Any], hex_key: str) -> str:
    """Encrypts a dictionary using AES and returns a Base64 encoded string."""
    try:
        key = bytes.fromhex(hex_key)
        data_string = json.dumps(data_dict)
        data_bytes = data_string.encode('utf-8')
        
        iv = get_random_bytes(AES.block_size)
        cipher = AES.new(key, AES.MODE_CBC, iv)
        
        padded_data = _pad(data_bytes)
        encrypted_bytes = cipher.encrypt(padded_data)
        
        # Prepend the IV to the ciphertext for use during decryption
        return base64.b64encode(iv + encrypted_bytes).decode('utf-8')
    except Exception as e:
        raise ValueError(f"Encryption failed: {e}")

def decrypt_data(encrypted_b64_string: str, hex_key: str) -> Dict[str, Any]:
    """Decrypts a Base64 string using AES and returns a dictionary."""
    try:
        key = bytes.fromhex(hex_key)
        encrypted_data = base64.b64decode(encrypted_b64_string)
        
        iv = encrypted_data[:AES.block_size]
        ciphertext = encrypted_data[AES.block_size:]
        
        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted_padded_bytes = cipher.decrypt(ciphertext)
        
        decrypted_bytes = _unpad(decrypted_padded_bytes)
        decrypted_string = decrypted_bytes.decode('utf-8')
        
        return json.loads(decrypted_string)
    except (ValueError, KeyError, json.JSONDecodeError) as e:
        # This error is common if the key is wrong
        raise ValueError(f"Decryption failed. The key is likely incorrect or the data is corrupt: {e}")