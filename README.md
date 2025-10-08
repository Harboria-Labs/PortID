# PortID SDK by Harboria Labs

**PortID** is a developer stack for building applications where users have full ownership of their data. It provides a secure, zero-knowledge, and decentralized user data and sync system.

This repository contains the client-side SDKs (JavaScript and Python) and the required self-hosted **PortID Sync Server**.

## 🌟 Features

* **Zero-Knowledge Architecture:** The server never has access to user passwords or unencrypted data.
* **End-to-End Encrypted (E2EE):** All user data is encrypted and decrypted only on the user's device.
* **Decentralized Storage:** User data is stored on IPFS, not a central server.
* **Cross-Platform:** SDKs are available for JavaScript (browser) and Python.
* **"Batteries-Included":** The JavaScript SDK manages its own local storage for user credentials.
* **Automatic Backups:** Supports a "Backup on Close" model for seamless data synchronization.

## 📦 SDKs Available

This repository contains two SDKs:

| SDK Folder          | Language   | Platform        | Package Name                |
| ------------------- | ---------- | --------------- | --------------------------- |
| `portid-js-sdk`     | JavaScript | Browser         | `@harboria-labs/portid-js-sdk` |
| `portid_python_sdk` | Python     | Backend/Desktop | `harboria-portid`            |

## 🚀 Quick Start

### JavaScript SDK

**Installation:**

```bash
npm install @harboria-labs/portid-js-sdk
```

**Basic Usage:**

```javascript
import PortID from '@harboria-labs/portid-js-sdk';

// Initialize the SDK
const sdk = new PortID(
    'my-app-id',
    '[https://my-sync-server.vercel.app](https://my-sync-server.vercel.app)'
);

// Sign up a new user
const { recoveryKey } = await sdk.signUp(username, password);

// Login
const isLoggedIn = await sdk.login(username, password);

// Backup data
if (isLoggedIn) {
    const newHash = await sdk.backupData(your_app_data);
}
```

📖 **Full JavaScript Documentation →** (Link to JS README)

### Python SDK

**Installation:**

```bash
pip install harboria-portid
```

**Basic Usage:**

```python
from portid_sdk import PortID, PortIDError

# Initialize the SDK
sdk = PortID(
    app_id='my-python-app-v1',
    api_base_url='[https://my-sync-server.vercel.app](https://my-sync-server.vercel.app)'
)

try:
    # Sign up a new user and get their credentials
    credentials = sdk.sign_up('test_user', 'strong_password123')
    
    # The application is responsible for saving these credentials locally
    print(f"Sign-up successful! Recovery Key: {credentials['recovery_key']}")

except PortIDError as e:
    print(f"An error occurred: {e}")
```

📖 **Full Python Documentation →** (Link to Python README)

### 🔧 Prerequisites

Before using PortID, you need to deploy the **PortID Sync Server**. The server code is included in this repository.

📖 **Deploy PortID Sync Server Guide →** (Link to server setup guide)

## 🏗️ Architecture

```
┌─────────────────┐
│   Your App      │
│  (JS/Python)    │
└────────┬────────┘
         │
         ├─── PortID SDK (Client-Side Encryption)
         │
         ↓
┌─────────────────┐
│  PortID Sync    │
│ Server (Self-Hosted) │
└────────┬────────┘
         │
         ├─── PostgreSQL (Directory)
         └─── IPFS (Encrypted Data Storage)
```

**Key Principle:** All encryption/decryption happens on the client side. The sync server only handles encrypted data and never has access to user passwords or decrypted content.

---

<div align="center">
Built with ❤️ by Harboria Labs
<br />
⭐ Star us on GitHub if you find this project useful!
</div>
