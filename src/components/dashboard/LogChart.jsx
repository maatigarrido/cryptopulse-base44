import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const HALVING_TIMESTAMPS = [
  { ts: new Date("2012-11-28").getTime() / 1000, label: "H1" },
  { ts: new Date("2016-07-09").getTime() / 1000, label: "H2" },
  { ts: new Date("2020-05-11").getTime() / 1000, label: "H3" },
  { ts: new Date("2024-04-20").getTime() / 1000, label: "H4" },
];

const formatDate = (timestamp) => {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg px-3 py-2" style={{ background: "hsla(222, 40%, 8%, 0.2)", backdropFilter: "blur(2px)", border: "1px solid hsla(255,255,255,0.08)", pointerEvents: "none" }}>
        <p className="text-xs text-muted-foreground mb-1">{formatDate(label)}</p>
        <p className="text-base font-bold text-primary">
          ${Number(payload[0].value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    );
  }
  return null;
};

const LOG_TICKS = [0.01, 0.1, 1, 10, 100, 1000, 10000, 100000, 1000000];

export default function LogChart({ data }) {
  if (!data || data.length === 0) return null;

  const formatXAxis = (tick) => {
    const d = new Date(tick * 1000);
    return d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
  };

  const formatYAxis = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(0)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
    if (value < 1) return `$${value}`;
    return `$${value}`;
  };

  // Filter out zero/negative values (log scale can't handle them)
  const filtered = data.filter((d) => d.y > 0);

  return (
    <div>
      <p className="text-center text-xs text-muted-foreground mb-2">
        Escala Logarítmica — cada división representa 10x
      </p>
      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={filtered} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="logGradient" x1="0" y1="0" x2="0" y2="1">
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
            scale="log"
            domain={["auto", "auto"]}
            allowDataOverflow
            ticks={LOG_TICKS}
            tickFormatter={formatYAxis}
            tick={{ fill: "hsl(215, 20%, 50%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={65}
          />
          <Tooltip content={<CustomTooltip />} />
          {HALVING_TIMESTAMPS.map(({ ts, label }) => (
            <ReferenceLine
              key={label}
              x={ts}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: label, position: "insideTopRight", fill: "#ef4444", fontSize: 10 }}
            />
          ))}
          <Area
            type="linear"
            dataKey="y"
            stroke="hsl(38, 92%, 55%)"
            strokeWidth={2}
            fill="url(#logGradient)"
            dot={false}
            activeDot={{ r: 5, fill: "hsl(38, 92%, 55%)", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}