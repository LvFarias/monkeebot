# Monkee Bot

A Discord bot for Egg, Inc. co-op coordination, leaderboards, and a lightweight OpenAI-powered chat persona (Monkee). Includes slash commands for managing members, contracts, co-ops, and reports, plus optional channel relaying.

## Features
- Discord slash commands auto-registered globally at startup (including a message-context `transcript` command).
- Monkee AI persona that replies in-channel when toggled on via `/monkee`.
- Co-op helpers: lookup free co-ops, recent co-ops, push reports, and season helpers.
- Member utilities: add/remove mamabirds, list members without IGN, ban helpers, and leaderboard reporting.
- SQLite persistence (Better-SQLite3) with automatic schema bootstrap and optional custom DB path.
- Optional embedding-based IGN matcher (uses OpenAI) and cached embeddings under `data/`.
- Dockerfile for production builds and packaged runtime.

## Requirements
- Node.js 20+
- npm (for dependency install)
- Discord bot token and application/client ID
- Egg, Inc. EID for contract/leaderboard calls
- OpenAI API key (required for Monkee replies and the embedding-based matcher)

## Quickstart
1) Install dependencies:

```
npm install
```

2) Create a `.env` in the project root (see sample below).

3) Run the bot (registers global commands on startup):

```
node index.js
```

Global command registration can take a minute to propagate in Discord. The process logs when commands are registered.

## Environment
Minimum variables to run:

```
# Discord
TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id

# Sheets
SPREADSHEET_ID=your_spreadsheet_id

# Egg, Inc.
EID=EIxxxxxxxxxxxxxxxx     # Egg, Inc. user ID (starts with EI)

# Optional
# OpenAI (needed for Monkee replies and /test embedding matcher)
OPENAI_API_KEY=sk-...

COOPS_DB_PATH=./data/coops.db   # Override database location (defaults to ./data/coops.db)
NODE_ENV=production             # Set if you want explicit mode
```

Notes:
- Without `OPENAI_API_KEY`, Monkee replies and the embedding-based `/test` command will not run; the bot will warn once in-channel instead of crashing.
- The SQLite file is created automatically. If `COOPS_DB_PATH` is set, the directory will be created as needed.

## Commands overview
- `/monkee on|off` — toggle the Monkee AI responder (authorized to user `659339631564947456`).
- Co-op utilities live under `commands/`: free co-ops, coop status checks, push reports, season helpers, and contract tools.
- Member/admin helpers: add/remove mamabirds, bans, member lookup, leaderboard reporting, and timestamp/rolling utilities.
- Message context: `transcript` (registered globally).

## Testing
Run unit tests (Vitest):

```
npm test
```

Coverage:

```
npm run test:coverage
```

## Docker
Build and run:

```
docker build -t monkee .
docker run --rm \
  -e TOKEN=your_discord_bot_token \
  -e SPREADSHEET_ID=your_spreadsheet_id \
  -e CLIENT_ID=your_discord_application_id \
  -e EID=EIxxxxxxxxxxxxxxxx \
  -e OPENAI_API_KEY=sk-... \
  -e COOPS_DB_PATH=/app/data/coops.db \
  -v $(pwd)/data:/app/data \
  monkee
```

The image sets `NODE_ENV=production` and defaults `COOPS_DB_PATH` to `/app/data/coops.db`.

## Data & persistence
- SQLite lives at `./data/coops.db` by default; schema is bootstrapped on startup.
- Embedding caches are written under `data/` (e.g., `embeddings_*.json`).

## Notes
- Channel proxying hooks (`getProxyLink`/`isProxyActive`) are referenced in `index.js`; ensure the corresponding helper exists/configures source/target channel IDs before enabling that flow.
- Commands run with the minimal intents needed (Guilds, Messages, MessageContent, DMs). Keep your bot token scoped appropriately.
