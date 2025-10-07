# PortID SDK by Harboria Labs

**PortID** is a client-side SDK for a zero-knowledge, end-to-end encrypted, and decentralized user data sync system. It allows developers to easily add a secure, multi-device data architecture to their applications.

This SDK is the client-side library and requires a separately deployed **PortID Sync Server**.

## Features

* **Zero-Knowledge:** The server never has access to user passwords or unencrypted data.
* **End-to-End Encrypted (E2EE):** All user data is encrypted on the client device before being uploaded.
* **Decentralized Storage:** Uses IPFS for resilient, user-controlled data storage.
* **Platform-Agnostic:** Can be used with any front-end or back-end framework.
* **Configurable Storage:** Supports memory, file, or custom backends for flexible data persistence.

## Installation

Install from PyPI (post-publication):

```bash
pip install portid-sdk
For development:
bashpip install pycryptodome requests
Usage
Here is a basic example of how to use the PortID SDK in a Python application.
pythonfrom portid_sdk import PortID
from portid_sdk.exceptions import PortIDError

# 1. Configure the SDK with your app's details
sdk = PortID(
    app_id='my-awesome-app-v1',
    api_base_url='https://my-sync-server.com'  # The URL of your deployed PortID Sync Server
)

# 2. Sign up a new user
try:
    new_user_credentials = sdk.sign_up('new_user', 'a-very-strong-password')
    print("Sign-up successful! Save these credentials in your app's local storage.")
    print(f"Recovery Key: {new_user_credentials['recovery_key']}")
    
except ValueError as e:
    print(f"Error: {e}")
except PortIDError as e:
    print(f"SDK Error: {e}")

# 3. Sign in an existing user
try:
    if sdk.sign_in('new_user', 'a-very-strong-password'):
        print("Sign-in successful!")
    else:
        print("Sign-in failed.")
except PortIDError as e:
    print(f"Sign-in Error: {e}")

# 4. Restore data using recovery key
try:
    restored_data = sdk.restore(new_user_credentials['recovery_key'], 'a-very-strong-password')
    print("Data restored:", restored_data)
except PortIDError as e:
    print(f"Restore Error: {e}")
Configurable Storage Example
For file-based persistence:
pythonimport shelve
from typing import Any, Optional

class FileStorage:
    def __init__(self, path: str):
        self.db = shelve.open(path)
    
    def store(self, key: str, value: Any) -> None:
        self.db[key] = value
    
    def retrieve(self, key: str) -> Optional[Any]:
        return self.db.get(key)
    
    def delete(self, key: str) -> None:
        self.db.pop(key, None)
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.db.close()

# Usage:
with FileStorage("./portid_data.db") as custom_storage:
    sdk_with_file = PortID('my-app', 'https://server.com', storage_backend=custom_storage)
    # ... perform operations
Backup and Restore Workflows

Manual Backup: Encrypt and upload data via sdk.backup(data_dict) (extend as needed).
Restore: Use sdk.restore(recovery_key, password) to decrypt and reload data.

Contributing
Contributions are welcome! Please fork the repository and submit pull requests. Ensure code adheres to PEP 8 standards.

https://opensource.org/licenses/MIT