# PortID SDK (JavaScript) by Harboria Labs

**PortID** is a client-side JavaScript SDK for building zero-knowledge, end-to-end encrypted applications. It provides a complete system for managing private, portable user data that can be synced across multiple devices.

## How It Works

PortID separates your application from your users' private data. The SDK runs in the user's browser, encrypts all data locally, and uses a self-hosted **PortID Sync Server** to communicate with a decentralized storage network (IPFS).

**Architecture:**
`[Your Application] <--> [PortID SDK] <--> [Your Deployed Sync Server] <--> [Postgres & IPFS]`

This means the server never has access to unencrypted data, providing a true zero-knowledge guarantee for your users.

## Getting Started

#### **1. Prerequisite: Deploy the Sync Server**

Before using this SDK, you must deploy the **[PortID Sync Server](https://github.com/Harboria-Labs/PortID)** to your hosting provider of choice (e.g., Vercel, Netlify). This server handles the communication with your PostgreSQL database and IPFS pinning service.

#### **2. Installation**

Install the SDK into your project using npm:

```bash
npm install portid-js-sdk
```

#### **3. Initialization**

Import and initialize the SDK in your application's main JavaScript file.

```javascript
import PortID from 'portid-js-sdk';

const sdk = new PortID(
    'your-unique-app-id',
    '[https://your-sync-server-url.com](https://your-sync-server-url.com)' // The URL of YOUR deployed PortID Sync Server
);
```

## Core Usage

The SDK provides simple `async` methods to handle complex user flows.

#### **Sign Up a New User**

```javascript
async function handleSignUp(username, password) {
    try {
        const { recoveryKey } = await sdk.signUp(username, password);
        
        // IMPORTANT: You must show this recovery key to the user
        // and instruct them to save it in a safe place.
        alert(`Sign-up successful! Your recovery key is: ${recoveryKey}`);
        
    } catch (error) {
        console.error(`Sign-up failed: ${error.message}`);
    }
}
```

#### **Log In a Returning User**

```javascript
async function handleLogin(username, password) {
    const isLoggedIn = await sdk.login(username, password);
    if (isLoggedIn) {
        console.log("Login successful!");
        // Proceed to load the main application
    } else {
        console.log("Invalid credentials.");
    }
}
```

#### **Backup User Data**

```javascript
async function saveAppData(data) {
    try {
        // The SDK's backupData method is simple.
        // It automatically uses the logged-in user's credentials.
        const newHash = await sdk.backupData(data);
        console.log("Data backed up successfully. New hash:", newHash);
    } catch (error) {
        console.error(`Backup failed: ${error.message}`);
    }
}
```

#### **Restore an Account on a New Device**

```javascript
async function restoreAccount(username, recoveryKey) {
    try {
        const restoredData = await sdk.restoreData(username, recoveryKey);
        
        // Use the returned data to populate your application's state.
        console.log('Data restored!', restoredData);
        
        // After restoring, prompt the user to set a new password for the device.
    } catch (error) {
        console.error(`Restore failed: ${error.message}`);
    }
}
```

## Advanced: Automatic "Backup on Close"

To provide a seamless experience, you can automatically back up a user's data when they close or navigate away from your app.

After a user successfully logs in, add this event listener:

```javascript
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        // This function should gather all the latest data from your app's state
        const latestData = getLatestAppData(); 
        
        // Call the backup method
        sdk.backupData(latestData);
    }
});
```

## API Reference

* `new PortID(appId, apiBaseUrl)`: Creates a new SDK instance.
* `sdk.signUp(username, password)`: Creates a new user and returns their Recovery Key.
* `sdk.login(username, password)`: Authenticates a user for the current session.
* `sdk.logout()`: Clears the current user session from the SDK.
* `sdk.backupData(data)`: Encrypts and saves the provided data object.
* `sdk.restoreData(username, recoveryKey)`: Downloads and decrypts user data.

---

For support, please open an issue on the [GitHub repository](https://github.com/Harboria-Labs/PortID/issues).
