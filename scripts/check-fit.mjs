#!/usr/bin/env node
// Checks that HQ fits the screen without scrolling (docs/DESIGN.md section 4),
// at 1440×900 and 1440×800 browser content areas, in light and dark themes.
//
//   npm run check:fit
//
// Starts the Vite dev server on a spare port (or uses BASE_URL if set), loads
// /hq in headless Chromium and fails if the page scrolls in either direction
// or logs a page error. Needs Chromium for playwright-core: run
// `npx playwright-core install chromium` once, or set CHROMIUM_PATH.
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1440, height: 800 },
];
const THEMES = ["light", "dark"];
const PATH = "/hq";
const PORT = Number(process.env.FIT_PORT ?? 4319);

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let server;
let base = process.env.BASE_URL;
if (!base) {
  base = `http://127.0.0.1:${PORT}`;
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(PORT),
      "--strictPort",
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

let failed = false;
let browser;
try {
  await waitFor(base + PATH, 120_000);
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  for (const size of SIZES) {
    for (const theme of THEMES) {
      const page = await browser.newPage({ viewport: size });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      // Choose the theme the way a user does: the saved preference.
      await page.addInitScript((t) => localStorage.setItem("gumption-theme", t), theme);
      await page.goto(base + PATH, { waitUntil: "networkidle" });
      const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      if (dark !== (theme === "dark")) errors.push(`theme ${theme} not applied`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
      }));
      const ok = m.height <= size.height && m.width <= size.width && errors.length === 0;
      failed ||= !ok;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${size.width}×${size.height} ${theme.padEnd(5)}  page ${m.width}×${m.height}` +
          (errors.length ? `  errors: ${errors.join("; ")}` : ""),
      );
      await page.close();
    }
  }
} catch (e) {
  failed = true;
  console.error(String(e));
} finally {
  await browser?.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
