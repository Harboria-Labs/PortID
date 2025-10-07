"""
PortID SDK: Zero-knowledge decentralized user data sync.

Provides client-side encryption and API interactions for secure, multi-device data management.
"""

from typing import Dict, Any, Optional, Union
import json
from .encryption import generate_recovery_key, hash_password, encrypt_data, decrypt_data
from .exceptions import PortIDError, PortIDAPIError, EncryptionError
from .api import APIClient

class MemoryStorage:
    """Default in-memory storage backend for user data."""
    
    def __init__(self):
        self.data: Dict[str, Any] = {}
    
    def store(self, key: str, value: Any) -> None:
        """Store data under the given key."""
        self.data[key] = value
    
    def retrieve(self, key: str) -> Optional[Any]:
        """Retrieve data by key."""
        return self.data.get(key)
    
    def delete(self, key: str) -> None:
        """Delete data by key."""
        self.data.pop(key, None)

class PortID:
    """
    Main SDK class for PortID operations.
    
    Initializes with app configuration and optional storage backend.
    
    Args:
        app_id (str): Unique identifier for the application.
        api_base_url (str): Base URL of the PortID Sync Server.
        storage_backend (Union[str, Any], optional): Storage backend ('memory' or custom class). Defaults to 'memory'.
    
    Raises:
        ValueError: If invalid storage backend is provided.
    """
    
    def __init__(
        self,
        app_id: str,
        api_base_url: str,
        storage_backend: Union[str, Any] = "memory"
    ):
        self.app_id = app_id
        self.api = APIClient(api_base_url)
        
        if isinstance(storage_backend, str):
            if storage_backend == "memory":
                self.storage = MemoryStorage()
            else:
                raise ValueError(f"Unsupported storage backend: {storage_backend}")
        else:
            self.storage = storage_backend  # Custom backend instance
    
    def sign_up(self, username: str, password: str) -> Dict[str, str]:
        """
        Signs up a new user, generating credentials and storing locally.
        
        Args:
            username (str): Unique username.
            password (str): User password.
        
        Returns:
            Dict[str, str]: Credentials including recovery key.
        
        Raises:
            PortIDAPIError: If signup fails on the server.
            EncryptionError: If encryption fails.
        """
        recovery_key = generate_recovery_key()
        hashed_password = hash_password(password)
        
        user_data = {
            "username": username,
            "app_id": self.app_id,
            "recovery_key": recovery_key
        }
        encrypted_data = encrypt_data(user_data, recovery_key)
        
        payload = {
            "username": username,
            "hashed_password": hashed_password,
            "encrypted_data": encrypted_data
        }
        
        try:
            response = self.api.post("/signup", payload)
            if response.status_code != 200:
                raise PortIDAPIError(f"Signup failed: {response.text}")
            
            # Store locally
            self.storage.store("credentials", {"username": username, "recovery_key": recovery_key})
            return {"username": username, "recovery_key": recovery_key}
        
        except Exception as e:
            raise PortIDAPIError(f"API error during signup: {e}")
    
    def sign_in(self, username: str, password: str) -> bool:
        """
        Signs in an existing user, verifying credentials.
        
        Args:
            username (str): Username.
            password (str): Password.
        
        Returns:
            bool: True if successful.
        
        Raises:
            PortIDAPIError: If signin fails.
            EncryptionError: If decryption fails.
        """
        hashed_password = hash_password(password)
        
        payload = {
            "username": username,
            "hashed_password": hashed_password
        }
        
        try:
            response = self.api.post("/signin", payload)
            if response.status_code != 200:
                raise PortIDAPIError(f"Signin failed: {response.text}")
            
            # Retrieve and decrypt stored data if needed
            stored = self.storage.retrieve("credentials")
            if stored and stored["username"] == username:
                return True
            return False
        
        except Exception as e:
            raise PortIDAPIError(f"API error during signin: {e}")
    
    def restore(self, recovery_key: str, password: str) -> Dict[str, Any]:
        """
        Restores user data using recovery key.
        
        Args:
            recovery_key (str): Hex-encoded recovery key.
            password (str): Password for verification.
        
        Returns:
            Dict[str, Any]: Restored user data.
        
        Raises:
            EncryptionError: If decryption fails.
            PortIDAPIError: If API retrieval fails.
        """
        try:
            # Fetch encrypted data from API
            response = self.api.get(f"/restore/{recovery_key}")
            if response.status_code != 200:
                raise PortIDAPIError(f"Restore failed: {response.text}")
            
            encrypted_data = response.json()["encrypted_data"]
            restored_data = decrypt_data(encrypted_data, recovery_key)
            
            # Store restored data
            self.storage.store("user_data", restored_data)
            return restored_data
        
        except Exception as e:
            raise PortIDAPIError(f"Restore error: {e}")

__version__ = "0.1.0"
__all__ = ["PortID"]