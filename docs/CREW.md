# Agent Catalogue — The One-Person Company Platform

Oct 31, 2026 · @Chris

## The thesis

Gumption (working name) gives one founder the output of a 20-person company: the founder sets direction and approves, and a team of agents does the work. Monday.com sells agents that help an existing team move faster. We sell the team itself, to people who don't have one yet.

The north star is the one-person unicorn: a company where headcount stops being the limit on growth. Every agent in this catalogue should be judged on one question: does it remove a hire the founder would otherwise need to make?

**Who it's for**

| Customer | Where they are | What they lack | Onboarding path | What they buy first |
| --- | --- | --- | --- | --- |
| Start-up founder (incl. students) | Idea to first revenue | Time, know-how, a team | Start up | Starter or Founder plan, plus a Launch Pack for the build month |
| Growing but under-resourced business | Trading, some revenue, 1–5 people | Marketing, sales and admin capacity | Keep going (imports existing data) | Founder or Growth plan |
| University or incubator | Runs founder cohorts | Scalable support for founders | Cohort code | Cohort licence with mentor oversight |

**What the one-person unicorn needs from us**

1. **Leverage:** agents that run continuously, not tools the founder has to drive.
2. **Judgement on tap:** agents that recommend, not just execute, so the founder makes fewer, better decisions.
3. **Trust:** enough visibility and control that the founder lets agents act without checking everything.
4. **Compounding context:** a company memory that makes every agent better the longer the business runs on the platform.
5. **Capital and credibility:** compliance, finance and fundraising handled to the standard investors expect.

**One story, three emphases**

| Audience | Lead line | What to stress |
| --- | --- | --- |
| Founders and small businesses | "Sol is your cofounder. Sol's crew does the work you'd otherwise hire for." | Named agents, visible results, cost compared with hiring |
| Universities and incubators | "Evidence-gated, mentor-overseen founder support at cohort scale." | Evidence gates, mentor view, consent and data safeguards; avoid unicorn hype |
| Investors | "The operating system for one-person companies." | The one-person-unicorn market, credit margins, institutional channel |

The safeguard against Polsia's failure mode: we never promise zero input. Agents do the work; evidence decides what is worth doing, and the founder approves anything that faces the outside world.

## Design principles

We take monday.com's packaging and governance almost wholesale, and change the centre of gravity from "help your team" to "be your team".

| monday.com does | We do | Already in our design? |
| --- | --- | --- |
| Named agents with a role and a running count ("Zara, Deal Scorer, 26 deals scored") | A crew of named agents under Sol, grouped by pillar, each card showing its outcome count | No. Sol is the only persona today; pillar subagents are not visible |
| "362 agent tasks last night" dashboard | Morning briefing built from HQ's Overnight activity: done, needs you, watch, spend | Partly. Overnight activity and approvals exist |
| Agents grouped by department and job type | Grouped by our pillars (Build, Grow, Customers, Run, Stay legal, Raise) and by stage | Yes. Pillars exist |
| Agent builder: style, tools, knowledge, skills | Same four parts: brand voice, MCP tools, company memory, Claude skills | Partly. Skills, MCP and versioned voice exist; no agent records yet |
| Activity log, permissions, simulation mode, cost centre | Same, plus an autonomy ladder that extends the response policy | Partly. Runs timeline, ledger and response policy exist |
| Drift Detector, Process Automator | Same, plus Opportunity Scout and Founder Coach | No |
| MCP server; bring your own agent | Expose the platform as an MCP server | No (later) |
| Assumes existing processes | Agents bring best-practice playbooks (skills) with them | Yes |
| Hosts your work on its platform | Founder owns the GitHub, Supabase, Stripe and domain | Yes. A key difference from Polsia too |
| No validation step | Evidence-gated roadmap: Idea → Evidence → Build → Launch → Grow | Yes |
| No external oversight | Mentors oversee cohorts and approve gates | Yes |
| No company formation, compliance or fundraising | Stay legal and Raise pillars | Yes, to be deepened |

**Three rules for every agent**

1. **Outcome, not activity.** Each agent has one measurable result (leads booked, invoices chased, posts published), shown on its card.
2. **Recommend, then act.** Every agent can explain what it plans to do and why before doing it.
3. **Earn autonomy.** New agents start in draft mode and move up autonomy levels as the founder approves their work (see Trust and governance).

## Sol, flight director

