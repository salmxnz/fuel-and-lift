package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
)

// Seal encrypts a short secret (an invite token) with AES-256-GCM under a key
// derived from the server secret and a purpose label, so the same secret can't
// be opened for another purpose.
func Seal(secret, purpose, plain string) ([]byte, error) {
	gcm, err := sealer(secret, purpose)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, []byte(plain), nil), nil
}

// Open reverses Seal. It fails if the data was tampered with or sealed under
// another secret or purpose.
func Open(secret, purpose string, sealed []byte) (string, error) {
	gcm, err := sealer(secret, purpose)
	if err != nil {
		return "", err
	}
	if len(sealed) < gcm.NonceSize() {
		return "", errors.New("sealed data too short")
	}
	nonce, data := sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, data, nil)
	return string(plain), err
}

func sealer(secret, purpose string) (cipher.AEAD, error) {
	key := sha256.Sum256([]byte(purpose + "\x00" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
