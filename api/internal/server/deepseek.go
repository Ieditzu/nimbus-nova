package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const groqURL = "https://api.groq.com/openai/v1/chat/completions"

// qwen returns clean JSON. gpt-oss is the fallback when that model is busy.
const (
	groqModel    = "qwen/qwen3.8-27b"
	groqFallback = "openai/gpt-oss-20b"
)

// Groq's edge returns Cloudflare 1010 unless the client sends a user agent.
var assistHTTP = &http.Client{Timeout: 25 * time.Second}

type assistFn func(ctx context.Context, system, user string, think bool) (string, error)

// Tests replace this. Production calls Groq when GROQ_API_KEY is set.
var assistComplete assistFn = groqComplete

func groqComplete(ctx context.Context, system, user string, _ bool) (string, error) {
	key := strings.TrimSpace(os.Getenv("GROQ_API_KEY"))
	if key == "" {
		return "", errAssistUnavailable
	}
	raw, err := groqCall(ctx, key, groqModel, true, system, user)
	if err == nil && strings.TrimSpace(raw) != "" {
		return raw, nil
	}
	return groqCall(ctx, key, groqFallback, false, system, user)
}

func groqCall(ctx context.Context, key, model string, jsonMode bool, system, user string) (string, error) {
	body := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"temperature": 0.2,
		"max_tokens":  900,
	}
	if jsonMode {
		body["response_format"] = map[string]string{"type": "json_object"}
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return "", errInternal
	}
	callCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, groqURL, bytes.NewReader(payload))
	if err != nil {
		return "", errInternal
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "nimbus-nova")
	resp, err := assistHTTP.Do(req)
	if err != nil {
		return "", errAssistUnavailable
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", errAssistUnavailable
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil || len(parsed.Choices) == 0 {
		return "", errAssistUnavailable
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}
