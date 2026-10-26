import { describe, expect, it } from "vitest";
import {
  chatSystemPrompt,
  chatTier,
  chunks,
  costUsd,
  mockReply,
  reservation,
  sse,
  countryFrom,
  deviceClass,
  linkCode,
} from "../../supabase/functions/_shared/logic";
import { readSse } from "@/lib/agentClient";

describe("edge function logic", () => {
  it("routes planning questions to the mid-tier model and the rest to the smallest", () => {
    expect(chatTier("Can you plan our launch week?")).toBe("planning");
    expect(chatTier("What's our roadmap priority?")).toBe("planning");
    expect(chatTier("How many signups today?")).toBe("routine");
  });
  it("prices usage per million tokens, with cache reads at a tenth", () => {
    expect(
      costUsd(
        { input_tokens: 1_000_000, output_tokens: 0 },
        { input_per_mtok: 0.1, output_per_mtok: 0.5 },
      ),
    ).toBeCloseTo(0.1);
    expect(
      costUsd(
        { input_tokens: 0, output_tokens: 2_000_000 },
        { input_per_mtok: 0.1, output_per_mtok: 0.5 },
      ),
    ).toBeCloseTo(1);
    expect(
      costUsd(
        { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 },
        { input_per_mtok: 2, output_per_mtok: 10 },
      ),
    ).toBeCloseTo(0.2);
  });
  it("reserves the cap or the balance, never below the estimate", () => {
    expect(reservation(10, 30, 1000)).toBe(30);
    expect(reservation(10, 30, 15)).toBe(15);
    expect(reservation(10, 30, 9)).toBe(null);
  });
  it("keeps the system prompt free of anything that changes per request", () => {
    const p = chatSystemPrompt({
      company: {
        name: "StudyBuddy",
        description: "Quizzes",
        stage: "build",
        customer_type: "B2C",
        goal_90d: null,
      },
      voice: null,
      unbuilt: ["Teacher dashboard"],
    });
    expect(p).toContain("Not built yet (don't imply these exist): Teacher dashboard");
    expect(p).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/);
  });
  it("streams the mock reply word by word", () => {
    expect(chunks(mockReply("waitlist?")).join("")).toBe(mockReply("waitlist?"));
  });
  it("round-trips server-sent events through the client's reader", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const text =
          sse("delta", { text: "Hi " }) +
          sse("delta", { text: "there" }) +
          sse("done", { credits: 3 });
        // Split mid-event to check the reader buffers.
        c.enqueue(new TextEncoder().encode(text.slice(0, 17)));
        c.enqueue(new TextEncoder().encode(text.slice(17)));
        c.close();
      },
    });
    const seen: [string, unknown][] = [];
    await readSse(body, (e, d) => seen.push([e, d]));
    expect(seen).toEqual([
      ["delta", { text: "Hi " }],
      ["delta", { text: "there" }],
      ["done", { credits: 3 }],
    ]);
  });
});

describe("short link logging", () => {
  it("keeps only a device class and country", () => {
    expect(
      deviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"),
    ).toBe("mobile");
    expect(deviceClass("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(deviceClass("facebookexternalhit/1.1")).toBe("bot");
    expect(deviceClass(null)).toBe("unknown");
    expect(countryFrom(new Headers({ "cf-ipcountry": "gb" }))).toBe("GB");
    expect(countryFrom(new Headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(linkCode("/functions/v1/link/HBflyer01")).toBe("HBflyer01");
    expect(linkCode("/functions/v1/link/../../x")).toBeNull();
  });
});
