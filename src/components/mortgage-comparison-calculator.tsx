"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceDot,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import {
  monthlyPaymentForLoan,
  loanForMonthlyPayment,
  remainingBalance,
  payoffMonths,
  futureValue,
  getPayoffMessage,
} from "@/lib/mortgage-calculations";

const INPUT_CLASSES =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

// ──────────────────────────────────────────────────────────────
// URL parameter helpers
// ──────────────────────────────────────────────────────────────

/** Read a number from `searchParams`, falling back to `fallback` (clamped to `min`). */
function readParam(
  searchParams: { get(name: string): string | null } | null,
  key: string,
  fallback: number,
  min = 0,
) {
  const raw = searchParams?.get(key);
  if (raw == null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, value) : fallback;
}

/** Round to 2 decimals so the URL stays compact and human-readable. */
const toParam = (value: number) => String(Math.round(value * 100) / 100);

type PaymentMode = "fix-deposit" | "fix-term";

interface DataPoint {
  year: number;
  propertyValue: number;
  mortgageBalance: number;
  netEquity: number;
  investmentValue: number;
  stockValue: number;
  totalSpent: number;
  interestAmount: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color?: string }>;
  label?: unknown;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const year = Number(label);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-800 min-w-[200px]">
      <div className="font-medium text-gray-900 mb-1">Year {year}</div>
      <div className="space-y-0.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 capitalize">
              <span
                className="block w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color ?? "#9ca3af" }}
              />
              {entry.dataKey === "investmentValue"
                ? "Investment (deposit)"
                : entry.dataKey === "netEquity"
                  ? "Property Net Equity"
                  : entry.dataKey === "propertyValue"
                    ? "Property Value"
                    : entry.dataKey === "stockValue"
                      ? "Stock Market"
                      : entry.dataKey === "totalSpent"
                        ? "Total Spent"
                        : entry.dataKey === "interestAmount"
                          ? "Interest Paid"
                          : entry.dataKey}
              :
            </span>
            <span className="font-medium text-gray-900">
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MortgageComparisonCalculator() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // ── Inputs ───────────────────────────────────────────
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    () =>
      (searchParams?.get("paymentMode") as PaymentMode) ?? "fix-deposit",
  );
  const [initialInvestment, setInitialInvestment] = useState(() =>
    readParam(searchParams, "initialInvestment", 30_000),
  );
  const [mortgageMultiplier, setMortgageMultiplier] = useState(() =>
    readParam(searchParams, "mortgageMultiplier", 10, 1),
  );
  const [mortgageRate, setMortgageRate] = useState(() =>
    readParam(searchParams, "mortgageRate", 5),
  );
  const [appreciationRate, setAppreciationRate] = useState(() =>
    readParam(searchParams, "appreciationRate", 4),
  );
  const [years, setYears] = useState(() =>
    readParam(searchParams, "years", 30, 1),
  );
  const [monthlyPayment, setMonthlyPayment] = useState<number | null>(
    () =>
      readParam(searchParams, "monthlyPayment", Number.NaN) || null,
  );
  const [stockReturnRate, setStockReturnRate] = useState(() =>
    readParam(searchParams, "stockReturnRate", 7),
  );
  const [showStockComparison, setShowStockComparison] = useState(() =>
    searchParams?.get("showStockComparison") !== "0",
  );

  // ── Derived values ───────────────────────────────────
  const deposit = initialInvestment;
  const referenceLoan = Math.max(0, deposit * mortgageMultiplier - deposit);
  const referenceStandardPayment = monthlyPaymentForLoan(
    referenceLoan,
    mortgageRate,
    years,
  );
  const effectiveMonthlyPayment =
    monthlyPayment ?? referenceStandardPayment;

  // Compute actual loan & property value based on mode
  let propertyValue: number;
  let loan: number;

  if (paymentMode === "fix-deposit") {
    propertyValue = deposit * mortgageMultiplier;
    loan = propertyValue - deposit;
  } else {
    // fix-term: loan derived from chosen monthly payment
    loan = loanForMonthlyPayment(effectiveMonthlyPayment, mortgageRate, years);
    propertyValue = deposit + loan;
  }

  const displayedMultiplier =
    deposit > 0 ? propertyValue / deposit : Infinity;

  // Slider range for monthly payment (based on reference standard)
  const paymentMin = Math.max(
    100,
    Math.round(referenceStandardPayment * 0.25 / 50) * 50,
  );
  const paymentMax = Math.max(
    paymentMin + 100,
    Math.round(referenceStandardPayment * 2.5 / 50) * 50,
  );
  const paymentStep = 50;

  // Payoff month count (used for chart data + summary)
  const payoffResult = payoffMonths(
    loan,
    mortgageRate,
    effectiveMonthlyPayment,
  );
  const payoffMonth = payoffResult !== null ? payoffResult : Infinity;

  // ── Chart data ───────────────────────────────────────
  const chartData: DataPoint[] = useMemo(() => {
    const r = appreciationRate / 100;
    const result: DataPoint[] = [];

    for (let y = 0; y <= years; y++) {
      const propertyVal = propertyValue * Math.pow(1 + r, y);
      const balance = remainingBalance(loan, mortgageRate, effectiveMonthlyPayment, y);
      const netEq = propertyVal - balance;
      const invValue = deposit * Math.pow(1 + r, y);
      const stockVal = showStockComparison
        ? futureValue(deposit, stockReturnRate, effectiveMonthlyPayment, y)
        : 0;

      // Total spent = deposit + cumulative mortgage payments
      // Starts at initial investment, increases with each payment, flattens at payoff
      const months = y * 12;
      const paymentsMade = effectiveMonthlyPayment * Math.min(months, payoffMonth);
      const totalSpent = deposit + paymentsMade;
      // Red area = interest portion = gap between total spent and property value
      const interestAmount = Math.max(0, totalSpent - propertyVal);

      result.push({
        year: y,
        propertyValue: propertyVal,
        mortgageBalance: balance,
        netEquity: netEq,
        investmentValue: invValue,
        stockValue: stockVal,
        totalSpent: totalSpent,
        interestAmount: interestAmount,
      });
    }
    return result;
  }, [
    appreciationRate,
    propertyValue,
    deposit,
    loan,
    mortgageRate,
    effectiveMonthlyPayment,
    payoffMonth,
    years,
    stockReturnRate,
    showStockComparison,
  ]);

  const final = chartData[years];

  // Total interest: account for early payoff
  const monthsPaid = Math.min(payoffMonth, years * 12);
  const totalPayments = effectiveMonthlyPayment * monthsPaid;
  const principalRepaid = loan - final.mortgageBalance;
  const totalInterestPaid = Math.max(0, totalPayments - principalRepaid);
  const finalTotalSpent = final.totalSpent;

  // Payoff status for "Fix Deposit" mode
  const payoffMessage = getPayoffMessage(payoffMonth, years);

  const finalNetEquity = final.netEquity;
  const finalInvestmentValue = final.investmentValue;
  const finalStockValue = final.stockValue;
  const difference = showStockComparison
    ? finalNetEquity - finalStockValue
    : 0;

  // ── Keep URL in sync with inputs ──
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("paymentMode", paymentMode);
    params.set("initialInvestment", toParam(initialInvestment));
    params.set("mortgageMultiplier", toParam(mortgageMultiplier));
    params.set("mortgageRate", toParam(mortgageRate));
    params.set("appreciationRate", toParam(appreciationRate));
    params.set("years", toParam(years));
    params.set("monthlyPayment", monthlyPayment !== null ? toParam(monthlyPayment) : "standard");
    params.set("stockReturnRate", toParam(stockReturnRate));
    params.set("showStockComparison", showStockComparison ? "1" : "0");
    window.history.replaceState(
      null,
      "",
      `${pathname}?${params.toString()}`,
    );
  }, [
    paymentMode,
    initialInvestment,
    mortgageMultiplier,
    mortgageRate,
    appreciationRate,
    years,
    monthlyPayment,
    stockReturnRate,
    showStockComparison,
    pathname,
  ]);

  // ── Render ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">
              Mortgage Comparison Calculator
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

              {/* Payment Mode Toggle */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  What to fix when changing payment
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMode("fix-deposit")}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition ${
                      paymentMode === "fix-deposit"
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    Fix Deposit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode("fix-term")}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition ${
                      paymentMode === "fix-term"
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    Fix Term
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {paymentMode === "fix-deposit"
                    ? "Deposit & loan fixed — payment changes payoff speed"
                    : "Term fixed — payment changes loan & property size"}
                </p>
              </div>

              {/* Initial Investment */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Initial Investment (£)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={initialInvestment}
                  onChange={(e) =>
                    setInitialInvestment(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  className={INPUT_CLASSES}
                />
              </div>

              {/* Mortgage Multiplier (fix-deposit only) */}
              {paymentMode === "fix-deposit" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Mortgage Multiplier{" "}
                    <span className="font-bold">{mortgageMultiplier}×</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    value={mortgageMultiplier}
                    onChange={(e) =>
                      setMortgageMultiplier(Number(e.target.value))
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>1×</span>
                    <span>20×</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Property value:{" "}
                    <span className="font-medium text-gray-900">
                      {formatCurrency(propertyValue)}
                    </span>
                  </p>
                </div>
              )}

              {/* Property Value display (fix-term only) */}
              {paymentMode === "fix-term" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Property Value
                  </label>
                  <div className={INPUT_CLASSES}>
                    {formatCurrency(propertyValue)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Multiplier:{" "}
                    <span className="font-medium text-gray-900">
                      {displayedMultiplier === Infinity
                        ? "∞"
                        : `${displayedMultiplier.toFixed(1)}×`}
                    </span>
                  </p>
                </div>
              )}

              {/* Mortgage Rate (always fixed input) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mortgage Interest Rate (%)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.1"
                    value={mortgageRate}
                    onChange={(e) =>
                      setMortgageRate(
                        Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                      )
                    }
                    className={INPUT_CLASSES}
                  />
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={mortgageRate}
                    onChange={(e) => setMortgageRate(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                  />
                </div>
              </div>

              {/* Appreciation Rate */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Property Appreciation Rate (%)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.1"
                    value={appreciationRate}
                    onChange={(e) =>
                      setAppreciationRate(
                        Math.max(
                          0,
                          Math.min(20, Number(e.target.value) || 0),
                        ),
                      )
                    }
                    className={INPUT_CLASSES}
                  />
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={appreciationRate}
                    onChange={(e) =>
                      setAppreciationRate(Number(e.target.value))
                    }
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                  />
                </div>
              </div>

              {/* Monthly Payment */}
              <div>
                <div className="flex justify-between">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Monthly Mortgage Payment (£)
                  </label>
                  <button
                    type="button"
                    onClick={() => setMonthlyPayment(null)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Reset to standard
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={paymentMin}
                    max={paymentMax}
                    step={paymentStep}
                    value={
                      monthlyPayment ?? Math.round(referenceStandardPayment)
                    }
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setMonthlyPayment(
                        isNaN(val) || val <= 0
                          ? null
                          : Math.max(paymentMin, Math.min(paymentMax, val)),
                      );
                    }}
                    className={INPUT_CLASSES}
                  />
                  <input
                    type="range"
                    min={paymentMin}
                    max={paymentMax}
                    step={paymentStep}
                    value={
                      monthlyPayment ?? Math.round(referenceStandardPayment)
                    }
                    onChange={(e) => setMonthlyPayment(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Standard:{" "}
                  <span className="font-medium text-gray-900">
                    {formatCurrency(referenceStandardPayment)}/mo
                  </span>
                  <span className="mx-1">·</span>
                  Current:{" "}
                  <span className="font-medium text-gray-900">
                    {formatCurrency(effectiveMonthlyPayment)}/mo
                  </span>
                </p>
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

              {/* Stock Market Comparison */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">
                    Compare with stock market investment
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showStockComparison}
                    onClick={() => setShowStockComparison(!showStockComparison)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      showStockComparison ? "bg-blue-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        showStockComparison ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {showStockComparison && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Stock Market Annual Return (%)
                      </label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.1"
                          value={stockReturnRate}
                          onChange={(e) =>
                            setStockReturnRate(
                              Math.max(
                                0,
                                Math.min(20, Number(e.target.value) || 0),
                              ),
                            )
                          }
                          className={INPUT_CLASSES}
                        />
                        <input
                          type="range"
                          min="0"
                          max="15"
                          step="0.1"
                          value={stockReturnRate}
                          onChange={(e) =>
                            setStockReturnRate(Number(e.target.value))
                          }
                          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Same £{deposit.toLocaleString()} deposit +{" "}
                      £{Math.round(effectiveMonthlyPayment).toLocaleString()}
                      /mo invested at {stockReturnRate}% p.a.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Summary card */}
            <div className="bg-white rounded-lg shadow p-6 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Summary (Year {years})
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Property Value:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(final.propertyValue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Mortgage Payment:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(effectiveMonthlyPayment)}/mo
                    <span className="text-xs text-gray-500">
                      {" "}({formatCurrency(effectiveMonthlyPayment * 12)}/yr)
                    </span>
                  </span>
                </div>
                {paymentMode === "fix-deposit" && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mortgage Payoff:</span>
                    <span className="font-medium text-gray-900">
                      {payoffMessage}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Interest Paid:</span>
                  <span className="font-medium text-red-600">
                    {formatCurrency(totalInterestPaid)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Spent:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(finalTotalSpent)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-600">Property Net Equity:</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(finalNetEquity)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-600">Investment (deposit only):</span>
                  <span className="font-medium text-blue-600">
                    {formatCurrency(finalInvestmentValue)}
                  </span>
                </div>
                {showStockComparison && (
                  <>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-600">
                        Stock Market Value:
                      </span>
                      <span className="font-medium text-orange-600">
                        {formatCurrency(finalStockValue)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-200">
                      <span className="text-gray-600">
                        Diff (Equity − Stock):
                      </span>
                      <span
                        className={`font-bold ${
                          difference >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {difference >= 0 ? "+" : ""}
                        {formatCurrency(difference)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Chart ── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Investment vs. Property Equity
              </h2>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 20, bottom: 10, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      tickFormatter={(v) => String(Math.round(Number(v)))}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      domain={[0, "dataMax"]}
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      tickFormatter={(v) => formatCurrency(Number(v))}
                      axisLine={false}
                      tickLine={false}
                      width={90}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconSize={10}
                      wrapperStyle={{ fontSize: "12px", color: "#6b7280" }}
                    />

                    {/* Property value (dashed reference line) */}
                    <Area
                      type="monotone"
                      dataKey="propertyValue"
                      stackId="spent"
                      fill="none"
                      stroke="#9ca3af"
                      strokeWidth={1}
                      strokeOpacity={0.7}
                      strokeDasharray="6 3"
                      dot={false}
                      name="Property Value"
                    />

                    {/* Interest paid area (red, stacked on top of property value) */}
                    <Area
                      type="monotone"
                      dataKey="interestAmount"
                      stackId="spent"
                      fill="#ef4444"
                      fillOpacity={0.12}
                      stroke="none"
                      name="Interest Paid"
                    />

                    {/* Total spent line (purple dashed) */}
                    <Line
                      type="monotone"
                      dataKey="totalSpent"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      dot={false}
                      name="Total Spent"
                    />

                    {/* Investment value (thin blue line) */}
                    <Line
                      type="monotone"
                      dataKey="investmentValue"
                      stroke="#3b82f6"
                      strokeWidth={1}
                      strokeOpacity={0.4}
                      dot={false}
                      name="Investment (deposit only)"
                    />

                    {/* Property net equity (green solid line) */}
                    <Line
                      type="monotone"
                      dataKey="netEquity"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#10b981" }}
                      activeDot={{ r: 6, fill: "#059669" }}
                      name="Property Net Equity"
                    />

                    {/* Stock market value (orange solid line) */}
                    {showStockComparison && (
                      <Line
                        type="monotone"
                        dataKey="stockValue"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#f59e0b" }}
                        activeDot={{ r: 6, fill: "#d97706" }}
                        name="Stock Market"
                      />
                    )}

                    {/* Zero point reference for initial investment */}
                    <ReferenceDot
                      x={0}
                      y={deposit}
                      r={4}
                      fill="#3b82f6"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Custom legend */}
              <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-gray-400" />
                  <span>Property Value</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-400 rounded-sm" />
                  <span>Interest Paid (red area)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 border-2 border-dashed border-purple-500" />
                  <span>Total Spent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-blue-400" />
                  <span>Investment (deposit only)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span>Property Net Equity</span>
                </div>
                {showStockComparison && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-orange-500 rounded" />
                    <span>Stock Market (deposit + payments)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
