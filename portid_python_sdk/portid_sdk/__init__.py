"""
PortID Python SDK — Zero-knowledge encrypted data sync.

Usage:
    from portid_sdk import PortID, PortIDError

    sdk = PortID(app_id="my-app", api_base_url="https://sync.portid.dev")

    # Sign up
    credentials = sdk.sign_up("alice", "password123")
    print(f"Recovery key: {credentials['recovery_key']}")

    # Login
    sdk.login("alice", "password123")

    # Backup data
    sdk.backup_data({"notes": ["hello", "world"]})

    # Load data
    data = sdk.load_data()

    # Restore on new device
    data = sdk.restore_data("alice", recovery_key)
"""

import json
import time
import requests
from typing import Any, Optional

from .encryption import (
    generate_recovery_key,
    hash_password,
    encrypt_data,
    decrypt_data,
)


__version__ = "0.2.0"


class PortIDError(Exception):
    """PortID SDK error."""
    pass


class PortID:
    """
    PortID Python SDK.

    Zero-knowledge encrypted data sync. All encryption/decryption
    happens locally — the server never sees plaintext.
    """

    def __init__(self, app_id: str, api_base_url: str):
        if not app_id or not api_base_url:
            raise PortIDError("app_id and api_base_url are required")
        self.app_id = app_id
        self.api_base_url = api_base_url.rstrip("/")
        self._current_user: Optional[str] = None
        self._credentials: dict = {}  # In-memory credential store

    # ── Network ────────────────────────────────────────────────

    def _request(self, method: str, endpoint: str, json_data=None, params=None) -> dict:
        url = f"{self.api_base_url}{endpoint}"
        try:
            resp = requests.request(method, url, json=json_data, params=params, timeout=30)
            if not resp.ok:
                try:
                    err = resp.json().get("error", resp.text)
                except Exception:
                    err = resp.text
                raise PortIDError(f"API Error ({resp.status_code}): {err}")
            return resp.json()
        except requests.exceptions.RequestException as e:
            raise PortIDError(f"Network error: {e}")

    # ── Auth ───────────────────────────────────────────────────

    def sign_up(self, username: str, password: str) -> dict:
        """
        Register a new user. Returns dict with recovery_key.
        The recovery key is the ONLY way to restore data if password is lost.
        """
        if not username or not password:
            raise PortIDError("Username and password are required")

        recovery_key = generate_recovery_key()
        hashed_password = hash_password(password, f"{self.app_id}:{username}")

        # Register on sync server
        self._request("POST", "/api/register", json_data={
            "app_id": self.app_id,
            "username": username,
        })

        # Initial backup
        initial_data = {"_portid": {"version": "0.2.0", "created": time.time()}}
        encrypted = encrypt_data(initial_data, recovery_key)

        backup_resp = self._request("POST", "/api/backup", json_data={
            "encryptedData": encrypted,
            "username": username,
            "app_id": self.app_id,
        })

        ipfs_hash = backup_resp.get("ipfsHash")
        if not ipfs_hash:
            raise PortIDError("Backup did not return a valid hash")

        # Update directory
        self._request("POST", "/api/set-hash", json_data={
            "app_id": self.app_id,
            "username": username,
            "hash": ipfs_hash,
        })

        # Store credentials locally (in-memory)
        self._credentials[username] = {
            "hashed_password": hashed_password,
            "recovery_key": recovery_key,
            "backup_hash": ipfs_hash,
        }
        self._current_user = username

        return {"recovery_key": recovery_key, "username": username}

    def login(self, username: str, password: str) -> bool:
        """
        Login with username and password.
        Checks against locally stored credentials.
        """
        creds = self._credentials.get(username)
        if not creds:
            return False

        hashed = hash_password(password, f"{self.app_id}:{username}")
        if hashed == creds["hashed_password"]:
            self._current_user = username
            return True
        return False

    def logout(self):
        """Logout current user."""
        self._current_user = None

    @property
    def is_logged_in(self) -> bool:
        return self._current_user is not None

    @property
    def current_user(self) -> Optional[str]:
        return self._current_user

    # ── Data Sync ─────────────────────────────────────────────

    def backup_data(self, data: Any) -> str:
        """
        Encrypt and backup data. Returns IPFS hash.
        """
        if not self._current_user:
            raise PortIDError("Not logged in")

        creds = self._credentials.get(self._current_user)
        if not creds:
            raise PortIDError("No credentials found")

        encrypted = encrypt_data(data, creds["recovery_key"])

        backup_resp = self._request("POST", "/api/backup", json_data={
            "encryptedData": encrypted,
            "username": self._current_user,
            "app_id": self.app_id,
        })

        ipfs_hash = backup_resp.get("ipfsHash")
        if not ipfs_hash:
            raise PortIDError("Backup did not return a valid hash")

        # Update directory + local
        self._request("POST", "/api/set-hash", json_data={
            "app_id": self.app_id,
            "username": self._current_user,
            "hash": ipfs_hash,
        })
        creds["backup_hash"] = ipfs_hash

        return ipfs_hash

    def load_data(self) -> Any:
        """Load and decrypt current user's data from IPFS."""
        if not self._current_user:
            raise PortIDError("Not logged in")

        creds = self._credentials.get(self._current_user)
        if not creds or not creds.get("backup_hash"):
            raise PortIDError("No backup found")

        restore_resp = self._request("GET", "/api/restore", params={
            "hash": creds["backup_hash"],
        })

        encrypted_blob = (
            restore_resp.get("kaironBackup") or
            (restore_resp.get("pinataContent") or {}).get("kaironBackup")
        )
        if not encrypted_blob:
            raise PortIDError("Backup data format unexpected")

        decrypted = decrypt_data(encrypted_blob, creds["recovery_key"])
        if decrypted is None:
            raise PortIDError("Decryption failed — recovery key may be incorrect")

        return decrypted

    def restore_data(self, username: str, recovery_key: str) -> Any:
        """
        Restore data on a new device using username + recovery key.
        """
        # Get hash from directory
        hash_resp = self._request("GET", "/api/get-hash", params={
            "app_id": self.app_id,
            "username": username,
        })

        ipfs_hash = hash_resp.get("ipfsHash")
        if not ipfs_hash:
            raise PortIDError("No backup found for this user")

        # Download encrypted data
        restore_resp = self._request("GET", "/api/restore", params={"hash": ipfs_hash})

        encrypted_blob = (
            restore_resp.get("kaironBackup") or
            (restore_resp.get("pinataContent") or {}).get("kaironBackup")
        )
        if not encrypted_blob:
            raise PortIDError("Backup data format unexpected")

        # Decrypt
        decrypted = decrypt_data(encrypted_blob, recovery_key)
        if decrypted is None:
            raise PortIDError("Decryption failed — recovery key is incorrect")

        # Store credentials locally
        self._credentials[username] = {
            "hashed_password": None,
            "recovery_key": recovery_key,
            "backup_hash": ipfs_hash,
        }

        # Register device
        try:
            self._request("POST", "/api/device/register", json_data={
                "app_id": self.app_id,
                "username": username,
            })
        except PortIDError:
            pass  # Non-critical

        self._current_user = username
        return decrypted

    # ── Integration (existing auth) ───────────────────────────

    def attach_to_existing_user(self, external_user_id: str) -> dict:
        """
        Attach PortID encrypted sync to an existing authenticated user.
        Use when you already have auth and want to add encrypted backup.

        Returns dict with recovery_key.
        """
        if not external_user_id:
            raise PortIDError("external_user_id required")

        username = f"ext_{external_user_id}"

        if username in self._credentials:
            self._current_user = username
            return {"recovery_key": self._credentials[username]["recovery_key"], "existing": True}

        recovery_key = generate_recovery_key()

        # Register
        try:
            self._request("POST", "/api/register", json_data={
                "app_id": self.app_id,
                "username": username,
            })
        except PortIDError as e:
            if "409" not in str(e):
                raise

        # Initial backup
        initial_data = {"_portid": {"version": "0.2.0", "created": time.time(), "external_id": external_user_id}}
        encrypted = encrypt_data(initial_data, recovery_key)

        backup_resp = self._request("POST", "/api/backup", json_data={
            "encryptedData": encrypted,
            "username": username,
            "app_id": self.app_id,
        })
        ipfs_hash = backup_resp.get("ipfsHash", "")

        if ipfs_hash:
            self._request("POST", "/api/set-hash", json_data={
                "app_id": self.app_id,
                "username": username,
                "hash": ipfs_hash,
            })

        self._credentials[username] = {
            "hashed_password": None,
            "recovery_key": recovery_key,
            "backup_hash": ipfs_hash,
        }
        self._current_user = username

        return {"recovery_key": recovery_key, "existing": False}
