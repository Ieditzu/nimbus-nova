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

const deepseekURL = "https://api.deepseek.com/chat/completions"

// Hard cap stays under the reverse-proxy read timeout, so a hung model
// becomes a JSON error instead of an HTML 502.
var assistHTTP = &http.Client{Timeout: 20 * time.Second}

type assistFn func(ctx context.Context, system, user string, think bool) (string, error)

// Tests replace this. Production calls DeepSeek when DEEPSEEK_API_KEY is set.
var assistComplete assistFn = deepseekComplete

func deepseekComplete(ctx context.Context, system, user string, think bool) (string, error) {
	key := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY"))
	if key == "" {
		return "", errAssistUnavailable
	}
	mode := "disabled"
	if think {
		mode = "enabled"
	}
	payload, err := json.Marshal(map[string]any{
		"model": "deepseek-flash",
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"response_format": map[string]string{"type": "json_object"},
		"thinking":        map[string]string{"type": mode},
		"max_tokens":      900,
	})
	if err != nil {
		return "", errInternal
	}
	callCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, deepseekURL, bytes.NewReader(payload))
	if err != nil {
		return "", errInternal
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
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
	return parsed.Choices[0].Message.Content, nil
}
