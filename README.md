# fcc — Firebase Crashlytics CLI

Browse and manage Firebase Crashlytics data from the command line.

Firebase doesn't provide a public API or CLI access to Crashlytics data. This tool fills that gap by using the same internal API (v1alpha) that the Firebase Console and MCP use, authenticated through your existing `firebase login` session.

## Why

- The official `firebase` CLI has no Crashlytics commands
- The Firebase Console is web-only, not scriptable
- No MCP or REST API is publicly documented for Crashlytics
- AI agents and automation workflows can't access crash data

`fcc` gives you full read access to your Crashlytics data from the terminal, pipeable to `jq`, usable by scripts and agents.

## Install

```bash
# Requires Node.js 18+
npm install -g firebase-crashlytics-cli
```

Or from source:

```bash
git clone https://github.com/nicMusic/firebase-crashlytics-cli.git
cd firebase-crashlytics-cli
npm install
npm run build
npm link
```

## Prerequisites

You must be logged in with the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
```

`fcc` reads the OAuth token stored by `firebase login` — no additional authentication setup needed.

## Quick start

```bash
# List all your Firebase projects
fcc projects list

# List apps in a project
fcc apps list --project my-project-id

# Set a default project and app for the current directory
fcc set project my-project-id
fcc set app 1:123456789:android:abcdef123456

# List crash issues (uses saved defaults)
fcc issues list

# Get full details of a crash
fcc issues get <issueId>
```

## Commands

### Projects

```bash
fcc projects list              # List all Firebase projects in your account
fcc projects list --json       # JSON output
```

### Apps

```bash
fcc apps list --project <id>   # List apps in a project
```

### Issues

```bash
# List top crash issues
fcc issues list
fcc issues list --type fatal          # Only fatal crashes
fcc issues list --type nonfatal       # Only non-fatal errors
fcc issues list --type anr            # Only ANRs
fcc issues list --version "3.2.1"     # Filter by app version
fcc issues list --signal regressed    # Filter by signal (fresh, regressed, repetitive)
fcc issues list --limit 10            # Limit results

# Get full details of an issue
fcc issues get <issueId>
fcc issues get <issueId> --json       # Full JSON with latest event, stacktrace, device info

# Change issue state
fcc issues close <issueId>
fcc issues mute <issueId>
fcc issues open <issueId>
```

### Events

```bash
# List crash events for a specific issue
fcc events list --issue <issueId>
fcc events list --issue <issueId> --from 7d      # Last 7 days
fcc events list --issue <issueId> --from 24h     # Last 24 hours
fcc events list --issue <issueId> --device "Samsung Galaxy S24"
fcc events list --issue <issueId> --os "Android 14"

# Get full event details (stacktrace, device, logs, breadcrumbs)
fcc events get <eventName>
fcc events get <eventName> --json
```

### Reports

```bash
fcc reports top-issues             # Top crash issues with stats
fcc reports top-versions           # Crashes by app version
fcc reports top-devices            # Crashes by device model
fcc reports top-os                 # Crashes by OS version
fcc reports summary                # Overview: total crashes + top issues + top versions

# All report commands support filters
fcc reports top-issues --type fatal --from 30d --version "3.2.1"
```

### Notes

```bash
fcc notes list <issueId>                      # List notes on an issue
fcc notes add <issueId> "Fixed in v3.3.0"     # Add a note
fcc notes delete <issueId> <noteId>           # Delete a note
```

### Configuration

```bash
# Set defaults for the current directory (saved in .fcc.json)
fcc set project my-project-id
fcc set app 1:123456789:android:abcdef

# View/manage config
fcc config list
fcc config get project
fcc config set defaultLimit 50
fcc config set-global defaultType fatal    # Global default (~/.config/fcc/config.json)
```

## Global options

All commands that query Crashlytics accept:

| Flag | Description |
|------|-------------|
| `--project <id>` | Override the Firebase project |
| `--app <appId>` | Override the Firebase app |
| `--json` | Output raw JSON (for piping to `jq`, scripts, agents) |
| `-V`, `--cli-version` | Print the CLI version |

## Project/app resolution order

1. `--project` / `--app` flags (highest priority)
2. `.firebaserc` in the current directory (for `--project` only)
3. `.fcc.json` in the current directory (set via `fcc set`)

## JSON output

Every command supports `--json` for machine-readable output:

```bash
# Pipe to jq
fcc issues list --json | jq '.[].issue.title'

# Use in scripts
ISSUE_ID=$(fcc issues list --json | jq -r '.[0].issue.id')
fcc issues get $ISSUE_ID --json
```

## How it works

`fcc` uses the Firebase Crashlytics v1alpha REST API at `firebasecrashlytics.googleapis.com`. This is the same undocumented API used internally by the Firebase Console and the Firebase MCP server. Authentication is done via the OAuth refresh token stored by `firebase login`.

**Important:** This API is undocumented and may change without notice. Service account authentication is not supported — only user OAuth tokens from `firebase login` work.

## Development

```bash
git clone https://github.com/nicMusic/firebase-crashlytics-cli.git
cd firebase-crashlytics-cli
npm install

# Run in dev mode
npx tsx src/index.ts projects list

# Build
npm run build

# Run built version
node dist/index.js projects list
```

## License

MIT
