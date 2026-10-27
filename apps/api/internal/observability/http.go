package observability

import (
	"log/slog"
	"net/http"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/trace"
)

// InstrumentHTTP adds server spans and standard HTTP request metrics. Request logs
// include trace identifiers so they can be correlated with the exported spans.
func InstrumentHTTP(handler http.Handler) http.Handler {
	return otelhttp.NewHandler(requestLogger(handler), "kloudlab-api")
}

// InstrumentHTTPClient wraps a client transport so dependency calls participate
// in the current trace and propagate W3C trace context when supported.
func InstrumentHTTPClient(client *http.Client) *http.Client {
	copy := *client
	transport := client.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	copy.Transport = otelhttp.NewTransport(transport)
	return &copy
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		tracked := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(tracked, r)

		status := tracked.status
		if status == 0 {
			status = http.StatusOK
		}
		level := slog.LevelInfo
		if status >= http.StatusInternalServerError {
			level = slog.LevelError
		} else if status >= http.StatusBadRequest {
			level = slog.LevelWarn
		}
		attrs := []slog.Attr{
			slog.String("http.request.method", r.Method),
			slog.Int("http.response.status_code", status),
			slog.Int64("http.server.duration_ms", time.Since(started).Milliseconds()),
		}
		if span := trace.SpanContextFromContext(r.Context()); span.IsValid() {
			attrs = append(attrs,
				slog.String("trace_id", span.TraceID().String()),
				slog.String("span_id", span.SpanID().String()),
			)
		}
		slog.LogAttrs(r.Context(), level, "http request", attrs...)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(data)
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