Sol ("powered by Claude") stays the founder's cofounder and single point of contact. What changes is that Sol now leads a visible crew. In the mission-control design, Sol is flight director and each agent is a crew member at a console, so the founder sees a company at work rather than one chatbot.

**What Sol does**

- **Turns goals into plans.** The 90-day goal from onboarding becomes weekly targets for each pillar's crew, within the current stage gate.
- **Runs the overnight loop.** Routines and Auto Mode schedule the crew; Sol collects their output and writes the morning briefing.
- **Holds the decision queue.** Anything above an agent's autonomy level lands in Approvals (Approve, Decline, Ask why).
- **Explains itself.** Every action keeps its plain-English "Why?", so founders learn rather than just delegate.
- **Spots gaps.** Notices when a goal has no crew member on it and proposes one, with its credit estimate.
- **Is the MCP entry point.** Later, when the founder works in Claude directly, Sol is who they talk to.

**The morning briefing (the hero screen)**

1. Headline: progress against the 90-day goal and the current stage gate.
2. Done overnight: one line per crew member, with its outcome count.
3. Needs you: approvals waiting, oldest first, each with Sol's recommendation.
4. Watch: risks and anomalies (cash, churn, an underperforming post, a compliance deadline).
5. Spend: credits used overnight, month to date, forecast to month end, and the equivalent hiring cost.

**Pillar leads.** On the Growth plan, each pillar gets a lead agent that coordinates its specialists, so Sol manages six leads rather than thirty agents. This mirrors how a real company scales and keeps each agent's prompt and context small.

## Evidence gates and mentors

The crew works inside the stage gates; it never runs ahead of the evidence. This is our main answer to Polsia's churn, which came largely from founders building things nobody wanted.

| Stage | Gate to pass | Crew active | Who approves the gate |
| --- | --- | --- | --- |
| Idea | Problem and customer defined | Sol, Iris, Scout | Founder |
| Evidence | Key assumptions validated on the Evidence board (interviews, waitlist, pre-orders) | Eve, Penny, Nova, Echo | Founder, or mentor in a cohort |
| Build | Site or app live and tested | Build crew, Shield, Forge | Founder, or mentor in a cohort |
| Launch | First paying customers | Grow, Customers and Stay legal crews | Founder |
| Grow | Repeatable acquisition | Full crew for the plan | Founder |

**Validation crew member.** Eve, Evidence Runner: designs tests for each assumption, books customer interviews, runs landing-page and waitlist tests, and moves cards on the Evidence board. Outcome shown: assumptions tested. Start autonomy L2. About 50 credits per test.

**Mentors.** In a cohort, mentors see each company's crew roster, stage, health and credit use, approve gates, and comment on approvals. They never see raw call transcripts. A crew that mentors can watch working is a strong selling point for institutions.

## Build agents (Build)

The Build crew keeps to websites and basic apps, in the founder's own GitHub and Supabase. Credits are indicative per run at 1 credit = 1p. Autonomy levels: L1 drafts only, L2 acts with approval, L3 acts and reports.

| Agent | Job | Trigger | Outcome shown on card | Tools | Start autonomy | Stage | Credits/run |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Arlo, Site Builder | Builds and updates the website and landing pages from the brand guide | Build stage; change requested | Pages live, versions approved | GitHub, hosting, Supabase | L2 | Start Up | 200–500 |
| Kit, App Builder | Builds simple supporting apps (booking, forms, portals) | Change requested | Features shipped | GitHub, Supabase | L2 | Both | 300–800 |
| Tess, QA and Accessibility | Tests each change on desktop and mobile, checks accessibility and broken links | Before any publish | Issues caught before release | Preview, browser | L3 | Both | 30 |
| Hook, Integrations | Connects Stripe, email, calendar and analytics in the founder's own accounts | Setup; new tool added | Integrations working | MCP connectors | L1 | Both | 50 |

Build runs are the most expensive work, which is why the Launch Pack exists (see Credits).

## Marketing agents (Grow)

Marketing is where founders feel the gap most, and it is the easiest place to show a visible result in week one. Social channels carry an API cost of about £10 per customer per month, so Starter is limited to one channel.

