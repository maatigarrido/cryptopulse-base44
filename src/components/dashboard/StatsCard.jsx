import React from "react";

export default function StatsCard({ title, value, change, icon: Icon, positive }) {
  return (
    <div className="bg-card rounded-2xl p-5 border border-border flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-widest">{title}</span>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {change !== undefined && (
        <div className={`text-xs font-semibold ${positive ? "text-green-400" : "text-destructive"}`}>
          {positive ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
        </div>
      )}
    </div>
  );
}