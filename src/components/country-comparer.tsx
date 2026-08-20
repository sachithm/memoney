"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import PageHeader from "@/components/ui/page-header";
import { INPUT_CLASSES } from "@/lib/form-classes";

// ──────────────────────────────────────────────────────────────
// Model
// ──────────────────────────────────────────────────────────────

/** The five variables compared across the two countries. */
export const VARIABLE_KEYS = [
  "income",
  "taxRate",
  "housing",
  "living",
  "recreational",
] as const;

export type VariableKey = (typeof VARIABLE_KEYS)[number];

/** Country-specific input variables.
 *
 *  `income` and the three cost figures are monthly amounts (£); `taxRate` is the
 *  cumulative tax rate as a percentage of gross income (e.g. 30 means 30%).
 */
export interface CountryVars {
  income: number;
  taxRate: number;
  housing: number;
  living: number;
  recreational: number;
}

/** Default values for a freshly added country. */
export const DEFAULT_COUNTRY_VARS: CountryVars = {
  income: 5_000,
  taxRate: 30,
  housing: 1_500,
  living: 600,
  recreational: 300,
};

/** Human-readable labels for the input form. */
const VARIABLE_LABELS: Record<VariableKey, string> = {
  income: "Monthly Income (£)",
  taxRate: "Cumulative Tax Rate (%)",
  housing: "Monthly Housing Cost (£)",
  living: "Monthly Living Costs (£)",
  recreational: "Monthly Recreational Costs (£)",
};

/** The unit each variable is entered in. */
const VARIABLE_UNITS: Record<VariableKey, "currency" | "percent"> = {
  income: "currency",
  taxRate: "percent",
  housing: "currency",
  living: "currency",
  recreational: "currency",
};

/** A value expressed in two time periods. */
interface Periodic {
  monthly: number;
  yearly: number;
}

/** Derived, formatted comparison figures for one country. */
export interface CountryComparison {
  income: Periodic;
  taxRate: number; // percent
  tax: Periodic;
  housing: Periodic;
  living: Periodic;
  recreational: Periodic;
  totalCosts: Periodic;
  saved: Periodic;
}

const MONTHS_PER_YEAR = 12;

/** Compute the comparison figures for a single country.
 *
 *  monthly tax   = monthly income × (taxRate / 100)
 *  monthly saved = monthly income − housing − living − recreational − monthly tax
 *  yearly figures = 12 × monthly
 */
export function deriveComparison(values: CountryVars): CountryComparison {
  const monthlyIncome = values.income;
  const monthlyTax = monthlyIncome * (values.taxRate / 100);
  const monthlyHousing = values.housing;
  const monthlyLiving = values.living;
  const monthlyRecreational = values.recreational;
  const monthlyCosts =
    monthlyHousing + monthlyLiving + monthlyRecreational + monthlyTax;
  const monthlySaved = monthlyIncome - monthlyCosts;

  return {
    income: {
      monthly: monthlyIncome,
      yearly: monthlyIncome * MONTHS_PER_YEAR,
    },
    taxRate: values.taxRate,
    tax: { monthly: monthlyTax, yearly: monthlyTax * MONTHS_PER_YEAR },
    housing: {
      monthly: monthlyHousing,
      yearly: monthlyHousing * MONTHS_PER_YEAR,
    },
    living: {
      monthly: monthlyLiving,
      yearly: monthlyLiving * MONTHS_PER_YEAR,
    },
    recreational: {
      monthly: monthlyRecreational,
      yearly: monthlyRecreational * MONTHS_PER_YEAR,
    },
    totalCosts: { monthly: monthlyCosts, yearly: monthlyCosts * MONTHS_PER_YEAR },
    saved: { monthly: monthlySaved, yearly: monthlySaved * MONTHS_PER_YEAR },
  };
}

// ──────────────────────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────────────────────

/** Format a percentage value (already 0–100) as e.g. "30.0%". */
const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

/** Format a signed currency difference: "+£1,234.00" / "-£1,234.00" / "—". */
const formatSignedCurrency = (value: number): string =>
  value === 0 ? "—" : `${value > 0 ? "+" : ""}${formatCurrency(value)}`;

