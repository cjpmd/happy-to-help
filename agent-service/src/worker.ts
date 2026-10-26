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
import { purgeExpiredAudio } from "./capture/prepare.js";
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
      }
      // Approved actions first: the founder is waiting on them.
      const approval = await claimApproval(db, config.workerId);
      if (approval) {
        await executeApproval(
          { db, providers, workerId: config.workerId, log: console.log },
          approval,
        );
        continue;
      }
      const job = await claimNext(db, config.workerId);
      if (job) await processJob({ db, config, runtime, transcription, log: console.log }, job);
      else await sleep(config.pollIntervalMs);
    } catch (e) {
      console.error("Worker error:", e instanceof Error ? e.message : e);
      await sleep(config.pollIntervalMs);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
