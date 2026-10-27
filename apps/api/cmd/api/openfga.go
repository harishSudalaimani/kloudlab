package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type fgaClient struct {
	baseURL  string
	storeID  string
	modelID  string
	apiToken string
	http     *http.Client
}

type fgaTuple struct {
	User     string `json:"user"`
	Relation string `json:"relation"`
	Object   string `json:"object"`
}

func (c *fgaClient) check(ctx context.Context, tuple fgaTuple) (bool, error) {
	var response struct {
		Allowed bool `json:"allowed"`
	}
	err := c.post(ctx, "/stores/"+c.storeID+"/check", map[string]any{
		"tuple_key": tuple, "authorization_model_id": c.modelID,
	}, &response)
	return response.Allowed, err
}

func (c *fgaClient) write(ctx context.Context, writes, deletes []fgaTuple) error {
	request := map[string]any{"authorization_model_id": c.modelID}
	if len(writes) > 0 {
		request["writes"] = map[string]any{"tuple_keys": writes}
	}
	if len(deletes) > 0 {
		request["deletes"] = map[string]any{"tuple_keys": deletes}
	}
	return c.post(ctx, "/stores/"+c.storeID+"/write", request, nil)
}

func (c *fgaClient) post(ctx context.Context, path string, payload any, output any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	request.Header.Set("content-type", "application/json")
	request.Header.Set("authorization", "Bearer "+c.apiToken)
	response, err := c.http.Do(request)
	if err != nil {
		return fmt.Errorf("OpenFGA request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("OpenFGA returned status %d", response.StatusCode)
	}
	if output != nil {
		if err := json.NewDecoder(response.Body).Decode(output); err != nil {
			return fmt.Errorf("decode OpenFGA response: %w", err)
		}
	}
	return nil
}

func workspaceFor(subject string) string {
	return "workspace:" + stableID(subject)
}

func architectureObject(id string) string { return "architecture:" + strings.TrimSpace(id) }

func stableID(value string) string {
	// A stable opaque workspace identifier keeps Auth0 subject strings out of URLs and logs.
	digest := sha256.Sum256([]byte(value))
	return fmt.Sprintf("%x", digest[:])
}
