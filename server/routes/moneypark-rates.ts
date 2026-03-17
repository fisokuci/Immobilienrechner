import type { RequestHandler } from "express";

// Scrapes MoneyPark hypothekarzinsen page and extracts rates for 2..10 years.
// Uses Playwright to accept cookies and evaluate the DOM for robust extraction.
// Response format: { ok: true, data: { "2": number, ..., "10": number } }

const MONEY_PARK_SOURCE_URLS = [
  "https://www.moneypark.ch/ch/mp/de/home/hypotheken/hypothekarzinsen.html",
  "https://app.moneypark.ch/hypothek/zinsen/hypozinsen/",
] as const;

const MONEY_PARK_URL = MONEY_PARK_SOURCE_URLS[0];
const MONEY_PARK_JSON_URLS = [
  "https://www.moneypark.ch/ch/mp/de/system/pages/reference/_jcr_content/whitelabelparsys-01/interestratesteaser_.data.json",
  "https://www.moneypark.ch/ch/mp/de/system/pages/reference/_jcr_content/parsys/interestratesteaser_.data.json",
] as const;
const WANTED_YEARS = ["2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

const COOKIE_ACCEPT_SELECTORS = [
  'button:has-text("Alle akzeptieren")',
  'button:has-text("Akzeptieren")',
  'button:has-text("Zustimmen")',
  'button:has-text("Einverstanden")',
  'button:has-text("Accept all")',
  'button:has-text("Allow all")',
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonAccept',
  'button[aria-label*="akzeptieren" i]'
];

export const getMoneyParkRates: RequestHandler = async (req, res) => {
  const isDebug = String(req.query.debug ?? "").toLowerCase() === "1";
  const wantHtml = String(req.query.html ?? "") === "1";
  const debug: any = { cookie: [], url: "", console: [], waits: [], tablesScan: null, source: "" };

  let browser: import("playwright").Browser | null = null;
  let context: import("playwright").BrowserContext | null = null;
  let page: import("playwright").Page | null = null;

  try {
    // Initialize mergedFetchData outside the try block so it's accessible later
    let mergedFetchData: Record<string, number> = {};

    // 1) First, try simple HTTP fetch and HTML parsing (no headless browser).
    //    This avoids DNS/proxy issues some environments have with Chromium.
    const preferFetch = String(req.query.fetch ?? "1") === "1"; // default: on
    if (preferFetch) {
      try {
        debug.source = "fetch";

        // Try multiple JSON endpoints
        for (const jsonUrl of MONEY_PARK_JSON_URLS) {
          try {
            const jsonResp = await fetch(jsonUrl, {
              headers: {
                "user-agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
                accept: "application/json,text/plain,*/*",
                "accept-language": "de-CH,de;q=0.9,en;q=0.8",
              },
            } as any);
            if (jsonResp.ok) {
              const jsonPayload = await jsonResp.json();
              const jsonData = extractRatesFromJson(jsonPayload);
              if (isDebug) {
                debug.jsonUrl = jsonUrl;
                debug.jsonKeys = jsonPayload && typeof jsonPayload === "object" ? Object.keys(jsonPayload) : [];
                debug.jsonData = jsonData;
              }
              if (hasEnoughRates(jsonData)) {
                const payload = {
                  ok: true,
                  data: jsonData,
                  debug: isDebug ? { ...debug, source: "json" } : undefined,
                } as any;
                if (!isDebug) delete payload.debug;
                return res.json(payload);
              }
            } else if (isDebug) {
              ((debug as any).jsonStatuses ||= []).push({
                url: jsonUrl,
                ok: jsonResp.ok,
                status: jsonResp.status,
                statusText: jsonResp.statusText,
              });
            }
          } catch (e: any) {
            if (isDebug) {
              ((debug as any).jsonErrors ||= []).push({ url: jsonUrl, error: String(e) });
            }
          }
        }
        for (const sourceUrl of MONEY_PARK_SOURCE_URLS) {
          const resp = await fetch(sourceUrl, {
            headers: {
              "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
              "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "accept-language": "de-CH,de;q=0.9,en;q=0.8",
            },
          } as any);
          if (!resp.ok) {
            if (isDebug) {
              ((debug as any).fetchStatuses ||= []).push({
                url: sourceUrl,
                ok: resp.ok,
                status: resp.status,
                statusText: resp.statusText,
              });
            }
            continue;
          }

          const html = await resp.text();
          if (isDebug) {
            ((debug as any).fetchSources ||= []).push({ url: sourceUrl, length: html.length });
            if (wantHtml && !(debug as any).html) (debug as any).html = html;
          }

          let parsed = extractRatesFromHtml(html, { debug: isDebug });
          Object.assign(mergedFetchData, parsed.data);
          if (hasEnoughRates(parsed.data)) {
            const payload = {
              ok: true,
              data: parsed.data,
              debug: isDebug ? { ...debug, url: sourceUrl, htmlScan: parsed.debug } : undefined,
            } as any;
            if (!isDebug) delete payload.debug;
            return res.json(payload);
          }

          if (isDebug) {
            ((debug as any).htmlScans ||= []).push({ url: sourceUrl, scan: parsed.debug });
          }

          const iframeUrls = findIframeRateUrls(html, sourceUrl);
          if (isDebug && iframeUrls.length) {
            ((debug as any).iframeUrls ||= []).push({ url: sourceUrl, iframeUrls });
          }
          for (const iframeUrl of iframeUrls) {
            try {
              const iResp = await fetch(iframeUrl, {
                headers: {
                  "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
                  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                  "accept-language": "de-CH,de;q=0.9,en;q=0.8",
                },
              } as any);
              if (!iResp.ok) {
                if (isDebug) {
                  ((debug as any).iframeFetchStatuses ||= []).push({ url: iframeUrl, status: iResp.status });
                }
                continue;
              }
              const iframeHtml = await iResp.text();
              if (isDebug) {
                (debug as any).iframeUrlUsed = iframeUrl;
                (debug as any).iframeFetchLength = iframeHtml.length;
                if (wantHtml) (debug as any).iframeHtml = iframeHtml;
              }
              parsed = extractRatesFromHtml(iframeHtml, { debug: isDebug });
              Object.assign(mergedFetchData, parsed.data);
              if (hasEnoughRates(parsed.data)) {
                const payload = {
                  ok: true,
                  data: parsed.data,
                  debug: isDebug ? { ...debug, url: iframeUrl, iframeScan: parsed.debug } : undefined,
                } as any;
                if (!isDebug) delete payload.debug;
                return res.json(payload);
              }
              if (isDebug) {
                ((debug as any).iframeScans ||= []).push({ url: iframeUrl, scan: parsed.debug });
              }
            } catch (e: any) {
              if (isDebug) {
                ((debug as any).iframeFetchErrors ||= []).push({ url: iframeUrl, error: String(e) });
              }
            }
          }
        }
        if (hasEnoughRates(mergedFetchData)) {
          const payload = {
            ok: true,
            data: mergedFetchData,
            debug: isDebug ? { ...debug, source: "fetch-merged" } : undefined,
          } as any;
          if (!isDebug) delete payload.debug;
          return res.json(payload);
        }
      } catch (e: any) {
        if (isDebug) debug.fetchError = String(e);
      }
    }

    // 2) Fallback to Playwright if fetch either failed or produced empty data.
    // In production, skip Playwright and return partial data if available
    const isProduction = process.env.NODE_ENV === "production";
    const skipPlaywright = String(req.query.skipPlaywright ?? (isProduction ? "1" : "0")) === "1";

    // Return what we have if there's any data
    if (Object.keys(mergedFetchData).length > 0) {
      const payload = {
        ok: true,
        data: mergedFetchData,
        debug: isDebug ? { ...debug, source: "fetch-partial", note: "Returned partial data from HTTP fetch" } : undefined,
      } as any;
      if (!isDebug) delete payload.debug;
      return res.json(payload);
    }

    if (skipPlaywright) {
      return res.status(502).json({
        ok: false,
        error: "MoneyPark-Zinsen konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
        debug: isDebug ? debug : undefined,
      });
    }

    debug.source = "playwright";
    let chromium: typeof import("playwright")["chromium"];
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
      browser = await chromium.launch({ headless: true });
    } catch (launchErr: any) {
      return res.status(500).json({
        ok: false,
        error:
          "Playwright Chromium not available. Please run: pnpm dlx playwright install chromium",
        details: String(launchErr),
      });
    }

    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      locale: "de-CH",
    });
    page = await context.newPage();
    page.on("console", (msg) => {
      try { debug.console.push(`${msg.type()}: ${msg.text()}`); } catch {}
    });

    await page.goto(MONEY_PARK_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    debug.url = page.url();

    // Try to accept cookies if a banner is present.
    for (const sel of COOKIE_ACCEPT_SELECTORS) {
      try {
        const loc = page.locator(sel).first();
        if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
          debug.cookie.push({ found: sel, context: "page" });
          await loc.click({ timeout: 2000 });
          debug.cookie.push({ clicked: sel, context: "page" });
          break;
        }
      } catch {
        // ignore each failed attempt
      }
    }

    // Try cookie consent inside iframes (e.g., OneTrust) as fallback
    try {
      const frames = page.frames();
      for (const f of frames) {
        for (const sel of COOKIE_ACCEPT_SELECTORS) {
          try {
            const loc = f.locator(sel).first();
            if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
              debug.cookie.push({ found: sel, context: "frame", url: f.url() });
              await loc.click({ timeout: 1500 });
              debug.cookie.push({ clicked: sel, context: "frame", url: f.url() });
              throw new Error("cookie-clicked"); // break both loops
            }
          } catch (e: any) {
            if (String(e?.message).includes("cookie-clicked")) throw e;
          }
        }
      }
    } catch (e: any) {
      if (!String(e?.message).includes("cookie-clicked")) {
        debug.cookie.push({ note: "iframe cookie scan error", error: String(e) });
      }
    }

    // Give the page a moment to update after consent.
    await page.waitForTimeout(1000);

    // Try to activate the "Aktuelle Zinssätze" tab if present
    try {
      const tabSelVariants = [
        'a:has-text("Aktuelle Zinssätze")',
        'button:has-text("Aktuelle Zinssätze")',
        '[role="tab"]:has-text("Aktuelle Zinssätze")'
      ];
      for (const sel of tabSelVariants) {
        const loc = page.locator(sel).first();
        if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
          await loc.click().catch(() => void 0);
          debug.waits.push(`clicked-tab:${sel}`);
          break;
        }
      }
    } catch { /* ignore */ }

    // Ensure the rates table or header text is present
    try {
      await page.waitForLoadState("networkidle", { timeout: 30000 });
      debug.waits.push("networkidle");
    } catch { debug.waits.push("networkidle-timeout"); }
    try {
      await page.waitForSelector("text=Art der Hypothek", { timeout: 10000 });
      debug.waits.push("found-header-Art-der-Hypothek");
    } catch { debug.waits.push("missing-header-Art-der-Hypothek"); }
    try {
      await page.waitForSelector("text=Zinssatz", { timeout: 10000 });
      debug.waits.push("found-header-Zinssatz");
    } catch { debug.waits.push("missing-header-Zinssatz"); }
    try {
      await page.waitForSelector("text=Fest 2 Jahre", { timeout: 10000 });
      debug.waits.push("found-row-Fest-2-Jahre");
    } catch { debug.waits.push("missing-row-Fest-2-Jahre"); }
    try {
      await page.waitForSelector("table", { timeout: 10000 });
      debug.waits.push("found-table");
    } catch { debug.waits.push("missing-table"); }

    // New: interrogate the embedded iframe and parse there if present
    let frameData: Record<string, number> | null = null;
    try {
      await page.waitForSelector('iframe[src*="current-mortgage-rates-iframe"], iframe[src*="rates-iframe"]', { timeout: 15000 });
      const handle = await page.locator('iframe[src*="current-mortgage-rates-iframe"], iframe[src*="rates-iframe"]').first().elementHandle();
      const frame = await handle?.contentFrame();
      if (frame) {
        debug.waits.push("iframe-found");
        debug.iframePageUrl = frame.url();
        await frame.waitForSelector('table', { timeout: 20000 }).catch(() => void 0);
        const { data: fd, scan: fscan } = await frame.evaluate(() => {
          const norm = (s: string) => s.replace(/\s+/g, " ").trim();
          const wanted = new Set(["2","3","4","5","6","7","8","9","10"]);
          const parsePct = (s: string) => {
            const m = (s.match(/[-+]?\d+(?:[.,]\d+)?/) || [""])[0];
            return m ? parseFloat(m.replace(",", ".")) : NaN;
          };
          const result: Record<string, number> = {};
          const tables = Array.from(document.querySelectorAll('table'));
          const scan: any = { tables: [] };
          for (const t of tables) {
            const headers = Array.from(t.querySelectorAll('th')).map(th => norm(th.textContent || ''));
            const rows = Array.from(t.querySelectorAll('tbody tr')).length ? Array.from(t.querySelectorAll('tbody tr')) : Array.from(t.querySelectorAll('tr'));
            const tscan: any = { headers, rows: [] };
            for (const tr of rows) {
              const cells = Array.from(tr.querySelectorAll('th,td'));
              if (!cells.length) continue;
              const label = norm(cells[0]?.textContent || '');
              const m = label.match(/Fest\s*(\d{1,2})\s*Jahr(?:e)?\s*ab/i);
              if (!m) continue;
              const y = m[1];
              if (!wanted.has(y)) continue;
              let valText = norm(cells[1]?.textContent || '');
              if (!/\d/.test(valText)) {
                for (let i = cells.length - 1; i >= 1; i--) {
                  const txt = norm(cells[i].textContent || '');
                  if (/\d/.test(txt)) { valText = txt; break; }
                }
              }
              const val = parsePct(valText);
              if (!Number.isNaN(val)) result[y] = val;
              tscan.rows.push({ label, y, valText, val });
            }
            scan.tables.push(tscan);
          }
          return { data: result, scan };
        });
        if (isDebug) debug.iframeTablesScan = fscan;
        if (fd && Object.keys(fd).length) {
          frameData = fd as Record<string, number>;
        }
      } else {
        debug.waits.push("iframe-not-found-contentFrame");
      }
    } catch (e: any) {
      if (isDebug) debug.iframeError = String(e);
    }

    // Extract rates for 2..10 years with a resilient heuristic over the DOM.
    const { data, scan } = await page.evaluate(() => {
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      const wanted = ["2","3","4","5","6","7","8","9","10"] as const;

      // Utility: parse decimal with comma or dot, optional %
      const parsePct = (s: string) => {
        const m = (s.match(/[-+]?\d+(?:[.,]\d+)?/) || [""])[0];
        return m ? parseFloat(m.replace(",", ".")) : NaN;
      };

      // Strategy 1: Look for tables that contain a year label and a percentage column
      const tryTables = (): { data: Record<string, number>, scan: any } => {
        const result: Record<string, number> = {};
        const scan: any = { tables: [] };
        const tables = Array.from(document.querySelectorAll("table"));
        for (const t of tables) {
          const text = norm(t.innerText || "").toLowerCase();
          const headers = Array.from(t.querySelectorAll("th")).map((th) => norm(th.textContent || "").toLowerCase());
          const looksLikeRatesTable =
            headers.some((h) => /art der hypothek/i.test(h)) && headers.some((h) => /zinssatz/i.test(h));
          if (!looksLikeRatesTable && !/(jahr|jahre)/i.test(text)) {
            scan.tables.push({ reason: "skip-no-rates-header", headers, sample: text.slice(0, 120) });
            continue;
          }
          const rows = Array.from(t.querySelectorAll("tbody tr")).length
            ? Array.from(t.querySelectorAll("tbody tr"))
            : Array.from(t.querySelectorAll("tr"));
          if (!rows.length) continue;
          const tableScan: any = { headers, rows: [] };
          for (const tr of rows) {
            const cells = Array.from(tr.querySelectorAll("th,td"));
            if (!cells.length) continue;
            const label = norm(cells[0]?.textContent || "");
            const ym = label.match(/(\d{1,2})\s*Jahr(?:e)?/i);
            if (!ym) continue;
            const y = ym[1];
            if (!(wanted as readonly string[]).includes(y)) continue;

            // Prefer the second cell if it exists (typical 2-column table: label | rate)
            let candidate = norm(cells[1]?.textContent || "");
            // Fallback: choose the right-most numeric-looking cell
            if (!/\d/.test(candidate)) {
              for (let i = cells.length - 1; i >= 1; i--) {
                const txt = norm(cells[i].textContent || "");
                if (/\d/.test(txt)) { candidate = txt; break; }
              }
            }
            const val = parsePct(candidate);
            if (!Number.isNaN(val)) result[y] = val;
            tableScan.rows.push({ label, year: y, candidate, parsed: val });
          }
          scan.tables.push(tableScan);
        }
        return { data: result, scan };
      };

      // Strategy 2: Generic label+value blocks (cards, lists, definition lists)
      const tryGenericBlocks = (): { data: Record<string, number>, scan: any } => {
        const result: Record<string, number> = {};
        const scan: any = { blocks: [] };
        const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));
        const byYear: Record<string, HTMLElement[]> = {};
        for (const el of all) {
          const txt = norm(el.innerText || "");
          const ym = txt.match(/\b(\d{1,2})\s*Jahr(?:e)?\b/i);
          if (!ym) continue;
          const y = ym[1];
          if (!(wanted as readonly string[]).includes(y)) continue;
          (byYear[y] ||= []).push(el);
        }
        for (const y of wanted) {
          const cands = byYear[y] || [];
          // For each candidate label element, search nearby for a percentage number
          for (const el of cands) {
            // Search within parent block to capture typical card layouts
            const scope = el.closest("section,article,div,li,dl,table,tbody,tr") || el.parentElement || el;
            if (!scope) continue;
            const scopeText = norm((scope as HTMLElement).innerText || "");
            // Try to find first percentage-like number after the label occurrence
            const labelIdx = scopeText.toLowerCase().indexOf((y + " jahr").toLowerCase());
            if (labelIdx >= 0) {
              const tail = scopeText.slice(labelIdx);
              const m = tail.match(/(\d+(?:[.,]\d+)?)\s*%?/);
              if (m) {
                const val = parsePct(m[1]);
                if (!Number.isNaN(val)) { result[y] = val; break; }
              }
            }
            // Fallback: scan descendants for a numeric badge/value
            const nums = Array.from(scope.querySelectorAll("*, ::before, ::after"))
              .map(n => norm((n as HTMLElement).innerText || ""))
              .filter(t => /\d/.test(t));
            for (const t of nums) {
              const val = parsePct(t);
              if (!Number.isNaN(val)) { result[y] = val; break; }
            }
            if (result[y] !== undefined) break;
          }
          if (result[y] !== undefined) scan.blocks.push({ year: y, value: result[y] });
        }
        return { data: result, scan };
      };

      const merged: Record<string, number> = {};
      const t1 = tryTables();
      for (const k of Object.keys(t1.data)) merged[k] = t1.data[k as keyof typeof t1.data]!;
      const t2 = tryGenericBlocks();
      for (const k of Object.keys(t2.data)) if (merged[k] === undefined) merged[k] = t2.data[k as keyof typeof t2.data]!;

      return { data: merged, scan: { tables: t1.scan?.tables ?? [], blocks: t2.scan?.blocks ?? [] } };
    });

    debug.tablesScan = scan;
    if (frameData && hasEnoughRates(frameData)) {
      // Prefer iframe data if available
      if (isDebug) {
        res.json({ ok: true, data: frameData, debug });
      } else {
        res.json({ ok: true, data: frameData });
      }
      return;
    }
    if (isDebug) {
      if (String(req.query.screenshot ?? "") === "1") {
        try {
          const buf = await page.screenshot({ fullPage: true });
          debug.screenshot = `data:image/png;base64,${buf.toString("base64")}`;
        } catch (e: any) {
          debug.screenshotError = String(e);
        }
      }
      if (String(req.query.html ?? "") === "1") {
        try {
          debug.html = await page.content();
        } catch (e: any) {
          debug.htmlError = String(e);
        }
      }
      if (hasEnoughRates(data)) {
        res.json({ ok: true, data, debug });
      } else {
        res.status(502).json({
          ok: false,
          error: "MoneyPark-Zinsen konnten nicht gelesen werden.",
          debug,
        });
      }
    } else {
      if (hasEnoughRates(data)) {
        res.json({ ok: true, data });
      } else {
        res.status(502).json({
          ok: false,
          error: "MoneyPark-Zinsen konnten nicht gelesen werden.",
        });
      }
    }
  } catch (err) {
    if (isDebug) {
      res.status(500).json({ ok: false, error: String(err), debug });
    } else {
      res.status(500).json({ ok: false, error: String(err) });
    }
  } finally {
    await page?.close().catch(() => void 0);
    await context?.close().catch(() => void 0);
    await browser?.close().catch(() => void 0);
  }
};

