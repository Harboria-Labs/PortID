# in portid_sdk/exceptions.py
class PortIDError(Exception):
    """Base exception for the PortID SDK."""
    pass

class PortIDAPIError(PortIDError):
    """Raised for errors returned from the Sync Server API."""
    pass

class EncryptionError(PortIDError):
    """Raised for failures during data encryption or decryption."""
    pass