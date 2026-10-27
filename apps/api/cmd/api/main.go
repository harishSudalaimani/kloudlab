package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/XSAM/otelsql"
	"github.com/harishsudalaimani/kloudlab/apps/api/internal/observability"
	_ "github.com/jackc/pgx/v5/stdlib"
	"go.opentelemetry.io/otel/attribute"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx := context.Background()
	shutdownTelemetry, err := observability.Setup(ctx)
	if err != nil {
		slog.Error("configure OpenTelemetry", "error", err)
		os.Exit(1)
	}

	err = run(ctx)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if shutdownErr := shutdownTelemetry(shutdownCtx); shutdownErr != nil {
		slog.Error("flush OpenTelemetry", "error", shutdownErr)
		if err == nil {
			err = shutdownErr
		}
	}
	if err != nil {
		slog.Error("KloudLab API stopped unexpectedly", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	config, err := loadConfig()
	if err != nil {
		return err
	}
	db, err := otelsql.Open("pgx", config.databaseURL,
		otelsql.WithAttributes(attribute.String("db.system.name", "postgresql")),
	)
	if err != nil {
		return fmt.Errorf("open application database: %w", err)
	}
	defer db.Close()
	dbStatsRegistration, err := otelsql.RegisterDBStatsMetrics(db,
		otelsql.WithAttributes(attribute.String("db.system.name", "postgresql")),
	)
	if err != nil {
		return fmt.Errorf("register database pool metrics: %w", err)
	}
	defer dbStatsRegistration.Unregister()
	db.SetMaxOpenConns(12)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(30 * time.Minute)

	startup, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.PingContext(startup); err != nil {
		return fmt.Errorf("connect to application database: %w", err)
	}
	if _, err := db.ExecContext(startup, `CREATE TABLE IF NOT EXISTS architectures (
		id text PRIMARY KEY,
		workspace_id text NOT NULL,
		document jsonb NOT NULL,
		updated_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return fmt.Errorf("initialize application schema: %w", err)
	}
	if _, err := db.ExecContext(startup, `CREATE INDEX IF NOT EXISTS architectures_workspace_updated_idx ON architectures (workspace_id, updated_at DESC)`); err != nil {
		return fmt.Errorf("initialize architecture index: %w", err)
	}

	openFGA := &fgaClient{
		baseURL:  strings.TrimRight(config.openFGAURL, "/"),
		storeID:  config.openFGAStoreID,
		modelID:  config.openFGAModelID,
		apiToken: config.openFGAAPIToken,
		http:     observability.InstrumentHTTPClient(&http.Client{Timeout: 5 * time.Second}),
	}
	api := &server{
		db:       db,
		fga:      openFGA,
		jwt: &jwtVerifier{
			issuer:   config.auth0Issuer,
			audience: config.auth0Audience,
			http:     observability.InstrumentHTTPClient(&http.Client{Timeout: 5 * time.Second}),
		},
		origin:   config.frontendOrigin,
	}

	address := ":" + config.port
	slog.Info("KloudLab API starting", "address", address)
	return serve(address, observability.InstrumentHTTP(api.routes()))
}

func serve(address string, handler http.Handler) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := &http.Server{
		Addr:              address,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	serverErr := make(chan error, 1)
	go func() { serverErr <- server.ListenAndServe() }()
	select {
	case err := <-serverErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
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
