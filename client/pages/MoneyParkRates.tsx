import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InterestRatesResponse } from "@shared/api";

const MoneyParkRates = () => {
  const [data, setData] = useState<InterestRatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const resp = await fetch("/api/moneypark/interest-rates");
        const json = (await resp.json()) as InterestRatesResponse | { error?: string };
        if (!("ok" in json) || !(json as InterestRatesResponse).ok) {
          const msg = (json as any)?.error ?? "Unexpected response";
          setError(String(msg));
        } else {
          setData(json as InterestRatesResponse);
        }
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>MoneyPark Zinsen (2–10 Jahre)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <div>Lade Daten…</div>}
          {error && (
            <div className="text-red-600">
              Fehler beim Laden: {error}
              <div className="text-sm text-muted-foreground mt-2">
                Hinweis: Für das Scraping muss Playwright installiert und Chromium verfügbar sein.
              </div>
            </div>
          )}
          {!loading && !error && data && (
            <pre className="bg-muted p-3 rounded text-sm overflow-auto">
{JSON.stringify(data.data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MoneyParkRates;

