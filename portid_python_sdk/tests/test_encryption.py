"""Test cross-platform encryption compatibility."""
import pytest
from portid_sdk.encryption import (
    generate_recovery_key,
    hash_password,
    encrypt_data,
    decrypt_data,
)


def test_generate_recovery_key():
    key = generate_recovery_key()
    assert len(key) == 64  # 32 bytes = 64 hex chars
    assert all(c in "0123456789abcdef" for c in key)


def test_generate_recovery_key_unique():
    k1 = generate_recovery_key()
    k2 = generate_recovery_key()
    assert k1 != k2


def test_hash_password_deterministic():
    h1 = hash_password("test123", "salt")
    h2 = hash_password("test123", "salt")
    assert h1 == h2
    assert len(h1) == 64


def test_hash_password_different_salt():
    h1 = hash_password("test123", "salt1")
    h2 = hash_password("test123", "salt2")
    assert h1 != h2


def test_encrypt_decrypt_roundtrip():
    key = generate_recovery_key()
    data = {"hello": "world", "number": 42, "nested": {"a": [1, 2, 3]}}
    encrypted = encrypt_data(data, key)
    decrypted = decrypt_data(encrypted, key)
    assert decrypted == data


def test_decrypt_wrong_key_returns_none():
    key1 = generate_recovery_key()
    key2 = generate_recovery_key()
    encrypted = encrypt_data({"secret": "data"}, key1)
    result = decrypt_data(encrypted, key2)
    assert result is None


def test_encrypt_produces_different_ciphertext():
    key = generate_recovery_key()
    data = {"same": "data"}
    e1 = encrypt_data(data, key)
    e2 = encrypt_data(data, key)
    assert e1 != e2  # Different IV each time


def test_encrypt_empty_dict():
    key = generate_recovery_key()
    encrypted = encrypt_data({}, key)
    assert decrypt_data(encrypted, key) == {}


def test_encrypt_string_data():
    key = generate_recovery_key()
    encrypted = encrypt_data("just a string", key)
    assert decrypt_data(encrypted, key) == "just a string"


def test_encrypt_large_data():
    key = generate_recovery_key()
    data = {"items": [f"item_{i}" for i in range(1000)]}
    encrypted = encrypt_data(data, key)
    assert decrypt_data(encrypted, key) == data
