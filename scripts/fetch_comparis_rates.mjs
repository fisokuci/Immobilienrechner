#!/usr/bin/env node
// Fetch Comparis interest rates (Laufzeiten-Vergleich -> Richtzinsen Mittelwert)
// and store them into public/comparis_interest_rates.json without using Playwright.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const url = 'https://www.comparis.ch/hypotheken/zinssatz';

function fetchText(u, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(u, { method: 'GET', headers }, (resp) => {
      let buf = '';
      resp.on('data', (c) => (buf += c));
      resp.on('end', () => {
        if ((resp.statusCode || 0) >= 200 && (resp.statusCode || 0) < 300) resolve(buf);
        else reject(new Error(`HTTP ${resp.statusCode}: ${buf.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function tryJson(u, headers = {}) {
  try {
    const txt = await fetchText(u, headers);
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function extractRates(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const keys = ['2','3','4','5','6','7','8','9','10'];
  const maybe = keys.reduce((acc, k) => {
    const v = obj[k];
    if (typeof v === 'number') acc[k] = v;
    return acc;
  }, {});
  if (Object.keys(maybe).length === keys.length) return maybe;
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = extractRates(v);
      if (found) return found;
    }
  }
  return null;
}

async function main() {
  const headersCommon = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
  };

  const html = await fetchText(url, headersCommon);
  const m = html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/);
  const buildId = m ? m[1] : null;

  const jsonCandidates = [];
  if (buildId) {
    jsonCandidates.push(
      `https://www.comparis.ch/nfamortgages/_next/data/${buildId}/interestRates.json`,
      `https://www.comparis.ch/nfamortgages/_next/data/${buildId}/hypotheken/zinssatz.json`
    );
  }
  jsonCandidates.push(
    'https://www.comparis.ch/nfamortgages/_next/data/interestRates.json',
    'https://www.comparis.ch/nfamortgages/_next/data/hypotheken/zinssatz.json'
  );

  let jsonData = null;
  for (const u of jsonCandidates) {
    jsonData = await tryJson(u, {
      ...headersCommon,
      'Accept': 'application/json, text/plain, */*',
      'Referer': url,
    });
    if (jsonData) break;
  }

  if (!jsonData) throw new Error('Could not fetch any JSON candidate');
  const rates = extractRates(jsonData);
  if (!rates) throw new Error('Could not locate 2..10 year rates in JSON');

  const out = {
    updatedAt: new Date().toISOString(),
    source: url,
    column: 'Richtzinsen Mittelwert',
    rates,
  };

  const outPath = path.join(process.cwd(), 'public', 'comparis_interest_rates.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8');
  console.log('Saved', outPath);
  console.log(out);
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});

