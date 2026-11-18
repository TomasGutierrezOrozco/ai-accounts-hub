# DESIGN.md: AI Accounts Hub

## Design Read

Reading this as: personal dispatch ledger and rate-limit instrument for developers juggling multiple AI subscriptions, styled as an archival drafting sheet (warm paper default) with a switchable hardware-console dark mode, dial ENERGY 2 / RHYTHM 3 / MOTION 1.

## Visual Identity & Motif

- **Archetype**: Editorial Dispatch Ledger. Rejects generic dark-slate rounded card grids in favor of open, unboxed typographic ledger entries separated by hairline rules (`1px`) and generous structural whitespace.
- **Identity Motif**: Editorial serif titles (`Newsreader`) paired with instrument-grade `IBM Plex Mono` tabular numerals (`tabular-nums`) for live cooldown clocks, quota fractions, and monthly spend figures, anchored by a single Signal Vermilion / Hardware Orange accent.
- **Structured Card & Directory Workspace**: Accounts render with collapsible headers and compact 2-column quota tiles showing clickable limit rows, remaining percentage rings, and inline reset timers, paired with a 2-column `Models & Scopes Directory` and a clean `Billing & Renewals` ledger.

## Dial Settings

- **ENERGY 2**: Distinct visual personality through warm paper/graphite surfaces, editorial serif display typography, and high-signal vermilion accents, without decorative clutter.
- **RHYTHM 3**: Deliberate compositional contrast across sections: compact single-band masthead with live pulse, grouped account and quota tile grids on Accounts & Quotas, a two-column model directory on Models & Scopes, open ledger tables on Billing & Renewals, and a two-column utility split on JSON Backup.
- **MOTION 1**: Crisp hover and focus transitions (< 150ms) only, completely disabled under `prefers-reduced-motion: reduce`. The 1-second live countdown includes a visible Pause/Resume button (`R-39`).

## Self-Hosted Typography (`web/static/fonts/`)

Zero third-party font CDNs. Three locally embedded `.woff2` families (~116 KB total):
- **Newsreader (600)**: Editorial serif for the masthead and account aliases, separating the ledger visually from generic sans-serif SaaS templates.
- **IBM Plex Sans (400, 500, 600)**: Engineered for readable dense controls, labels, and operational notes without falling back to generic `Inter` or `Geist`.
- **IBM Plex Mono (400, 500)**: Used strictly with `font-variant-numeric: tabular-nums` on countdown clocks, quota percentages, provider eyebrows, and currency totals.

## Verified Color Palette (WCAG AA Checked via contrast-check.py)

### Light Theme: Archival Paper & Signal Vermilion (Default)
Default chosen deliberately (`R-21`) to break the generic dark-tech template mold while remaining calm across daytime sessions, paired with a full Warm Graphite dark toggle.

| Token | Hex | Role | Contrast Check |
|---|---|---|---|
| `--bg-primary` | `#F6F3EC` | Warm archival paper canvas | Base |
| `--bg-surface` | `#FDFCF9` | Modal dialogs and highlighted surfaces | Base |
| `--bg-elevated` | `#ECE7DD` | Inputs, hover surfaces, meter tracks | Base |
| `--divider-color` | `#DCD5C7` | Hairline 1px ledger and rail dividers | Structural |
| `--border-color` | `#6E685E` | Interactive input and button borders | 4.98:1 on primary, 5.38:1 on surface, 4.48:1 on elevated (PASS >= 3.0 non-text) |
| `--text-primary` | `#171614` | Archival ink headings and primary values | 16.32:1 on primary, 17.63:1 on surface (PASS) |
| `--text-secondary` | `#544F47` | Metadata, scope lines, secondary labels | 7.33:1 on primary, 7.91:1 on surface (PASS) |
| `--accent` | `#C23B17` | Signal Vermilion primary CTA, active tab rule, focus ring | 4.82:1 on primary, 5.21:1 on surface; `#FFFFFF` text on accent = 5.34:1 (PASS) |
| `--status-ok` | `#166534` | Ready quota (`[READY]`) | 6.43:1 on primary (PASS) |
| `--status-warn` | `#9A4D00` | Near-limit quota >= 80% (`[NEAR LIMIT]`) | 5.52:1 on primary (PASS) |
| `--status-danger` | `#B91C1C` | Exhausted / Cooldown (`[COOLDOWN]`) | 5.84:1 on primary (PASS) |

### Dark Theme: Warm Graphite & Signal Orange

| Token | Hex | Role | Contrast Check |
|---|---|---|---|
| `--bg-primary` | `#141311` | Warm obsidian charcoal canvas | Base |
| `--bg-surface` | `#1C1A17` | Modal dialogs and elevated panels | Base |
| `--bg-elevated` | `#26231F` | Inputs, hover surfaces, meter tracks | Base |
| `--divider-color` | `#322E28` | Hairline 1px ledger and rail dividers | Structural |
| `--border-color` | `#766F64` | Interactive input and button borders | 3.74:1 on primary, 3.50:1 on surface, 3.15:1 on elevated (PASS >= 3.0 non-text) |
| `--text-primary` | `#F2EFE9` | Warm parchment headings and values | 16.18:1 on primary, 15.13:1 on surface (PASS) |
| `--text-secondary` | `#B8B1A6` | Metadata, scope lines, secondary labels | 8.73:1 on primary, 8.17:1 on surface (PASS) |
| `--accent` | `#FF7847` | Signal Orange primary CTA, active tab rule, focus ring | 7.10:1 on primary, 6.64:1 on surface; `#141311` text on accent = 7.10:1 (PASS) |
| `--status-ok` | `#52D186` | Ready quota (`[READY]`) | 9.57:1 on primary (PASS) |
| `--status-warn` | `#FBBF24` | Near-limit quota >= 80% (`[NEAR LIMIT]`) | 11.12:1 on primary (PASS) |
| `--status-danger` | `#FF6B6B` | Exhausted / Cooldown (`[COOLDOWN]`) | 6.69:1 on primary (PASS) |

## Design Decisions & Reasons (R-31)

- **Color (`R-01`, `R-29`)**: Warm paper/graphite paired with Signal Vermilion/Orange creates a physical instrument character without blue/purple AI gradients or neon glows.
- **Typography (`R-06`)**: Pairing `Newsreader` display headings with `IBM Plex Sans` UI copy and `IBM Plex Mono` tabular numerals separates editorial hierarchy from operational telemetry while remaining 100% self-hosted.
- **Icons (`R-04`)**: Four minimal `16x16` geometric SVGs strictly for clock pause, theme switch, add account, and modal close; zero decorative icons or emojis.
- **Border Radius (`R-11`)**: Crisp architectural corners (`2px` status markers, `3px` buttons and inputs, `4px` modals) reinforce the hardware-ledger identity instead of uniform pill shapes.
- **Shadow (`R-12`)**: Zero box-shadow on ledger rows or rails; shadow reserved exclusively for active modal dialogs (`<dialog>`) to separate them from the canvas.
- **Layout & Rhythm (`R-05`, `R-14`)**: Pairs structured account cards and 2-column quota tiles with a unified 2-column model directory on desktop, collapsing cleanly into a single column on mobile (`375px`).
- **Accessibility & Touch Targets (`R-03`, `R-32`, `R-39`)**: Native controls, explicit `<label for>`, `cursor: pointer`, high-contrast `2px` `:focus-visible` outline, and `>= 44px` tap targets on mobile/tablet.
