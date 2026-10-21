/**
 * Single boundary for all AI agent calls.
 * MOCKED: a real agent service (Sol, powered by Claude) will replace these implementations
 * and write results directly into the database.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TASK_CREDITS: Record<string, number> = {
  social_post: 40, email: 30, landing_page: 600, site_change: 150, compliance_doc: 120,
  investor_research: 200, interview_synthesis: 80, ad_campaign: 90,
};

export async function sendChatMessage(companyId: string, text: string): Promise<{ reply: string }> {
  await wait(900);
  const t = text.toLowerCase();
  let reply = "Got it. I'll add that to tonight's plan and have a draft ready for your approval by the morning.";
  if (t.includes("waitlist") || t.includes("signup"))
    reply = "Signups are up 18% week on week, mostly from the TikTok revision-hack posts. I'd suggest doubling down there tonight.";
  else if (t.includes("ad") || t.includes("spend"))
    reply = "I've proposed a £30 test on Instagram aimed at S5 students in Scotland. It's waiting in your approvals.";
  else if (t.includes("legal") || t.includes("privacy"))
    reply = "Your privacy policy is drafted and the ICO fee is due on 14 Nov 2026. I can file it once you approve.";
  void companyId;
  return { reply };
}

export async function runTask(companyId: string, taskId: string): Promise<{ runId: string; status: "queued" }> {
  await wait(400);
  void companyId;
  return { runId: `run_${taskId}_${Date.now()}`, status: "queued" };
}

export function estimateTaskCredits(taskType: string): number {
  return TASK_CREDITS[taskType] ?? 100;
}

export async function simulateWork(kind: string, title: string): Promise<{success:boolean;url?:string;reason?:string}> {
 await wait(1800);
 if (title.toLowerCase().includes('fail')) return {success:false,reason:'Demo provider timeout. Try again with a new prompt.'};
 return {success:true, ...(kind === 'image' ? {url: '/media/revision.svg'} : kind === 'video' ? {url: '/media/revision.svg'} : {})};
}