// Lightweight HTML parsing without external dependencies.
// Finds the "Art der Hypothek | Zinssatz" table and extracts Fest 2..10 Jahre.
function extractRatesFromHtml(html: string, opts?: { debug?: boolean }) {
  const debug: any = opts?.debug ? { candidates: [] as any[], nextDataTried: false, nextDataFound: false } : undefined;
  const wanted = new Set<string>(WANTED_YEARS);
  const normSpace = (s: string) => s.replace(/\s+/g, " ").trim();
  const stripTags = (s: string) => normSpace(
    s
      .replace(/<\/?br\s*\/?>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&gt;/gi, ">")
      .replace(/&lt;/gi, "<")
  );
  const parsePct = (s: string) => {
    const m = (s.match(/[-+]?\d+(?:[.,]\d+)?/) || [""])[0];
    return m ? parseFloat(m.replace(",", ".")) : NaN;
  };

  const result: Record<string, number> = {};

  // Strategy A: Parse __NEXT_DATA__ JSON (Next.js data payload)
  try {
    if (debug) debug.nextDataTried = true;
    const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (m && m[1]) {
      const jsonText = m[1];
      const root = JSON.parse(jsonText);
      if (debug) debug.nextDataFound = true;

      const found: Record<string, number> = {};
      const keysPriority = ["rate","zinssatz","value","interest","percentage","percent","interestRate","zins"];
      const parseNode = (node: any) => {
        if (!node || typeof node === "function") return;
        if (Array.isArray(node)) { for (const it of node) parseNode(it); return; }
        if (typeof node === "object") {
          const values = Object.values(node);
          const textJoined = values.filter(v => typeof v === "string").join(" \n ");
          let ym = textJoined.match(/Fest\s*(\d{1,2})\s*Jahr(?:e)?\s*ab/i);
          if (!ym) {
            // Try split labels: a field with "Fest", another with "2 Jahre"
            const hasFest = values.some(v => typeof v === "string" && /\bFest\b/i.test(v));
            const yearStr = values.find(v => typeof v === "string" && /(\d{1,2})\s*Jahr(?:e)?/i.test(v as string));
            if (hasFest && typeof yearStr === "string") {
              const m2 = yearStr.match(/(\d{1,2})\s*Jahr(?:e)?/i);
              if (m2) ym = [m2[0], m2[1]] as any;
            }
          }
          if (ym) {
            const y = ym[1];
            if (!found[y] && wanted.has(y)) {
              let val: number | undefined;
              for (const k of keysPriority) {
                if (k in node) {
                  const v: any = (node as any)[k];
                  if (typeof v === "number") { val = v; break; }
                  if (typeof v === "string") { const p = parsePct(v); if (!Number.isNaN(p)) { val = p; break; } }
                }
              }
              if (val === undefined) {
                for (const v of values) {
                  if (typeof v === "number") { val = v; break; }
                  if (typeof v === "string") { const p = parsePct(v); if (!Number.isNaN(p)) { val = p; break; } }
                }
              }
              if (val !== undefined && !Number.isNaN(val)) {
                found[y] = val;
                if (debug) debug.candidates.push({ from: "nextData", year: y, val, keys: Object.keys(node) });
              }
            }
          }
          for (const v of values) parseNode(v);
        }
      };
      parseNode(root);
      Object.assign(result, found);
      if ([...wanted].every(y => result[y] !== undefined)) {
        return { data: result, debug } as const;
      }
    }
  } catch (e: any) {
    if (debug) debug.nextDataError = String(e);
  }

  // Strategy B: Direct text parsing for static page content such as
  // "Fest 5 Jahre ab 1.80 %" or "Fixed 5 years from 0.42 %".
  const textContent = stripTags(html);
  const lineRegexes = [
    /\bFest\s*(\d{1,2})\s*Jahr(?:e)?\s*ab\s*([0-9]+(?:[.,][0-9]+)?)\s*%/gi,
    /\bFixed\s*(\d{1,2})\s*years?\s*from\s*([0-9]+(?:[.,][0-9]+)?)\s*%/gi,
  ];
  for (const re of lineRegexes) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(textContent))) {
      const year = match[1];
      if (!wanted.has(year) || result[year] !== undefined) continue;
      const value = parsePct(match[2]);
      if (!Number.isNaN(value)) {
        result[year] = value;
        if (debug) debug.candidates.push({ from: "text", year, value, sample: match[0] });
      }
    }
  }
  if ([...wanted].every((y) => result[y] !== undefined)) {
    return { data: result, debug } as const;
  }

  const tableRegex = /<table\b[\s\S]*?<\/table>/gi;
  const allTables = html.match(tableRegex) || [];
  for (const t of allTables) {
    const text = stripTags(t).toLowerCase();
    const hasHeaderTexts = text.includes("art der hypothek") && text.includes("zinssatz");
    const hasRatesClass = /<table[^>]*class=["'][^"']*rates_table__/i.test(t);
    if (!(hasHeaderTexts || hasRatesClass)) {
      if (debug) debug.candidates.push({ reason: "skip-no-headers", sample: text.slice(0, 120) });
      continue;
    }
    const rowRegex = /<tr\b[\s\S]*?<\/tr>/gi;
    const rows = t.match(rowRegex) || [];
    if (!rows.length) continue;
    const local: Record<string, number> = {};
    for (const r of rows) {
      const cells = r.match(/<(?:td|th)\b[\s\S]*?<\/(?:td|th)>/gi) || [];
      if (!cells.length) continue;
      const c0 = stripTags(cells[0] || "");
      const ym = c0.match(/Fest\s*(\d{1,2})\s*Jahr(?:e)?\s*ab/i);
      if (!ym) continue;
      const y = ym[1];
      if (!wanted.has(y)) continue;
      // Prefer second cell, else any later numeric cell
      let candidate = stripTags(cells[1] || "");
      if (!/\d/.test(candidate)) {
        for (let i = cells.length - 1; i >= 1; i--) {
          const txt = stripTags(cells[i]);
          if (/\d/.test(txt)) { candidate = txt; break; }
        }
      }
      const val = parsePct(candidate);
      if (!Number.isNaN(val)) local[y] = val;
    }
    if (Object.keys(local).length) {
      Object.assign(result, local);
      if ([...wanted].every((y) => result[y] !== undefined)) break;
    }
  }

  return { data: result, debug } as const;
}

