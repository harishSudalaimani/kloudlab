package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type server struct {
	db     *sql.DB
	fga    *fgaClient
	jwt    *jwtVerifier
	origin string
}

type subjectContextKey struct{}

type architecture struct {
	Document  json.RawMessage `json:"document"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type canvasPayload struct {
	SchemaVersion string       `json:"schemaVersion"`
	ID            string       `json:"id"`
	Name          string       `json:"name"`
	Nodes         []canvasNode `json:"nodes"`
	Edges         []canvasEdge `json:"edges"`
}

type canvasNode struct {
	ID     string `json:"id"`
	TypeID string `json:"typeId"`
}

type canvasEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, http.StatusOK, map[string]string{"status": "ok"}) })
	mux.Handle("GET /api/architectures", s.auth(http.HandlerFunc(s.listArchitectures)))
	mux.Handle("POST /api/architectures", s.auth(http.HandlerFunc(s.createArchitecture)))
	mux.Handle("GET /api/architectures/{id}", s.auth(http.HandlerFunc(s.getArchitecture)))
	mux.Handle("PUT /api/architectures/{id}", s.auth(http.HandlerFunc(s.updateArchitecture)))
	mux.Handle("DELETE /api/architectures/{id}", s.auth(http.HandlerFunc(s.deleteArchitecture)))
	mux.Handle("POST /api/workspaces/self/authorize-create", s.auth(http.HandlerFunc(s.authorizeCreate)))
	return s.cors(mux)
}

func (s *server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && origin == s.origin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			writeError(w, http.StatusUnauthorized, "Sign in to continue.")
			return
		}
		subject, err := s.jwt.verify(r.Context(), parts[1])
		if err != nil {
			log.Printf("reject bearer token: %v", err)
			writeError(w, http.StatusUnauthorized, "Your sign-in has expired. Sign in again.")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), subjectContextKey{}, subject)))
	})
}

func (s *server) authorizeCreate(w http.ResponseWriter, r *http.Request) {
	subject := r.Context().Value(subjectContextKey{}).(string)
	allowed, err := s.ensurePersonalWorkspace(r.Context(), subject)
	if err != nil {
		writeError(w, http.StatusBadGateway, "Workspace permissions could not be checked.")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "You do not have permission to create architectures in this workspace.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"allowed": true})
}

func (s *server) ensurePersonalWorkspace(ctx context.Context, subject string) (bool, error) {
	workspace := workspaceFor(subject)
	allowed, err := s.fga.check(ctx, fgaTuple{User: "user:" + subject, Relation: "can_create", Object: workspace})
	if err != nil || allowed {
		return allowed, err
	}
	err = s.fga.write(ctx, []fgaTuple{{User: "user:" + subject, Relation: "owner", Object: workspace}}, nil)
	if err != nil {
		// Concurrent first requests can race to write the same owner tuple. Recheck
		// after a failed write and continue only if OpenFGA now grants access.
		allowed, checkErr := s.fga.check(ctx, fgaTuple{User: "user:" + subject, Relation: "can_create", Object: workspace})
		if checkErr != nil || !allowed {
			return false, err
		}
		return true, nil
	}
	return s.fga.check(ctx, fgaTuple{User: "user:" + subject, Relation: "can_create", Object: workspace})
}

func (s *server) listArchitectures(w http.ResponseWriter, r *http.Request) {
	subject := r.Context().Value(subjectContextKey{}).(string)
	workspace := workspaceFor(subject)
	rows, err := s.db.QueryContext(r.Context(), `SELECT document, updated_at FROM architectures WHERE workspace_id = $1 ORDER BY updated_at DESC`, workspace)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load saved architectures.")
		return
	}
	defer rows.Close()
	stored := make([]architecture, 0)
	for rows.Next() {
		var item architecture
		if err := rows.Scan(&item.Document, &item.UpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not load saved architectures.")
			return
		}
		stored = append(stored, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load saved architectures.")
		return
	}
	if err := rows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load saved architectures.")
		return
	}
	items := make([]architecture, 0, len(stored))
	for _, item := range stored {
		var document canvasPayload
		if err := json.Unmarshal(item.Document, &document); err != nil {
			writeError(w, http.StatusInternalServerError, "A saved architecture could not be read.")
			return
		}
		allowed, err := s.fga.check(r.Context(), fgaTuple{User: "user:" + subject, Relation: "can_view", Object: architectureObject(document.ID)})
		if err != nil {
			writeError(w, http.StatusBadGateway, "Architecture permissions could not be checked.")
			return
		}
		if !allowed {
			continue
		}
		items = append(items, item)
	}
	// The workspace filter limits this initial library to the caller's personal workspace.
	writeJSON(w, http.StatusOK, items)
}

func (s *server) createArchitecture(w http.ResponseWriter, r *http.Request) {
	subject := r.Context().Value(subjectContextKey{}).(string)
	document, raw, err := decodeCanvas(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	workspace := workspaceFor(subject)
	allowed, err := s.ensurePersonalWorkspace(r.Context(), subject)
	if err != nil {
		writeError(w, http.StatusBadGateway, "Workspace permissions could not be checked.")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "You do not have permission to create architectures in this workspace.")
		return
	}
	result, err := s.db.ExecContext(r.Context(), `INSERT INTO architectures (id, workspace_id, document) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, document.ID, workspace, string(raw))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save architecture.")
		return
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save architecture.")
		return
	}
	if inserted == 0 {
		writeError(w, http.StatusConflict, "An architecture with this ID already exists.")
		return
	}
	tupleSet := []fgaTuple{
		{User: "user:" + subject, Relation: "owner", Object: architectureObject(document.ID)},
		{User: workspace, Relation: "workspace", Object: architectureObject(document.ID)},
	}
	if err := s.fga.write(r.Context(), tupleSet, nil); err != nil {
		_, _ = s.db.ExecContext(r.Context(), `DELETE FROM architectures WHERE id = $1 AND workspace_id = $2`, document.ID, workspace)
		writeError(w, http.StatusBadGateway, "Architecture permissions could not be recorded; nothing was saved.")
		return
	}
	s.respondArchitecture(w, r, document.ID)
}

