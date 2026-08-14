"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import PageHeader from "@/components/ui/page-header";
import {
  calculateTaxBreakdown,
  annualFromFrequency,
  fromAnnual,
  getTaxRates,
  AVAILABLE_TAX_YEARS,
  DEFAULT_WORKING_HOURS,
  TAX_TABLE_ROWS,
  type TaxBreakdown,
  type SalaryFrequency,
  type WorkingHours,
} from "@/lib/tax-calculations";

const INPUT_CLASSES =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const FREQUENCY_OPTIONS: { value: SalaryFrequency; label: string }[] = [
  { value: "hourly", label: "Per Hour" },
  { value: "daily", label: "Per Day" },
  { value: "monthly", label: "Per Month" },
  { value: "annual", label: "Per Year" },
];

const TABLE_FREQUENCIES: SalaryFrequency[] = ["hourly", "daily", "monthly", "annual"];
const TABLE_FREQ_LABELS: Record<SalaryFrequency, string> = {
  hourly: "Hour",
  daily: "Day",
  monthly: "Month",
  annual: "Annual",
};

const INPUT_LABEL: Record<SalaryFrequency, string> = {
  hourly: "Hourly Rate (£)",
  daily: "Daily Rate (£)",
  monthly: "Monthly Salary (£)",
  annual: "Annual Salary (£)",
};

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

// Round a number to 2 decimal places, returning a clean float for <input type=number>
const round2 = (v: number): number => parseFloat(v.toFixed(2));

// ──────────────────────────────────────────────────────────────
// Breakdown table
// ──────────────────────────────────────────────────────────────

/**
 * Renders the hour / day / month / annual breakdown of every TaxBreakdown
 * field as a colour-coded table.  Bold figures are totals (gross, total
 * deductions, take-home).
 */
