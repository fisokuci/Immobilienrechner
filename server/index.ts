import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { getMoneyParkRates } from "./routes/moneypark-rates";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // MoneyPark interest rates scraping endpoint
  // Returns: { ok: true, data: { "2": number, ..., "10": number } }
  app.get("/api/moneypark/interest-rates", getMoneyParkRates);

  return app;
}
