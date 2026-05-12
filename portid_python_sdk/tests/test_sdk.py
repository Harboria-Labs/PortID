"""Test PortID SDK (unit tests, no network)."""
import pytest
from portid_sdk import PortID, PortIDError


def test_init_requires_params():
    with pytest.raises(PortIDError):
        PortID("", "http://localhost")
    with pytest.raises(PortIDError):
        PortID("app", "")


def test_init():
    sdk = PortID("test-app", "http://localhost:3000")
    assert sdk.app_id == "test-app"
    assert sdk.api_base_url == "http://localhost:3000"
    assert not sdk.is_logged_in
    assert sdk.current_user is None


def test_backup_requires_login():
    sdk = PortID("test", "http://localhost:3000")
    with pytest.raises(PortIDError, match="Not logged in"):
        sdk.backup_data({"test": 1})


def test_load_requires_login():
    sdk = PortID("test", "http://localhost:3000")
    with pytest.raises(PortIDError, match="Not logged in"):
        sdk.load_data()


def test_logout():
    sdk = PortID("test", "http://localhost:3000")
    sdk._current_user = "alice"
    assert sdk.is_logged_in
    sdk.logout()
    assert not sdk.is_logged_in
