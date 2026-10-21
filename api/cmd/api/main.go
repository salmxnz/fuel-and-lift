// Command api runs the adebite API.
//
//	api          serve HTTP (runs migrations first unless RUN_MIGRATIONS=false)
//	api migrate  apply migrations and exit
//	api vapid    print a new VAPID key pair for Web Push
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/ai"
	"github.com/salmxnz/fuel-and-lift/api/internal/config"
	"github.com/salmxnz/fuel-and-lift/api/internal/google"
	"github.com/salmxnz/fuel-and-lift/api/internal/handlers"
	"github.com/salmxnz/fuel-and-lift/api/internal/migrate"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/server"
	"github.com/salmxnz/fuel-and-lift/api/internal/storage"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)
	if err := run(log, os.Args[1:]); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger, args []string) error {
	cmd := "serve"
	if len(args) > 0 {
		cmd = args[0]
	}
	if cmd == "vapid" {
		pub, priv, err := push.GenerateVAPID()
		if err != nil {
			return err
		}
		fmt.Printf("VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\n", pub, priv)
		return nil
	}

	config.LoadDotEnv()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch cmd {
	case "migrate":
		n, err := migrate.Up(ctx, cfg.DatabaseURL)
		if err != nil {
			return err
		}
		log.Info("migrations applied", "count", n)
		return nil
	case "serve":
	default:
		return fmt.Errorf("unknown command %q (serve, migrate, vapid)", cmd)
	}

	if cfg.RunMigrations {
		n, err := migrate.Up(ctx, cfg.DatabaseURL)
		if err != nil {
			return err
		}
		log.Info("migrations applied", "count", n)
	}
	st, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	notifier := &push.Notifier{Store: st, Log: log}
	if cfg.PushConfigured() {
		v, err := push.NewVAPID(cfg.VAPIDSubject, cfg.VAPIDPublicKey, cfg.VAPIDPrivateKey)
		if err != nil {
			return fmt.Errorf("vapid keys: %w", err)
		}
		notifier.Sender = &push.Sender{VAPID: v, HTTP: &http.Client{Timeout: 10 * time.Second}}
	} else {
		log.Warn("VAPID keys not set: push notifications are off (run `api vapid`)")
	}

	h := &handlers.Handler{
		Store:    st,
		Cfg:      cfg,
		Google:   google.New(cfg.GoogleClientID, cfg.GoogleClientSecret),
		AI:       gateway(cfg, log),
		Notifier: notifier,
		Log:      log,
	}
	if r2 := storage.NewR2(cfg.R2AccountID, cfg.R2AccessKeyID, cfg.R2SecretAccessKey, cfg.R2Bucket); r2 != nil {
		h.Photos = r2
		go h.CleanPendingPhotos(ctx)
	} else {
		log.Warn("R2 not configured: meal photos are not stored (set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)")
	}
	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           server.NewRouter(h),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      120 * time.Second, // AI estimates can take a while
		IdleTimeout:       120 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.HTTPAddr, "env", cfg.AppEnv)
		errc <- srv.ListenAndServe()
	}()
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("shutting down")
		sctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		return srv.Shutdown(sctx)
	}
	return nil
}

// gateway builds the AI providers in the configured order, skipping any
// without a key.
func gateway(cfg config.Config, log *slog.Logger) *ai.Gateway {
	g := &ai.Gateway{Timeout: 45 * time.Second}
	for _, name := range cfg.AIProviders {
		switch name {
		case "openrouter":
			if cfg.OpenRouterAPIKey != "" {
				g.Providers = append(g.Providers, &ai.OpenRouter{APIKey: cfg.OpenRouterAPIKey, ModelID: cfg.OpenRouterModel,
					AppURL: cfg.AppURL, AppName: cfg.AppName})
			}
		case "anthropic":
			if cfg.AnthropicAPIKey != "" {
				// Prices only feed the monthly budget cap; adjust if the model changes.
				g.Providers = append(g.Providers, &ai.Anthropic{APIKey: cfg.AnthropicAPIKey, ModelID: cfg.AnthropicModel,
					PriceInPerM: 1, PriceOutPerM: 5})
			}
		default:
			log.Warn("unknown AI provider in AI_PROVIDERS", "name", name)
		}
	}
	if len(g.Providers) == 0 {
		log.Warn("no AI provider key set: photo estimates are off")
	}
	return g
}
