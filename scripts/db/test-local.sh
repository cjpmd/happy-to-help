#!/usr/bin/env bash
# Builds a throwaway database on a local Postgres 16 (with pgTAP and pg_prove installed),
# applies the Supabase stand-in, every migration and the seed, then runs the pgTAP tests.
# With the Supabase CLI and Docker you can use `supabase db reset && supabase test db` instead.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${TEST_DB:-gumption_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

dropdb --if-exists "$DB"
createdb "$DB"
psql -X -q -d "$DB" -c "alter database \"$DB\" set search_path = \"\$user\", public, extensions"

"${PSQL[@]}" -f scripts/db/supabase-shim.sql
for f in supabase/migrations/*.sql; do
  echo "migration: $f"
  "${PSQL[@]}" -f "$f"
done
echo "seed: supabase/seed.sql"
"${PSQL[@]}" -f supabase/seed.sql

pg_prove -d "$DB" supabase/tests/database/*.test.sql
