package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	ctx := context.Background()
	config, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}
	db, err := sql.Open("pgx", config.databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(12)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(30 * time.Minute)

	startup, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.PingContext(startup); err != nil {
		log.Fatalf("connect to application database: %v", err)
	}
	if _, err := db.ExecContext(startup, `CREATE TABLE IF NOT EXISTS architectures (
		id text PRIMARY KEY,
		workspace_id text NOT NULL,
		document jsonb NOT NULL,
		updated_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		log.Fatalf("initialize application schema: %v", err)
	}
	if _, err := db.ExecContext(startup, `CREATE INDEX IF NOT EXISTS architectures_workspace_updated_idx ON architectures (workspace_id, updated_at DESC)`); err != nil {
		log.Fatalf("initialize architecture index: %v", err)
	}

	openFGA := &fgaClient{
		baseURL:  strings.TrimRight(config.openFGAURL, "/"),
		storeID:  config.openFGAStoreID,
		modelID:  config.openFGAModelID,
		apiToken: config.openFGAAPIToken,
		http:     &http.Client{Timeout: 5 * time.Second},
	}
	api := &server{
		db:       db,
		fga:      openFGA,
		jwt:      &jwtVerifier{issuer: config.auth0Issuer, audience: config.auth0Audience, http: &http.Client{Timeout: 5 * time.Second}},
		origin:   config.frontendOrigin,
	}

	address := ":" + config.port
	log.Printf("KloudLab API listening on %s", address)
	if err := http.ListenAndServe(address, api.routes()); err != nil {
		log.Fatal(err)
	}
}

type appConfig struct {
	port            string
	databaseURL     string
	auth0Issuer     string
	auth0Audience   string
	openFGAURL      string
	openFGAStoreID  string
	openFGAModelID  string
	openFGAAPIToken string
	frontendOrigin  string
}

func loadConfig() (appConfig, error) {
	cfg := appConfig{
		port:            env("PORT", "8080"),
		databaseURL:     os.Getenv("DATABASE_URL"),
		auth0Issuer:     strings.TrimRight(os.Getenv("AUTH0_ISSUER"), "/") + "/",
		auth0Audience:   os.Getenv("AUTH0_AUDIENCE"),
		openFGAURL:      os.Getenv("OPENFGA_API_URL"),
		openFGAStoreID:  os.Getenv("OPENFGA_STORE_ID"),
		openFGAModelID:  os.Getenv("OPENFGA_AUTHORIZATION_MODEL_ID"),
		openFGAAPIToken: os.Getenv("OPENFGA_API_TOKEN"),
		frontendOrigin:  env("FRONTEND_ORIGIN", "http://localhost:5173"),
	}
	missing := make([]string, 0)
	for name, value := range map[string]string{
		"DATABASE_URL": cfg.databaseURL, "AUTH0_ISSUER": cfg.auth0Issuer,
		"AUTH0_AUDIENCE": cfg.auth0Audience, "OPENFGA_API_URL": cfg.openFGAURL,
		"OPENFGA_STORE_ID": cfg.openFGAStoreID, "OPENFGA_AUTHORIZATION_MODEL_ID": cfg.openFGAModelID,
		"OPENFGA_API_TOKEN": cfg.openFGAAPIToken,
	} {
		if value == "" || value == "/" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return appConfig{}, &configError{missing: missing}
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

type configError struct{ missing []string }

func (e *configError) Error() string {
	return "required environment variables are missing: " + strings.Join(e.missing, ", ")
}
