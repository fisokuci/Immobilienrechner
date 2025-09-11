import type { RequestHandler } from "express";

// NOTE: We use Playwright to render the Comparis page client-side and extract
// the table values because the data is populated dynamically and not directly
// accessible via a simple JSON endpoint with CORS from the browser.
//
// This route returns a JSON object mapping years ("2".."10") to percentage numbers.
// Example: { "2": 1.23, "3": 1.45, ... }

export const getComparisRates: RequestHandler = async (_req, res) => {
  // Lazy import so the server can start even if Playwright isn't installed yet.
  let chromium: typeof import("playwright")["chromium"]; // type hint only
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch (err) {
    return res.status(500).json({
      error: "Playwright not installed. Please `pnpm add -D playwright` and try again.",
      details: String(err),
    });
  }

  const url = "https://www.comparis.ch/hypotheken/zinssatz";
  let browser: import("playwright").Browser | null = null;
  let context: import("playwright").BrowserContext | null = null;
  let page: import("playwright").Page | null = null;

  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (launchErr: any) {
      // Common case: browsers not installed
      return res.status(500).json({
        ok: false,
        error:
          "Playwright Chromium not available. Please run: pnpm dlx playwright install chromium",
        details: String(launchErr),
      });
    }
    context = await browser!.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      locale: "de-CH",
    });
    page = await context.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Accept cookie banner if present to ensure content loads
    try {
      const acceptBtn = page.locator('button:has-text("Akzeptieren")');
      if (await acceptBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await acceptBtn.first().click({ timeout: 2000 });
      }
    } catch {
      // ignore
    }

    // Click the "Laufzeiten-Vergleich" tab if needed
    try {
      const tabButton = page.locator('button:has-text("Laufzeiten")');
      if (await tabButton.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        await tabButton.first().click();
      }
    } catch {
      // ignore if not found; content may already be visible
    }

    // Wait for the table that contains the target columns
    await page.waitForSelector("table", { timeout: 30000 });

    // Evaluate in page context: reuse the same logic you validated in the browser console
    const data = await page.evaluate(() => {
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      const tables = Array.from(document.querySelectorAll("table"));
      const table = tables.find((t) => /Richtzinsen/i.test(t.innerText) && /Mittelwert/i.test(t.innerText));
      if (!table) return {} as Record<string, number>;

      const headers = Array.from(table.querySelectorAll("th")).map((th) => norm(th.textContent || ""));
      const colIdx = headers.findIndex((h) => /richtzinsen/i.test(h) && /mittelwert/i.test(h));
      if (colIdx === -1) return {} as Record<string, number>;

      const wanted = new Set(["2", "3", "4", "5", "6", "7", "8", "9", "10"]);
      const parsePct = (s: string) => {
        const m = (s.match(/[-+]?\d+(?:[.,]\d+)?/) || [""])[0];
        return m ? parseFloat(m.replace(",", ".")) : NaN;
      };

      const result: Record<string, number> = {};
      for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
        const tds = Array.from(tr.querySelectorAll("td"));
        if (!tds.length) continue;
        const label = norm(tds[0].textContent || "");
        const ym = label.match(/(\d{1,2})\s*Jahr/i);
        if (!ym) continue;
        const y = ym[1];
        if (!wanted.has(y)) continue;

        const valText = norm((tds[colIdx] || ({} as HTMLElement)).textContent || "");
        const val = parsePct(valText);
        if (!Number.isNaN(val)) result[y] = val;
      }
      return result;
    });

    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  } finally {
    await page?.close().catch(() => void 0);
    await context?.close().catch(() => void 0);
    await browser?.close().catch(() => void 0);
  }
};
