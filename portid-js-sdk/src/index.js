import Dexie from "dexie";
import {
  encryptData,
  decryptData,
  generateRecoveryKey,
  hashPassword,
} from "./encryption.js";

/**
 * Custom error class for SDK-specific issues.
 */
export class PortIDError extends Error {
  constructor(message) {
    super(message);
    this.name = "PortIDError";
  }
}

/**
 * PortID SDK — Zero-knowledge encrypted data sync.
 * 
 * Usage:
 *   const sdk = new PortID('my-app', 'https://sync.portid.dev');
 *   const { recoveryKey } = await sdk.signUp('alice', 'password123');
 *   await sdk.login('alice', 'password123');
 *   await sdk.backupData({ notes: [...] });
 *   const data = await sdk.loadData();
 */
export default class PortID {
  /**
   * @param {string} appId - Unique app identifier
   * @param {string} apiBaseUrl - PortID sync server URL
   */
  constructor(appId, apiBaseUrl) {
    if (!appId || !apiBaseUrl) {
      throw new PortIDError("appId and apiBaseUrl are required.");
    }
    this.appId = appId;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');

    this.db = new Dexie(`PortID_DB_${appId}`);
    this.db.version(1).stores({
      users: "&username, hashedPassword, recoveryKey, backupHash",
    });

    this.currentUser = null;
  }

  // ── Network ─────────────────────────────────────────────────────────────

  async _request(endpoint, options = {}) {
    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
    if (!response.ok) {
      let msg = response.statusText;
      try { const d = await response.json(); msg = d.error || d.message || msg; } catch {}
      throw new PortIDError(`API Error (${response.status}): ${msg}`);
    }
    return response.json();
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  /**
   * Register a new user. Returns the recovery key (user must save this).
   */
  async signUp(username, password) {
    if (!username || !password) {
      throw new PortIDError("Username and password are required.");
    }

    const existingUser = await this.db.users.get(username);
    if (existingUser) {
      throw new PortIDError("Username already exists locally.");
    }

    // Generate crypto keys
    const recoveryKey = await generateRecoveryKey();
    const hashedPassword = await hashPassword(password, `${this.appId}:${username}`);

    // Register on sync server
    await this._request("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: this.appId, username }),
    });

    // Initial backup
    const initialData = { _portid: { version: "0.2.0", created: Date.now() } };
    const encryptedData = await encryptData(initialData, recoveryKey);

    const backupResponse = await this._request("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encryptedData, username, app_id: this.appId }),
    });

    const ipfsHash = backupResponse.ipfsHash;
    if (!ipfsHash) {
      throw new PortIDError("Initial backup did not return a valid hash.");
    }

