import React, { useState } from "react";

const ranges = [
  { label: "1D", value: "1day" },
  { label: "1M", value: "30days" },
  { label: "3M", value: "90days" },
  { label: "6M", value: "180days" },
  { label: "1A", value: "1year" },
  { label: "2A", value: "2years" },
  { label: "Todo", value: "all" },
];

export default function TimeRangeSelector({ selected, onSelect, onCustomRange }) {
  const [showCustom, setShowCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const handleApply = () => {
    if (from && to && new Date(from) < new Date(to)) {
      onCustomRange({ from, to });
      onSelect("custom");
      setShowCustom(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex gap-1 bg-secondary rounded-xl p-1 flex-wrap">
        {ranges.map((r) => (
          <button
            key={r.value}
            onClick={() => { onSelect(r.value); setShowCustom(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              selected === r.value
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
            selected === "custom"
              ? "bg-primary text-primary-foreground shadow"
              : showCustom
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Personalizado
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-input text-foreground text-xs rounded-lg px-2 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-input text-foreground text-xs rounded-lg px-2 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleApply}
            disabled={!from || !to || new Date(from) >= new Date(to)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-40 transition-all"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}