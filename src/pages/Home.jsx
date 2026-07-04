import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { TrendingUp, TrendingDown, Bitcoin, RefreshCw, Download } from "lucide-react";
import StatsCard from "../components/dashboard/StatsCard";
import TimeRangeSelector from "../components/dashboard/TimeRangeSelector";
import PriceChart from "../components/dashboard/PriceChart";
import HalvingChart from "../components/dashboard/HalvingChart";
import LogChart from "../components/dashboard/LogChart";
import YearChart from "../components/dashboard/YearChart";
import CyclePrediction from "../components/dashboard/CyclePrediction";
import AIAnalysis from "../components/dashboard/AIAnalysis";

// Days param per range selector
const timespanDays = {
  "1day":    1,
  "30days":  30,
  "90days":  90,
  "180days": 180,
  "1year":   365,
  "2years":  730,
  "all":     "max",
};

const HALVINGS = [
  { name: "Halving 2012", date: new Date("2012-11-28"), endDate: new Date("2016-07-09") },
  { name: "Halving 2016", date: new Date("2016-07-09"), endDate: new Date("2020-05-11") },
  { name: "Halving 2020", date: new Date("2020-05-11"), endDate: new Date("2024-04-20") },
  { name: "Halving 2024", date: new Date("2024-04-20"), endDate: null },
];

const COINS = {
  BTC: { label: "BTC", name: "Bitcoin" },
  ETH: { label: "ETH", name: "Ethereum" },
  XMR: { label: "XMR", name: "Monero"  },
};

const KRAKEN_PAIRS = { BTC: "XBTUSD", ETH: "ETHUSD", XMR: "XMRUSD" };
const YAHOO_SYMBOLS = { BTC: "BTC-USD", ETH: "ETH-USD", XMR: "XMR-USD" };

const LOCAL_PRICE_HISTORY = {
  BTC: {
    manifest: "/data/btcusd_bitstamp_1h_manifest.json",
    sourceLabel: "CSV horario local Bitstamp",
  },
  ETH: {
    manifest: "/data/ethusd_kraken_1h_manifest.json",
    sourceLabel: "CSV horario local Kraken",
  },
  XMR: {
    manifest: "/data/xmrusd_composite_1h_manifest.json",
    sourceLabel: "CSV horario local Poloniex/Kraken",
  },
};

