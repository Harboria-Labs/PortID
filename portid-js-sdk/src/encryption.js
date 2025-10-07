import CryptoJS from 'crypto-js';

export function generateRecoveryKey() {
    return CryptoJS.lib.WordArray.random(16).toString();
}

export function hashPassword(password) {
    return CryptoJS.SHA256(password).toString();
}

export function encryptData(data, secretKey) {
    const dataString = JSON.stringify(data);
    return CryptoJS.AES.encrypt(dataString, secretKey).toString();
}

export function decryptData(encryptedData, secretKey) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, secretKey);
        const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedString) return null;
        return JSON.parse(decryptedString);
    } catch (error) {
        // This will fail if the key is incorrect, which is a valid check
        return null;
    }
}