"use client";

import {
  ResponsiveContainer,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
} from "recharts";

interface DataPoint {
  date: string;
  netWorth: number;
}

interface NetWorthChartProps {
  data: DataPoint[];
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
  }).format(value);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
};

export default function NetWorthChart({ data }: NetWorthChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No balance entries yet. Add a balance to start tracking net worth.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    netWorth: Math.round(d.netWorth),
  }));

  const max = Math.max(...chartData.map((d) => d.netWorth));
  const min = Math.min(0, ...chartData.map((d) => d.netWorth));
  const range = max - min;
  const padding = range * 0.15;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="networthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[min - padding, max + padding]}
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatCurrency}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "8px 12px",
            }}
            formatter={(value) => {
              const num = typeof value === "number" ? value : 0;
              return [formatCurrency(num), "Net Worth"] as [string, string];
            }}
            labelStyle={{ fontSize: "12px", color: "#6b7280" }}
          />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#networthGradient)"
            dot={{ r: 3, fill: "#10b981" }}
            activeDot={{ r: 5, fill: "#059669" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
