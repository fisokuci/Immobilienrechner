import type { RequestHandler } from "express";
import fs from "fs";
import path from "path";

export const getComparisRatesStatic: RequestHandler = (_req, res) => {
  try {
    const filePath = path.join(process.cwd(), "public", "comparis_interest_rates.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw) as {
      rates?: Record<string, number | null>;
      updatedAt?: string;
      source?: string;
    };
    const data = json.rates || {};
    return res.json({ ok: true, data });
  } catch (err) {
    // If file is missing, return an empty structure for 2..10 years
    const empty: Record<string, number | null> = {
      "2": null,
      "3": null,
      "4": null,
      "5": null,
      "6": null,
      "7": null,
      "8": null,
      "9": null,
      "10": null,
    };
    return res.status(200).json({ ok: true, data: empty, error: "No local JSON found; using empty defaults" });
  }
};

