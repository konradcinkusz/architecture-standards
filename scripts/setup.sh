#!/usr/bin/env bash
#
# setup.sh — one-command onboarding. REPO-BASELINE.md §3.
#
# Usage:
#   ./scripts/setup.sh            check prerequisites, install hooks, report
#   ./scripts/setup.sh --check    strict: a missing secret scanner is a failure
#
# §3 is written for a service repository: initialise a secret store, generate the one
# mandatory secret, offer each optional integration. Almost none of that applies here,
# and the steps are omitted rather than faked — this repository has no secrets, no
# runtime, and nothing to run against. What is left is the part that does apply: name
# the prerequisites with install pointers, install the pre-commit hook that P5 makes
# mandatory, and say plainly what will be refused if a step was skipped.
#
# A plain run degrades and still installs what it can. --check is the strict form CI
# would use, where a missing scanner is a failure rather than a warning.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

STRICT=0
[ "${1:-}" = "--check" ] && STRICT=1

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
amber() { printf '\033[0;33m%s\033[0m\n' "$*"; }
dim()   { printf '\033[0;90m%s\033[0m\n' "$*"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

DEGRADED=0

# ── 1. Prerequisites ─────────────────────────────────────────────────────────
step "1. Prerequisites"

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "${NODE_MAJOR}" -ge 18 ]; then
    green "  node $(node -v) — the generator needs 18 or newer."
  else
    red   "  node $(node -v) is too old; the generator needs 18 or newer."
    echo  "  Install: https://nodejs.org/en/download"
    exit 1
  fi
else
  red  "  node is not installed. The generator will not run without it."
  echo "  Install: https://nodejs.org/en/download"
  exit 1
fi

# Deliberately not checked: npm. There is no package.json and no dependency to
# install — the generator uses only the Node standard library, which is what makes a
# fresh clone runnable with nothing but the runtime.

# ── 2. Secret scanner ────────────────────────────────────────────────────────
step "2. Secret scanner"

if command -v gitleaks >/dev/null 2>&1; then
  green "  gitleaks on PATH — the hook will use it directly."
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  green "  gitleaks not on PATH, but Docker is running — the hook falls back to the"
  dim   "  same container image CI uses (ghcr.io/gitleaks/gitleaks)."
else
  DEGRADED=1
  amber "  No secret scanner available."
  echo  "  The hook installed below REFUSES TO COMMIT without one — that is by design"
  echo  "  (P5), not a bug to work around. Install one of:"
  echo  "    • gitleaks   https://github.com/gitleaks/gitleaks#installing"
  echo  "                 macOS: brew install gitleaks"
  echo  "    • Docker     https://docs.docker.com/get-docker/"
fi

# ── 3. Git hooks ─────────────────────────────────────────────────────────────
step "3. Git hooks"

HOOK_SRC="${REPO_ROOT}/scripts/hooks/pre-commit"
HOOK_DST="$(git rev-parse --git-path hooks)/pre-commit"
mkdir -p "$(dirname "${HOOK_DST}")"

if [ -e "${HOOK_DST}" ] && ! cmp -s "${HOOK_SRC}" "${HOOK_DST}"; then
  cp "${HOOK_DST}" "${HOOK_DST}.backup"
  dim "  Existing hook backed up to pre-commit.backup"
fi
cp "${HOOK_SRC}" "${HOOK_DST}"
chmod +x "${HOOK_DST}"
green "  pre-commit installed → ${HOOK_DST}"

# ── 4. Verify the tree ───────────────────────────────────────────────────────
step "4. Generated tree"

if node scripts/build-marketplace.mjs --check >/dev/null 2>&1; then
  green "  Marketplace tree is up to date."
else
  amber "  Marketplace tree is stale or the version gate is unsatisfied. Run:"
  echo  "    node scripts/build-marketplace.mjs"
  dim   "  See MARKETPLACE.md \"Versioning\" if it asks for a version bump."
fi

# ── Summary ──────────────────────────────────────────────────────────────────
step "Ready"

echo "  node scripts/build-marketplace.mjs           regenerate the packaging layer"
echo "  node scripts/build-marketplace.mjs --check   what CI runs"
echo "  node scripts/validate-marketplace.mjs        validate manifests"
echo "  ./scripts/scan-secrets.sh                    mirror the CI secret scan"

if [ "${DEGRADED}" -eq 1 ]; then
  echo
  if [ "${STRICT}" -eq 1 ]; then
    red "setup --check: a secret scanner is required and none was found."
    exit 1
  fi
  amber "Setup finished, but committing will be refused until a scanner is installed."
fi
