# AI Accounts Hub

Self-hosted local dashboard for tracking AI subscriptions, grouped quota pools, live reset countdowns, model availability across surfaces (Web, CLI, IDE, Mobile, API), and multi-currency renewal costs.

Built as a single dependency-free Go binary (`CGO_ENABLED=0`) with embedded SQLite (`modernc.org/sqlite`) and self-hosted static assets (`embed.FS`).

## Features

- **100% local and private**: Stores everything in a local SQLite database with zero third-party API calls, telemetry, or external font CDNs.
- **Account cards & grouped quota tiles**: Organize accounts into pools (such as Web vs CLI/IDE) with shared or exclusive scope markers, click-to-adjust percentage/unit rows, traffic-light status bars + SVG remaining rings, and persistent custom account ordering (`Reorder` drag & drop or Up/Down controls).
- **Flexible reset windows & exact timers**: Supports rolling hour windows (e.g., 5h), daily fixed-time resets, 7-day rolling or fixed-weekday weekly cycles, monthly cycles, and manual prepaid balances. Set remaining usage alongside either `D / H / M` countdowns (`6d 21h`, `2h 31m`) or exact reset timestamps (`HH:MM`).
- **Models & Scopes Directory**: Unified model view showing which accounts provide each model, current remaining percentage, ready counts (`3/3 ready`), and collapsible scope/app details.
- **Usage & Activity**: GitHub-style 52-week daily usage heatmap, active day streaks, cooldown counters, most-used models ranking, surface mix, and per-account utilization vs cost.
- **Billing & Renewals**: Currency-grouped spending summary (monthly equivalent, direct monthly, direct annual, annual projection, and prepaid balances) plus urgency-tagged renewal schedule.
- **Starter templates**: 11 built-in templates covering Anthropic Claude (Pro, Max, Ultra), OpenAI ChatGPT (Plus, Pro 100), Cursor Premium, GitHub Copilot (Pro, Pro+), Google AI (Pro, Ultra 5x), and Prepaid API Consoles.
- **JSON Backup & Restore**: Full export and merge/replace import for moving data between environments.
- **Warm Paper & Dark Graphite themes**: Accessible WCAG AA color palettes with a live 1-second clock toggle.

## Quick Start

### Option 1: Build and run with Go

Requires Go 1.26+.

```bash
make build
./ai-accounts-hub -port 8080 -db ./ai-accounts-hub.db
```

Open `http://localhost:8080` in your browser.

Available CLI flags and environment variables:

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `-host` | - | `0.0.0.0` | Listen IP address |
| `-port` | `PORT` | `8080` | HTTP listen port |
| `-db` | `AI_HUB_DB` | `ai-accounts-hub.db` | Path to SQLite database file |

### Option 2: Docker Compose

```bash
docker compose up -d --build
```

Data persists in `./data/ai-accounts-hub.db`.

### Cross-compiling portable binaries

Because the binary uses `CGO_ENABLED=0` and embeds all frontend assets and fonts, you can compile for another OS/architecture directly:

```bash
# Linux amd64
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ai-accounts-hub-linux-amd64 .

# macOS Apple Silicon
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o ai-accounts-hub-darwin-arm64 .

# Windows amd64
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ai-accounts-hub.exe .
```

## Development & Testing

```bash
# Format & static analysis
gofmt -w .
go vet ./...

# Run unit & HTTP integration tests
go test -count=1 -v ./...
```

## Project Layout

- `main.go`: CLI flags, SQLite initialization, graceful HTTP server shutdown, and embedded static filesystem.
- `internal/model/`: Shared data models (`Account`, `QuotaRule`, `SummaryStats`, `ProviderPreset`, `ExportPayload`).
- `internal/quotas/`: Quota evaluation, auto-reset math, custom `D/H/M` and `HH:MM` rollover calculations, currency summaries, and starter templates.
- `internal/db/`: SQLite schema migrations, CRUD transactions, automatic cooldown rollover persistence, and JSON backup import/export.
- `internal/server/`: REST API handlers (`/api/accounts`, `/api/quotas/{id}/action`, `/api/stats`, `/api/presets`, `/api/export`, `/api/import`, `/api/health`) and static SPA serving.
- `web/static/`: Vanilla HTML/CSS/JS frontend with self-hosted `Newsreader`, `IBM Plex Sans`, and `IBM Plex Mono` fonts.

## Design Documentation

Color tokens, WCAG AA contrast checks, and typographic guidelines are documented in [DESIGN.md](DESIGN.md).

## License

[MIT](LICENSE)
