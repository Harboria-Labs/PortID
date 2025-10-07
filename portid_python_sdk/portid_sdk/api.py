"""
API client for PortID Sync Server interactions.
"""

import requests
from typing import Dict, Any, Optional
from .exceptions import PortIDAPIError

class APIClient:
    """
    Handles HTTP requests to the Sync Server.
    
    Args:
        base_url (str): Base URL of the server.
    """
    
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.timeout = 30  # Default timeout
    
    def post(self, endpoint: str, data: Dict[str, Any]) -> requests.Response:
        """
        Perform a POST request.
        
        Args:
            endpoint (str): API endpoint path.
            data (Dict[str, Any]): Request payload.
        
        Returns:
            requests.Response: Server response.
        
        Raises:
            PortIDAPIError: On request failure.
        """
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.post(url, json=data)
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            raise PortIDAPIError(f"POST request failed: {e}")
    
    def get(self, endpoint: str) -> requests.Response:
        """
        Perform a GET request.
        
        Args:
            endpoint (str): API endpoint path.
        
        Returns:
            requests.Response: Server response.
        
        Raises:
            PortIDAPIError: On request failure.
        """
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.get(url)
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            raise PortIDAPIError(f"GET request failed: {e}")