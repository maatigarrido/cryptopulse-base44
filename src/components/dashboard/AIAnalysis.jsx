import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, TrendingDown, Minus, Sparkles, Loader2 } from "lucide-react";

export default function AIAnalysis({ data, coin }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    if (!data || data.length < 10) return;
    setLoading(true);
    setAnalysis(null);

    // Build a summary of recent price action
    const recent = data.slice(-30);
    const prices = recent.map((d) => ({
      date: new Date(d.x * 1000).toISOString().split("T")[0],
      price: d.y,
    }));
    const first = prices[0];
    const last = prices[prices.length - 1];
    const high = Math.max(...recent.map((d) => d.y));
    const low = Math.min(...recent.map((d) => d.y));
    const change = ((last.price - first.price) / first.price) * 100;

    const prompt = `Eres un analista experto en criptomonedas. Analiza los siguientes datos de precio de ${coin} en los últimos 30 días y da una predicción breve de si el precio subirá o bajará a corto plazo.

Datos:
- Precio inicial (30 días atrás): $${first.price.toFixed(2)} (${first.date})
- Precio actual: $${last.price.toFixed(2)} (${last.date})
- Máximo del período: $${high.toFixed(2)}
- Mínimo del período: $${low.toFixed(2)}
- Cambio del período: ${change.toFixed(2)}%

Serie de precios recientes (últimos 10 días): ${prices.slice(-10).map(p => `${p.date}: $${p.price.toFixed(0)}`).join(", ")}

Responde en español con:
1. Una señal clara: SUBE, BAJA o LATERAL
2. Una explicación breve (2-3 oraciones) del análisis técnico
3. Nivel de confianza: ALTO, MEDIO o BAJO`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          signal: { type: "string", enum: ["SUBE", "BAJA", "LATERAL"] },
          explanation: { type: "string" },
          confidence: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
        },
      },
    });

    setAnalysis(result);
    setLoading(false);
  };

  const signalColor = {
    SUBE: "text-green-400",
    BAJA: "text-red-400",
    LATERAL: "text-yellow-400",
  };
  const signalBg = {
    SUBE: "bg-green-500/10 border-green-500/20",
    BAJA: "bg-red-500/10 border-red-500/20",
    LATERAL: "bg-yellow-500/10 border-yellow-500/20",
  };
  const SignalIcon = analysis?.signal === "SUBE" ? TrendingUp : analysis?.signal === "BAJA" ? TrendingDown : Minus;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Análisis IA</h3>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading || !data?.length}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {loading ? "Analizando..." : "Analizar"}
        </button>
      </div>

      {!analysis && !loading && (
        <p className="text-xs text-muted-foreground">
          Presiona "Analizar" para obtener una predicción basada en IA sobre la dirección del precio.
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground">La IA está analizando el mercado...</span>
        </div>
      )}

      {analysis && (
        <div className={`rounded-xl border p-4 ${signalBg[analysis.signal]}`}>
          <div className="flex items-center gap-2 mb-2">
            <SignalIcon className={`w-5 h-5 ${signalColor[analysis.signal]}`} />
            <span className={`text-lg font-bold ${signalColor[analysis.signal]}`}>{analysis.signal}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              Confianza: <span className="font-semibold text-foreground">{analysis.confidence}</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{analysis.explanation}</p>
        </div>
      )}
    </div>
  );
}