// Package config reads runtime configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds everything the API reads from the environment.
type Config struct {
	AppName string
	AppEnv  string // "production" turns on Secure cookies
	AppURL  string // the PWA's public URL, used to build invite links

	DatabaseURL    string
	HTTPAddr       string
	RunMigrations  bool
	AllowedOrigins []string

	JWTSecret      string
	AccessTTL      time.Duration
	RefreshTTLDays int

	// Google sign-in. The client secret lives only here, never in the PWA.
	GoogleClientID     string
	GoogleClientSecret string
	// AdminEmails are admins and always have Pro.
	AdminEmails []string

	// AI providers, tried in order of AIProviders until one answers.
	AIProviders       []string // "openrouter", "anthropic"
	OpenRouterAPIKey  string
	OpenRouterModel   string
	AnthropicAPIKey   string
	AnthropicModel    string
	AIPerMinute       int     // per user, all AI calls
	AIPerDay          int     // per user, all AI calls (fair use, also for Pro)
	FreePhotosMonthly int     // free plan photo estimates per calendar month
	AIMonthlyBudget   float64 // USD across everyone; 0 = no cap
	ReferralsForPro   int     // friends who must join for Pro forever

	// Meal photos in Cloudflare R2. Photo storage is off unless all four are set.
	R2AccountID       string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2Bucket          string
	PhotoURLTTL       time.Duration // lifetime of signed photo links
	FreePhotosStored  int           // photos a free user keeps; Pro is unlimited

	// Web Push (VAPID). Generate once with `api vapid`.
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string // mailto: or https: contact for push services
}

// SecureCookies reports whether cookies carry the Secure flag.
func (c Config) SecureCookies() bool { return c.AppEnv == "production" }

// AIConfigured reports whether at least one provider has a key.
func (c Config) AIConfigured() bool { return c.OpenRouterAPIKey != "" || c.AnthropicAPIKey != "" }

// PushConfigured reports whether Web Push can be sent.
func (c Config) PushConfigured() bool { return c.VAPIDPublicKey != "" && c.VAPIDPrivateKey != "" }

// IsAdminEmail reports whether email is listed in ADMIN_EMAILS.
func (c Config) IsAdminEmail(email string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	for _, e := range c.AdminEmails {
		if e == email {
			return true
		}
	}
	return false
}

// LoadDotEnv loads .env.local then .env for local runs. Variables already set
// in the environment always win, so it is a no-op in production.
func LoadDotEnv() {
	_ = godotenv.Load(".env.local")
	_ = godotenv.Load(".env")
}

// Load reads the configuration and checks the required values.
func Load() (Config, error) {
	cfg := Config{
		AppName: env("APP_NAME", "adebite"),
		AppEnv:  env("APP_ENV", "development"),
		AppURL:  strings.TrimRight(env("APP_URL", "http://localhost:3000"), "/"),

		DatabaseURL:    os.Getenv("DATABASE_URL"),
		HTTPAddr:       env("HTTP_ADDR", ":8080"),
		RunMigrations:  envBool("RUN_MIGRATIONS", true),
		AllowedOrigins: ParseList(env("ALLOWED_ORIGINS", "http://localhost:3000"), true),

		JWTSecret:      os.Getenv("JWT_SECRET"),
		AccessTTL:      envDuration("ACCESS_TTL", 15*time.Minute),
		RefreshTTLDays: envInt("REFRESH_TTL_DAYS", 60),

		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		AdminEmails:        lower(ParseList(os.Getenv("ADMIN_EMAILS"), false)),

		AIProviders:       ParseList(env("AI_PROVIDERS", "openrouter,anthropic"), false),
		OpenRouterAPIKey:  os.Getenv("OPENROUTER_API_KEY"),
		OpenRouterModel:   env("OPENROUTER_MODEL", "google/gemini-2.5-flash"),
		AnthropicAPIKey:   os.Getenv("ANTHROPIC_API_KEY"),
		AnthropicModel:    env("ANTHROPIC_MODEL", "claude-haiku-5-5"),
		AIPerMinute:       envInt("AI_PER_MINUTE", 6),
		AIPerDay:          envInt("AI_PER_DAY", 60),
		FreePhotosMonthly: envInt("FREE_PHOTOS_MONTHLY", 10),
		AIMonthlyBudget:   envFloat("AI_MONTHLY_BUDGET_USD", 25),
		ReferralsForPro:   envInt("REFERRALS_FOR_PRO", 8),

		R2AccountID:       os.Getenv("R2_ACCOUNT_ID"),
		R2AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
		R2SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
		R2Bucket:          env("R2_BUCKET", "adebite-photos"),
		PhotoURLTTL:       envDuration("PHOTO_URL_TTL", time.Hour),
		FreePhotosStored:  envInt("FREE_PHOTOS_STORED", 20),

		VAPIDPublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
		VAPIDPrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
		VAPIDSubject:    env("VAPID_SUBJECT", "mailto:admin@example.com"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_SECRET is required and must be at least 32 characters")
	}
	return cfg, nil
}

// ParseList splits a comma-separated list, trimming spaces (and a trailing
// slash when trimSlash is set) and dropping empty and duplicate entries.
func ParseList(raw string, trimSlash bool) []string {
	var out []string
	seen := map[string]bool{}
	for _, v := range strings.Split(raw, ",") {
		v = strings.TrimSpace(v)
		if trimSlash {
			v = strings.TrimRight(v, "/")
		}
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func lower(in []string) []string {
	for i := range in {
		in[i] = strings.ToLower(in[i])
	}
	return in
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if b, err := strconv.ParseBool(os.Getenv(key)); err == nil {
		return b
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return n
	}
	return fallback
}

func envFloat(key string, fallback float64) float64 {
	if f, err := strconv.ParseFloat(os.Getenv(key), 64); err == nil {
		return f
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	if d, err := time.ParseDuration(os.Getenv(key)); err == nil {
		return d
	}
	return fallback
}
