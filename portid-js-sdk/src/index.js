import Dexie from "dexie";
import {
  encryptData,
  decryptData,
  generateRecoveryKey,
  hashPassword,
} from "./encryption.js";

/**
 * Custom error class for SDK-specific issues, making it easier for developers to catch errors.
 */
class PortIDError extends Error {
  constructor(message) {
    super(message);
    this.name = "PortIDError";
  }
}

/**
 * The main SDK class for interacting with the PortID sync service.
 * A developer will create an instance of this class to manage user data for their application.
 */
export default class PortID {
  /**
   * Initializes the SDK.
   * @param {string} appId - A unique identifier for the application using the SDK.
   * @param {string} apiBaseUrl - The root URL of the developer's deployed PortID Sync Server.
   */
  constructor(appId, apiBaseUrl) {
    if (!appId || !apiBaseUrl) {
      throw new PortIDError("appId and apiBaseUrl are required.");
    }
    this.appId = appId;
    this.apiBaseUrl = apiBaseUrl.endsWith("/")
      ? apiBaseUrl.slice(0, -1)
      : apiBaseUrl;

    // The SDK creates and manages its own private IndexedDB database.
    // The database name is made unique to the app using the SDK to prevent conflicts.
    this.db = new Dexie(`PortID_DB_${appId}`);
    this.db.version(1).stores({
      users: "&username, hashedPassword, recoveryKey, backupHash",
    });

    this.currentUser = null;
  }

