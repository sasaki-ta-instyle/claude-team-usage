"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CostTrendPoint = {
  date: string;
  costUsd: number;
};

export function CostTrendChart({ data }: { data: CostTrendPoint[] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="apiCostFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2, #D4772C)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-2, #D4772C)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(53,54,45,0.08)" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            stroke="#82837A"
            tick={{ fontSize: 11 }}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis
            stroke="#82837A"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(243,241,238,0.92)",
              border: "1px solid rgba(255,255,255,0.7)",
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(53,54,45,0.16)",
              fontSize: 12,
            }}
            formatter={(v: number) => [`$${v.toFixed(2)}`, "コスト (USD)"]}
          />
          <Area
            type="monotone"
            dataKey="costUsd"
            name="コスト (USD)"
            stroke="var(--chart-2, #D4772C)"
            strokeWidth={2}
            fill="url(#apiCostFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
