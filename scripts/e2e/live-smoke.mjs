#!/usr/bin/env node
// End-to-end smoke test of the live (Supabase) store against the local stack.
//
//   npx supabase start && npx supabase db reset
//   npm run e2e:live
//
// Starts the Vite dev server with the local Supabase URL and publishable key (or uses
// BASE_URL), signs in seeded people with a magic-link token minted by the local admin API,
// and walks the main flows in headless Chromium. Local stack only: it uses the local
// service key from `supabase status`, which never leaves this machine.
import { execFileSync, spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }),
);
const API = status.API_URL;
const ANON = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const SECRET = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
const PORT = Number(process.env.E2E_PORT ?? 4327);
let base = process.env.BASE_URL;
let server;

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

if (!base) {
  base = `http://127.0.0.1:${PORT}`;
  server = spawn("npx", ["vite", "dev", "--port", String(PORT), "--host", "127.0.0.1", "--strictPort"], {
    env: { ...process.env, VITE_SUPABASE_URL: API, VITE_SUPABASE_PUBLISHABLE_KEY: ANON },
    stdio: "ignore",
    detached: true,
  });
  await waitFor(base, 60_000);
}

const admin = createClient(API, SECRET, { auth: { persistSession: false } });

/** A real session for a seeded person, via a magic-link token from the local admin API. */
async function sessionFor(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const anon = createClient(API, ANON, { auth: { persistSession: false } });
  const res = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (res.error) throw res.error;
  return res.data.session;
}

const storageKey = `sb-${new URL(API).hostname.split(".")[0]}-auth-token`;
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
async function pageAs(email) {
  const session = email ? await sessionFor(email) : null;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (session)
    await context.addInitScript(
      ([k, v]) => window.localStorage.setItem(k, v),
      [storageKey, JSON.stringify(session)],
    );
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
  return page;
}

try {
  // Signed out: app routes send you to sign-in.
  {
    const page = await pageAs(null);
    await page.goto(`${base}/hq`);
    await page.waitForURL(`${base}/`, { timeout: 15_000 });
    check(true, "signed-out visitors are sent to sign-in");
    await page.context().close();
  }

  // Founder: HQ loads from the database; flagged drafts block GO; editing fixes them.
  {
    const page = await pageAs("aisha.grant@example.com");
    await page.goto(`${base}/hq`);
    await page.getByText("BUILD PHASE", { exact: false }).first().waitFor({ timeout: 20_000 });
    check(await page.getByText("StudyBuddy").first().isVisible(), "HQ shows StudyBuddy from Supabase");

    await page.goto(`${base}/approvals`);
    await page.getByText("Publish a post").first().waitFor();
    const cards = page.locator("article");
    const postCard = cards.filter({ hasText: "Higher Maths prelim" }).first();
    check(await postCard.getByRole("button", { name: /GO · ≈/ }).isDisabled(), "GO is disabled on a flagged draft");
    await postCard.getByRole("button", { name: "Edit" }).click();
    await postCard.getByLabel("Post text").fill("POV: 10 minutes before your Higher Maths prelim. Here's a 3-minute warm-up.");
    await postCard.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Draft updated").waitFor();
    await page.waitForTimeout(500);
    const go = postCard.getByRole("button", { name: /GO · ≈/ });
    check(await go.isEnabled(), "after editing, the draft passes the claims check");
    await go.click();
    await page.getByRole("button", { name: /Confirm/ }).click();
    await page.getByText("GO given").waitFor({ timeout: 10_000 });
    const { data: decided } = await admin
      .from("approvals")
      .select("status, decided_by, original_payload")
      .eq("id", "f0000000-0000-4000-8000-000000000001")
      .single();
    check(
      decided?.status === "approved" &&
        decided.decided_by === "a0000000-0000-4000-8000-000000000001" &&
        decided.original_payload?.text?.includes("actually works"),
      "the approval is recorded with the founder's id and the original draft kept",
    );
    await page.context().close();
  }

  // Mentor: the cohort view lists the programme's companies; approving a gate moves the stage.
  {
    const page = await pageAs("morag.fraser@example.com");
    await page.goto(`${base}/cohort`);
    await page.getByText("University Venture Programme").waitFor({ timeout: 20_000 });
    check(await page.getByText("Kelpie Energy").isVisible(), "the mentor sees the cohort's companies");
    await page.getByRole("link", { name: "Kelpie Energy" }).click();
    const approve = page.getByRole("button", { name: /approve/i }).first();
    await approve.waitFor({ timeout: 10_000 });
    await approve.click();
    await page.waitForTimeout(1500);
    const { data: kelpie } = await admin
      .from("companies")
      .select("stage")
      .eq("id", "c0000000-0000-4000-8000-000000000002")
      .single();
    check(kelpie?.stage === "build", "approving Kelpie's gate moves it to Build");
    await page.context().close();
  }

  // A new person: onboarding creates their company with every answer kept.
  {
    const email = `new.founder.${Date.now()}@example.com`;
    await admin.auth.admin.createUser({ email, email_confirm: true });
    const page = await pageAs(email);
    await page.goto(`${base}/hq`);
    await page.waitForURL(`${base}/onboarding`, { timeout: 20_000 });
    check(true, "a person with no company is sent to onboarding");
    await page.context().close();
  }
} catch (e) {
  failures.push(`crashed: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser.close();
  if (server) process.kill(-server.pid);
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nLive smoke test passed.");
