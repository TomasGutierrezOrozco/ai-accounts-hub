package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"ai-accounts-hub/internal/db"
	"ai-accounts-hub/internal/server"
)

//go:embed web/static
var embeddedStatic embed.FS

func main() {
	defaultPort := os.Getenv("PORT")
	if defaultPort == "" {
		defaultPort = "8080"
	}
	defaultDB := os.Getenv("AI_HUB_DB")
	if defaultDB == "" {
		defaultDB = "ai-accounts-hub.db"
	}

	port := flag.String("port", defaultPort, "HTTP listen port")
	host := flag.String("host", "0.0.0.0", "Listen IP address")
	dbPath := flag.String("db", defaultDB, "Path to SQLite database file")
	flag.Parse()

	if dir := filepath.Dir(*dbPath); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Fatalf("create database directory: %v", err)
		}
	}

	store, err := db.Open(*dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer store.Close()

	staticSub, err := fs.Sub(embeddedStatic, "web/static")
	if err != nil {
		log.Fatalf("mount embedded static files: %v", err)
	}

	srv := server.New(store, staticSub)
	addr := strings.TrimSpace(*host) + ":" + strings.TrimPrefix(strings.TrimSpace(*port), ":")

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("AI Accounts Hub running at http://%s (SQLite: %s)", addr, *dbPath)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("forced server shutdown: %v", err)
	}
}
