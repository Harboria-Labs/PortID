# PortID Python SDK

Zero-knowledge encrypted data sync for Python applications.

## Install

```bash
pip install harboria-portid
```

## Quick Start

```python
from portid_sdk import PortID, PortIDError

sdk = PortID(app_id="my-app", api_base_url="https://sync.portid.dev")

# Sign up
result = sdk.sign_up("alice", "strong_password_123")
print(f"Recovery key: {result['recovery_key']}")  # User must save this!

# Login
sdk.login("alice", "strong_password_123")

# Backup data (encrypted before leaving your machine)
sdk.backup_data({"notes": ["hello", "world"], "preferences": {"theme": "dark"}})

# Load data (downloaded + decrypted locally)
data = sdk.load_data()
print(data)  # {"notes": ["hello", "world"], ...}

# Restore on new device (only needs username + recovery key)
data = sdk.restore_data("alice", "your_64_char_hex_recovery_key")
```

## Use with existing auth (Firebase, Clerk, etc.)

```python
# You already have auth — just add encrypted sync
sdk = PortID(app_id="my-app", api_base_url="https://sync.portid.dev")
result = sdk.attach_to_existing_user(firebase_uid)
# Now sdk.backup_data() / sdk.load_data() work with encrypted IPFS storage
```

## Cross-platform

Data encrypted with the Python SDK can be decrypted by the JS SDK and vice versa.
Both use the same format: AES-256-GCM with base64(iv + ciphertext + tag).

## Security

- AES-256-GCM (authenticated encryption)
- PBKDF2 with 250,000 iterations for password hashing
- 256-bit recovery keys
- Zero dependencies on deprecated crypto libraries