| Agent | Job | Trigger | Outcome shown on card | Tools | Start autonomy | Stage | Credits/run |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Iris, Brand Builder | Builds brand voice, positioning and messaging guide from the founder interview; maintains the versioned voice | Onboarding; on request | Brand guide approved | Company memory | L1 | Start Up | 200 |
| Nova, Content Creator | Drafts posts, blogs and emails in the brand voice (social-post skill) | Weekly content plan | Pieces published | Social, CMS, email | L2 | Both | 20–50 |
| Echo, Social Manager | Schedules posts, replies to comments and DMs | Content approved; new mention | Posts out, replies sent | Social APIs | L2 → L3 | Both | 10 |
| Scout, Competitor Researcher | Tracks competitor pricing, launches, hiring and ads | Weekly | Changes spotted | Web search | L3 | Both | 50 |
| Lumen, Campaign Manager | Plans and runs paid and organic campaigns using tracked links, hub pages and QR codes | Goal set by Sol | Campaigns live, cost per lead | Ads platforms, link layer | L2 | Keep Going | 100 |
| Bea, Performance Analyst | Spots wasted budget and weak angles, recommends reallocation | Daily | £ saved or redirected | Link layer, analytics, ads | L1 | Keep Going | 30 |
| Sage, SEO and AI-search | Optimises the site for search and for AI assistants (llms.txt, "Hey AI" page) | Monthly | Rankings, AI mentions | Site, search console | L2 | Both | 100 |
| Quill, PR and Awards | Finds press, podcast, awards and grant-showcase opportunities and drafts pitches | Weekly | Pitches sent, coverage won | Web, email | L2 | Both | 50 |

**Unicorn lever:** marketing agents turn one founder into a content team, an ads team and a research team. The AI-search agent matters more each year: being recommended by assistants like Claude is becoming as important as ranking on Google.

## Sales and customer agents (Customers)

The Customers pillar follows the existing loop of Reach → Capture → Listen → Respond, with outbound sales added. It also borrows monday's "score the deals, send proposals above 80%" relay, with the threshold set by the founder and shown on the card. Outbound sales is the biggest gap in the current design and what Keep Going customers most want to pay for.

| Agent | Job | Trigger | Outcome shown on card | Tools | Start autonomy | Stage | Credits/run |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hunter, Lead Finder | Builds target lists from the ideal-customer profile | Weekly; goal set by Sol | Qualified leads added | Web, CRM | L3 | Both | 50 |
| Penny, Lead Capture | Captures and enriches leads from site forms, chat, hub pages and QR codes | New form or chat | Leads captured, response time | Site, link layer, CRM | L3 | Both | 10 |
| Rex, Outreach | Writes and sends personalised outreach and follow-up sequences | New qualified lead | Replies, meetings booked | Email, CRM | L2 | Both | 20 |
| Zara, Deal Scorer | Scores open deals on fit, intent and engagement | Daily | Deals scored, at-risk deals flagged | CRM | L3 | Keep Going | 20 |
| Dev, Proposal Writer | Drafts proposals and quotes from templates and deal notes | Deal score above threshold | Proposals sent, win rate | Docs, CRM, e-sign | L2 | Both | 50 |
| Mira, Meeting Assistant | Captures calls, voice notes and meetings, with consent, into decisions and actions | Meeting or voice note | Actions routed | Calendar, transcription, CRM | L3 | Both | 30 |
| Harper, Reputation Manager | Monitors reviews, mentions and feedback; drafts responses within the response policy | New review or mention | Response time, sentiment trend | Reviews, social, forms | L1 → L2 | Both | 10–20 |
| Cora, CRM Keeper | Merges duplicates, fills gaps, closes stale deals | Weekly | Records cleaned | CRM | L3 | Keep Going | 20 |
| Nell, Customer Success | Onboards new customers, checks in, spots churn risk and upsell | New customer; usage drop | Retention, expansion revenue | CRM, email, billing | L2 | Keep Going | 20 |

**Unicorn lever:** the founder only handles the conversations that need a human, usually the last call before a signature. Everything before and after is taken care of. The Run pillar's CRM is the shared system of record, and Origin CRM's pipeline work could be reused there.

## Operations agents (Run)

Ops agents keep the business running without the founder noticing. Their value shows as problems that never reached the founder, so their cards should count what was prevented as well as what was done.

