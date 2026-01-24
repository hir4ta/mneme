#!/bin/bash
# Memoria - Pre-Compact Hook
# Called before context compaction
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/dist/pre-compact.js"
