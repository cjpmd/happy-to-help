#!/usr/bin/env bash
# Pre-downloads the Edge Functions' npm dependencies into the local edge runtime's cache.
# Only needed where outbound TLS is re-signed by a corporate or sandbox proxy that the edge
# runtime container doesn't trust (its boot error says "invalid peer certificate"). Point
# CA_BUNDLE at that proxy's CA. Run after `npx supabase start`.
set -euo pipefail
cd "$(dirname "$0")/../.."
CA_BUNDLE="${CA_BUNDLE:-/root/.ccr/ca-bundle.crt}"
FUNCS="$PWD/supabase/functions"
docker run --rm \
  -v supabase_edge_runtime_gumption:/root/.cache/deno \
  -v "$CA_BUNDLE":/ca.crt:ro \
  -v "$FUNCS":"$FUNCS":ro \
  -e DENO_CERT=/ca.crt -e DENO_DIR=/root/.cache/deno \
  denoland/deno:2.1.4 cache $(ls "$FUNCS"/*/index.ts)
