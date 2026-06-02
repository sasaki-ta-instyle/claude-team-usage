"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendPoint = {
  date: string;
  tokens: number;
  costUsd: number;
};

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(53,54,45,0.08)" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            stroke="#82837A"
            tick={{ fontSize: 11 }}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis
            yAxisId="tokens"
            stroke="#82837A"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) =>
              v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : `${v}`
            }
          />
          <YAxis
            yAxisId="cost"
            orientation="right"
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
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="tokens"
            type="monotone"
            dataKey="tokens"
            name="トークン"
            stroke="#35362D"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="cost"
            type="monotone"
            dataKey="costUsd"
            name="推定コスト (USD)"
            stroke="#D4772C"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
