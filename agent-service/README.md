# Agent service

The long-running worker that runs Sol. It claims jobs from `agent_jobs`, runs one company agent per job, and writes `agent_runs`, `activity_events`, `approvals`, `chat_messages` and the credit ledger with the Supabase service role.

```
claim (FOR UPDATE SKIP LOCKED) → estimate → reserve credits → build the company workspace
  → run the agent (maxBudgetUsd from the reservation) → audit every tool call
  → settle the actual cost, release the rest → auto-refund and retry if the platform failed
```

## Run it locally

```bash
npx supabase start && npx supabase db reset     # from the repo root
cd agent-service && npm install
npm run run-once                                # one social post for StudyBuddy, end to end
npm run run-once -- chat "How's the waitlist?"  # or any job type in src/jobs.ts
npm run dev                                     # the worker loop
npm test                                        # against the local stack (reset it first)
```

`run-once` and the tests read the local stack's URL and service key from `supabase status`. For the worker, copy `.env.example` to `.env`.

## Runtimes

- **mock** (default): no Anthropic calls and no cost. Follows each job's playbook with plain drafts, through the same tools, gate, audit trail and credit flow. A task title containing "fail" simulates a provider failure.
- **claude**: `AGENT_RUNTIME=claude` plus `ANTHROPIC_API_KEY`. Real runs on the Claude Agent SDK (`src/runtime/claude.ts`), based on `docs/prototype/`. This spends real money; see `docs/HANDOFF.md`.

## Layout

| File               | What it does                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `src/config.ts`    | Model IDs per tier (routine: Haiku, planning: Sonnet, strategy: Opus) and worker settings, from env |
| `src/jobs.ts`      | Job types: model tier, skills, credit estimate and cap, tools, prompt                               |
| `src/memory.ts`    | The company's CLAUDE.md, generated from the database                                                |
| `src/workspace.ts` | Writes the run's workspace: CLAUDE.md, `.claude/skills/*`, data snapshot                            |
| `src/tools.ts`     | Read tools and `propose_*` tools (which only write pending approvals)                               |
| `src/gate.ts`      | `canUseTool`: a job may use only its own tools; no shell, writes or web                             |
| `src/runtime/`     | `claude.ts` (Agent SDK), `mock.ts`, and the shared interface                                        |
| `src/runner.ts`    | One job end to end, with credits, retries and escalation                                            |
| `src/worker.ts`    | The polling loop, plus the stale-run reaper                                                         |
| `skills/`          | Playbooks: `social-post`, `claims-check`                                                            |

Credit rules (CLAUDE.md rule 3): the reservation is the job's cap or the available balance (plus cohort pool), whichever is smaller, and never less than the estimate; `maxBudgetUsd` is that reservation converted with `credit_config`. Agents never publish, send or spend: `propose_*` tools create approvals that the executor carries out after GO.
