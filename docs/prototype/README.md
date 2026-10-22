# Company agent prototype

One company agent on the Claude Agent SDK, showing the core loop of the platform:
**company memory → skill (playbook) → MCP tool → approval gate → audit log → cost report.**

## Run it

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...      # API key, not a Claude subscription
npm start
# or with your own task:
npm start -- studybuddy "Look at our metrics and tell me which angle to double down on"
```

Optional: `MODEL=claude-haiku-5-5` to compare cost and quality, `MAX_BUDGET_USD=0.20` to tighten the cap.

## What happens

1. The agent loads StudyBuddy's memory (`companies/studybuddy/CLAUDE.md`) and the `social-post` skill.
2. It reads performance data through the `social` MCP server (allowed automatically: read-only).
3. It writes a post following the playbook, including the UK advertising checks.
4. It tries to publish, and the **approval gate** stops it and asks you `Approve? [y/N]`.
   Try saying **N** once to see it accept the decision and report back instead of retrying.
5. You get a run summary with tokens and cost by model, also logged to `data/runs.jsonl`.
   Published posts (mock) land in `data/outbox.json`.

## How it maps to the platform

| Prototype | Platform |
|---|---|
| `companies/<id>/` folder | Each customer company's workspace |
| `CLAUDE.md` | Company memory: business, brand voice, goals, rules |
| `.claude/skills/social-post/SKILL.md` | One of our playbooks (the IP) |
| `src/social-server.ts` | MCP integration (mock here; Ayrshare in production) |
| `src/approval.ts` (`canUseTool`) | HQ approval queue for founders and mentors |
| `PostToolUse` audit hook | HQ activity feed and audit trail |
| `maxBudgetUsd` | Per-run spending cap |
| Run summary / `runs.jsonl` | Cost per task shown in HQ; basis for usage pricing |

## Safety defaults in this prototype
- Only read-only tools run without asking; anything else is denied unless it's on the approval list.
- Bash, file writes and web access are switched off.
- Each run stops if it would exceed its budget (`error_max_budget_usd`).

## Next steps
- Add a second company folder (e.g. Tessera) with a B2B-flavoured CLAUDE.md, and see the same skill adapt.
- Swap the mock tools for real Ayrshare calls.
- Run the same task on Sonnet and Haiku and compare cost and quality from the run logs.
