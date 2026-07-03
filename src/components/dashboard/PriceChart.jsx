import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
const formatDate = (timestamp) => {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg px-3 py-2" style={{ background: "hsla(222, 40%, 8%, 0.2)", backdropFilter: "blur(2px)", border: "1px solid hsla(255,255,255,0.08)", pointerEvents: "none" }}>
        <p className="text-xs text-muted-foreground mb-0.5">{formatDate(label)}</p>
        <p className="text-sm font-bold text-primary">
          ${Number(payload[0].value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    );
  }
  return null;
};

export default function PriceChart({ data }) {
  if (!data || data.length === 0) return null;
  const maxRenderedPoints = 5000;
  const renderStep = Math.max(1, Math.ceil(data.length / maxRenderedPoints));
  const chartData = renderStep === 1
    ? data
    : data.filter((_, index) => index % renderStep === 0 || index === data.length - 1);

  const formatXAxis = (tick) => {
    const d = new Date(tick * 1000);
    return d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
  };

  const formatYAxis = (value) => {
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
    return `$${value}`;
  };

  const { minPrice, maxPrice } = data.reduce(
    (acc, d) => ({
      minPrice: Math.min(acc.minPrice, d.y),
      maxPrice: Math.max(acc.maxPrice, d.y),
    }),
    { minPrice: Number.POSITIVE_INFINITY, maxPrice: 0 }
  );
  const padding = (maxPrice - minPrice) * 0.15 || maxPrice * 0.05;
  const yMin = Math.max(0, minPrice - padding);
  const yMax = maxPrice + padding;

  return (
    <ResponsiveContainer width="100%" height={380}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="btcGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(38, 92%, 55%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(38, 92%, 55%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 15%)" vertical={false} />
        <XAxis
          dataKey="x"
          tickFormatter={formatXAxis}
          tick={{ fill: "hsl(215, 20%, 50%)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={60}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fill: "hsl(215, 20%, 50%)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={60}
          domain={[yMin, yMax]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="linear"
          dataKey="y"
          stroke="hsl(38, 92%, 55%)"
          strokeWidth={2}
          fill="url(#btcGradient)"
          dot={false}
          activeDot={{ r: 5, fill: "hsl(38, 92%, 55%)", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
