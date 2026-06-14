#!/usr/bin/env bash
# runner-standalone.sh — pre-commit gate for a standalone clone of the
# vscode-extension. Self-contained mirror of botopink/projects'
# scripts/git-hooks/lib/runners/vscode-extension.sh.
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
pass() { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

runStandaloneGate() {
    local root
    root=$(git rev-parse --show-toplevel)
    cd "$root"

    # 1. conflict markers in staged files.
    local lt7 eq7 gt7
    lt7=$(printf '<%.0s' {1..7})
    eq7=$(printf '=%.0s' {1..7})
    gt7=$(printf '>%.0s' {1..7})
    local marker_re="${lt7} |${eq7}\$|${gt7} "
    local staged
    staged=$(git diff --cached --name-only --diff-filter=ACM)
    if [ -n "$staged" ]; then
        local hits=""
        while IFS= read -r f; do
            [ -z "$f" ] && continue
            [ -f "$f" ] || continue
            if grep -nE "$marker_re" "$f" 2>/dev/null | head -1 | grep -q .; then
                hits="$hits $f"
            fi
        done <<< "$staged"
        if [ -n "$hits" ]; then
            echo "  Conflict markers in:$hits"
            fail "Conflict markers found in staged files"
        fi
        pass "No conflict markers"
    fi

    # 2. npm test (bootstrap node_modules on first run).
    if ! command -v npm >/dev/null 2>&1; then
        warn "npm missing — skipping vscode-extension gate"
        return 0
    fi
    local marker="$root/node_modules/.botopink-installed"
    if [ ! -f "$marker" ]; then
        echo "  ==> first run: npm ci ($root)"
        if ! ( cd "$root" && npm ci ) 2>&1; then
            fail "vscode-extension: npm ci failed"
        fi
        mkdir -p "$root/node_modules"
        : > "$marker"
    fi
    echo -n "  Testing vscode-extension (npm test)... "
    if ( cd "$root" && npm test --silent ) >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo "  Re-run:  ( cd $root && npm test )"
        fail "vscode-extension: npm test failed"
    fi
}
