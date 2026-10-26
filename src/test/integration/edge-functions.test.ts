import { describe, expect, it } from "vitest";
import { AISHA, CALLUM, STUDYBUDDY, adminClient, clientAs, localStack } from "./local";

// Needs `npx supabase functions serve` (or a stack that serves supabase/functions).
async function call(email: string, name: string, body: unknown) {
  const sb = await clientAs(email);
  const { data } = await sb.auth.getSession();
  const s = localStack();
  return fetch(`${s.API_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session!.access_token}`,
      apikey: s.PUBLISHABLE_KEY ?? s.ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("edge functions", () => {
  it("enqueue-job queues work at the catalogue's estimate", async () => {
    const res = await call(AISHA, "enqueue-job", {
      company_id: STUDYBUDDY,
      job_type: "social_post",
      payload: { title: "Integration test post" },
      estimated_credits: 1,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { job_id: string; estimated_credits: number };
    expect(body.estimated_credits).toBe(40);
    await adminClient().from("agent_jobs").update({ status: "done" }).eq("id", body.job_id);
  });

  it("enqueue-job refuses a company you don't belong to", async () => {
    const res = await call(CALLUM, "enqueue-job", { company_id: STUDYBUDDY, job_type: "task" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/founders and teammates/);
  });

  it("chat streams a reply, saves both messages and settles the credits", async () => {
    const admin = adminClient();
    const before = (await admin.rpc("credit_summary", { p_company: STUDYBUDDY })).data as {
      balance: number;
    };
    const res = await call(AISHA, "chat", {
      company_id: STUDYBUDDY,
      message: "How is the waitlist going?",
    });
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const text = await res.text();
    expect(text).toMatch(/event: start/);
    expect(text).toMatch(/event: delta/);
    const done = /event: done\ndata: (.*)/.exec(text);
    expect(done).not.toBeNull();
    const credits = (JSON.parse(done![1]!) as { credits: number }).credits;
    expect(credits).toBeGreaterThan(0);
    const after = (await admin.rpc("credit_summary", { p_company: STUDYBUDDY })).data as {
      balance: number;
    };
    expect(after.balance).toBe(before.balance - credits);
    const { data: last } = await admin
      .from("chat_messages")
      .select("sender")
      .eq("company_id", STUDYBUDDY)
      .order("created_at", { ascending: false })
      .limit(2);
    expect(last!.map((m) => m.sender).sort()).toEqual(["founder", "sol"]);
  });

  it("chat refuses people who can't chat for the company", async () => {
    const res = await call(CALLUM, "chat", { company_id: STUDYBUDDY, message: "Hi" });
    expect(res.status).toBe(400);
  });
});

describe("short links", () => {
  it("link redirects anyone to the tagged destination and logs the click", async () => {
    const admin = adminClient();
    const { count: before } = await admin
      .from("link_clicks")
      .select("id", { count: "exact", head: true })
      .eq("link_id", "b1000000-0000-4000-8000-000000000002");
    // No Authorization header: short links are public (verify_jwt = false).
    const res = await fetch(`${localStack().API_URL}/functions/v1/link/HBflyer01`, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone) Mobile",
        Referer: "https://www.instagram.com/x",
      },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(
      /\/h\/harbour-bakes\?utm_source=print&utm_medium=qr&utm_campaign=wedding-fair&l=HBflyer01$/,
    );
    const { data: clicks } = await admin
      .from("link_clicks")
      .select("device, referrer_host")
      .eq("link_id", "b1000000-0000-4000-8000-000000000002")
      .order("clicked_at", { ascending: false })
      .limit(1);
    expect(clicks![0]).toEqual({ device: "mobile", referrer_host: "www.instagram.com" });
    const { count: after } = await admin
      .from("link_clicks")
      .select("id", { count: "exact", head: true })
      .eq("link_id", "b1000000-0000-4000-8000-000000000002");
    expect(after).toBe((before ?? 0) + 1);
  });

  it("link answers 404 for an unknown code", async () => {
    const res = await fetch(`${localStack().API_URL}/functions/v1/link/Nope12345`, {
      redirect: "manual",
    });
    expect(res.status).toBe(404);
  });
});
