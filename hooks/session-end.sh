#!/bin/bash
# Memoria - Session End Hook
# Called when a Claude Code session ends
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/dist/session-end.js"