export default function Home() {
  const [coin, setCoin] = useState("BTC");
  const [view, setView] = useState("price");
  const [range, setRange] = useState("1year");
  const [customRange, setCustomRange] = useState(null);
  const [halvingData, setHalvingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const buildHalvingData = useCallback((allData) => {
    const byHalving = {};
    HALVINGS.forEach(({ name, date, endDate }) => {
      const startTs = date.getTime() / 1000;
      const endTs = endDate ? endDate.getTime() / 1000 : Infinity;
      const slice = allData.filter((d) => d.x >= startTs && d.x < endTs);
      if (slice.length === 0) return;
      const basePrice = slice[0].y;
      byHalving[name] = slice.map((d) => ({
        day: Math.floor((d.x - startTs) / 86400),
        value: d.y / basePrice,
      }));
    });
    const maxDay = Math.max(...Object.values(byHalving).map((arr) => arr[arr.length - 1]?.day || 0));
    const rows = [];
    for (let day = 0; day <= maxDay; day++) {
      const row = { day };
      HALVINGS.forEach(({ name }) => {
        const point = byHalving[name]?.find((p) => p.day === day);
        if (point) row[name] = point.value;
      });
      rows.push(row);
    }
    return rows;
  }, []);

  const [dailyData, setDailyData] = useState([]);
  const [hourlyData, setHourlyData] = useState([]);
  const [minuteData, setMinuteData] = useState([]);

  const fetchCancelRef = useRef(0);

  const fetchAllData = useCallback(async () => {
    const fetchId = ++fetchCancelRef.current;
    setLoading(true);
    setError(null);

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const fetchKrakenOHLC = async (pair, interval, sinceTs) => {
      const url = `/kraken/0/public/OHLC?pair=${pair}&interval=${interval}&since=${sinceTs}`;
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const krakenError = json.error?.[0];
        if (krakenError) {
          if (krakenError.includes("Too many requests") && attempt < 3) {
            await delay(1200 * (attempt + 1));
            continue;
          }
          throw new Error(krakenError);
        }
        const key = Object.keys(json.result).find(k => k !== "last");
        return json.result[key] || [];
      }
      return [];
    };

    const fetchYahooDaily = async (symbol, period1 = 1356998400) => {
      const period2 = Math.floor(Date.now() / 1000) + 86400;
      const url = `/yahoo/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
      const json = await res.json();
      if (json.chart?.error) throw new Error(json.chart.error.description || "Yahoo data error");
      const result = json.chart?.result?.[0];
      const timestamps = result?.timestamp || [];
      const closes = result?.indicators?.quote?.[0]?.close || [];
      return timestamps
        .map((ts, i) => ({ x: ts, y: closes[i] }))
        .filter((d) => Number.isFinite(d.y) && d.y > 0);
    };

    const fetchLocalPriceHistory = async (selectedCoin) => {
      const history = LOCAL_PRICE_HISTORY[selectedCoin];
      if (!history) return [];

      const manifestRes = await fetch(history.manifest);
      if (!manifestRes.ok) throw new Error(`CSV manifest HTTP ${manifestRes.status}`);
      const manifest = await manifestRes.json();
      const chunks = await Promise.all(
        manifest.chunks.map(async ({ file }) => {
          const res = await fetch(file);
          if (!res.ok) throw new Error(`CSV chunk HTTP ${res.status}`);
          return res.text();
        })
      );
      return chunks.flatMap((text) =>
        text
          .trim()
          .split(/\r?\n/)
          .slice(1)
          .map((line) => {
            const [timestamp, , , , , close] = line.split(",");
            const x = Number(timestamp);
            const y = Number(close);
            return { x, y };
          })
          .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y) && d.y > 0)
      );
    };

    const mergePriceData = (base, fresh) => {
      const byTimestamp = new Map();
      [...base, ...fresh].forEach((point) => {
        if (Number.isFinite(point.x) && Number.isFinite(point.y) && point.y > 0) {
          byTimestamp.set(point.x, point);
        }
      });
      return Array.from(byTimestamp.values()).sort((a, b) => a.x - b.x);
    };

    try {
      const pair = KRAKEN_PAIRS[coin];
      const localHistory = await fetchLocalPriceHistory(coin);
      const lastLocalTs = localHistory.reduce((max, point) => Math.max(max, point.x), 0);
      const shouldRefreshFromApi = !lastLocalTs || (Date.now() / 1000 - lastLocalTs) > 6 * 3600;
      const yahooStartTs = lastLocalTs ? lastLocalTs + 3600 : 1356998400;
      const yahooDaily = shouldRefreshFromApi ? await fetchYahooDaily(YAHOO_SYMBOLS[coin], yahooStartTs) : [];
      let daily = mergePriceData(localHistory, yahooDaily);
      if (daily.length === 0) throw new Error("Sin datos de precios");

      // Hourly & minute (single page each, recent only)
      let hourly = [], minute = [];
      try {
        const rows = await fetchKrakenOHLC(pair, 60, Math.floor((Date.now() - 90 * 86400 * 1000) / 1000));
        hourly = rows.map(r => ({ x: parseInt(r[0]), y: parseFloat(r[4]) })).filter(d => d.y > 0);
      } catch (_) {}
      try {
        const rows = await fetchKrakenOHLC(pair, 5, Math.floor((Date.now() - 86400 * 1000) / 1000));
        minute = rows.map(r => ({ x: parseInt(r[0]), y: parseFloat(r[4]) })).filter(d => d.y > 0);
      } catch (_) {}

      const nowTs = Math.floor(Date.now() / 1000);
      if (hourly.length === 0) {
        hourly = daily.filter((d) => d.x >= nowTs - 90 * 86400);
      }
      if (minute.length === 0) {
        minute = hourly.filter((d) => d.x >= nowTs - 86400);
      }

      if (fetchId !== fetchCancelRef.current) return;
      setDailyData(daily);
      setHourlyData(hourly);
      setMinuteData(minute);
      setHalvingData(buildHalvingData(daily));
      setLastUpdated(new Date());
    } catch (err) {
      if (fetchId !== fetchCancelRef.current) return;
      setError(`Error al cargar datos: ${err.message || "No se pudo conectar con la API. Intenta actualizar."}`);
    } finally {
      if (fetchId === fetchCancelRef.current) setLoading(false);
    }
  }, [coin, buildHalvingData]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Choose minute/hourly/daily data based on range
  const data = useMemo(() => {
    if (range === "custom" && customRange) {
      const fromTs = Math.floor(new Date(customRange.from).getTime() / 1000);
      const toTs = Math.floor(new Date(customRange.to).getTime() / 1000);
      return dailyData.filter((d) => d.x >= fromTs && d.x <= toTs);
    }
    const days = timespanDays[range];
    // 1D → use minute data (last 1440 minutes = 24h)
    if (days === 1) {
      const cutoffTs = Math.floor((Date.now() - 86400 * 1000) / 1000);
      if (minuteData.length > 0) return minuteData.filter((d) => d.x >= cutoffTs);
      if (hourlyData.length > 0) return hourlyData.filter((d) => d.x >= cutoffTs);
      return dailyData.filter((d) => d.x >= cutoffTs);
    }
    if (days !== "max" && days <= 90 && hourlyData.length > 0) {
      const cutoffTs = Math.floor((Date.now() - days * 86400 * 1000) / 1000);
      return hourlyData.filter((d) => d.x >= cutoffTs);
    }
    const cutoffTs = days === "max" ? 0 : Math.floor((Date.now() - days * 86400 * 1000) / 1000);
    return dailyData.filter((d) => d.x >= cutoffTs);
  }, [dailyData, hourlyData, minuteData, range, customRange]);

  const currentPrice = data.length > 0 ? data[data.length - 1].y : null;
  const firstPrice = data.length > 0 ? data[0].y : null;
  const allTimeHigh = data.length > 0 ? data.reduce((max, d) => Math.max(max, d.y), 0) : null;
  const priceChange = currentPrice && firstPrice ? ((currentPrice - firstPrice) / firstPrice) * 100 : null;
  const isPositive = priceChange !== null && priceChange >= 0;

  const formatUSD = (val) =>
    val != null
      ? `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";

  const handleRefresh = () => fetchAllData();

  const chartTitle = view === "price"
    ? `Precio de ${COINS[coin].name} (USD)`
    : view === "log"
    ? `Precio de ${COINS[coin].name} (Escala Log)`
    : view === "year"
    ? `${COINS[coin].name} – Ciclos por Año (desde 1 de Enero)`
    : `${COINS[coin].name} – Ciclos por Halving de BTC (normalizado)`;

  const activeLocalSource = LOCAL_PRICE_HISTORY[coin]?.sourceLabel || "CSV local";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Bitcoin className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Crypto Dashboard</h1>
            <p className="text-xs text-muted-foreground">Precios históricos en USD</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!dailyData.length) return;
              const rows = ["fecha,precio_usd"];
              dailyData.forEach((d) => {
                const date = new Date(d.x * 1000).toISOString().split("T")[0];
                rows.push(`${date},${d.y}`);
              });
              const blob = new Blob([rows.join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${coin.toLowerCase()}_precios_historicos.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            disabled={loading || !dailyData.length}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-all disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="Precio Actual" value={loading ? "..." : formatUSD(currentPrice)} icon={Bitcoin} />
          <StatsCard
            title="Cambio del período"
            value={loading ? "..." : (priceChange != null ? `${isPositive ? "+" : ""}${priceChange.toFixed(2)}%` : "—")}
            change={priceChange}
            positive={isPositive}
            icon={isPositive ? TrendingUp : TrendingDown}
          />
          <StatsCard title="Máximo histórico" value={loading ? "..." : formatUSD(allTimeHigh)} icon={TrendingUp} />
          <StatsCard title="Primer precio" value={loading ? "..." : formatUSD(firstPrice)} icon={TrendingDown} />
        </div>

        {/* Chart Card */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-base font-semibold">{chartTitle}</h2>
              {lastUpdated && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Actualizado: {lastUpdated.toLocaleTimeString("es-ES")}
                </p>
              )}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              {/* Coin selector */}
              <div className="flex gap-1 bg-secondary rounded-xl p-1">
                {Object.keys(COINS).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCoin(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                      coin === c ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {COINS[c].label}
                  </button>
                ))}
              </div>
              {/* View toggle */}
              <div className="flex gap-1 bg-secondary rounded-xl p-1">
                <button
                  onClick={() => setView("price")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    view === "price" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Precio
                </button>
                <button
                  onClick={() => setView("halving")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    view === "halving" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Halving
                </button>
                <button
                  onClick={() => setView("log")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    view === "log" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Log
                </button>
                <button
                  onClick={() => setView("year")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    view === "year" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Año
                </button>
              </div>
              {(view === "price" || view === "log") && (
                <TimeRangeSelector
                  selected={range}
                  onSelect={setRange}
                  onCustomRange={setCustomRange}
                />
              )}

            </div>
          </div>

          {error ? (
            <div className="h-80 flex items-center justify-center text-destructive text-sm">{error}</div>
          ) : loading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-muted-foreground text-sm">Cargando datos...</span>
              </div>
            </div>
          ) : view === "price" ? (
            <PriceChart data={data} />
          ) : view === "log" ? (
            <LogChart data={dailyData} />
          ) : view === "year" ? (
            <YearChart dailyData={dailyData} />
          ) : (
            <HalvingChart halvingData={halvingData} dailyData={dailyData} />
          )}
        </div>

        {/* Cycle Prediction */}
        {!loading && !error && (view === "halving" || view === "year") && (
          <CyclePrediction view={view} dailyData={dailyData} currentPrice={currentPrice} />
        )}

        {/* AI Analysis */}
        {!loading && !error && (
          <AIAnalysis data={data} coin={COINS[coin].name} />
        )}

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          Datos base desde <span className="text-primary">{activeLocalSource}</span> · Nuevos datos desde <span className="text-primary">Yahoo Finance</span> / <span className="text-primary">Kraken</span>
          {(coin === "XMR" || coin === "ETH") && view === "halving" && (
            <span className="ml-1">· {COINS[coin].name} analizado con ciclos de halvings de BTC</span>
          )}
        </p>
      </div>
    </div>
  );
}
