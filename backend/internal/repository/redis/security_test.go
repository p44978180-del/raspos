package redis

import (
	"context"
	"strings"
	"testing"
)

func TestMalformedCredentialURLIsNotReinterpretedOrDisclosed(t *testing.T) {
	secret := "private-password-never-in-error"
	_, err := New(context.Background(), "redis://user:"+secret+"@host:invalid-port")
	if err == nil {
		t.Fatal("malformed URL accepted")
	}
	if strings.Contains(err.Error(), secret) {
		t.Fatal("connection secret leaked in error")
	}
}
