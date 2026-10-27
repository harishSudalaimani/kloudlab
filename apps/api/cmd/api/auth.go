package main

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

type jwtVerifier struct {
	issuer   string
	audience string
	http     *http.Client

	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	keysUntil time.Time
}

type tokenClaims struct {
	Subject   string          `json:"sub"`
	Issuer    string          `json:"iss"`
	Audience  json.RawMessage `json:"aud"`
	ExpiresAt int64           `json:"exp"`
	NotBefore int64           `json:"nbf"`
}

func (v *jwtVerifier) verify(ctx context.Context, token string) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed bearer token")
	}
	var header struct {
		Algorithm string `json:"alg"`
		KeyID     string `json:"kid"`
	}
	if err := decodeSegment(parts[0], &header); err != nil || header.Algorithm != "RS256" || header.KeyID == "" {
		return "", errors.New("unsupported bearer token")
	}
	keys, err := v.signingKeys(ctx)
	if err != nil {
		return "", err
	}
	key := keys[header.KeyID]
	if key == nil {
		v.mu.Lock()
		v.keysUntil = time.Time{}
		v.mu.Unlock()
		keys, err = v.signingKeys(ctx)
		if err != nil {
			return "", err
		}
		key = keys[header.KeyID]
	}
	if key == nil {
		return "", errors.New("unknown token signing key")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", errors.New("malformed token signature")
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], signature); err != nil {
		return "", errors.New("invalid token signature")
	}
	var claims tokenClaims
	if err := decodeSegment(parts[1], &claims); err != nil {
		return "", errors.New("malformed token claims")
	}
	now := time.Now().Unix()
	if claims.Subject == "" || claims.Issuer != v.issuer || claims.ExpiresAt <= now || (claims.NotBefore != 0 && claims.NotBefore > now) {
		return "", errors.New("token claims are invalid or expired")
	}
	if !containsAudience(claims.Audience, v.audience) {
		return "", errors.New("token audience is invalid")
	}
	return claims.Subject, nil
}

func (v *jwtVerifier) signingKeys(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if time.Now().Before(v.keysUntil) && len(v.keys) > 0 {
		return v.keys, nil
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, v.issuer+".well-known/jwks.json", nil)
	if err != nil {
		return nil, err
	}
	response, err := v.http.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch Auth0 signing keys: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch Auth0 signing keys: status %d", response.StatusCode)
	}
	var set struct {
		Keys []struct {
			KeyID string `json:"kid"`
			Type  string `json:"kty"`
			Use   string `json:"use"`
			N     string `json:"n"`
			E     string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(response.Body).Decode(&set); err != nil {
		return nil, err
	}
	keys := make(map[string]*rsa.PublicKey, len(set.Keys))
	for _, item := range set.Keys {
		if item.Type != "RSA" || (item.Use != "" && item.Use != "sig") || item.KeyID == "" {
			continue
		}
		modulus, errN := base64.RawURLEncoding.DecodeString(item.N)
		exponent, errE := base64.RawURLEncoding.DecodeString(item.E)
		if errN != nil || errE != nil || len(exponent) == 0 {
			continue
		}
		exp := 0
		for _, b := range exponent {
			exp = (exp << 8) | int(b)
		}
		if exp < 3 {
			continue
		}
		keys[item.KeyID] = &rsa.PublicKey{N: new(big.Int).SetBytes(modulus), E: exp}
	}
	if len(keys) == 0 {
		return nil, errors.New("Auth0 returned no usable signing keys")
	}
	v.keys = keys
	v.keysUntil = time.Now().Add(15 * time.Minute)
	return keys, nil
}

func decodeSegment(segment string, target any) error {
	data, err := base64.RawURLEncoding.DecodeString(segment)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

func containsAudience(value json.RawMessage, expected string) bool {
	var single string
	if json.Unmarshal(value, &single) == nil {
		return single == expected
	}
	var multiple []string
	if json.Unmarshal(value, &multiple) != nil {
		return false
	}
	for _, audience := range multiple {
		if audience == expected {
			return true
		}
	}
	return false
}

