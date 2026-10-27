// The agent worker: claims jobs from agent_jobs one at a time and runs them, and every minute
// recovers runs a crashed worker left behind. Run several for more throughput: claiming uses
// FOR UPDATE SKIP LOCKED, so they never take the same job.
//
//   cd agent-service && npm run dev
import { loadConfig, type Config } from "./config.js";
import { serviceClient, type Db } from "./db/client.js";
import { processJob, type Job } from "./runner.js";
import { claimApproval, executeApproval } from "./executor/executor.js";
import { mockProviders } from "./executor/providers.js";
import { runtimeFor } from "./runtime/index.js";
import { transcriptionFromEnv } from "./capture/transcription.js";
import { notetakerFromEnv, runNotetaker } from "./capture/notetaker.js";
import { purgeExpiredAudio } from "./capture/prepare.js";
import { runScheduler } from "./scheduler.js";
import { reportError } from "./errors.js";
import {
  platformKeys,
  providersFor,
  reportPlatform,
  syncListening,
  syncPostHog,
  syncSocialAnalytics,
} from "./integrations/index.js";
import type { AgentRuntime } from "./runtime/types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function claimNext(db: Db, workerId: string, types?: string[]): Promise<Job | null> {
  const { data, error } = await db.rpc("claim_agent_job", {
    p_worker: workerId,
    ...(types ? { p_job_types: types } : {}),
  });
  if (error) throw new Error(`claim: ${error.message}`);
  return (data as Job[] | null)?.[0] ?? null;
}

/** Runs queued jobs until none are due. Returns how many it processed. */
export async function drain(deps: {
  db: Db;
  config: Config;
  runtime: AgentRuntime;
  types?: string[];
}) {
  let n = 0;
  for (
    let job = await claimNext(deps.db, deps.config.workerId, deps.types);
    job;
    job = await claimNext(deps.db, deps.config.workerId, deps.types)
  ) {
    await processJob({ ...deps, log: console.log }, job);
    n++;
  }
  return n;
}

async function main() {
  const config = loadConfig();
  const db = serviceClient(config);
  const runtime = runtimeFor(config.runtime);
  // Phase 7 picks real providers per company; until then everything goes to the mocks.
  const providers = mockProviders();
  const transcription = transcriptionFromEnv();
  const notetaker = notetakerFromEnv(db);
  const keys = platformKeys();
  const unsubscribeSecret = process.env["UNSUBSCRIBE_SECRET"];
  const unsubscribe = unsubscribeSecret
    ? { secret: unsubscribeSecret, base: config.supabaseUrl }
    : undefined;
  await reportPlatform(db, keys);
  let lastSocialSync = 0;
  let lastMetricsSync = 0;
  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.on(sig, () => {
      console.log(`${sig}: finishing the current job, then stopping`);
      stopping = true;
    });
  console.log(
    `Agent worker ${config.workerId} started (${runtime.name} runtime, ${providers.name} providers, ${transcription.name} transcription)`,
  );
  let lastReap = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastReap > 60_000) {
        lastReap = Date.now();
        const { data } = await db.rpc("reap_stale_runs", {
          p_stale: `${config.staleAfterMinutes} minutes`,
        });
        if (data) console.log(`Recovered ${data} stale run(s)`);
        const purged = await purgeExpiredAudio(db);
        if (purged) console.log(`Deleted ${purged} recording(s) past their keep period`);
        // The meeting notetaker (Phase 18), when switched on for the platform.
        if (notetaker.enabled) {
          const n = await runNotetaker({ db, ...notetaker });
          if (n.scheduled || n.recorded)
            console.log(`Notetaker: ${n.scheduled} bot(s) sent, ${n.recorded} meeting(s) recorded`);
        }
        const s = await runScheduler(db);
        if (s.routines || s.nightly || s.voice || s.autoSteps)
          console.log(
            `Scheduled ${s.routines} routine(s), ${s.nightly} nightly, ${s.voice} voice review(s), ${s.autoSteps} Auto Mode step(s)`,
          );
      }
      // Analytics back in from the real providers (Phase 8 moves these onto the scheduler).
      if (Date.now() - lastSocialSync > 60 * 60_000) {
        lastSocialSync = Date.now();
        const n = await syncSocialAnalytics(db, keys);
        if (n) console.log(`Synced analytics for ${n} post(s)`);
        const heard = await syncListening(db, keys);
        if (heard) console.log(`${heard} new comment(s) and review(s) in the inbox`);
      }
      if (Date.now() - lastMetricsSync > 6 * 60 * 60_000) {
        lastMetricsSync = Date.now();
        const n = await syncPostHog(db, keys);
        if (n) console.log(`Synced site metrics for ${n} company(ies)`);
      }
      // Approved actions first: the founder is waiting on them.
      const approval = await claimApproval(db, config.workerId);
      if (approval) {
        await executeApproval(
          {
            db,
            providers,
            providersFor: (companyId) => providersFor(db, keys, companyId),
            ...(unsubscribe ? { unsubscribe } : {}),
            workerId: config.workerId,
            log: console.log,
          },
          approval,
        );
        continue;
      }
      const job = await claimNext(db, config.workerId);
      if (job) await processJob({ db, config, runtime, transcription, log: console.log }, job);
      else await sleep(config.pollIntervalMs);
    } catch (e) {
      await reportError(db, "worker", e);
      await sleep(config.pollIntervalMs);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