| Agent | Job | Trigger | Outcome shown on card | Tools | Start autonomy | Stage | Credits/run |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tilly, Inbox Triage | Sorts email and messages, answers routine ones, routes the rest (cheapest model tier) | New message | Messages handled without founder | Email, chat | L2 → L3 | Both | 10 |
| Hal, Support Agent | Answers customer questions from the knowledge base within the response policy; escalates the rest | New ticket or chat | Tickets resolved, CSAT | Helpdesk, chat, docs | L2 | Both | 10 |
| Nia, Supplier Scout | Finds and compares suppliers, tools and quotes | On request | Options found, savings | Web, email | L2 | Both | 100 |
| Hugo, Contract Reviewer | Reviews contracts and terms, flags risky clauses | Document uploaded | Issues flagged | Docs | L1 | Both | 50 |
| Vera, Project Monitor | Tracks tasks and deadlines, flags risks early | Daily | Risks flagged, deadlines met | Tasks, calendar | L3 | Keep Going | 10 |
| Wren, Daily Wrap-Up | Summarises the day's decisions, meetings and progress | End of day | Feeds Sol's briefing | All logs | L3 | Both | 20 |
| Pip, Process Builder | Writes SOPs and turns repeat work into Routines | Repeat task spotted | Hours saved | All | L1 | Keep Going | 50 |
| Jade, Hiring Assistant | Writes job ads, screens applicants, books interviews for first hires or freelancers | Role opened | Candidates shortlisted | Job boards, calendar | L2 | Keep Going | 30 |

**Unicorn lever:** most of a small company's admin is routine. Inbox triage and support together usually free the most founder hours, so they should be in every plan from day one.

## Company office agents (Stay legal, Run, Raise)

This is the pillar monday.com doesn't touch, and the one that makes a solo founder look like a proper company to customers, banks and investors. These agents prepare and track; the founder (or a partner accountant or solicitor) signs anything legally binding. That line keeps us out of regulated advice.

| Agent | Pillar | Job | Trigger | Outcome shown on card | Tools | Start autonomy | Stage | Credits/run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Forge, Company Formation | Stay legal | Prepares incorporation, articles, share structure, registered office, bank account checklist | Build stage | Company registered | Companies House data, docs | L1 | Start Up | 300 |
| Clara, Compliance Calendar | Stay legal | Tracks every filing and renewal (confirmation statement, accounts, VAT, PAYE, ICO, insurance) | Daily | Deadlines met, none missed | Calendar, docs | L3 | Both | 10 |
| Shield, Policies and GDPR | Stay legal | Writes privacy policy, terms, cookie notice and data records; keeps them current | Build stage; law or product change | Policies current | Docs, site | L1 | Both | 100 |
| Penn, Bookkeeper | Run | Categorises transactions, chases receipts, reconciles | Daily | Books up to date | Accounting software, bank feed | L2 → L3 | Both | 10 |
| Cass, Credit Control | Run | Sends invoices and polite, escalating payment chasers | Invoice due or overdue | Days to get paid | Accounting, Stripe, email | L2 | Both | 10 |
| Flo, Cash Forecaster | Run | Rolling 13-week cash forecast and runway; warns early | Weekly | Weeks of runway | Accounting, bank, Stripe | L3 | Both | 30 |
| Gus, Grants Scout | Raise | Finds grants, competitions and soft funding; drafts applications | Weekly | Applications submitted, £ won | Web, docs | L2 | Both | 100 |
| Ada, Investor Readiness | Raise | Builds pitch deck, financial model, data room and SEIS/EIS advance assurance pack | Founder starts fundraise | Readiness score | Docs, accounting | L1 | Both | 200 |
| Finn, Fundraising CRM | Raise | Builds investor list by fit, drafts intros, runs the investor kanban | Round open | Meetings, commitments | CRM, email | L2 | Keep Going | 50 |
| Rhea, Board and Investor Updates | Raise | Writes monthly investor updates and board packs from live data | Monthly | Updates sent on time | All data | L2 | Keep Going | 50 |

**Unicorn lever:** investor-grade data from day one. A company whose books, metrics and compliance have been agent-maintained since incorporation can raise faster and more cheaply, and due diligence becomes a link to the data room. This is a strong reason to stay on the platform once a company takes off.

Open question: which partner accountant and solicitor (ideally Scotland-based) sign off Forge, Shield and Ada's outputs, and on what terms?

## Meta-agents

These agents improve the system itself. They are what make the platform get better the longer a company uses it, which is the compounding effect a one-person unicorn depends on.