func (s *server) getArchitecture(w http.ResponseWriter, r *http.Request) {
	subject := r.Context().Value(subjectContextKey{}).(string)
	item, workspace, err := s.loadArchitecture(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Architecture not found.")
		return
	}
	allowed, err := s.fga.check(r.Context(), fgaTuple{User: "user:" + subject, Relation: "can_view", Object: architectureObject(r.PathValue("id"))})
	if err != nil {
		writeError(w, http.StatusBadGateway, "Architecture permissions could not be checked.")
		return
	}
	if !allowed || workspace != workspaceFor(subject) {
		writeError(w, http.StatusNotFound, "Architecture not found.")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *server) updateArchitecture(w http.ResponseWriter, r *http.Request) {
	subject := r.Context().Value(subjectContextKey{}).(string)
	id := r.PathValue("id")
	document, raw, err := decodeCanvas(w, r)
	if err != nil || document.ID != id {
		writeError(w, http.StatusBadRequest, "Architecture ID does not match the request.")
		return
	}
	_, workspace, err := s.loadArchitecture(r.Context(), id)
	if err != nil || workspace != workspaceFor(subject) {
		writeError(w, http.StatusNotFound, "Architecture not found.")
		return
	}
	allowed, err := s.fga.check(r.Context(), fgaTuple{User: "user:" + subject, Relation: "can_edit", Object: architectureObject(id)})
	if err != nil {
		writeError(w, http.StatusBadGateway, "Architecture permissions could not be checked.")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "You do not have permission to edit this architecture.")
		return
	}
	_, err = s.db.ExecContext(r.Context(), `UPDATE architectures SET document = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`, string(raw), id, workspace)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save architecture.")
		return
	}
	s.respondArchitecture(w, r, id)
}

func (s *server) deleteArchitecture(w http.ResponseWriter, r *http.Request) {
	subject := r.Context().Value(subjectContextKey{}).(string)
	id := r.PathValue("id")
	_, workspace, err := s.loadArchitecture(r.Context(), id)
	if err != nil || workspace != workspaceFor(subject) {
		writeError(w, http.StatusNotFound, "Architecture not found.")
		return
	}
	allowed, err := s.fga.check(r.Context(), fgaTuple{User: "user:" + subject, Relation: "can_delete", Object: architectureObject(id)})
	if err != nil {
		writeError(w, http.StatusBadGateway, "Architecture permissions could not be checked.")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "You do not have permission to delete this architecture.")
		return
	}
	if _, err := s.db.ExecContext(r.Context(), `DELETE FROM architectures WHERE id = $1 AND workspace_id = $2`, id, workspace); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete architecture.")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

func (s *server) loadArchitecture(ctx context.Context, id string) (architecture, string, error) {
	var item architecture
	var workspace string
	err := s.db.QueryRowContext(ctx, `SELECT document, updated_at, workspace_id FROM architectures WHERE id = $1`, id).Scan(&item.Document, &item.UpdatedAt, &workspace)
	return item, workspace, err
}

func (s *server) respondArchitecture(w http.ResponseWriter, r *http.Request, id string) {
	item, _, err := s.loadArchitecture(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read the saved architecture.")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func decodeCanvas(w http.ResponseWriter, r *http.Request) (canvasPayload, []byte, error) {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		return canvasPayload{}, nil, errors.New("Architecture document is too large or unreadable.")
	}
	var document canvasPayload
	if err := json.Unmarshal(raw, &document); err != nil {
		return document, nil, errors.New("Invalid architecture document.")
	}
	if document.SchemaVersion != "1.0.0" || !validArchitectureID(document.ID) || strings.TrimSpace(document.Name) == "" || len(document.Name) > 200 {
		return document, nil, errors.New("Architecture version, ID, and name must be valid.")
	}
	nodes := make(map[string]struct{}, len(document.Nodes))
	for _, node := range document.Nodes {
		if node.ID == "" || node.TypeID == "" {
			return document, nil, errors.New("Every component needs an ID and catalog type.")
		}
		if _, exists := nodes[node.ID]; exists {
			return document, nil, errors.New("Component IDs must be unique.")
		}
		nodes[node.ID] = struct{}{}
	}
	edges := make(map[string]struct{}, len(document.Edges))
	for _, edge := range document.Edges {
		if edge.ID == "" || edge.Source == "" || edge.Target == "" || edge.Source == edge.Target {
			return document, nil, errors.New("Every connection needs a valid ID, source, and target.")
		}
		if _, exists := edges[edge.ID]; exists {
			return document, nil, errors.New("Connection IDs must be unique.")
		}
		if _, exists := nodes[edge.Source]; !exists {
			return document, nil, fmt.Errorf("Connection %q refers to a missing source component.", edge.ID)
		}
		if _, exists := nodes[edge.Target]; !exists {
			return document, nil, fmt.Errorf("Connection %q refers to a missing target component.", edge.ID)
		}
		edges[edge.ID] = struct{}{}
	}
	return document, raw, nil
}

func validArchitectureID(id string) bool {
	if id == "" || len(id) > 128 {
		return false
	}
	for _, char := range id {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-' || char == '_' || char == '.' {
			continue
		}
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	if status != http.StatusNoContent && value != nil {
		_ = json.NewEncoder(w).Encode(value)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
