import { describe, expect, it } from "vitest";
import {
  mapContact,
  mapEmails,
  mapLayout,
  mapPreferences,
  mapProfile,
  preferencesRow,
} from "@/lib/live/mappers";
import { defaultLayout, defaultPreferences } from "@/lib/workspace";

const base = { created_at: "2026-10-20T10:00:00Z" };

describe("live mappers", () => {
  it("derives the platform role from admin and mentor flags", () => {
    const p = {
      id: "u",
      full_name: "A",
      email: "a@example.com",
      is_admin: false,
      ...base,
      updated_at: base.created_at,
    };
    expect(mapProfile(p).role).toBe("founder");
    expect(mapProfile(p, { mentor: true }).role).toBe("mentor");
    expect(mapProfile({ ...p, is_admin: true }, { mentor: true }).role).toBe("admin");
  });

  it("puts email messages in their threads, oldest first, and marks drafts as not sent", () => {
    const threads = mapEmails(
      [
        {
          id: "t",
          company_id: "c",
          subject: "Hi",
          contact_name: "Ms Khan",
          address: "k@example.com",
          mode: "support",
          ...base,
        },
      ],
      [
        {
          id: "2",
          thread_id: "t",
          company_id: "c",
          direction: "draft",
          body: "Reply",
          created_at: "2026-10-20T12:00:00Z",
        },
        {
          id: "1",
          thread_id: "t",
          company_id: "c",
          direction: "received",
          body: "Hello",
          created_at: "2026-10-20T11:00:00Z",
        },
      ],
    );
    expect(threads[0]?.messages.map((m) => [m.direction, m.text])).toEqual([
      ["received", "Hello"],
      ["sent", "Draft only — not sent. Reply"],
    ]);
  });

  it("accepts only a saved layout that lists each card once", () => {
    const ok = defaultLayout();
    const row = (layout: unknown) => ({
      user_id: "u",
      layout: layout as never,
      updated_at: base.created_at,
    });
    expect(mapLayout(row(ok))).toEqual(ok);
    expect(mapLayout(row([...ok.slice(1), ok[1]]))).toBeUndefined();
    expect(mapLayout(row([{ id: "Sol", visible: true }]))).toBeUndefined();
    expect(mapLayout(undefined)).toBeUndefined();
  });

  it("round-trips preferences", () => {
    const prefs = { ...defaultPreferences(), explanation: "more" as const, adThreshold: 35 };
    const row = {
      user_id: "u",
      theme: "light",
      updated_at: base.created_at,
      ...preferencesRow(prefs),
    };
    expect(mapPreferences(row)).toEqual(prefs);
    expect(mapPreferences(undefined)).toEqual(defaultPreferences());
  });

  it("falls back to the creation date when a contact has no last contact", () => {
    const c = mapContact({
      id: "x",
      company_id: "c",
      name: "N",
      email: "",
      kind: "lead",
      value: "",
      last_contact_at: null,
      ...base,
    });
    expect(c.last).toBe(base.created_at);
  });
});