/** Format a signed percentage-point difference, e.g. "+5.0 pp" / "-2.0 pp". */
const formatSignedPercentPoints = (value: number): string => {
  if (value === 0) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`;
};

/** Tailwind colour class for a signed delta, given which direction is
 *  favourable for Country 2. */
function deltaClass(value: number, higherIsBetter: boolean): string {
  if (value === 0) return "text-gray-500";
  const favourable = higherIsBetter ? value > 0 : value < 0;
  return favourable ? "text-green-700" : "text-red-700";
}

// ──────────────────────────────────────────────────────────────
// URL persistence helpers
// ──────────────────────────────────────────────────────────────

/** Round to 2 decimals so the URL stays compact and human-readable. */
const toParam = (value: number): string =>
  String(Math.round(value * 100) / 100);

/** Read a number from `searchParams`, falling back to `fallback` (clamped to `min`). */
function readParam(
  searchParams: { get(name: string): string | null } | null,
  key: string,
  fallback: number,
  min = 0,
): number {
  const raw = searchParams?.get(key);
  if (raw == null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, value) : fallback;
}

/** Read a CountryVars from the URL, optionally with a `2` suffix. */
function readVars(
  searchParams: { get(name: string): string | null } | null,
  suffix: string,
): CountryVars {
  const p = (key: string) => `${key}${suffix}`;
  return {
    income: readParam(searchParams, p("income"), DEFAULT_COUNTRY_VARS.income),
    taxRate: readParam(
      searchParams,
      p("taxRate"),
      DEFAULT_COUNTRY_VARS.taxRate,
    ),
    housing: readParam(searchParams, p("housing"), DEFAULT_COUNTRY_VARS.housing),
    living: readParam(
      searchParams,
      p("living"),
      DEFAULT_COUNTRY_VARS.living,
    ),
    recreational: readParam(
      searchParams,
      p("recreational"),
      DEFAULT_COUNTRY_VARS.recreational,
    ),
  };
}

/** Read Country 2 overrides. Only fields with an explicit `?<key>2=` param are
 *  considered overridden (i.e. unlinked from Country 1); the rest follow Country
 *  1 automatically. */
function readOverrides(
  searchParams: { get(name: string): string | null } | null,
  country1: CountryVars,
): Partial<CountryVars> {
  const overrides: Partial<CountryVars> = {};
  for (const key of VARIABLE_KEYS) {
    const raw = searchParams?.get(`${key}2`);
    if (raw == null) continue;
    const value = Number(raw);
    overrides[key] = Number.isFinite(value) ? Math.max(0, value) : country1[key];
  }
  return overrides;
}

/** Write a country's variables to `params`. When `suffix` is "2" these become
 *  the Country 2 *overrides* — only written for fields the user has explicitly
 *  set (the presence of a `<key>2` param is what marks a field as overridden). */
function writeCountry(
  params: URLSearchParams,
  values: CountryVars,
  suffix: string,
): void {
  for (const key of VARIABLE_KEYS) {
    params.set(`${key}${suffix}`, toParam(values[key]));
  }
}

// ──────────────────────────────────────────────────────────────
// Reusable input
// ──────────────────────────────────────────────────────────────

interface CountryInputProps {
  label: string;
  id: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  unit: "currency" | "percent";
}

/** A labelled numeric input shared by both countries. */
function CountryInput({
  label,
  id,
  value,
  onChange,
  step = "0.01",
  unit,
}: CountryInputProps) {
  // Percentages use 0.1 steps; currency amounts use 0.01 so pence are possible.
  const resolvedStep = step ?? (unit === "percent" ? "0.1" : "0.01");
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-gray-800"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        min="0"
        step={resolvedStep}
        value={value || ""}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={INPUT_CLASSES}
      />
    </div>
  );
}

interface Country2InputProps extends CountryInputProps {
  /** Whether the field is currently linked to Country 1. */
  linked: boolean;
  /** Toggle the link state for this field. */
  onToggleLink: () => void;
}

/** Country 2 input with a per-field link toggle.
 *
 *  A linked field mirrors Country 1; editing it (or clicking the chain)
 *  overrides it for Country 2 — the two countries are then kept separate for
 *  that variable. Clicking the chain again re-links the field to Country 1. */
function Country2Input({
  linked,
  onToggleLink,
  ...rest
}: Country2InputProps) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={rest.id}
        className="block text-xs font-medium text-gray-800"
      >
        {rest.label}
      </label>
      <div className="flex items-end gap-2">
        <input
          id={rest.id}
          type="number"
          min="0"
          step={rest.step ?? (rest.unit === "percent" ? "0.1" : "0.01")}
          value={rest.value || ""}
          onChange={(e) =>
            rest.onChange(Math.max(0, Number(e.target.value) || 0))
          }
          className={INPUT_CLASSES}
        />
        <button
          type="button"
          onClick={onToggleLink}
          aria-label={
            linked
              ? `Unlink "${rest.label}" from Country 1`
              : `Re-link "${rest.label}" to Country 1`
          }
          title={
            linked
              ? "Linked to Country 1 — edit to override"
              : "Overridden — independent of Country 1"
          }
          className={
            linked
              ? "shrink-0 px-2.5 py-2 text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
              : "shrink-0 px-2.5 py-2 text-gray-500 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition"
          }
        >
          {linked ? "🔗" : "🔓"}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {linked
          ? "Linked to Country 1 — editing overrides this field"
          : "Overridden — set independently"}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Comparison table
// ──────────────────────────────────────────────────────────────

/** Currency rows in the comparison table (Month + Year per country). */
const CURRENCY_ROWS: {
  key: "income" | "housing" | "living" | "recreational" | "saved";
  label: string;
  higherIsBetter: boolean;
}[] = [
  { key: "income", label: "Income", higherIsBetter: true },
  { key: "housing", label: "Housing Cost", higherIsBetter: false },
  { key: "living", label: "Living Costs", higherIsBetter: false },
  { key: "recreational", label: "Recreational Costs", higherIsBetter: false },
  { key: "saved", label: "Monthly Saved", higherIsBetter: true },
];

interface ComparisonTableProps {
  comp1: CountryComparison;
  comp2: CountryComparison;
  c1Name: string;
  c2Name: string;
}

/** Side-by-side comparison of the two countries, with monthly and yearly
 *  values for every currency row and a Difference column. The "Cumulative Tax"
 *  row shows both the rate and the resulting tax amount. */
function ComparisonTable({
  comp1,
  comp2,
  c1Name,
  c2Name,
}: ComparisonTableProps) {
  const savedDiff = comp2.saved.monthly - comp1.saved.monthly;

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Cost of Living Comparison
      </h2>
      <p className="text-xs text-gray-600 mb-4">
        Monthly and yearly figures. <strong>Difference</strong> is Country 2 −
        Country 1 (green favours Country 2).
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap">
          <thead>
            <tr>
              <th className="sticky left-0 bg-gray-50 px-4 py-2.5 text-left font-medium text-gray-700">
                Metric
              </th>
              <th
                colSpan={2}
                className="bg-blue-50 px-4 py-2.5 text-center font-medium text-gray-700"
              >
                Country 1
              </th>
              <th
                colSpan={2}
                className="bg-green-50 px-4 py-2.5 text-center font-medium text-gray-700"
              >
                Country 2
              </th>
              <th className="bg-gray-50 px-4 py-2.5 text-center font-medium text-gray-700">
                Difference
              </th>
            </tr>
            <tr>
              <th className="sticky left-0 bg-gray-100 px-4 py-2 text-left font-medium text-gray-700">
                Metric
              </th>
              <th className="bg-blue-50 px-4 py-2 text-right font-medium text-gray-700">
                Monthly
              </th>
              <th className="bg-blue-50 px-4 py-2 text-right font-medium text-gray-700">
                Yearly
              </th>
              <th className="bg-green-50 px-4 py-2 text-right font-medium text-gray-700">
                Monthly
              </th>
              <th className="bg-green-50 px-4 py-2 text-right font-medium text-gray-700">
                Yearly
              </th>
              <th className="bg-gray-100 px-4 py-2 text-right font-medium text-gray-700">
                C2 − C1
              </th>
            </tr>
          </thead>

          <tbody className="bg-white divide-y divide-gray-200">
            {CURRENCY_ROWS.map((row) => {
              const v1 = comp1[row.key];
              const v2 = comp2[row.key];
              const diff = v2.monthly - v1.monthly;
              const isSaved = row.key === "saved";
              return (
                <tr
                  key={row.key}
                  className={isSaved ? "bg-gray-50/50" : ""}
                >
                  <td className="sticky left-0 bg-white px-4 py-2 whitespace-nowrap font-medium text-gray-900">
                    {row.label}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatCurrency(v1.monthly)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatCurrency(v1.yearly)}
                  </td>
                  <td
                    className={
                      "px-4 py-2 text-right whitespace-nowrap " +
                      (isSaved ? "font-bold text-green-800" : "")
                    }
                  >
                    {formatCurrency(v2.monthly)}
                  </td>
                  <td
                    className={
                      "px-4 py-2 text-right whitespace-nowrap " +
                      (isSaved ? "font-bold text-green-800" : "")
                    }
                  >
                    {formatCurrency(v2.yearly)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right whitespace-nowrap ${deltaClass(
                      diff,
                      row.higherIsBetter,
                    )}`}
                  >
                    {formatSignedCurrency(diff)}
                  </td>
                </tr>
              );
            })}

            {/* Cumulative Tax: the rate (%) plus the resulting tax amounts. */}
            <tr className="bg-gray-50/50">
              <td className="sticky left-0 bg-white px-4 py-2 whitespace-nowrap font-medium text-gray-900">
                Cumulative Tax
              </td>
              <td colSpan={2} className="px-4 py-2 text-right whitespace-nowrap">
                <div className="font-medium text-gray-900">
                  {formatPercent(comp1.taxRate)}
                </div>
                <div className="text-xs text-gray-600">
                  {formatCurrency(comp1.tax.monthly)} /{" "}
                  {formatCurrency(comp1.tax.yearly)}
                </div>
              </td>
              <td colSpan={2} className="px-4 py-2 text-right whitespace-nowrap">
                <div className="font-bold text-green-800">
                  {formatPercent(comp2.taxRate)}
                </div>
                <div className="text-xs text-gray-600">
                  {formatCurrency(comp2.tax.monthly)} /{" "}
                  {formatCurrency(comp2.tax.yearly)}
                </div>
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                <div
                  className={deltaClass(
                    comp2.taxRate - comp1.taxRate,
                    false,
                  )}
                >
                  {formatSignedPercentPoints(comp2.taxRate - comp1.taxRate)}
                </div>
                <div className="text-xs text-gray-600">
                  {formatSignedCurrency(
                    comp2.tax.monthly - comp1.tax.monthly,
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Winner summary */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-sm">
        {savedDiff > 0 ? (
          <span className="font-medium text-green-800">
            Based on these numbers, you&apos;d save{" "}
            <strong>{formatCurrency(savedDiff)}</strong> more per month in{" "}
            {c2Name} ({formatCurrency(savedDiff * MONTHS_PER_YEAR)}/year).
          </span>
        ) : savedDiff < 0 ? (
          <span className="font-medium text-red-800">
            Based on these numbers, you&apos;d save{" "}
            <strong>{formatCurrency(-savedDiff)}</strong> more per month in{" "}
            {c1Name} ({formatCurrency(-savedDiff * MONTHS_PER_YEAR)}/year).
          </span>
        ) : (
          <span className="text-gray-700">
            Both countries yield the same monthly savings.
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main calculator
// ──────────────────────────────────────────────────────────────

export default function CountryComparer() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // ── Country names ──────────────────────────────────────────
  const [c1Name, setC1Name] = useState(
    () => searchParams?.get("c1Name") ?? "Country 1",
  );
  const [c2Name, setC2Name] = useState(
    () => searchParams?.get("c2Name") ?? "Country 2",
  );

  // ── Country 1 is the source of truth for linked fields ─────
  const [country1, setCountry1] = useState<CountryVars>(() =>
    readVars(searchParams, ""),
  );

  // ── Country 2 overrides: a field is overridden (unlinked) when it
  //    has an entry here. The URL encodes overrides as `<key>2=`. ──
  const [country2Overrides, setCountry2Overrides] = useState<
    Partial<CountryVars>
  >(() => readOverrides(searchParams, readVars(searchParams, "")));

  // Effective Country 2 values: override if present, else mirror Country 1.
  const country2 = useMemo<CountryVars>(() => {
    const c2: CountryVars = { ...DEFAULT_COUNTRY_VARS };
    for (const key of VARIABLE_KEYS) {
      c2[key] = country2Overrides[key] ?? country1[key];
    }
    return c2;
  }, [country1, country2Overrides]);

  const comp1 = useMemo(() => deriveComparison(country1), [country1]);
  const comp2 = useMemo(() => deriveComparison(country2), [country2]);

  // ── Handlers ───────────────────────────────────────────────
  /** Editing Country 1 propagates to Country 2 for every still-linked field. */
  const handleC1Change = (key: VariableKey, value: number) =>
    setCountry1((prev) => ({ ...prev, [key]: value }));

  /** Editing Country 2 overrides that field from Country 1 (auto-unlink). */
  const handleC2Change = (key: VariableKey, value: number) =>
    setCountry2Overrides((prev) => ({ ...prev, [key]: value }));

  /** Toggle whether a Country 2 field links to Country 1.
   *  - Linked → unlink: copy Country 1's current value (then it can diverge).
   *  - Overridden → re-link: drop the override so it follows Country 1 again. */
  const toggleLink = (key: VariableKey) =>
    setCountry2Overrides((prev) => {
      const next = { ...prev };
      if (key in next) {
        delete next[key];
      } else {
        next[key] = country1[key];
      }
      return next;
    });

  /** Link every Country 2 field back to Country 1 (clear all overrides). */
  const syncAll = () => setCountry2Overrides({});

  const isLinked = (key: VariableKey): boolean => !(key in country2Overrides);
  const linkedCount = VARIABLE_KEYS.filter(isLinked).length;

  // ── Keep the URL in sync ───────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("c1Name", c1Name);
    params.set("c2Name", c2Name);
    writeCountry(params, country1, "");
    // Only write Country 2 overrides (absence == linked).
    for (const key of VARIABLE_KEYS) {
      const paramKey = `${key}2`;
      if (key in country2Overrides) {
        params.set(paramKey, toParam(country2Overrides[key]!));
      } else {
        params.delete(paramKey);
      }
    }
    window.history.replaceState(
      null,
      "",
      `${pathname}?${params.toString()}`,
    );
  }, [
    country1,
    country2Overrides,
    c1Name,
    c2Name,
    pathname,
  ]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Country Comparer"
        description="Compare the cost of living between two countries. Enter values for Country 1; Country 2 mirrors them by default. Edit (or unlink) any Country 2 field to override it — the countries are then kept separate for that variable."
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sm text-gray-600 mb-6 max-w-3xl">
          Monthly income is reduced by the cumulative tax percentage, housing,
          living and recreational costs. <strong>Monthly saved</strong> = monthly
          income − tax − housing − living − recreation (shown both monthly and
          yearly).
        </p>

        {/* Country names + bulk sync */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[160px]">
              <label
                htmlFor="c1Name"
                className="block text-xs font-medium text-gray-800 mb-1"
              >
                Country 1
              </label>
              <input
                id="c1Name"
                type="text"
                value={c1Name}
                onChange={(e) => setC1Name(e.target.value || "Country 1")}
                className={INPUT_CLASSES}
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label
                htmlFor="c2Name"
                className="block text-xs font-medium text-gray-800 mb-1"
              >
                Country 2
              </label>
              <input
                id="c2Name"
                type="text"
                value={c2Name}
                onChange={(e) => setC2Name(e.target.value || "Country 2")}
                className={INPUT_CLASSES}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {linkedCount}/{VARIABLE_KEYS.length} fields linked
              </span>
              <button
                type="button"
                onClick={syncAll}
                className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
              >
                Sync Country 2 to Country 1
              </button>
            </div>
          </div>
        </div>

        {/* Simulator inputs — side by side */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Simulator
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Country 1 */}
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-900">
                {c1Name}
              </h3>
              {VARIABLE_KEYS.map((key) => (
                <CountryInput
                  key={key}
                  id={`country1-${key}`}
                  label={VARIABLE_LABELS[key]}
                  unit={VARIABLE_UNITS[key]}
                  value={country1[key]}
                  onChange={(v) => handleC1Change(key, v)}
                />
              ))}
            </div>

            {/* Country 2 */}
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-900">
                {c2Name}
              </h3>
              {VARIABLE_KEYS.map((key) => {
                const linked = isLinked(key);
                return (
                  <Country2Input
                    key={key}
                    id={`country2-${key}`}
                    label={VARIABLE_LABELS[key]}
                    unit={VARIABLE_UNITS[key]}
                    value={country2[key]}
                    onChange={(v) => handleC2Change(key, v)}
                    linked={linked}
                    onToggleLink={() => toggleLink(key)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Comparison table */}
        <ComparisonTable
          comp1={comp1}
          comp2={comp2}
          c1Name={c1Name}
          c2Name={c2Name}
        />
      </main>
    </div>
  );
}
