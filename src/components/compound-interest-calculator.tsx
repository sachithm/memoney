"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
} from "recharts";
import { formatCurrency, currencyTick, yearTick } from "@/lib/utils";
import PageHeader from "@/components/ui/page-header";

const INPUT_CLASSES =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

type Frequency = "monthly" | "annual";

interface DataPoint {
  year: number;
  invested: number;
  interest: number;
  total: number;
}

/** Pure calculation function — no closure dependencies. */
function calcYear(
  y: number,
  initialInvestment: number,
  contribution: number,
  frequency: Frequency,
  annualRate: number,
): [number, number] {
  const rate = annualRate / 100;
  const P = initialInvestment;

  if (rate === 0) {
    const contrib = frequency === "monthly" ? contribution * 12 : contribution;
    const invested = P + contrib * y;
    return [invested, invested];
  }

  if (frequency === "monthly") {
    const monthlyRate = rate / 12;
    const months = y * 12;
    const fvLump = P * Math.pow(1 + monthlyRate, months);
    const fvContrib =
      contribution * (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
    const total = fvLump + fvContrib;
    const invested = P + contribution * months;
    return [invested, total];
  } else {
    const total =
      P * Math.pow(1 + rate, y) +
      contribution * (Math.pow(1 + rate, y) - 1) / rate;
    const invested = P + contribution * y;
    return [invested, total];
  }
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: unknown;
  chartData: DataPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
  chartData,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = chartData[Number(label)];
  if (!point) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[180px]">
      <div className="font-medium text-gray-900 mb-1">Year {point.year}</div>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-red-600">Invested:</span>
          <span className="font-medium text-gray-900">
            {formatCurrency(point.invested)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-green-600">Interest:</span>
          <span className="font-medium text-gray-900">
            {formatCurrency(point.interest)}
          </span>
        </div>
        <div className="flex justify-between gap-4 border-t pt-0.5">
          <span className="text-blue-700">Total:</span>
          <span className="font-bold text-gray-900">
            {formatCurrency(point.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CompoundInterestCalculator() {
  // ── Inputs ───────────────────────────────────────────
  const [initialInvestment, setInitialInvestment] = useState(10000);
  const [contribution, setContribution] = useState(500);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [annualRate, setAnnualRate] = useState(7);
  const [years, setYears] = useState(30);

  // ── Calculation ──────────────────────────────────────
  const data: DataPoint[] = useMemo(() => {
    const result: DataPoint[] = [];
    for (let y = 0; y <= years; y++) {
      const [invested, total] = calcYear(
        y,
        initialInvestment,
        contribution,
        frequency,
        annualRate,
      );
      result.push({
        year: y,
        invested,
        interest: total - invested,
        total,
      });
    }
    return result;
  }, [initialInvestment, contribution, frequency, annualRate, years]);

  const final = data[data.length - 1];
  const maxTotal = Math.max(...data.map((d) => d.total), 1);

  // ── Render ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">
              Compound Interest Calculator
            </h1>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Controls ── */}
          <div className="lg:col-span-1 space-y-6">
            {/* Input card */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Inputs</h2>

              {/* Initial Investment */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Initial Investment (£)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={initialInvestment}
                  onChange={(e) =>
                    setInitialInvestment(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  className={INPUT_CLASSES}
                />
              </div>

              {/* Contribution Frequency */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Contribution Frequency
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="frequency"
                      checked={frequency === "monthly"}
                      onChange={() => setFrequency("monthly")}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    Monthly
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="frequency"
                      checked={frequency === "annual"}
                      onChange={() => setFrequency("annual")}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    Annual
                  </label>
                </div>
              </div>

              {/* Monthly / Annual Contribution */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {frequency === "monthly"
                    ? "Monthly Contribution (£)"
                    : "Annual Contribution (£)"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={contribution}
                  onChange={(e) =>
                    setContribution(Math.max(0, Number(e.target.value) || 0))
                  }
                  className={INPUT_CLASSES}
                />
              </div>

              {/* Annual Rate of Return */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Annual Rate of Return (%)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    value={annualRate}
                    onChange={(e) =>
                      setAnnualRate(
                        Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                      )
                    }
                    className={INPUT_CLASSES}
                  />
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.1"
                    value={annualRate}
                    onChange={(e) => setAnnualRate(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                  />
                </div>
              </div>

              {/* Years Slider */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Years <span className="text-lg font-bold">{years}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>25</span>
                  <span>50</span>
                </div>
              </div>
            </div>

            {/* Summary card */}
            <div className="bg-white rounded-lg shadow p-6 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Summary (Year {years})
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Invested:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(final.invested)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Interest:</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(final.interest)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-600">Final Value:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(final.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Chart ── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Growth Over Time
              </h2>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data}
                    margin={{ top: 10, right: 20, bottom: 10, left: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="investedGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#ef4444"
                          stopOpacity={0.4}
                        />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient
                        id="interestGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#10b981"
                          stopOpacity={0.5}
                        />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      tickFormatter={yearTick}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      domain={[0, maxTotal * 1.1]}
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      tickFormatter={currencyTick}
                      axisLine={false}
                      tickLine={false}
                      width={80}
                    />
                    <Tooltip content={<CustomTooltip chartData={data} />} />

                    {/* Invest stack (red) — bottom layer */}
                    <Area
                      type="monotone"
                      dataKey="invested"
                      stackId="growth"
                      stroke="#dc2626"
                      fill="url(#investedGradient)"
                      dot={{ r: 0 }}
                      activeDot={{ r: 0 }}
                    />

                    {/* Interest stack (green) — top layer */}
                    <Area
                      type="monotone"
                      dataKey="interest"
                      stackId="growth"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#interestGradient)"
                      dot={{ r: 3, fill: "#10b981" }}
                      activeDot={{ r: 5, fill: "#059669" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-6 mt-4 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded" />
                  <span>Invested Money</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span>Interest / Return</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
