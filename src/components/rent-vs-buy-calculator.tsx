"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { monthlyPaymentForLoan } from "@/lib/mortgage-calculations";
import {
  deriveValues,
  buildDetailedComparisonData,
  findCrossoverYear,
  breakevenRent,
  type RentVsBuyInputs,
  type RentVsBuyDetailedDataPoint,
} from "@/lib/rent-vs-buy";

const INPUT_CLASSES =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const SLIDER_CLASSES =
  "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb";

/** When the *final* stock portfolio in a scenario exceeds this amount, a red
 * advisory note is shown in the summary. "Amount invested in stocks" is the
 * value held in stocks at the projection horizon (the pension pot is separate).
 */
// UK annual tax-free ISA allowance. The warning fires when the amount invested
// in stocks each YEAR exceeds £20,000 (i.e. monthlyStockInvestment * 12).
const STOCK_EXPOSURE_WARNING_THRESHOLD = 20_000;

interface DetailedTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color?: string }>;
  label?: unknown;
  /** Full per-year dataset, used to look up the breakdown for the hovered year. */
  data: RentVsBuyDetailedDataPoint[];
}

/** Pretty-print a signed change: "+£1,234.00" / "-£1,234.00". */
const formatDelta = (value: number | null | undefined) => {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${formatCurrency(value)}`;
};

/** Tailwind colour class for a signed delta in the tooltip. */
const deltaColorClass = (value: number | null | undefined): string =>
  value == null || value === 0
    ? "text-gray-500"
    : value > 0
      ? "text-green-700"
      : "text-red-700";

function labelForDataKey(dataKey: string): string {
  return dataKey === "rentScenarioNW"
    ? "Rent + Invest"
    : dataKey === "mortgageScenarioNW"
      ? "Mortgage + Invest"
      : "Difference (Rent − Mortgage)";
}

/**
 * Tooltip for the rent-vs-buy chart. Collapsed it shows the same year + totals
 * as the original tooltip; an inline "Show breakdown" button expands it to
 * attribute the year's net-worth movement to its causes (property appreciation,
 * mortgage principal repaid, and stock growth) and lists the housing outgoings
 * incurred that year.
 */
export function DetailedTooltip({ active, payload, label, data }: DetailedTooltipProps) {
  const [expanded, setExpanded] = useState(false);
  if (!active || !payload || payload.length === 0) return null;
  const year = Math.round(Number(label));
  const point = data.find((d) => d.year === year);
  if (!point) return null;

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-800 min-w-[240px]"
      style={{ pointerEvents: "auto" }}
    >
      <div className="font-medium text-gray-900 mb-1">
        Year {year}
        {point.year === 0 ? " (initial position)" : ""}
      </div>

      {/* Collapsed totals */}
      <div className="space-y-0.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 capitalize">
              <span
                className="block w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color ?? "#9ca3af" }}
              />
              <span>{labelForDataKey(entry.dataKey)}</span>
            </span>
            <span className="font-medium text-gray-900">
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="mt-1.5 w-full text-left text-xs font-medium text-blue-700 hover:text-blue-900 underline underline-offset-1"
        aria-expanded={expanded}
      >
        {expanded ? "Hide breakdown" : "Show breakdown"}
      </button>

      {/* Expanded attribution */}
      {expanded && (
        <div className="mt-2 pt-2 border-t space-y-2 text-xs">
          {/* Rent + Invest */}
          <div>
            <div className="font-medium text-gray-800">Rent + Invest</div>
            {point.year === 0 ? (
              <div className="mt-0.5">
                Starting investment parked in stocks:{" "}
                <span className="font-medium">
                  {formatCurrency(point.rentScenarioNW)}
                </span>
              </div>
            ) : (
              <>
                <div className="mt-0.5 flex justify-between">
                  <span>Change vs last year</span>
                  <span className={`font-medium ${deltaColorClass(point.rentScenarioChange)}`}>
                    {formatDelta(point.rentScenarioChange)}
                  </span>
                </div>
                {point.pensionGrowth > 0 && (
                  <div className="flex justify-between">
                    <span>Pension growth</span>
                    <span className={deltaColorClass(point.pensionGrowth)}>
                      {formatDelta(point.pensionGrowth)}
                    </span>
                  </div>
                )}
                <div className="text-gray-600">
                  {point.pensionGrowth > 0
                    ? "(remainder from stock growth + contributions)"
                    : "(entirely from stock growth + contributions)"}
                </div>

                {/* Net-worth composition */}
                <div className="mt-1.5 pt-1 border-t border-gray-100 space-y-0.5">
                  <div className="font-medium text-gray-700">Net worth:</div>
                  <div className="ml-3 flex justify-between">
                    <span>Stocks</span>
                    <span>{formatCurrency(point.rentStocks)}</span>
                  </div>
                  {point.pensionPot > 0 && (
                    <div className="ml-3 flex justify-between">
                      <span>Pension</span>
                      <span>{formatCurrency(point.pensionPot)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="mt-0.5 flex justify-between">
              <span>
                {point.year === 0 ? "Up-front cost" : "Outgoings this year"}
              </span>
              <span className="font-medium">
                {formatCurrency(point.rentOutgoings)}
              </span>
            </div>
            {/* Cost breakdown — only meaningful for ongoing years (year 0 has no
                rent; the up-front cost is a single lump sum). */}
            {point.year > 0 && (
              <div className="ml-3 space-y-0.5">
                <div className="flex justify-between">
                  <span>Annual budget</span>
                  <span>{formatCurrency(point.annualBudget)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rent</span>
                  <span>{formatCurrency(point.annualRent)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Investing (stocks)</span>
                  <span>{formatCurrency(point.annualRentStockInvestment)}</span>
                </div>
                {point.annualPension > 0 && (
                  <div className="flex justify-between">
                    <span>Pension</span>
                    <span>{formatCurrency(point.annualPension)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mortgage + Invest */}
          <div>
            <div className="font-medium text-gray-800">Mortgage + Invest</div>
            {point.year === 0 ? (
              <>
                <div className="mt-0.5 flex justify-between">
                  <span>Down payment (property equity)</span>
                  <span className="font-medium">
                    {formatCurrency(point.mortgageHomeEquity)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Property value</span>
                  <span className="font-medium">
                    {formatCurrency(point.currentPropertyValue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Stocks</span>
                  <span className="font-medium">
                    {formatCurrency(point.mortgageStocks)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="mt-0.5 flex justify-between">
                  <span>Change vs last year</span>
                  <span className={`font-medium ${deltaColorClass(point.mortgageScenarioChange)}`}>
                    {formatDelta(point.mortgageScenarioChange)}
                  </span>
                </div>
                <div className="ml-2 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Property appreciation</span>
                    <span className={deltaColorClass(point.mortgageAppreciation)}>
                      {formatDelta(point.mortgageAppreciation)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mortgage principal repaid</span>
                    <span className={deltaColorClass(point.mortgagePrincipalPaid)}>
                      {formatDelta(point.mortgagePrincipalPaid)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Interest paid</span>
                    <span>{formatCurrency(point.interestPaidThisYear)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Stock growth</span>
                    <span className={deltaColorClass(point.mortgageStocksChange)}>
                      {formatDelta(point.mortgageStocksChange)}
                    </span>
                  </div>
                  {point.pensionGrowth > 0 && (
                    <div className="flex justify-between">
                      <span>Pension growth</span>
                      <span className={deltaColorClass(point.pensionGrowth)}>
                        {formatDelta(point.pensionGrowth)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Net-worth composition */}
                <div className="mt-1.5 pt-1 border-t border-gray-100 space-y-0.5">
                  <div className="font-medium text-gray-700">Net worth:</div>
                  <div className="ml-3 flex justify-between">
                    <span>Home equity</span>
                    <span>{formatCurrency(point.mortgageHomeEquity)}</span>
                  </div>
                  <div className="ml-3 flex justify-between">
                    <span>Stocks</span>
                    <span>{formatCurrency(point.mortgageStocks)}</span>
                  </div>
                  {point.pensionPot > 0 && (
                    <div className="ml-3 flex justify-between">
                      <span>Pension</span>
                      <span>{formatCurrency(point.pensionPot)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="mt-0.5 flex justify-between">
              <span>
                {point.year === 0 ? "Up-front cost" : "Outgoings this year"}
              </span>
              <span className="font-medium">
                {formatCurrency(point.mortgageOutgoings)}
              </span>
            </div>
            {/* Cost breakdown — only meaningful for ongoing years (year 0 has no
                recurring mortgage payment; the up-front cost is a single lump sum). */}
            {point.year > 0 && (
              <div className="ml-3 space-y-0.5">
                <div className="flex justify-between">
                  <span>Mortgage payment</span>
                  <span>{formatCurrency(point.annualMortgagePayment)}</span>
                </div>
                {point.annualOverpay > 0 && (
                  <div className="flex justify-between">
                    <span>Overpay</span>
                    <span>{formatCurrency(point.annualOverpay)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Annual budget</span>
                  <span>{formatCurrency(point.annualBudget)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Maintenance</span>
                  <span>{formatCurrency(point.annualMaintenance)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Investing (stocks)</span>
                  <span>
                    {formatCurrency(point.annualMortgageStockInvestment)}
                  </span>
                </div>
                {point.annualPension > 0 && (
                  <div className="flex justify-between">
                    <span>Pension</span>
                    <span>{formatCurrency(point.annualPension)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between border-t pt-1">
            <span>Difference (Rent − Mortgage)</span>
            <span className="font-medium">
              {formatCurrency(point.difference)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A wide, horizontally-scrollable table that shows every computed figure for
 * each projection year — the numeric equivalent of the
 * {@link DetailedTooltip} breakdown. Columns are grouped into Net Worth
 * (per scenario), Year-over-Year Change, and Costs, mirroring the tooltip's
 * structure. "Summation" columns (scenario NW totals, outgoings totals) are
 * rendered bold so the component relationships are obvious.
 */
export function RentVsBuyResultsTable({
  data,
}: {
  data: RentVsBuyDetailedDataPoint[];
}) {
  // Columns whose value is a signed year-over-year change rather than an
  // absolute amount. Rendered with formatDelta (±) and shown as "—" at
  // year 0 where there is no prior year to compare against.
  const isChangeCol = (key: string) =>
    [
      "rentScenarioChange",
      "mortgageScenarioChange",
      "mortgageAppreciation",
      "mortgagePrincipalPaid",
      "mortgageStocksChange",
      "pensionGrowth",
    ].includes(key);

  // Tailwind class for a signed delta: green for positive, red for negative,
  // grey for zero. Makes the YoY movement columns scannable at a glance.
  const deltaClass = (value: number): string =>
    value > 0
      ? "text-green-700"
      : value < 0
        ? "text-red-700"
        : "text-gray-500";

  const cell = (p: RentVsBuyDetailedDataPoint, key: keyof RentVsBuyDetailedDataPoint) =>
    isChangeCol(key)
      ? p[key] === 0
        ? "—"
        : formatDelta(p[key] as number)
      : formatCurrency(p[key] as number);

  return (
    <div className="mt-6 bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Year-by-Year Breakdown
      </h2>
      <p className="text-xs text-gray-600 mb-4">
        Scroll horizontally for the full breakdown. Bold figures are totals
        (e.g. Rent NW = Stocks + Pension; Outgoings = Rent + Investing +
        Pension). Budget columns show the annual housing budget, which grows
        with the Budget Increase Rate.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-xs text-gray-900 whitespace-nowrap">
          <thead>
          {/* Group header row */}
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 z-20 bg-gray-100 px-3 py-1.5 text-left font-medium text-gray-900 shadow-[2px_0_4px_rgba(0,0,0,0.05)]
              "
            >
              Year
            </th>
            <th colSpan={3} className="bg-blue-50 px-3 py-1.5 text-left text-gray-900">
              Rent + Invest (NW)
            </th>
            <th colSpan={6} className="bg-green-50 px-3 py-1.5 text-left text-gray-900">
              Mortgage + Invest (NW)
            </th>
            <th rowSpan={2} className="bg-gray-100 px-3 py-1.5 text-gray-900">
              Difference
            </th>
            <th colSpan={7} className="bg-purple-50 px-3 py-1.5 text-left text-gray-900">
              Change (YoY)
            </th>
            <th colSpan={5} className="bg-orange-50 px-3 py-1.5 text-left text-gray-900">
              Rent Costs
            </th>
            <th colSpan={7} className="bg-teal-50 px-3 py-1.5 text-left text-gray-900">
              Mortgage Costs
            </th>
          </tr>
          {/* Detail header row */}
          <tr>
            <th className="bg-blue-50 px-3 py-1.5 text-left text-gray-900">NW</th>
            <th className="bg-blue-50 px-3 py-1.5 text-left text-gray-900">Stocks</th>
            <th className="bg-blue-50 px-3 py-1.5 text-left text-gray-900">Pension</th>
            <th className="bg-green-50 px-3 py-1.5 text-left text-gray-900">NW</th>
            <th className="bg-green-50 px-3 py-1.5 text-left text-gray-900">Property</th>
            <th className="bg-green-50 px-3 py-1.5 text-left text-gray-900">Balance</th>
            <th className="bg-green-50 px-3 py-1.5 text-left text-gray-900">Home Equity</th>
            <th className="bg-green-50 px-3 py-1.5 text-left text-gray-900">Stocks</th>
            <th className="bg-green-50 px-3 py-1.5 text-left text-gray-900">Pension</th>
            <th className="bg-purple-50 px-3 py-1.5 text-left text-gray-900">Rent Δ</th>
            <th className="bg-purple-50 px-3 py-1.5 text-left text-gray-900">Mtg Δ</th>
            <th className="bg-purple-50 px-3 py-1.5 text-left text-gray-900">Appreciation</th>
            <th className="bg-purple-50 px-3 py-1.5 text-left text-gray-900">Principal</th>
            <th className="bg-purple-50 px-3 py-1.5 text-left text-gray-900">Interest</th>
            <th className="bg-purple-50 px-3 py-1.5 text-left text-gray-900">Stock Δ</th>
            <th className="bg-purple-50 px-3 py-1.5 text-left text-gray-900">Pens Δ</th>
            <th className="bg-orange-50 px-3 py-1.5 text-left text-gray-900">Budget</th>
            <th className="bg-orange-50 px-3 py-1.5 text-left text-gray-900">Rent</th>
            <th className="bg-orange-50 px-3 py-1.5 text-left text-gray-900">Invest</th>
            <th className="bg-orange-50 px-3 py-1.5 text-left text-gray-900">Pension</th>
            <th className="bg-orange-50 px-3 py-1.5 text-left text-gray-900">Outgoings</th>
            <th className="bg-teal-50 px-3 py-1.5 text-left text-gray-900">Budget</th>
            <th className="bg-teal-50 px-3 py-1.5 text-left text-gray-900">Payment</th>
            <th className="bg-teal-50 px-3 py-1.5 text-left text-gray-900">Overpay</th>
            <th className="bg-teal-50 px-3 py-1.5 text-left text-gray-900">Maintenance</th>
            <th className="bg-teal-50 px-3 py-1.5 text-left text-gray-900">Invest</th>
            <th className="bg-teal-50 px-3 py-1.5 text-left text-gray-900">Pension</th>
            <th className="bg-teal-50 px-3 py-1.5 text-left text-gray-900">Outgoings</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((p) => (
            <tr key={p.year} className={p.year % 2 === 0 ? "" : "bg-gray-50"}>
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-900">
                {p.year}
              </td>
              {/* Rent + Invest NW */}
              <td className="px-3 py-1.5 font-medium text-gray-900">{cell(p, "rentScenarioNW")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "rentStocks")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "pensionPot")}</td>
              {/* Mortgage + Invest NW */}
              <td className="px-3 py-1.5 font-medium text-gray-900">{cell(p, "mortgageScenarioNW")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "currentPropertyValue")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "currentMortgageBalance")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "mortgageHomeEquity")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "mortgageStocks")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "pensionPot")}</td>
              {/* Difference */}
              <td
                className={`px-3 py-1.5 font-medium ${p.difference >= 0 ? "text-green-700" : "text-red-700"}`}
              >
                {cell(p, "difference")}
              </td>
              {/* Change (YoY) — colour-coded: green = positive, red = negative */}
              <td className={`px-3 py-1.5 ${deltaClass(p.rentScenarioChange)}`}>{cell(p, "rentScenarioChange")}</td>
              <td className={`px-3 py-1.5 ${deltaClass(p.mortgageScenarioChange)}`}>{cell(p, "mortgageScenarioChange")}</td>
              <td className={`px-3 py-1.5 ${deltaClass(p.mortgageAppreciation)}`}>{cell(p, "mortgageAppreciation")}</td>
              <td className={`px-3 py-1.5 ${deltaClass(p.mortgagePrincipalPaid)}`}>{cell(p, "mortgagePrincipalPaid")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "interestPaidThisYear")}</td>
              <td className={`px-3 py-1.5 ${deltaClass(p.mortgageStocksChange)}`}>{cell(p, "mortgageStocksChange")}</td>
              <td className={`px-3 py-1.5 ${deltaClass(p.pensionGrowth)}`}>{cell(p, "pensionGrowth")}</td>
              {/* Rent Costs */}
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualBudget")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualRent")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualRentStockInvestment")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualPension")}</td>
              <td className="px-3 py-1.5 font-medium text-gray-900">{cell(p, "rentOutgoings")}</td>
              {/* Mortgage Costs */}
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualBudget")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualMortgagePayment")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualOverpay")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualMaintenance")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualMortgageStockInvestment")}</td>
              <td className="px-3 py-1.5 text-gray-900">{cell(p, "annualPension")}</td>
              <td className="px-3 py-1.5 font-medium text-gray-900">{cell(p, "mortgageOutgoings")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

const currencyTick = (value: number | string) =>
  formatCurrency(Number(value));
const yearTick = (value: number | string) => String(Math.round(Number(value)));

/**
 * The simulator inputs that are persisted to the URL so a configuration can be
 * shared/bookmarked and restored on reload.
 */
const RENT_VS_BUY_PARAMS = [
  "startingInvestment",
  "propertyValue",
  "monthlyHousingBudget",
  "monthlyRent",
  "rentIncreaseRate",
  "housingBudgetIncreaseRate",
  "mortgageRate",
  "termYears",
  "propertyAppreciationRate",
  "stockReturnRate",
  "monthlyMaintenanceCost",
  "monthlyPension",
  "mortgageOverpayRate",
] as const;

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

export default function RentVsBuyCalculator() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // ── Inputs ───────────────────────────────────────────
  const [startingInvestment, setStartingInvestment] = useState(() =>
    readParam(searchParams, "startingInvestment", 45000),
  );
  const [propertyValue, setPropertyValue] = useState(() =>
    readParam(searchParams, "propertyValue", 450000),
  );
  const [monthlyHousingBudget, setMonthlyHousingBudget] = useState(() =>
    readParam(searchParams, "monthlyHousingBudget", 2500),
  );
  const [monthlyRent, setMonthlyRent] = useState(() => {
    // Default to a "fair comparison" rent: mortgage payment + maintenance on
    // the default inputs, so the initial chart matches the equal-cost baseline.
    const defaultRent = monthlyPaymentForLoan(450000 - 45000, 3, 35) + 300;
    return readParam(searchParams, "monthlyRent", defaultRent);
  });
  // Annual rent escalation (%). Rent grows as monthlyRent * (1 + r/100)^year.
  // 0 keeps rent constant (the historical default / equal-cost baseline).
  const [rentIncreaseRate, setRentIncreaseRate] = useState(() =>
    readParam(searchParams, "rentIncreaseRate", 2),
  );
  // Annual increase rate (%) applied to the total monthly housing budget.
  // 0 keeps the budget constant; e.g. 3 means the budget rises 3% per year
  // (wage growth), increasing investment power in both scenarios.
  const [housingBudgetIncreaseRate, setHousingBudgetIncreaseRate] = useState(
    () => readParam(searchParams, "housingBudgetIncreaseRate", 0),
  );
  const [mortgageRate, setMortgageRate] = useState(() =>
    readParam(searchParams, "mortgageRate", 3),
  );
  // The mortgage term and the projection period are locked to the same value —
  // the mortgage is amortised over exactly the comparison horizon. A single
  // source of truth guarantees they can never diverge.
  const [termYears, setTermYears] = useState(() =>
    readParam(searchParams, "termYears", 35, 1),
  );
  const [propertyAppreciationRate, setPropertyAppreciationRate] = useState(
    () => readParam(searchParams, "propertyAppreciationRate", 2),
  );
  const [stockReturnRate, setStockReturnRate] = useState(() =>
    readParam(searchParams, "stockReturnRate", 10),
  );
  const [monthlyMaintenanceCost, setMonthlyMaintenanceCost] = useState(() =>
    readParam(searchParams, "monthlyMaintenanceCost", 300),
  );
  const [monthlyPension, setMonthlyPension] = useState(() =>
    readParam(searchParams, "monthlyPension", 0),
  );
  // `pensionGross` is a boolean, so it's serialised as "1"/"0" in the URL
  // (not part of the numeric RENT_VS_BUY_PARAMS loop below).
  const [pensionGross, setPensionGross] = useState(() =>
    searchParams?.get("pensionGross") === "1",
  );
  // Mortgage overpay percentage (of the initial loan or remaining balance).
  // `mortgageOverpayMode` is stored as "initial"/"remaining" in the URL
  // (not part of the numeric RENT_VS_BUY_PARAMS loop below).
  const [mortgageOverpayRate, setMortgageOverpayRate] = useState(() =>
    readParam(searchParams, "mortgageOverpayRate", 0),
  );
  const [mortgageOverpayMode, setMortgageOverpayMode] = useState<
    "initial" | "remaining"
  >(() => {
    const raw = searchParams?.get("mortgageOverpayMode");
    return raw === "initial" || raw === "remaining" ? raw : "initial";
  });

  // Keep the URL in sync with the current inputs so the configuration can be
  // shared or bookmarked and restored on reload. `history.replaceState` updates
  // the address bar *without* triggering a Next.js client-side navigation, so
  // the page does not scroll back to the top (or re-run routing) on every
  // keystroke / slider drag. It replaces the current history entry (no history
  // pollution), matching the previous `router.replace` semantics.
  useEffect(() => {
    const values: Record<string, number> = {
      startingInvestment,
      propertyValue,
      monthlyHousingBudget,
      monthlyRent,
      rentIncreaseRate,
      housingBudgetIncreaseRate,
      mortgageRate,
      termYears,
      propertyAppreciationRate,
      stockReturnRate,
      monthlyMaintenanceCost,
      monthlyPension,
      mortgageOverpayRate,
    };
    const params = new URLSearchParams();
    for (const key of RENT_VS_BUY_PARAMS) {
      params.set(key, toParam(values[key]));
    }
    params.set("pensionGross", pensionGross ? "1" : "0");
    params.set("mortgageOverpayMode", mortgageOverpayMode);
    window.history.replaceState(
      null,
      "",
      `${pathname}?${params.toString()}`,
    );
  }, [
    startingInvestment,
    propertyValue,
    monthlyHousingBudget,
    monthlyRent,
    rentIncreaseRate,
    housingBudgetIncreaseRate,
    mortgageRate,
    termYears,
    propertyAppreciationRate,
    stockReturnRate,
    monthlyMaintenanceCost,
    monthlyPension,
    mortgageOverpayRate,
    mortgageOverpayMode,
    pensionGross,
    pathname,
  ]);

  const inputs: RentVsBuyInputs = useMemo(
    () => ({
      startingInvestment,
      propertyValue,
      monthlyHousingBudget,
      monthlyRent,
      rentIncreaseRate,
      housingBudgetIncreaseRate,
      mortgageRate,
      // mortgageTermYears and projectionYears are locked together via termYears
      mortgageTermYears: termYears,
      propertyAppreciationRate,
      stockReturnRate,
      monthlyMaintenanceCost,
      monthlyPension,
      pensionGross,
      mortgageOverpayRate,
      mortgageOverpayMode,
      projectionYears: termYears,
    }),
    [
      startingInvestment,
      propertyValue,
      monthlyHousingBudget,
      monthlyRent,
      rentIncreaseRate,
      housingBudgetIncreaseRate,
      mortgageRate,
      termYears,
      propertyAppreciationRate,
      stockReturnRate,
      monthlyMaintenanceCost,
      monthlyPension,
      pensionGross,
      mortgageOverpayRate,
      mortgageOverpayMode,
    ],
  );

  // ── Derived values & chart data ──────────────────────
  const derived = useMemo(() => deriveValues(inputs), [inputs]);
  const data: RentVsBuyDetailedDataPoint[] = useMemo(
    () => buildDetailedComparisonData(inputs),
    [inputs],
  );

  const final = data[data.length - 1];
  const maxNW = Math.max(
    ...data.map((d) => d.rentScenarioNW),
    ...data.map((d) => d.mortgageScenarioNW),
    1,
  );

  const crossover = findCrossoverYear(data);
  const rentWins = final.rentScenarioNW > final.mortgageScenarioNW;
  const breakeven = useMemo(() => breakevenRent(inputs, derived), [inputs, derived]);

  // ── Render ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">
              Rent vs Buy Comparison
            </h1>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              ← Back to Dashboard
            </Link>
          </div>
          <p className="text-sm text-gray-500 mt-2 max-w-3xl">
            Compare your net worth if you <strong>rent and invest</strong>
            vs. <strong>buy with a mortgage and invest the rest</strong>. Both
            scenarios start with the same investment and share the same total
            monthly amount available for housing and investing. Enter your
            actual monthly rent to see how it changes the comparison — the
            <strong> breakeven rent</strong> (in the summary) is the maximum
            rent at which renting beats buying over the projection period.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Controls ── */}
          <div className="lg:col-span-1 space-y-6">
            {/* Input card */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Inputs</h2>

              {/* Starting Investment */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Starting Investment (£)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={startingInvestment}
                  onChange={(e) =>
                    setStartingInvestment(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  className={INPUT_CLASSES}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Down payment (mortgage) or stocker investment (rent)
                </p>
              </div>

              {/* Property Value */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Property Value (£)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={propertyValue}
                  onChange={(e) =>
                    setPropertyValue(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  className={INPUT_CLASSES}
                />
              </div>

              {/* Total Monthly (housing + investing) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Total Monthly (£)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={monthlyHousingBudget}
                  onChange={(e) =>
                    setMonthlyHousingBudget(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  className={INPUT_CLASSES}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Total monthly money available for housing and investing
                </p>
              </div>

              {/* Monthly Rent */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Monthly Rent (£)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={monthlyRent}
                  onChange={(e) =>
                    setMonthlyRent(Math.max(0, Number(e.target.value) || 0))
                  }
                  className={INPUT_CLASSES}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your actual rent. If your rent is below the breakeven rent
                  shown in the summary, renting is more profitable.
                </p>
              </div>

              {/* Rent Increase Rate */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Rent Increase Rate (%) per year{" "}
                  <span className="text-lg font-bold">{rentIncreaseRate}</span>
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={rentIncreaseRate}
                    onChange={(e) =>
                      setRentIncreaseRate(
                        Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                      )
                    }
                    className={INPUT_CLASSES}
                  />
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={rentIncreaseRate}
                    onChange={(e) => setRentIncreaseRate(Number(e.target.value))}
                    className={SLIDER_CLASSES}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  How much your rent grows each year (like inflation). Higher
                  escalation shrinks the rent + invest scenario.
                </p>
              </div>

              {/* Total Monthly Budget Increase Rate */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Budget Increase Rate (%) per year{" "}
                  <span className="text-lg font-bold">
                    {housingBudgetIncreaseRate}
                  </span>
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={housingBudgetIncreaseRate}
                    onChange={(e) =>
                      setHousingBudgetIncreaseRate(
                        Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                      )
                    }
                    className={INPUT_CLASSES}
                  />
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={housingBudgetIncreaseRate}
                    onChange={(e) =>
                      setHousingBudgetIncreaseRate(Number(e.target.value))
                    }
                    className={SLIDER_CLASSES}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  How much your total monthly amount grows each year (e.g. wage
                  growth). A higher rate increases your stock investment power
                  in both scenarios over time.
                </p>
              </div>

              {/* Mortgage Rate */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mortgage Interest Rate (%)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    value={mortgageRate}
                    onChange={(e) =>
                      setMortgageRate(
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
                    value={mortgageRate}
                    onChange={(e) => setMortgageRate(Number(e.target.value))}
                    className={SLIDER_CLASSES}
                  />
                </div>
              </div>

              {/* Mortgage Overpay */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mortgage Overpay (%)
                  <span className="text-lg font-bold"> {mortgageOverpayRate}</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Extra amount paid towards the mortgage each month, as a
                  percentage of your loan. Overpaying reduces the loan faster
                  and builds equity sooner.
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={mortgageOverpayRate}
                    onChange={(e) =>
                      setMortgageOverpayRate(
                        Math.max(
                          0,
                          Math.min(100, Number(e.target.value) || 0),
                        ),
                      )
                    }
                    className={INPUT_CLASSES}
                  />
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.5"
                    value={mortgageOverpayRate}
                    onChange={(e) => setMortgageOverpayRate(Number(e.target.value))}
                    className={SLIDER_CLASSES}
                  />
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs font-medium text-gray-700">
                    Of:
                  </span>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name="mortgageOverpayMode"
                      checked={mortgageOverpayMode === "initial"}
                      onChange={() => setMortgageOverpayMode("initial")}
                      className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Initial loan</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name="mortgageOverpayMode"
                      checked={mortgageOverpayMode === "remaining"}
                      onChange={() => setMortgageOverpayMode("remaining")}
                      className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Remaining balance</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {mortgageOverpayMode === "initial"
                    ? "Overpay is a fixed amount (a percentage of the original loan)."
                    : "Overpay shrinks each year as the loan balance decreases."}
                </p>
              </div>

              {/* Mortgage Term (locked to Projection Period) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mortgage Term (years){" "}
                  <span className="text-lg font-bold">{termYears}</span>
                </label>
                <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  {termYears} years
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Locked to the Projection Period — the mortgage is amortised
                  over the same horizon as the comparison. Adjust the
                  “Projection Period” slider below.
                </p>
              </div>

              {/* Property Appreciation */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Property Appreciation Rate (%)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    value={propertyAppreciationRate}
                    onChange={(e) =>
                      setPropertyAppreciationRate(
                        Math.max(
                          0,
                          Math.min(50, Number(e.target.value) || 0),
                        ),
                      )
                    }
                    className={INPUT_CLASSES}
                  />
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.1"
                    value={propertyAppreciationRate}
                    onChange={(e) =>
                      setPropertyAppreciationRate(Number(e.target.value))
                    }
                    className={SLIDER_CLASSES}
                  />
                </div>
              </div>

              {/* Stock Market Return */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Stock Market Return Rate (%)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    value={stockReturnRate}
                    onChange={(e) =>
                      setStockReturnRate(
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
                    value={stockReturnRate}
                    onChange={(e) => setStockReturnRate(Number(e.target.value))}
                    className={SLIDER_CLASSES}
                  />
                </div>
              </div>

              {/* Monthly Maintenance */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Monthly Maintenance Cost (£)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={monthlyMaintenanceCost}
                  onChange={(e) =>
                    setMonthlyMaintenanceCost(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  className={INPUT_CLASSES}
                />
              </div>

              {/* Monthly Pension */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Pension (£/month)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={monthlyPension}
                    onChange={(e) =>
                      setMonthlyPension(Math.max(0, Number(e.target.value) || 0))
                    }
                    className={INPUT_CLASSES}
                  />
                  <input
                    type="range"
                    min="0"
                    max="5000"
                    step="50"
                    value={monthlyPension}
                    onChange={(e) => setMonthlyPension(Number(e.target.value))}
                    className={SLIDER_CLASSES}
                  />
                </div>

                {/* add tax recompensation checkbox */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    id="pensionGross"
                    type="checkbox"
                    checked={pensionGross}
                    onChange={(e) => setPensionGross(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600
                      focus:ring-blue-500"
                  />
                  <label
                    htmlFor="pensionGross"
                    className="text-xs font-medium text-gray-700"
                  >
                    add tax recompensation
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {pensionGross
                    ? `add tax recompensation is on: £${monthlyPension} is paid out of pocket, ×5/3 = ${formatCurrency(
                        derived.pensionInvested,
                      )} actually goes into the pension (growing at the stock return rate of ${derived.pensionRate}%).`
                    : `Your £${monthlyPension} monthly pension is invested in the pension (growing at the stock return rate of ${derived.pensionRate}%).`}
                </p>
              </div>

              {/* Projection Period (also sets the Mortgage Term) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Projection Period (years){" "}
                  <span className="text-lg font-bold">{termYears}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={termYears}
                  onChange={(e) => setTermYears(Number(e.target.value))}
                  className={SLIDER_CLASSES}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>25</span>
                  <span>50</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  This also sets the Mortgage Term, so both horizons always
                  match.
                </p>
              </div>
            </div>

            {/* Summary card */}
            <div className="bg-white rounded-lg shadow p-6 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Summary (Year {termYears})
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Mortgage Payment/Month:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(derived.effectiveMonthlyMortgagePayment)}
                    {derived.monthlyOverpay > 0 && (
                      <span className="text-xs text-gray-500">
                        {" "}
                        (+{formatCurrency(derived.monthlyOverpay)} overpay)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Monthly Rent (£):</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(derived.monthlyRent)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Stock Investment/Month (Rent):
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(derived.monthlyStockInvestment)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Stock Investment/Month (Mortgage):
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(derived.monthlyMortgageStockInvestment)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pension (£/month):</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(derived.pensionInvested)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Rent + Invest NW:</span>
                  <span className="font-medium text-blue-700">
                    {formatCurrency(final.rentScenarioNW)}
                  </span>
                </div>
                {derived.monthlyStockInvestment * 12 >
                  STOCK_EXPOSURE_WARNING_THRESHOLD && (
                  <p className="text-xs text-red-700 bg-red-50 p-2 rounded">
                    ⚠ Over £20,000 is invested in stocks per year in this
                    scenario — this exceeds the annual tax-free ISA allowance.
                  </p>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Mortgage + Invest NW:</span>
                  <span className="font-medium text-green-700">
                    {formatCurrency(final.mortgageScenarioNW)}
                  </span>
                </div>
                {derived.monthlyMortgageStockInvestment * 12 >
                STOCK_EXPOSURE_WARNING_THRESHOLD && (
                  <p className="text-xs text-red-700 bg-red-50 p-2 rounded">
                    ⚠ Over £20,000 is invested in stocks per year in this
                    scenario — this exceeds the annual tax-free ISA allowance.
                  </p>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-600">
                    Difference (Rent − Mortgage):
                  </span>
                  <span
                    className={`font-bold ${rentWins ? "text-green-700" : "text-red-700"}`}
                  >
                    {formatCurrency(final.difference)}
                  </span>
                </div>

                {/* Breakeven rent guidance */}
                <div className="pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-gray-600 font-medium">
                      Breakeven Rent:
                    </span>
                    <span className="font-bold text-purple-700">
                      {typeof breakeven === "number" &&
                      Number.isFinite(breakeven)
                        ? formatCurrency(breakeven)
                        : breakeven === Infinity
                          ? "∞"
                          : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {typeof breakeven === "number" &&
                    Number.isFinite(breakeven)
                      ? rentWins
                        ? `Renting wins — your rent (£${Math.round(
                            derived.monthlyRent,
                          )}) is below the breakeven.`
                        : `Buying wins — raise your rent above £${Math.round(
                            breakeven,
                          )} to flip it.`
                      : breakeven === Infinity
                        ? "Renting wins at any rent within your total monthly budget."
                        : "Buying wins even if rent were £0 — try a higher stock return or longer horizon."}
                  </p>
                </div>

                {!derived.affordable && (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                    ⚠ Your total monthly amount is below your rent
                    {derived.pensionInvested > 0 ? " (+ pension)" : ""}, so
                    nothing is left to invest.
                  </p>
                )}
                {crossover !== null && (
                  <p className="text-xs text-gray-700">
                    Crossover at ~year {crossover.toFixed(1)} —{" "}
                    {crossover < termYears / 2
                      ? "Mortgage catches up to Rent"
                      : "Rent catches up to Mortgage"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Chart ── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Net Worth Comparison Over Time
              </h2>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data}
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
                      tickFormatter={yearTick}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      domain={[0, maxNW * 1.1]}
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      tickFormatter={currencyTick}
                      axisLine={false}
                      tickLine={false}
                      width={80}
                    />
                    <Tooltip
                      // Pin the tooltip to a fixed spot so it doesn't chase the
                      // cursor — a cursor-following tooltip can never be clicked.
                      // The content still updates as you hover different years;
                      // only the placement is frozen.
                      position={{ x: 100, y: 16 }}
                      wrapperStyle={{ zIndex: 50 }}
                      content={
                        <DetailedTooltip data={data} />
                      }
                    />
                    <Legend />

                    {/* Rent + Invest line */}
                    <Line
                      type="monotone"
                      dataKey="rentScenarioNW"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#3b82f6" }}
                      activeDot={{ r: 5, fill: "#2563eb" }}
                      name="Rent + Invest"
                    />

                    {/* Mortgage + Invest line */}
                    <Line
                      type="monotone"
                      dataKey="mortgageScenarioNW"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#10b981" }}
                      activeDot={{ r: 5, fill: "#059669" }}
                      name="Mortgage + Invest"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-8 mt-4 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full" />
                  <span>Rent + Invest</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span>Mortgage + Invest</span>
                </div>
              </div>

              {/* Winner callout */}
              <div
                className={`mt-4 p-4 rounded-lg text-center ${
                  rentWins
                    ? "bg-blue-50 border border-blue-200"
                    : "bg-green-50 border border-green-200"
                }`}
              >
                <p className="text-sm font-medium">
                  {rentWins
                    ? "Rent + Invest wins by "
                    : "Mortgage + Invest wins by "}
                  <span className="font-bold">
                    {formatCurrency(Math.abs(final.difference))}
                  </span>
                  {crossover !== null && crossover < termYears && (
                    <span className="block text-xs text-gray-500 mt-1">
                      crossover at ~year {crossover.toFixed(1)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Results table (below the chart, right column) */}
            <RentVsBuyResultsTable data={data} />
          </div>
        </div>
      </main>
    </div>
  );
}
