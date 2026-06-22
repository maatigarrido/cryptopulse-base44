import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const HALVING_STARTS = [
  { name: "Halving 2012", date: new Date("2012-11-28") },
  { name: "Halving 2016", date: new Date("2016-07-09") },
  { name: "Halving 2020", date: new Date("2020-05-11") },
  // Halving 2024 is the current one — excluded from "previous" averages
];

const YEAR_STARTS = [
  { name: "Año 2012", date: new Date("2012-01-01") },
  { name: "Año 2016", date: new Date("2016-01-01") },
  { name: "Año 2020", date: new Date("2020-01-01") },
  // 2024 is current — excluded
];

// Get multiplier at a given day offset from a cycle start, using dailyData
function getMultiplierAtDay(dailyData, startTs, dayOffset) {
  const targetTs = startTs + dayOffset * 86400;
  // find closest data point within ±2 days
  const nearby = dailyData.filter((d) => Math.abs(d.x - targetTs) <= 2 * 86400);
  if (nearby.length === 0) return null;
  nearby.sort((a, b) => Math.abs(a.x - targetTs) - Math.abs(b.x - targetTs));
  const basePoint = dailyData.find((d) => d.x >= startTs);
  if (!basePoint || basePoint.y === 0) return null;
  return nearby[0].y / basePoint.y;
}

function computePrediction(dailyData, cycleStarts, currentCycleStart) {
  const now = new Date();
  const currentStartTs = currentCycleStart.date.getTime() / 1000;
  const daysSinceCycleStart = Math.floor((now.getTime() / 1000 - currentStartTs) / 86400);
  const currentMonthInCycle = Math.floor(daysSinceCycleStart / 30) + 1;

  // End of current month in cycle (day = currentMonthInCycle * 30)
  const endOfMonthDay = currentMonthInCycle * 30;
  // Current day in cycle
  const startOfMonthDay = (currentMonthInCycle - 1) * 30;

  // For each previous cycle, get multiplier at start-of-month and end-of-month
  const changes = cycleStarts.map(({ name, date }) => {
    const startTs = date.getTime() / 1000;
    const multStart = getMultiplierAtDay(dailyData, startTs, startOfMonthDay);
    const multEnd = getMultiplierAtDay(dailyData, startTs, endOfMonthDay);
    if (multStart == null || multEnd == null) return null;
    return { name, change: (multEnd - multStart) / multStart };
  }).filter(Boolean);

  if (changes.length === 0) return null;

  const avgChange = changes.reduce((s, c) => s + c.change, 0) / changes.length;

  // Current price
  const currentPricePoint = dailyData[dailyData.length - 1];
  const currentPrice = currentPricePoint?.y;

  // Days left until end of month
  const daysLeftInMonth = endOfMonthDay - daysSinceCycleStart;
  const endOfMonthDate = new Date(now.getTime() + daysLeftInMonth * 86400 * 1000);

  return {
    currentMonthInCycle,
    avgChange,
    changes,
    currentPrice,
    expectedPrice: currentPrice ? currentPrice * (1 + avgChange) : null,
    endOfMonthDate,
    daysLeft: Math.max(0, daysLeftInMonth),
  };
}

export default function CyclePrediction({ view, dailyData, currentPrice }) {
  if (!dailyData || dailyData.length === 0) return null;
  if (view !== "halving" && view !== "year") return null;

  const isHalving = view === "halving";
  const cycleStarts = isHalving ? HALVING_STARTS : YEAR_STARTS;
  const currentCycleStart = isHalving
    ? { name: "Halving 2024", date: new Date("2024-04-20") }
    : { name: "Año 2024", date: new Date("2024-01-01") };

  const pred = computePrediction(dailyData, cycleStarts, currentCycleStart);
  if (!pred) return null;

  const { currentMonthInCycle, avgChange, changes, expectedPrice, endOfMonthDate, daysLeft } = pred;
  const bullish = avgChange > 0.01;
  const bearish = avgChange < -0.01;
  const neutral = !bullish && !bearish;

  const formatUSD = (v) =>
    v != null ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";

  const formatDate = (d) =>
    d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  const Icon = bullish ? TrendingUp : bearish ? TrendingDown : Minus;
  const color = bullish ? "text-green-400" : bearish ? "text-red-400" : "text-yellow-400";
  const bgColor = bullish ? "bg-green-500/10 border-green-500/20" : bearish ? "bg-red-500/10 border-red-500/20" : "bg-yellow-500/10 border-yellow-500/20";
  const label = bullish ? "SUBIDA ESPERADA" : bearish ? "BAJADA ESPERADA" : "MOVIMIENTO LATERAL";

  return (
    <div className={`rounded-2xl border p-5 ${bgColor}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Predicción basada en ciclos anteriores · {isHalving ? "Halving" : "Año"} — Mes {currentMonthInCycle}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Icon className={`w-5 h-5 ${color}`} />
            <span className={`text-lg font-bold ${color}`}>{label}</span>
            <span className={`text-lg font-bold ${color}`}>
              ({avgChange >= 0 ? "+" : ""}{(avgChange * 100).toFixed(1)}% promedio histórico)
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Precio actual: <span className="text-foreground font-semibold">{formatUSD(currentPrice)}</span>
            {" · "}
            Precio estimado al <span className="text-foreground font-semibold">{formatDate(endOfMonthDate)}</span>:{" "}
            <span className={`font-bold ${color}`}>{formatUSD(expectedPrice)}</span>
            {" · "}
            <span className="text-muted-foreground">{daysLeft} días restantes</span>
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {changes.map(({ name, change }) => (
            <div key={name} className="bg-card border border-border rounded-xl px-3 py-2 text-center min-w-[90px]">
              <p className="text-xs text-muted-foreground mb-0.5">{name}</p>
              <p className={`text-sm font-bold ${change > 0.01 ? "text-green-400" : change < -0.01 ? "text-red-400" : "text-yellow-400"}`}>
                {change >= 0 ? "+" : ""}{(change * 100).toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}