| Agent | Job | Trigger | Outcome shown on card | Credits/run |
| --- | --- | --- | --- | --- |
| Dex, Health Monitor | Watches every agent and integration; flags failed runs, broken connectors and quality drops | Continuous | Issues caught before the founder noticed | 10 |
| Otto, Automation Finder | Spots manual work the founder keeps doing and proposes a new agent or Routine | Weekly | Hours saved per proposal | 30 |
| Opal, Opportunity Scout | Looks across all data for growth openings: a product people keep asking for, an underpriced plan, a new segment | Monthly | Opportunities raised, adopted | 100 |
| Mo, Memory Keeper | Turns decisions, captured conversations and documents into the company memory every agent reads | Daily | Facts added, conflicts resolved | 20 |
| Cal, Founder Coach | Reviews how the founder spends time and suggests what to delegate next | Weekly | Founder hours on high-value work | 20 |

Dex and Mo run on every plan because the rest of the crew depends on them. Otto and Opal double as the platform's growth engine: each proposal comes with its credit estimate, so useful suggestions turn into plan upgrades and top-ups.

## Agent anatomy and data model

Every agent, built-in or custom, is the same record. That lets the catalogue, the custom-agent builder and the marketplace share one engine. Monday's four parts (style, tools, knowledge, skills) map directly onto Claude.

| Part | What it is | Claude mapping | Exists today? |
| --- | --- | --- | --- |
| Identity | Name, role, avatar, pillar, outcome metric | Crew card display | No |
| Style | Voice, tone, rules, red lines | System prompt + versioned brand voice | Yes |
| Tools | What it can touch, and how | MCP connectors, scoped by permission | Yes |
| Knowledge | What it knows about the company | Company memory (Mo) + uploaded docs | Partly |
| Skills | How it does the job well | Claude skills (SKILL.md playbooks, e.g. social-post) | Yes |
| Model tier | Which Claude model it uses | Cheapest tier for triage, stronger tiers for drafting and strategy | Yes |
| Trigger | When it runs | Routine, event (webhook), Auto Mode or request from Sol | Yes |
| Guardrails | Autonomy level, approval rules, budget cap | Response policy + platform policy layer, enforced outside the model; SDK maxBudgetUsd per run | Partly |

```json
{
  "id": "agent_zara",
  "name": "Zara",
  "role": "Deal Scorer",
  "pillar": "customers",
  "model_tier": "standard",
  "stage": ["keep_going"],
  "outcome_metric": { "label": "deals scored", "source": "run_log" },
  "style": { "prompt_ref": "prompts/sales/deal_scorer.md", "brand_voice": true },
  "tools": [ { "connector": "crm", "access": "read_write", "objects": ["deals"] } ],
  "knowledge": ["company_memory", "icp", "pricing"],
  "skills": ["deal-scoring"],
  "triggers": [ { "type": "schedule", "cron": "0 6 * * *" } ],
  "autonomy_level": 3,
  "approval_rules": [ { "action": "send_proposal", "requires": "founder" } ],
  "budget": { "credits_per_run_max": 50, "credits_per_month_max": 2000 },
  "handoffs": [ { "when": "score >= threshold", "to": "agent_dev" } ]
}
```