// Discover iframe URLs on the MoneyPark page that likely contain the rates table
function findIframeRateUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const re = /<iframe[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const src = m[1];
    if (!src) continue;
    if (/current-mortgage-rates-iframe|rates-iframe|hypothekarzinsen/i.test(src)) {
      urls.add(resolveUrl(baseUrl, src));
    }
  }
  // If nothing matched, still include any app.moneypark.ch iframe as a guess
  if (!urls.size) {
    re.lastIndex = 0;
    while ((m = re.exec(html))) {
      const src = m[1];
      if (!src) continue;
      if (/app\.moneypark\.ch/i.test(src)) urls.add(resolveUrl(baseUrl, src));
    }
  }
  return Array.from(urls);
}

function resolveUrl(baseUrl: string, href: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function extractRatesFromJson(payload: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!payload || typeof payload !== "object") return result;

  for (const year of WANTED_YEARS) {
    const key = `rate_fixed_${year}y`;
    const entry = (payload as Record<string, unknown>)[key];
    if (!entry || typeof entry !== "object") continue;
    const value = (entry as Record<string, unknown>).best_expected_value;
    if (typeof value === "number" && Number.isFinite(value)) {
      result[year] = value;
    }
  }

  return result;
}

function hasEnoughRates(data: Record<string, number> | null | undefined): data is Record<string, number> {
  if (!data) return false;
  return WANTED_YEARS.some((year) => Number.isFinite(data[year]));
}