  /**
   * A private helper method for making network requests to the sync server.
   * @param {string} endpoint - The API endpoint to call (e.g., '/api/set-hash').
   * @param {object} options - The options for the fetch request (method, headers, body).
   * @returns {Promise<object>} The JSON response from the API.
   */
  async _request(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
      if (!response.ok) {
        const errorData = await response.json();
        throw new PortIDError(
          `API Error: ${errorData.message || response.statusText}`
        );
      }
      return response.json();
    } catch (error) {
      throw new PortIDError(`Network or API error: ${error.message}`);
    }
  }

  /**
   * Registers a new user, generates their keys, and performs the initial backup.
   * @param {string} username - The user's desired username.
   * @param {string} password - The user's desired password.
   * @returns {Promise<{recoveryKey: string}>} An object containing the Recovery Key for the user to save.
   */
  async signUp(username, password) {
    if (!username || !password) {
      throw new PortIDError("Username and password are required.");
    }

    const existingUser = await this.db.users.get(username);
    if (existingUser) {
      throw new PortIDError("Username already exists locally.");
    }

    // Step 1: Generate the user's cryptographic keys.
    const recoveryKey = generateRecoveryKey();
    const hashedPassword = hashPassword(password);

    // Step 2: Register the username in the central directory with a temporary placeholder.
    await this._request("/api/set-hash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: this.appId,
        username,
        hash: "pending_first_backup",
      }),
    });

    // Step 3: Perform the initial, empty backup to get a real IPFS hash.
    const initialData = { sdk_version: "1.0.0" };
    const encryptedData = encryptData(initialData, recoveryKey);

    const backupResponse = await this._request("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encryptedData, username }),
    });

    const ipfsHash = backupResponse.ipfsHash;
    if (!ipfsHash) {
      throw new PortIDError("Initial backup did not return a valid IPFS hash.");
    }

    // Step 4: Update the central directory with the real IPFS hash.
    await this._request("/api/set-hash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: this.appId, username, hash: ipfsHash }),
    });

    const credentials = {
      username,
      hashedPassword,
      recoveryKey,
      backupHash: ipfsHash,
    };

    // Step 5: The SDK saves the full credentials to its own private database.
    await this.db.users.add(credentials);

    // Step 6: Return only the recoveryKey for the user to save.
    return { recoveryKey };
  }

  /**
   * Logs in a user on a trusted device by checking credentials against the local DB.
   * @param {string} username - The user's username.
   * @param {string} password - The user's password.
   * @returns {Promise<boolean>} True if login is successful.
   */
  async login(username, password) {
    const user = await this.db.users.get(username);
    const hashedPassword = hashPassword(password);

    if (user && user.hashedPassword === hashedPassword) {
      this.currentUser = username;
      return true;
    }
    return false;
  }

  /**
   * Logs out the current user.
   */
  logout() {
    this.currentUser = null;
  }

  /**
   * Encrypts and backs up the user's current application data.
   * @param {object} data - The JSON-serializable data object to back up.
   * @returns {Promise<string>} The new IPFS hash for the backup.
   */
  async backupData(data) {
    if (!this.currentUser) {
      throw new PortIDError(
        "User is not logged in. Please call login() first."
      );
    }
    const user = await this.db.users.get(this.currentUser);
    if (!user)
      throw new PortIDError("Could not find user credentials locally.");

    const encryptedData = encryptData(data, user.recoveryKey);

    const backupResponse = await this._request("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encryptedData, username: this.currentUser }),
    });

    const ipfsHash = backupResponse.ipfsHash;
    if (!ipfsHash)
      throw new PortIDError("Backup did not return a valid IPFS hash.");

    await this._request("/api/set-hash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: this.appId,
        username: this.currentUser,
        hash: ipfsHash,
      }),
    });

    await this.db.users.update(this.currentUser, { backupHash: ipfsHash });
    return ipfsHash;
  }

  /**
   * Restores and decrypts user data from the network using their recovery key.
   * @param {string} username - The user's username.
   * @param {string} recoveryKey - The user's saved recovery key.
   * @returns {Promise<object>} An object containing the decrypted data.
   */
  async restoreData(username, recoveryKey) {
    // 1. Get the backup location from the central directory.
    const { ipfsHash } = await this._request(
      `/api/get-hash?app_id=${this.appId}&username=${username}`
    );
    if (!ipfsHash)
      throw new PortIDError("Could not find a backup hash for this user.");

    // 2. Download the encrypted data from IPFS.
    const restoreResponse = await this._request(
      `/api/restore?hash=${ipfsHash}`
    );
    const encryptedDataBlob =
      restoreResponse.kaironBackup ||
      restoreResponse.pinataContent?.kaironBackup;
    if (!encryptedDataBlob)
      throw new PortIDError("Backup data blob is in an unexpected format.");

    // 3. Decrypt the data. This also verifies the recovery key is correct.
    const decryptedData = decryptData(encryptedDataBlob, recoveryKey);
    if (decryptedData === null) {
      throw new PortIDError(
        "Decryption failed. The Recovery Key is likely incorrect."
      );
    }

    // 4. Save the user's profile to this new device's local DB.
    // Password must be set separately by the application after this step.
    await this.db.users.put({
      username,
      recoveryKey,
      backupHash: ipfsHash,
      hashedPassword: null,
    });

    return decryptedData;
  }

  /**
   * Registers a periodic background sync event to enable automatic backups.
   * The application's service worker must be configured to handle the 'portid-auto-backup' event.
   * @param {number} [minIntervalHours=12] - The minimum interval in hours between backups.
   */
  async enableAutoBackup(minIntervalHours = 12) {
    if (!("serviceWorker" in navigator)) {
      throw new PortIDError(
        "Service Workers are not supported by this browser."
      );
    }

    const registration = await navigator.serviceWorker.ready;
    if (!("periodicSync" in registration)) {
      throw new PortIDError(
        "Periodic Background Sync is not supported by this browser."
      );
    }

    try {
      await registration.periodicSync.register("portid-auto-backup", {
        minInterval: minIntervalHours * 60 * 60 * 1000,
      });
      console.log("PortID auto-backup has been registered.");
    } catch (error) {
      throw new PortIDError(
        `Auto-backup registration failed: ${error.message}`
      );
    }
  }
}

