import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Move, RotateCcw, Undo2, Hand } from "lucide-react";

const HALVINGS = [
  { name: "Halving 2012", color: "#4e8cff", startDate: new Date("2012-11-28") },
  { name: "Halving 2016", color: "#f97316", startDate: new Date("2016-07-09") },
  { name: "Halving 2020", color: "#22c55e", startDate: new Date("2020-05-11") },
  { name: "Halving 2024", color: "#ef4444", startDate: new Date("2024-04-20") },
];

const LOG_TICKS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
const MARGIN = { top: 10, right: 20, left: 58, bottom: 40 };
const HEIGHT = 420;
const INIT_OFFSETS = () => Object.fromEntries(HALVINGS.map((h) => [h.name, { dx: 0, dy: 1 }]));

const formatUSD = (v) =>
  v != null ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : null;

export default function HalvingChart({ halvingData, dailyData }) {
  const [editMode, setEditMode] = useState(false);
  const [lockScroll, setLockScroll] = useState(false);
  const [offsets, setOffsets] = useState(INIT_OFFSETS);
  const [selectedLine, setSelectedLine] = useState(null);
  const [history, setHistory] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const tooltipDragRef = useRef(null);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [size, setSize] = useState({ width: 700 });

  // Build a timestamp→price lookup from dailyData
  const priceByTs = useMemo(() => {
    if (!dailyData?.length) return {};
    const map = {};
    dailyData.forEach((d) => { map[d.x] = d.y; });
    return map;
  }, [dailyData]);

  // For each halving cycle, map day offset → real price (closest daily point)
  const priceByHalvingDay = useMemo(() => {
    const result = {};
    HALVINGS.forEach(({ name, startDate }) => {
      const startTs = startDate.getTime() / 1000;
      result[name] = (day) => {
        const targetTs = startTs + day * 86400;
        // find closest daily point within ±2 days
        let best = null, bestDist = Infinity;
        dailyData?.forEach((d) => {
          const dist = Math.abs(d.x - targetTs);
          if (dist < bestDist) { bestDist = dist; best = d.y; }
        });
        return bestDist <= 2 * 86400 ? best : null;
      };
    });
    return result;
  }, [dailyData]);

  const rawByHalving = useMemo(() => {
    if (!halvingData?.length) return {};
    const map = {};
    halvingData.forEach((row) => {
      HALVINGS.forEach(({ name }) => {
        if (row[name] != null) {
          if (!map[name]) map[name] = [];
          map[name].push({ day: row.day, value: row[name] });
        }
      });
    });
    return map;
  }, [halvingData]);

  const maxDay = halvingData?.[halvingData.length - 1]?.day || 1460;

  const shiftedSeries = useMemo(() => {
    const result = {};
    HALVINGS.forEach(({ name }) => {
      const series = rawByHalving[name] || [];
      const { dx, dy } = offsets[name];
      result[name] = series.map(({ day, value }) => ({ day: day + dx, value: value * dy, origDay: day }));
    });
    return result;
  }, [rawByHalving, offsets]);

  const domainX = useMemo(() => {
    let min = 0, max = maxDay;
    Object.values(shiftedSeries).forEach((s) => s.forEach(({ day }) => {
      if (day < min) min = day;
      if (day > max) max = day;
    }));
    return [min, max];
  }, [shiftedSeries, maxDay]);

  // Compute dynamic Y max from all series
  const domainY = useMemo(() => {
    let maxVal = 200;
    Object.values(rawByHalving).forEach((series) => {
      series.forEach(({ value }) => { if (value > maxVal) maxVal = value; });
    });
    // Round up to next nice log tick
    const niceMax = [200, 500, 1000, 2000, 5000, 10000].find((v) => v >= maxVal) || maxVal * 1.2;
    return [0.5, niceMax];
  }, [rawByHalving]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.getBoundingClientRect().width }));
    ro.observe(el);
    setSize({ width: el.getBoundingClientRect().width });
    return () => ro.disconnect();
  }, []);

  const W = size.width;
  const plotW = W - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const xToPixel = useCallback((day) => MARGIN.left + ((day - domainX[0]) / (domainX[1] - domainX[0])) * plotW, [domainX, plotW]);
  const yToPixel = useCallback((val) => {
    const logMin = Math.log10(domainY[0]);
    const logMax = Math.log10(domainY[1]);
    return MARGIN.top + (1 - (Math.log10(Math.max(val, domainY[0])) - logMin) / (logMax - logMin)) * plotH;
  }, [plotH]);
  const pixelToDay = useCallback((px) => domainX[0] + ((px - MARGIN.left) / plotW) * (domainX[1] - domainX[0]), [domainX, plotW]);
  const pixelToY = useCallback((py) => {
    const logMin = Math.log10(domainY[0]);
    const logMax = Math.log10(domainY[1]);
    return Math.pow(10, logMin + (1 - (py - MARGIN.top) / plotH) * (logMax - logMin));
  }, [plotH]);

  const getValuesAtDay = useCallback((day) => {
    return HALVINGS.map(({ name, color }) => {
      const series = shiftedSeries[name] || [];
      if (!series.length) return null;
      let best = null, bestDist = Infinity;
      series.forEach((p) => {
        const d = Math.abs(p.day - day);
        if (d < bestDist) { bestDist = d; best = p; }
      });
      if (!best || bestDist > 30) return null;
      const origDay = best.origDay ?? best.day;
      const price = priceByHalvingDay[name]?.(origDay);
      const halvingStart = HALVINGS.find((h) => h.name === name)?.startDate;
      const date = halvingStart ? new Date((halvingStart.getTime() / 1000 + origDay * 86400) * 1000) : null;
      return { name, color, value: best.value, day: best.day, price, date };
    }).filter(Boolean);
  }, [shiftedSeries, priceByHalvingDay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !halvingData?.length) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${HEIGHT}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, HEIGHT);

    ctx.strokeStyle = "hsl(222, 30%, 18%)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    LOG_TICKS.filter((v) => v >= domainY[0] && v <= domainY[1]).forEach((v) => {
      const py = yToPixel(v);
      ctx.beginPath(); ctx.moveTo(MARGIN.left, py); ctx.lineTo(W - MARGIN.right, py); ctx.stroke();
    });
    const xTicks = [];
    for (let d = Math.ceil(domainX[0] / 90) * 90; d <= domainX[1]; d += 90) xTicks.push(d);
    xTicks.forEach((d) => {
      const px = xToPixel(d);
      ctx.beginPath(); ctx.moveTo(px, MARGIN.top); ctx.lineTo(px, HEIGHT - MARGIN.bottom); ctx.stroke();
    });
    ctx.setLineDash([]);

    ctx.strokeStyle = "hsl(215,20%,45%)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(MARGIN.left, yToPixel(1)); ctx.lineTo(W - MARGIN.right, yToPixel(1)); ctx.stroke();
    ctx.setLineDash([]);

    if (!editMode && tooltip) {
      const cx = xToPixel(tooltip.day);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(cx, MARGIN.top); ctx.lineTo(cx, HEIGHT - MARGIN.bottom); ctx.stroke();
      ctx.setLineDash([]);
    }

    HALVINGS.forEach(({ name, color }) => {
      const series = shiftedSeries[name] || [];
      if (!series.length) return;
      const isSelected = selectedLine === name;
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3.5 : editMode ? 2 : 1.5;
      ctx.globalAlpha = editMode && !isSelected && selectedLine ? 0.3 : 1;
      if (isSelected) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
      ctx.beginPath();
      series.forEach(({ day, value }, i) => {
        const px = xToPixel(day), py = yToPixel(value);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    });

    if (!editMode && tooltip) {
      tooltip.values.forEach(({ color, value }) => {
        const cx = xToPixel(tooltip.day);
        const cy = yToPixel(value);
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    ctx.fillStyle = "hsl(215,20%,50%)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    LOG_TICKS.filter((v) => v >= domainY[0] && v <= domainY[1]).forEach((v) => {
      ctx.fillText(`${v}x`, MARGIN.left - 4, yToPixel(v) + 4);
    });
    ctx.textAlign = "center";
    xTicks.filter((d) => d % 180 === 0 || d === 0).forEach((d) => {
      ctx.fillText(`${Math.round(d / 30)}m`, xToPixel(d), HEIGHT - MARGIN.bottom + 14);
    });

    HALVINGS.forEach(({ name, color }, i) => {
      const lx = MARGIN.left + i * 115;
      const ly = 6;
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly, 18, 3);
      ctx.fillStyle = "hsl(215,20%,80%)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(name, lx + 22, ly + 8);
    });

    if (editMode) {
      HALVINGS.forEach(({ name, color }) => {
        const { dx } = offsets[name];
        if (dx === 0) return;
        const series = shiftedSeries[name];
        if (!series?.length) return;
        const mid = series[Math.floor(series.length / 2)];
        ctx.fillStyle = color;
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${dx > 0 ? "+" : ""}${dx}d`, xToPixel(mid.day), yToPixel(mid.value) - 10);
      });
    }
  }, [shiftedSeries, W, editMode, domainX, domainY, offsets, halvingData, selectedLine, tooltip, xToPixel, yToPixel]);

  const getEventPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    return {
      x: (touch ? touch.clientX : e.clientX) - rect.left,
      y: (touch ? touch.clientY : e.clientY) - rect.top,
    };
  };

  const onPointerDown = (e) => {
    if (!editMode || !selectedLine) return;
    e.preventDefault();
    const { x, y } = getEventPos(e);
    setHistory((prev) => [...prev.slice(-19), { ...offsets }]);
    dragRef.current = { name: selectedLine, startX: x, startY: y, startDx: offsets[selectedLine].dx, startDy: offsets[selectedLine].dy };
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const { x, y } = getEventPos(e);
    const { name, startX, startY, startDx, startDy } = dragRef.current;
    const deltaDays = Math.round(pixelToDay(x) - pixelToDay(startX));
    const deltaY = pixelToY(y) / pixelToY(startY);
    setOffsets((prev) => ({ ...prev, [name]: { dx: startDx + deltaDays, dy: startDy * deltaY } }));
  };

  const onPointerUp = () => { dragRef.current = null; };

  const onCanvasMouseMove = (e) => {
    if (editMode) { onPointerMove(e); return; }
    const { x } = getEventPos(e);
    const day = Math.round(pixelToDay(x));
    const values = getValuesAtDay(day);
    if (values.length) {
      setTooltip({ day, values });
      // Solo fijar posición la primera vez
      setTooltipPos((prev) => prev ?? { x: x + 16, y: 30 });
    }
  };

  // Touch: update crosshair (in view mode) or drag line (edit mode)
  const onTouchMove = (e) => {
    if (editMode) { onPointerMove(e); return; }
    if (lockScroll) e.preventDefault();
    const { x } = getEventPos(e);
    const day = Math.round(pixelToDay(x));
    const values = getValuesAtDay(day);
    if (values.length) {
      setTooltip({ day, values });
      // Solo fijar posición la primera vez
      setTooltipPos((prev) => prev ?? { x: Math.min(x + 16, W - 170), y: 30 });
    }
  };

  const onTouchStart = (e) => {
    if (editMode) { onPointerDown(e); return; }
    if (lockScroll) e.preventDefault();
    const { x } = getEventPos(e);
    const day = Math.round(pixelToDay(x));
    const values = getValuesAtDay(day);
    if (values.length) {
      setTooltip({ day, values });
      // Solo fijar posición la primera vez
      setTooltipPos((prev) => prev ?? { x: Math.min(x + 16, W - 170), y: 30 });
    }
  };

  const onTouchEnd = (e) => {
    if (editMode) { onPointerUp(); return; }
  };

  const onCanvasMouseLeave = () => {
    if (editMode) { onPointerUp(); return; }
    setTooltip(null);
  };

  // Tooltip drag — mouse
  const onTooltipMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    tooltipDragRef.current = { startMx: e.clientX, startMy: e.clientY, startTx: tooltipPos.x, startTy: tooltipPos.y };
    const onMove = (ev) => {
      const dx = ev.clientX - tooltipDragRef.current.startMx;
      const dy = ev.clientY - tooltipDragRef.current.startMy;
      setTooltipPos({ x: tooltipDragRef.current.startTx + dx, y: tooltipDragRef.current.startTy + dy });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Tooltip drag — touch
  const onTooltipTouchStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const t = e.touches[0];
    tooltipDragRef.current = { startMx: t.clientX, startMy: t.clientY, startTx: tooltipPos.x, startTy: tooltipPos.y };
    const onMove = (ev) => {
      const touch = ev.touches[0];
      const dx = touch.clientX - tooltipDragRef.current.startMx;
      const dy = touch.clientY - tooltipDragRef.current.startMy;
      setTooltipPos({ x: tooltipDragRef.current.startTx + dx, y: tooltipDragRef.current.startTy + dy });
    };
    const onUp = () => { window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp); };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  const undo = () => {
    if (!history.length) return;
    setOffsets(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  const resetOffsets = () => {
    setHistory((prev) => [...prev.slice(-19), { ...offsets }]);
    setOffsets(INIT_OFFSETS());
  };

  if (!halvingData?.length) return null;

  const touchAction = (editMode || lockScroll) ? "none" : "auto";

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">
          Multiplicador del Precio Inicial (Escala Logarítmica)
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Anti-scroll lock */}
          <button
            onClick={() => setLockScroll((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${lockScroll ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            title="Bloquear scroll al inspeccionar el gráfico"
          >
            <Hand className="w-3 h-3" />
            {lockScroll ? "Scroll OFF" : "Scroll ON"}
          </button>
          {editMode && (
            <>
              <button onClick={undo} disabled={!history.length} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground text-xs transition-all disabled:opacity-30">
                <Undo2 className="w-3 h-3" /> Deshacer
              </button>
              <button onClick={resetOffsets} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground text-xs transition-all">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </>
          )}
          <button
            onClick={() => { setEditMode((v) => !v); if (editMode) { resetOffsets(); setSelectedLine(null); } setTooltip(null); }}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${editMode ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            <Move className="w-3 h-3" />
            {editMode ? "Edición ON" : "Modo Edición"}
          </button>
        </div>
      </div>

      {editMode && (
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-xs text-muted-foreground self-center">Seleccionar línea:</span>
          {HALVINGS.map(({ name, color }) => (
            <button
              key={name}
              onClick={() => setSelectedLine((s) => s === name ? null : name)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all select-none"
              style={{
                borderColor: color,
                color: selectedLine === name ? "#000" : color,
                background: selectedLine === name ? color : `${color}18`,
                boxShadow: selectedLine === name ? `0 0 8px ${color}88` : "none",
              }}
            >
              {name}
              {offsets[name].dx !== 0 && (
                <span className="opacity-70 ml-1">({offsets[name].dx > 0 ? "+" : ""}{offsets[name].dx}d)</span>
              )}
            </button>
          ))}
          {selectedLine && <span className="text-xs text-muted-foreground self-center ml-1">→ arrastra en el gráfico</span>}
        </div>
      )}

      <div ref={containerRef} className="relative" style={{ touchAction }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: HEIGHT, cursor: editMode ? (selectedLine ? "grab" : "default") : "crosshair", display: "block" }}
          onMouseDown={editMode ? onPointerDown : undefined}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={editMode ? onPointerUp : undefined}
          onMouseLeave={onCanvasMouseLeave}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        {!editMode && tooltip && tooltipPos && (
          <div
            onMouseDown={onTooltipMouseDown}
            onTouchStart={onTooltipTouchStart}
            style={{
              position: "absolute",
              left: tooltipPos.x,
              top: tooltipPos.y,
              cursor: "grab",
              userSelect: "none",
              zIndex: 10,
              minWidth: 158,
              background: "rgba(10, 16, 35, 0.55)",
              backdropFilter: "blur(16px) saturate(180%)",
              WebkitBackdropFilter: "blur(16px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.13)",
              borderRadius: 14,
              padding: "10px 14px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "hsl(215,20%,65%)", fontWeight: 600, letterSpacing: "0.03em" }}>
                Día {tooltip.day}
              </span>
              <Move style={{ width: 11, height: 11, color: "rgba(255,255,255,0.3)" }} />
            </div>
            {tooltip.values.map(({ name, color, value, price, date }) => (
              <div key={name} style={{ marginTop: 5 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 10, color, fontWeight: 600 }}>{name}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color }}>{value.toFixed(2)}x</span>
                </div>
                {(price != null || date) && (
                  <div style={{ textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
                    {date && <span>{date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })} · </span>}
                    {formatUSD(price)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}