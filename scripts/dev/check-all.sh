#!/usr/bin/env bash
# Runs every check a phase must pass before merging (docs/AUTONOMOUS-RUN.md): typecheck, lint,
# unit tests, build, database tests, integration tests, agent-service tests and the live e2e
# smoke test. Needs the local Supabase stack and `supabase functions serve` running.
# Usage: scripts/dev/check-all.sh [--no-reset]
set -uo pipefail
cd "$(dirname "$0")/../.."
fail=0
step() {
  local name=$1; shift
  if "$@" >"/tmp/check-$name.log" 2>&1; then echo "PASS $name"; else echo "FAIL $name (see /tmp/check-$name.log)"; fail=1; fi
}
if [ "${1:-}" != "--no-reset" ]; then
  step db-reset npx supabase db reset
  step db-types npm run db:types
fi
step typecheck npx tsc --noEmit -p .
step lint npx eslint .
step unit npx vitest run
step build npm run build
step pgtap npx supabase test db
step integration npm run test:integration
step agent-typecheck bash -c "cd agent-service && npx tsc --noEmit -p ."
step agent-tests bash -c "cd agent-service && npx vitest run"
# The other suites change the seed data (the agent tests reply to Harbour Bakes' inbox), so the
# browser test gets a fresh database.
step e2e-reset npx supabase db reset
step e2e env CHROMIUM_PATH="${CHROMIUM_PATH:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}" npm run e2e:live
exit $fail