    // Update directory
    await this._request("/api/set-hash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: this.appId, username, hash: ipfsHash }),
    });

    // Save credentials locally
    await this.db.users.add({ username, hashedPassword, recoveryKey, backupHash: ipfsHash });
    this.currentUser = username;

    return { recoveryKey };
  }

  /**
   * Login on a trusted device (checks local credentials).
   */
  async login(username, password) {
    const user = await this.db.users.get(username);
    if (!user) return false;

    const hashedPassword = await hashPassword(password, `${this.appId}:${username}`);
    if (user.hashedPassword === hashedPassword) {
      this.currentUser = username;
      return true;
    }
    return false;
  }

  /**
   * Logout.
   */
  logout() {
    this.currentUser = null;
  }

  /**
   * Check if a user is logged in.
   */
  get isLoggedIn() {
    return this.currentUser !== null;
  }

  // ── Data Sync ──────────────────────────────────────────────────────────

  /**
   * Encrypt and backup data to IPFS.
   * @param {any} data - JSON-serializable data
   * @returns {string} IPFS hash
   */
  async backupData(data) {
    if (!this.currentUser) {
      throw new PortIDError("Not logged in.");
    }
    const user = await this.db.users.get(this.currentUser);
    if (!user) throw new PortIDError("User credentials not found locally.");

    const encryptedData = await encryptData(data, user.recoveryKey);

    const backupResponse = await this._request("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encryptedData, username: this.currentUser, app_id: this.appId }),
    });

    const ipfsHash = backupResponse.ipfsHash;
    if (!ipfsHash) throw new PortIDError("Backup did not return a valid hash.");

    // Update directory + local
    await this._request("/api/set-hash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: this.appId, username: this.currentUser, hash: ipfsHash }),
    });
    await this.db.users.update(this.currentUser, { backupHash: ipfsHash });

    return ipfsHash;
  }

  /**
   * Load and decrypt the current user's data from IPFS.
   * @returns {any} Decrypted data
   */
  async loadData() {
    if (!this.currentUser) {
      throw new PortIDError("Not logged in.");
    }
    const user = await this.db.users.get(this.currentUser);
    if (!user || !user.backupHash) {
      throw new PortIDError("No backup found for this user.");
    }

    const restoreResponse = await this._request(`/api/restore?hash=${user.backupHash}`);
    const encryptedBlob = restoreResponse.kaironBackup || restoreResponse.pinataContent?.kaironBackup;
    if (!encryptedBlob) {
      throw new PortIDError("Backup data is in an unexpected format.");
    }

    const decryptedData = await decryptData(encryptedBlob, user.recoveryKey);
    if (decryptedData === null) {
      throw new PortIDError("Decryption failed. Recovery key may be incorrect.");
    }

    return decryptedData;
  }

  /**
   * Restore data on a new device using username + recovery key.
   * @param {string} username
   * @param {string} recoveryKey
   * @returns {any} Decrypted data
   */
  async restoreData(username, recoveryKey) {
    const { ipfsHash } = await this._request(
      `/api/get-hash?app_id=${this.appId}&username=${username}`
    );
    if (!ipfsHash) throw new PortIDError("No backup found for this user.");

    const restoreResponse = await this._request(`/api/restore?hash=${ipfsHash}`);
    const encryptedBlob = restoreResponse.kaironBackup || restoreResponse.pinataContent?.kaironBackup;
    if (!encryptedBlob) throw new PortIDError("Backup data format unexpected.");

    const decryptedData = await decryptData(encryptedBlob, recoveryKey);
    if (decryptedData === null) {
      throw new PortIDError("Decryption failed. Recovery key is incorrect.");
    }

    // Save to local DB for future logins
    await this.db.users.put({ username, recoveryKey, backupHash: ipfsHash, hashedPassword: null });

    // Register new device
    await this._request("/api/device/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: this.appId, username }),
    });

    this.currentUser = username;
    return decryptedData;
  }

  // ── Integration (existing auth) ───────────────────────────────────────

  /**
   * Attach PortID encrypted sync to an existing authenticated user.
   * Use when you already have auth (Firebase, Clerk, etc.) and want to
   * add encrypted data sync without replacing your login system.
   * 
   * @param {string} externalUserId - Your existing user ID (from Firebase, etc.)
   * @returns {{ recoveryKey: string }} Recovery key for this user
   */
  async attachToExistingUser(externalUserId) {
    if (!externalUserId) throw new PortIDError("externalUserId required.");

    const username = `ext_${externalUserId}`;
    const existingUser = await this.db.users.get(username);
    
    if (existingUser) {
      // Already attached — just log in
      this.currentUser = username;
      return { recoveryKey: existingUser.recoveryKey, existing: true };
    }

    // Generate new recovery key for this user
    const recoveryKey = await generateRecoveryKey();

    // Register on sync server
    try {
      await this._request("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: this.appId, username }),
      });
    } catch (e) {
      // May already exist from another device
      if (!e.message.includes('409')) throw e;
    }

    // Initial backup
    const initialData = { _portid: { version: "0.2.0", created: Date.now(), external_id: externalUserId } };
    const encryptedData = await encryptData(initialData, recoveryKey);
    const { ipfsHash } = await this._request("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encryptedData, username, app_id: this.appId }),
    });

    await this._request("/api/set-hash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: this.appId, username, hash: ipfsHash }),
    });

    await this.db.users.add({ username, hashedPassword: null, recoveryKey, backupHash: ipfsHash });
    this.currentUser = username;

    return { recoveryKey, existing: false };
  }

  // ── Auto-backup ───────────────────────────────────────────────────────

  /**
   * Register periodic background sync (requires service worker).
   */
  async enableAutoBackup(minIntervalHours = 12) {
    if (!("serviceWorker" in navigator)) {
      throw new PortIDError("Service Workers not supported.");
    }
    const registration = await navigator.serviceWorker.ready;
    if (!("periodicSync" in registration)) {
      throw new PortIDError("Periodic Background Sync not supported.");
    }
    await registration.periodicSync.register("portid-auto-backup", {
      minInterval: minIntervalHours * 60 * 60 * 1000,
    });
  }
}