**Tables:** keep the existing `agent_runs`, `approvals`, `credit_ledger`, `stage_gates` and `evidence_items`, and add `agent_runs.agent_id`. New tables: `agents` (the record above, per company), `agent_autonomy` (level per agent and action type, with approval history), `company_memory` (facts with source and date) and `goals` (Sol's plans).

## Trust and governance

A founder only gets unicorn-level leverage if they trust agents to act unsupervised. The current response policy sets what Sol may do without approval, but it is fixed. The ladder below makes it per agent and per action type, and lets trust grow with evidence.

**Autonomy ladder (per agent, per action type)**

| Level | Behaviour | Moves up when |
| --- | --- | --- |
| L0 Simulate | Shows what it would have done; nothing is sent | Founder reviews a week of simulated output |
| L1 Draft | Prepares the work; founder sends | 20 drafts approved with few edits |
| L2 Approve | Acts after one-tap approval in Approvals (Approve, Decline, Ask why) | 50 approvals with no rejections in 30 days |
| L3 Act and report | Acts, then reports in the briefing | Founder chooses; can drop back anytime |

Sol proposes each promotion and the founder confirms. In a cohort, mentors can see each agent's level, and can hold an agent at L2 or below. Anything touching money, legal commitments or public statements in a crisis stays at L2 or below permanently. This matches the existing rule that everything external needs approval at the start.

**Controls borrowed from monday.com**

- **Activity log:** every action, by which agent, when, and why, searchable and exportable.
- **Permissions:** read, create or edit per connector and per object, set on the agent record.
- **Simulation mode:** L0 above; also used whenever an agent's prompt or skill changes.
- **Cost centre:** credit spend per agent and department, with caps and alerts.
- **Content ownership:** the customer owns inputs and outputs, written into the terms.
- **No training on customer data:** stated plainly, consistent with Anthropic's commercial terms.

**Added for small businesses:** a kill switch that pauses all agents in one tap, and a weekly "what your agents said in public" digest so the founder sees the brand's voice in the wild.

## Credits, tiers and the Launch Pack

Prices and credits come from the existing financial model. Customers pay first, so the platform never fronts Claude costs. What's new here is which crew each plan unlocks; that mapping is a proposal to test.

**Credit rule:** 1 credit = 1p, with a 3× markup, so a $0.10 run charges about 24 credits. Each run is estimated, reserved, capped and then settled at actual cost. The per-run figures in the agent tables are first guesses; replace them with measured averages from `agent_runs` after the pilot.

| Product | Price | Credits | Crew unlocked (proposed) |
| --- | --- | --- | --- |
| Starter | £29/month | 1,500/month | Sol, Iris, Nova, Echo (one social channel), Eve, Penny, Tilly, Clara, Shield, Penn, Dex, Mo |
| Founder | £79/month | 5,000/month | Starter crew plus Build crew, Forge, Scout, Sage, Quill, Hunter, Rex, Dev, Mira, Harper, Hal, Cass, Flo, Gus, Ada, Otto |
| Growth | £149/month | 12,000/month | Everything, incl. Lumen, Bea, Zara, Cora, Nell, Hugo, Nia, Vera, Wren, Pip, Jade, Finn, Rhea, Opal, Cal, pillar leads; later custom agents and MCP access |
| Launch Pack (build month) | £49 one-off | 10,000 build credits | Build crew for the Build stage |
| Top-ups | £10 / £25 / £50 | 500 / 1,300 / 2,800 | n/a |
| Cohort licence | About £400 per founder per six-month programme, invoiced | Pooled, with per-founder caps | Founder-plan crew, plus mentor view |

**Making spend feel like payroll:** the briefing shows an "equivalent cost" line, such as "this month's crew work would have taken about 60 hours of a marketing assistant". Founders compare us with hiring, not with other software. Unlocking crew by plan also makes upgrades visible: the founder can see the agents they don't have yet.

**Open question:** does a full crew on Growth fit inside 12,000 credits a month? A busy Growth company could plausibly run several thousand credits a week on outbound and content alone. Check this against pilot run costs before fixing the plan contents.

## Build order

Much of the engine already exists (runs, approvals, ledger, gates, skills, response policy), so the first steps are about making the crew visible and trusted. Each phase should be sellable on its own, so customer payments fund the next.

1. **Agent records.** Add the `agents` table and link `agent_runs` to it, so each pillar subagent becomes a named crew member with an outcome metric.
2. **Crew roster and cards.** A crew view per pillar in the mission-control design, with outcome counts and a "Why?" on every action. Sol becomes flight director.
3. **Morning briefing.** Rebuild HQ's Overnight activity into the five-part briefing, including spend and equivalent hiring cost.
4. **Autonomy ladder and simulation mode.** Extend the response policy per agent and per action type; add L0 simulation for anything customer-facing.
5. **Starter crew live in a paid pilot** of 5–10 founders, ideally a CfE cohort with a mentor. Measure real credits per run and hours saved.
6. **Customers crew.** Hunter, Rex, Dev, Zara and Cora: the outbound gap that Keep Going customers pay for.
7. **Run and Stay legal depth.** Penn, Cass, Flo, Forge, with partner accountant and solicitor sign-off in place.
8. **Meta-crew.** Dex, Mo, Otto, then Opal and Cal.
9. **Raise and Growth tier.** Ada, Finn, Rhea, pillar leads, the custom agent builder, and the platform's own MCP server.

**The test for every release:** did it remove a hire a founder would otherwise have made? If the answer isn't clear, the agent isn't ready.
