# Decisions

Non-trivial decisions made during the autonomous build run (`docs/AUTONOMOUS-RUN.md`). Each says what the question was, what was chosen, why, and how to change it. Precedence used: SPEC (v2 parts win) → DESIGN → CLAUDE.md → existing code → simplest reversible option.

## D1. Branches and pushing
- **Question:** AUTONOMOUS-RUN asks for `phase-N-*` branches merged into `develop`; this session may only push to `claude/great-babbage-kzczde`.
- **Chosen:** phase branches and `develop` exist locally; every phase is merged into `develop` with `--no-ff`, and `claude/great-babbage-kzczde` is kept identical to `develop` and pushed. The merge commits preserve the phase structure.
- **Change it:** `git push origin claude/great-babbage-kzczde:develop` creates `develop` on GitHub from the pushed branch.

## D2. Local Supabase ports
- **Question:** `supabase start` failed because ports 54322 and 54324 are taken in the build sandbox.
- **Chosen:** `supabase/config.toml` uses 54332 for the database and 54334 for the mail catcher. API (54321) is unchanged.
- **Change it:** set them back to 54322 / 54324 in `config.toml`; nothing else depends on them.

## D3. Merging the SPEC and PHASES additions
- **Question:** the additions reuse letters A–L, which clash with SPEC parts A–E.
- **Chosen:** the additions' section A replaces "Product in one line"; sections B–L became parts F–P under a "v2 scope" heading, with cross-references renumbered (e.g. "section L" → "section P"). The SPEC says F–P win on conflict. The two additions files were removed so there is one source of truth (they're in git history at `b48bee0`).
- **Change it:** restore the files from `b48bee0`.

## D4. Build order
- **Chosen:** 1 → 2 → 3 → 4 → 5 → 10 → 11 → 12 → 13 → 6 → 7 → 8 → 9 → 14 → 15 → 16 → 17 → 18 → 19. See STATUS.md for the reasons.
