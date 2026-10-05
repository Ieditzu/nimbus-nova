package server

import (
	"bytes"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func TestWebPushUsesValidVAPIDSubject(t *testing.T) {
	var authorization string
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusCreated)
	}))
	defer provider.Close()

	_, x, y, err := elliptic.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		t.Fatal(err)
	}
	device := webPushTarget{
		endpoint: provider.URL,
		p256dh:   base64.RawURLEncoding.EncodeToString(elliptic.Marshal(elliptic.P256(), x, y)),
		auth:     base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{1}, 16)),
	}
	status, err := (&Server{}).sendWebPush(device, publicKey, privateKey, "Test", "Test", nil)
	if err != nil || status != http.StatusCreated {
		t.Fatalf("status=%d err=%v", status, err)
	}
	if !strings.HasPrefix(authorization, "vapid t=") {
		t.Fatalf("missing VAPID authorization: %q", authorization)
	}
	token := strings.SplitN(strings.TrimPrefix(authorization, "vapid t="), ", k=", 2)[0]
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("invalid JWT parts: %d", len(parts))
	}
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatal(err)
	}
	var claims struct {
		Subject  string `json:"sub"`
		Audience string `json:"aud"`
	}
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		t.Fatal(err)
	}
	if claims.Subject != "mailto:support@nimbusnova.cc" || claims.Audience != provider.URL {
		t.Fatalf("invalid VAPID claims: sub=%q aud=%q", claims.Subject, claims.Audience)
	}
}