export function TaxBreakdownTable({
  breakdown,
  workingHours,
}: {
  breakdown: TaxBreakdown;
  workingHours: WorkingHours;
}) {
  const rowTypeClasses: Record<string, string> = {
    gross: "font-bold text-gray-900",
    allowance: "text-green-800",
    tax: "text-red-700",
    total: "font-bold text-gray-900 border-t-2 border-gray-300",
    takehome: "font-bold text-green-800 border-t-2 border-gray-300",
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-gray-50 text-left px-4 py-2.5 font-medium text-gray-700">
              Component
            </th>
            {TABLE_FREQUENCIES.map((freq) => (
              <th
                key={freq}
                className="bg-gray-50 px-4 py-2.5 font-medium text-gray-700 text-right"
              >
                {TABLE_FREQ_LABELS[freq]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {TAX_TABLE_ROWS.map((row, i) => {
            const annualValue = breakdown[row.valueKey];
            const cells = TABLE_FREQUENCIES.map((freq) =>
              formatCurrency(round2(fromAnnual(annualValue, freq, workingHours))),
            );

            const taxableAnnual = row.taxableKey
              ? breakdown[row.taxableKey]
              : null;

            return (
              <tr
                key={row.key}
                className={i % 2 === 1 ? "bg-gray-50/50" : ""}
              >
                <td
                  className={
                    "sticky left-0 bg-white px-4 py-2 whitespace-nowrap " +
                    rowTypeClasses[row.type]
                  }
                >
                  {row.label}
                  {taxableAnnual !== null && (
                    <div className="text-xs font-normal text-gray-600">
                      on {formatCurrency(taxableAnnual)}
                    </div>
                  )}
                </td>
                {TABLE_FREQUENCIES.map((freq, j) => (
                  <td
                    key={freq}
                    className="px-4 py-2 text-right whitespace-nowrap"
                  >
                    {cells[j]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main calculator
// ──────────────────────────────────────────────────────────────

export default function TakeHomeSalaryCalculator() {
  const [annualSalary, setAnnualSalary] = useState(35_000);
  const [frequency, setFrequency] = useState<SalaryFrequency>("annual");
  const [taxYear, setTaxYear] = useState("2026/2027");
  const [workingHours, setWorkingHours] = useState<WorkingHours>({
    ...DEFAULT_WORKING_HOURS,
  });
  const [showWorkingHours, setShowWorkingHours] = useState(false);

  const rates = useMemo(() => getTaxRates(taxYear), [taxYear]);

  const breakdown = useMemo(
    () => calculateTaxBreakdown(annualSalary, rates),
    [annualSalary, rates],
  );

  // The salary input displays the annual figure converted to the selected
  // frequency.  When the user types, the raw value is converted back to an
  // annual figure (the source of truth).
  const displaySalary = useMemo(
    () =>
      round2(fromAnnual(annualSalary, frequency, workingHours)),
    [annualSalary, frequency, workingHours],
  );

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value) || 0;
    setAnnualSalary(annualFromFrequency(v, frequency, workingHours));
  };

  // ── Working-hours helpers ────────────────────────────────
  const setHoursPerMonth = (v: number) =>
    setWorkingHours((prev) => ({ ...prev, hoursPerMonth: v }));
  const setDaysPerWeek = (v: number) =>
    setWorkingHours((prev) => ({ ...prev, daysPerWeek: v }));
  const setWeeksPerYear = (v: number) =>
    setWorkingHours((prev) => ({ ...prev, weeksPerYear: v }));

  const annualHours = Math.round(workingHours.hoursPerMonth * 12);
  const annualDays = Math.round(
    workingHours.daysPerWeek * workingHours.weeksPerYear,
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Take Home Salary Calculator"
        description="Calculate your net pay after UK Income Tax and National Insurance. Enter your salary in any frequency (hourly, daily, monthly, or annual) to see a full breakdown of tax-free allowances, tax bands, and deductions."
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Controls ── */}
          <div className="lg:col-span-1 space-y-6">
            {/* Salary input card */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Salary
              </h2>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-gray-800 mb-1">
                  {INPUT_LABEL[frequency]}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={displaySalary || 0}
                  onChange={handleSalaryChange}
                  className={INPUT_CLASSES}
                />
              </div>

              {/* Frequency selector */}
              <div>
                <label className="block text-xs font-medium text-gray-800 mb-1">
                  Frequency
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFrequency(opt.value)}
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition ${
                        frequency === opt.value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tax year */}
              <div>
                <label className="block text-xs font-medium text-gray-800 mb-1">
                  Tax Year
                </label>
                <select
                  value={taxYear}
                  onChange={(e) => setTaxYear(e.target.value)}
                  className={INPUT_CLASSES}
                >
                  {AVAILABLE_TAX_YEARS.map((yr) => (
                    <option key={yr.taxYear} value={yr.taxYear}>
                      UK {yr.taxYear}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tax year rules — shows the bands, thresholds and rates for
                  the selected year so the user knows what rules are applied */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                <div className="font-medium text-gray-800 mb-1.5">
                  Tax Rules ({rates.taxYear})
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Personal Allowance</span>
                    <span className="text-gray-900">
                      {formatCurrency(rates.personalAllowance)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Basic rate</span>
                    <span className="text-gray-900">
                      {rates.basicRate * 100}% (up to{" "}
                      {formatCurrency(rates.basicRateThreshold)})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Higher rate</span>
                    <span className="text-gray-900">
                      {rates.higherRate * 100}% (up to{" "}
                      {formatCurrency(rates.higherRateThreshold)})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Additional rate</span>
                    <span className="text-gray-900">
                      {rates.additionalRate * 100}%
                    </span>
                  </div>
                  <div className="border-t border-gray-300 my-1"></div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">NIC primary threshold</span>
                    <span className="text-gray-900">
                      {formatCurrency(rates.nicPrimaryThreshold)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">NIC upper limit</span>
                    <span className="text-gray-900">
                      {formatCurrency(rates.nicUpperEarningsLimit)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">NIC main rate</span>
                    <span className="text-gray-900">
                      {rates.nicLowerRate * 100}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">NIC additional rate</span>
                    <span className="text-gray-900">
                      {rates.nicUpperRate * 100}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Working hours — collapsible */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowWorkingHours(!showWorkingHours)}
                  className="w-full flex items-center justify-between text-sm font-medium text-gray-800 hover:text-gray-900"
                >
                  <span>Working Hours</span>
                  <svg
                    className={`w-4 h-4 transform transition-transform ${
                      showWorkingHours ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {showWorkingHours && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-800 mb-1">
                        Hours per month
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        step="0.5"
                        value={workingHours.hoursPerMonth}
                        onChange={(e) =>
                          setHoursPerMonth(
                            Math.max(1, Number(e.target.value) || 0),
                          )
                        }
                        className={INPUT_CLASSES}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-800 mb-1">
                        Days per week
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="7"
                        step="0.5"
                        value={workingHours.daysPerWeek}
                        onChange={(e) =>
                          setDaysPerWeek(
                            Math.max(1, Number(e.target.value) || 0),
                          )
                        }
                        className={INPUT_CLASSES}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-800 mb-1">
                        Weeks per year
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="52"
                        step="1"
                        value={workingHours.weeksPerYear}
                        onChange={(e) =>
                          setWeeksPerYear(
                            Math.max(1, Number(e.target.value) || 0),
                          )
                        }
                        className={INPUT_CLASSES}
                      />
                    </div>
                    <div className="text-xs text-gray-600 pt-1 border-t">
                      <div>
                        Annual hours: {annualHours}{" "}
                        (~{Math.round(annualHours / workingHours.weeksPerYear * 10) / 10}/wk)
                      </div>
                      <div>Annual days: {annualDays}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Summary card */}
            <div className="bg-white rounded-lg shadow p-6 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Take-Home Summary (Annual)
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700">Gross:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(breakdown.grossAnnual)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Income Tax:</span>
                  <span className="font-medium text-red-700">
                    -{formatCurrency(breakdown.totalIncomeTax)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">National Insurance:</span>
                  <span className="font-medium text-red-700">
                    -{formatCurrency(breakdown.totalNic)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-700">Total Deductions:</span>
                  <span className="font-bold text-red-800">
                    -{formatCurrency(breakdown.totalDeductions)}
                  </span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-gray-700">Take-Home:</span>
                  <span className="font-bold text-green-800">
                    {formatCurrency(breakdown.takeHome)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Effective Tax Rate:</span>
                  <span className="font-medium text-gray-900">
                    {formatPercent(breakdown.effectiveTaxRate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">You Keep:</span>
                  <span className="font-medium text-green-800">
                    {formatPercent(breakdown.takeHomePercentage)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Breakdown table ── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Tax &amp; NIC Breakdown
              </h2>
              <p className="text-xs text-gray-600 mb-4">
                Tax-free allowance, income-tax bands (20% / 40% / 45%) and
                National Insurance, shown in every time frequency. Bold
                figures are totals. Based on {rates.taxYear} UK tax rates
                (rates frozen until 2028).
              </p>
              <TaxBreakdownTable
                breakdown={breakdown}
                workingHours={workingHours}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
