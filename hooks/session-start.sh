#!/bin/bash
# Memoria - Session Start Hook
# Called when a Claude Code session starts
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/dist/session-start.js"
