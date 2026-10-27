module github.com/harishsudalaimani/kloudlab/apps/api

go 1.26

require (
	github.com/XSAM/otelsql v0.44.0
	github.com/jackc/pgx/v5 v5.7.5
	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.68.0
	go.opentelemetry.io/otel v1.46.0
	go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp v1.46.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.46.0
	go.opentelemetry.io/otel/sdk v1.46.0
)
