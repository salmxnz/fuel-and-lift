// Package audit records every API request (metadata only, never bodies) for
// the admin app's audit log. Requests never wait on the database: records go
// into a buffer that one goroutine writes in batches.
package audit

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

const (
	bufferSize    = 2000
	batchSize     = 500
	flushInterval = time.Second
	errorBodyMax  = 2 << 10
)

// Recorder buffers records and writes them in batches.
type Recorder struct {
	store   *store.Store
	log     *slog.Logger
	ch      chan store.AuditRecord
	flushes chan chan struct{}
	done    chan struct{}
	mu      sync.RWMutex // guards closed against Add racing Close
	closed  bool
	dropped atomic.Int64
}

// New starts a Recorder. Close it on shutdown to write what's buffered.
func New(st *store.Store, log *slog.Logger) *Recorder {
	r := &Recorder{
		store: st, log: log,
		ch:      make(chan store.AuditRecord, bufferSize),
		flushes: make(chan chan struct{}),
		done:    make(chan struct{}),
	}
	go r.run()
	return r
}

// Add queues a record, dropping it when the buffer is full.
func (r *Recorder) Add(rec store.AuditRecord) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.closed {
		return
	}
	select {
	case r.ch <- rec:
	default:
		if n := r.dropped.Add(1); n == 1 || n%1000 == 0 {
			r.log.Warn("audit: buffer full, records dropped", "dropped", n)
		}
	}
}

// Flush writes everything queued so far (tests).
func (r *Recorder) Flush() {
	ack := make(chan struct{})
	r.flushes <- ack
	<-ack
}

// Close stops taking records and writes the rest.
func (r *Recorder) Close() {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return
	}
	r.closed = true
	close(r.ch)
	r.mu.Unlock()
	<-r.done
}

func (r *Recorder) run() {
	defer close(r.done)
	t := time.NewTicker(flushInterval)
	defer t.Stop()
	batch := make([]store.AuditRecord, 0, batchSize)
	write := func() {
		if len(batch) == 0 {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := r.store.InsertAudit(ctx, batch); err != nil {
			r.log.Warn("audit: write failed", "records", len(batch), "err", err)
		}
		cancel()
		batch = batch[:0]
	}
	for {
		select {
		case rec, ok := <-r.ch:
			if !ok {
				write()
				return
			}
			batch = append(batch, rec)
			if len(batch) >= batchSize {
				write()
			}
		case <-t.C:
			write()
		case ack := <-r.flushes:
			for drained := false; !drained; {
				select {
				case rec, ok := <-r.ch:
					if !ok {
						drained = true
						break
					}
					batch = append(batch, rec)
				default:
					drained = true
				}
			}
			write()
			close(ack)
		}
	}
}

// captureWriter keeps the status and, for errors, the start of the body.
type captureWriter struct {
	http.ResponseWriter
	status int
	body   bytes.Buffer
}

func (c *captureWriter) WriteHeader(code int) {
	c.status = code
	c.ResponseWriter.WriteHeader(code)
}

func (c *captureWriter) Write(b []byte) (int, error) {
	if c.status >= 400 && c.body.Len() < errorBodyMax {
		c.body.Write(b[:min(len(b), errorBodyMax-c.body.Len())])
	}
	return c.ResponseWriter.Write(b)
}

// errorMessage is error.message from a JSON error body, else the raw text.
func (c *captureWriter) errorMessage() string {
	if c.status < 400 || c.body.Len() == 0 {
		return ""
	}
	var body struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(c.body.Bytes(), &body) == nil && body.Error.Message != "" {
		return body.Error.Message
	}
	s := strings.TrimSpace(c.body.String())
	if len(s) > 300 {
		s = s[:300]
	}
	return s
}

// Middleware records each request through mux (to name its route). A nil
// Recorder turns it off. GET /health and reads of the logs themselves are
// skipped so health checks and Live polling don't drown everything else.
func Middleware(rec *Recorder, mux *http.ServeMux) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if rec == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet && r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}
			start := time.Now()
			seen := &auth.Seen{}
			r = r.WithContext(auth.WithSeen(r.Context(), seen))
			cw := &captureWriter{ResponseWriter: w, status: http.StatusOK}
			defer func() {
				_, route := mux.Handler(r)
				if quiet(route) {
					return
				}
				rec.Add(store.AuditRecord{
					At:         start,
					UserID:     seen.UserID,
					Role:       seen.Role,
					Method:     r.Method,
					Path:       safePath(r.URL.Path, route),
					Route:      route,
					Query:      r.URL.RawQuery,
					Status:     cw.status,
					DurationMs: int(time.Since(start).Milliseconds()),
					IP:         httpx.ClientIP(r),
					UserAgent:  truncate(r.UserAgent(), 300),
					Error:      cw.errorMessage(),
				})
			}()
			next.ServeHTTP(cw, r)
		})
	}
}

// quiet reports reads of the admin logs themselves: the admin app polls them
// every few seconds in Live mode, which would bury everything else.
func quiet(route string) bool {
	return strings.HasPrefix(route, "GET /v1/admin/audit") || strings.HasPrefix(route, "GET /v1/admin/notifications")
}

// safePath keeps secrets out of the log: a route with a {token} segment is
// stored as the route ("/v1/invite-links/preview/{token}").
func safePath(path, route string) string {
	if !strings.Contains(route, "{token}") {
		return path
	}
	if i := strings.IndexByte(route, ' '); i >= 0 {
		return route[i+1:]
	}
	return route
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
