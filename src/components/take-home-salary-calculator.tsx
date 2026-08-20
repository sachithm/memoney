"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
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
  STUDENT_LOAN_PLANS,
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

// ──────────────────────────────────────────────────────────────
// Person configuration
// ──────────────────────────────────────────────────────────────

export interface PersonConfig {
  annualSalary: number;
  frequency: SalaryFrequency;
  taxYear: string;
  workingHours: WorkingHours;
  pensionRate: number;
  employerPensionMatchRate: number;
  studentLoanPlan: keyof typeof STUDENT_LOAN_PLANS;
}

const DEFAULT_PERSON_CONFIG: PersonConfig = {
  annualSalary: 35_000,
  frequency: "annual",
  taxYear: "2026/2027",
  workingHours: { ...DEFAULT_WORKING_HOURS },
  pensionRate: 0,
  employerPensionMatchRate: 0,
  studentLoanPlan: "none",
};

/** Read a PersonConfig from URL search params (with optional suffix for person 2). */
function readPersonConfig(
  searchParams: { get(name: string): string | null } | null,
  suffix: string,
): PersonConfig {
  const p = (key: string) => (suffix ? `${key}${suffix}` : key);
  const rawStudentLoan = searchParams?.get(p("studentLoan"));
  return {
    annualSalary: readParam(searchParams, p("salary"), DEFAULT_PERSON_CONFIG.annualSalary),
    frequency:
      (searchParams?.get(p("freq")) as SalaryFrequency | null) ??
      DEFAULT_PERSON_CONFIG.frequency,
    taxYear: searchParams?.get(p("taxYear")) ?? DEFAULT_PERSON_CONFIG.taxYear,
    workingHours: {
      hoursPerMonth: readParam(searchParams, p("hoursPerMonth"), DEFAULT_WORKING_HOURS.hoursPerMonth),
      daysPerWeek: readParam(searchParams, p("daysPerWeek"), DEFAULT_WORKING_HOURS.daysPerWeek),
      weeksPerYear: readParam(searchParams, p("weeksPerYear"), DEFAULT_WORKING_HOURS.weeksPerYear),
    },
    pensionRate: readParam(searchParams, p("pension"), 0),
    employerPensionMatchRate: readParam(searchParams, p("employerMatch"), 0),
    studentLoanPlan:
      (rawStudentLoan && rawStudentLoan in STUDENT_LOAN_PLANS
        ? rawStudentLoan
        : "none") as keyof typeof STUDENT_LOAN_PLANS,
  };
}

/** Write a PersonConfig to URLSearchParams (with optional suffix). */
function writePersonConfig(
  params: URLSearchParams,
  config: PersonConfig,
  suffix: string,
): void {
  const p = (key: string) => (suffix ? `${key}${suffix}` : key);
  params.set(p("salary"), toParam(config.annualSalary));
  params.set(p("freq"), config.frequency);
  params.set(p("taxYear"), config.taxYear);
  params.set(p("hoursPerMonth"), toParam(config.workingHours.hoursPerMonth));
  params.set(p("daysPerWeek"), toParam(config.workingHours.daysPerWeek));
  params.set(p("weeksPerYear"), toParam(config.workingHours.weeksPerYear));
  params.set(p("pension"), toParam(config.pensionRate));
  params.set(p("employerMatch"), toParam(config.employerPensionMatchRate));
  params.set(p("studentLoan"), config.studentLoanPlan);
}

// ──────────────────────────────────────────────────────────────
// Breakdown table (unchanged — exported for tests)
// ──────────────────────────────────────────────────────────────

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
    employer: "text-blue-800 font-medium",
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
// Reusable input form for a single person
// ──────────────────────────────────────────────────────────────

interface TaxInputFormProps {
  config: PersonConfig;
  onChange: (config: PersonConfig) => void;
  personNumber: 1 | 2;
  showRemoveButton?: boolean;
  onRemove?: () => void;
}

/** Extracted input form — renders all controls for one person. */
function TaxInputForm({
  config,
  onChange,
  personNumber,
  showRemoveButton = false,
  onRemove,
}: TaxInputFormProps) {
  const {
    annualSalary,
    frequency,
    taxYear,
    workingHours,
    pensionRate,
    employerPensionMatchRate,
    studentLoanPlan,
  } = config;

  const [showWorkingHours, setShowWorkingHours] = useState(false);

  const rates = useMemo(() => getTaxRates(taxYear), [taxYear]);

  const displaySalary = useMemo(
    () => round2(fromAnnual(annualSalary, frequency, workingHours)),
    [annualSalary, frequency, workingHours],
  );

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value) || 0;
    const newAnnual = annualFromFrequency(v, frequency, workingHours);
    onChange({ ...config, annualSalary: newAnnual });
  };

  const setHoursPerMonth = (v: number) =>
    onChange({
      ...config,
      workingHours: { ...workingHours, hoursPerMonth: v },
    });
  const setDaysPerWeek = (v: number) =>
    onChange({
      ...config,
      workingHours: { ...workingHours, daysPerWeek: v },
    });
  const setWeeksPerYear = (v: number) =>
    onChange({
      ...config,
      workingHours: { ...workingHours, weeksPerYear: v },
    });

  const annualHours = Math.round(workingHours.hoursPerMonth * 12);
  const annualDays = Math.round(
    workingHours.daysPerWeek * workingHours.weeksPerYear,
  );

  // Suffix for IDs and labels (empty for person 1 to maintain backward compat)
  const idSuffix = personNumber === 1 ? "" : `-${personNumber}`;
  const labelSuffix =
    personNumber === 1 ? "" : ` — Person ${personNumber}`;

  return (
    <div className="space-y-4">
      {/* Salary input card */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Salary
          {labelSuffix ? <span className="text-sm text-gray-500">{labelSuffix}</span> : ""}
        </h2>

        {/* Amount */}
        <div>
          <label
            htmlFor={`salary-input${idSuffix}`}
            className="block text-xs font-medium text-gray-800 mb-1"
          >
            {INPUT_LABEL[frequency]}{labelSuffix}
          </label>
          <input
            id={`salary-input${idSuffix}`}
            type="number"
            min="0"
            step="0.01"
            value={displaySalary || ""}
            onChange={handleSalaryChange}
            className={INPUT_CLASSES}
          />
        </div>

        {/* Frequency selector */}
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1">
            Frequency{labelSuffix}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...config, frequency: opt.value })}
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
          <label
            htmlFor={`tax-year-select${idSuffix}`}
            className="block text-xs font-medium text-gray-800 mb-1"
          >
            Tax Year{labelSuffix}
          </label>
          <select
            id={`tax-year-select${idSuffix}`}
            value={taxYear}
            onChange={(e) => onChange({ ...config, taxYear: e.target.value })}
            className={INPUT_CLASSES}
          >
            {AVAILABLE_TAX_YEARS.map((yr) => (
              <option key={yr.taxYear} value={yr.taxYear}>
                UK {yr.taxYear}
              </option>
            ))}
          </select>
        </div>

        {/* Tax year rules */}
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

        {/* Pension & student loan */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Deductions{labelSuffix}
          </h3>

          {/* Pension (employee) */}
          <div>
            <label
              htmlFor={`pension-rate${idSuffix}`}
              className="block text-xs font-medium text-gray-800 mb-1"
            >
              Pension Contribution (%){labelSuffix}
            </label>
            <input
              id={`pension-rate${idSuffix}`}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={pensionRate || ""}
              onChange={(e) =>
                onChange({
                  ...config,
                  pensionRate: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className={INPUT_CLASSES}
            />
            <p className="text-xs text-gray-600 mt-1">
              Taken before tax, reduces your taxable income.
            </p>
          </div>

          {/* Employer match */}
          <div>
            <label
              htmlFor={`employer-match${idSuffix}`}
              className="block text-xs font-medium text-gray-800 mb-1"
            >
              Employer Match (%){labelSuffix}
            </label>
            <input
              id={`employer-match${idSuffix}`}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={employerPensionMatchRate || ""}
              onChange={(e) =>
                onChange({
                  ...config,
                  employerPensionMatchRate: Math.max(
                    0,
                    Number(e.target.value) || 0,
                  ),
                })
              }
              className={INPUT_CLASSES}
            />
            <p className="text-xs text-gray-600 mt-1">
              Employer top-up — adds to your pension pot without
              affecting your take-home.
            </p>
          </div>

          {/* Student loan */}
          <div>
            <label
              htmlFor={`student-loan-plan${idSuffix}`}
              className="block text-xs font-medium text-gray-800 mb-1"
            >
              Student Loan Plan{labelSuffix}
            </label>
            <select
              id={`student-loan-plan${idSuffix}`}
              value={studentLoanPlan}
              onChange={(e) =>
                onChange({
                  ...config,
                  studentLoanPlan: e.target.value as keyof typeof STUDENT_LOAN_PLANS,
                })
              }
              className={INPUT_CLASSES}
            >
              {Object.entries(STUDENT_LOAN_PLANS).map(([key, plan]) => (
                <option key={key} value={key}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Working hours — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowWorkingHours(!showWorkingHours)}
            className="w-full flex items-center justify-between text-sm font-medium text-gray-800 hover:text-gray-900"
          >
            <span>Working Hours{labelSuffix}</span>
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

        {/* Remove button (only for person 2) */}
        {showRemoveButton && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-full px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition"
          >
            Remove Person {personNumber}
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Reusable summary card
// ──────────────────────────────────────────────────────────────

interface TaxSummaryCardProps {
  breakdown: TaxBreakdown;
  pensionRate: number;
  employerPensionMatchRate: number;
  personLabel: string;
}

function TaxSummaryCard({
  breakdown,
  pensionRate,
  employerPensionMatchRate,
  personLabel,
}: TaxSummaryCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">
        Take-Home Summary — {personLabel}
      </h2>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-700">Gross:</span>
          <span className="font-medium text-gray-900">
            {formatCurrency(breakdown.grossAnnual)}
          </span>
        </div>
        {pensionRate > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-700">
              Pension (Employee, {pensionRate}%):
            </span>
            <span className="font-medium text-green-800">
              -{formatCurrency(breakdown.employeePension)}
            </span>
          </div>
        )}
        {breakdown.totalIncomeTax > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-700">Income Tax:</span>
            <span className="font-medium text-red-700">
              -{formatCurrency(breakdown.totalIncomeTax)}
            </span>
          </div>
        )}
        {breakdown.totalNic > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-700">National Insurance:</span>
            <span className="font-medium text-red-700">
              -{formatCurrency(breakdown.totalNic)}
            </span>
          </div>
        )}
        {breakdown.studentLoan > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-700">Student Loan:</span>
            <span className="font-medium text-red-700">
              -{formatCurrency(breakdown.studentLoan)}
            </span>
          </div>
        )}
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
        {employerPensionMatchRate > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-700">
              Employer Pension ({employerPensionMatchRate}%):
            </span>
            <span className="font-medium text-blue-800">
              +{formatCurrency(breakdown.employerPension)}
            </span>
          </div>
        )}
        {employerPensionMatchRate > 0 && (
          <div className="flex justify-between border-t pt-2">
            <span className="text-gray-700">Total Compensation:</span>
            <span className="font-bold text-gray-900">
              {formatCurrency(
                breakdown.grossAnnual + breakdown.employerPension,
              )}
            </span>
          </div>
        )}
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
  );
}

// ──────────────────────────────────────────────────────────────
// Cumulative tax comparison table
// ──────────────────────────────────────────────────────────────

interface CumulativeTaxComparisonProps {
  persons: { label: string; breakdown: TaxBreakdown }[];
}

/** Shows the cumulative tax (Income Tax + NIC + Student Loan) for each person
 * and the combined total. */
export function CumulativeTaxComparison({
  persons,
}: CumulativeTaxComparisonProps) {
  const rows = [
    {
      label: "Income Tax",
      key: "totalIncomeTax" as const,
      color: "text-red-700",
    },
    {
      label: "National Insurance",
      key: "totalNic" as const,
      color: "text-red-700",
    },
    {
      label: "Student Loan",
      key: "studentLoan" as const,
      color: "text-red-700",
    },
    {
      label: "Total Tax",
      key: "totalDeductions" as const,
      color: "font-bold text-red-800",
    },
    {
      label: "Gross Income",
      key: "grossAnnual" as const,
      color: "font-bold text-gray-900",
    },
    {
      label: "Take-Home Pay",
      key: "takeHome" as const,
      color: "font-bold text-green-800",
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Cumulative Tax Comparison
      </h2>
      <p className="text-xs text-gray-600 mb-4">
        Total tax (Income Tax + NIC + Student Loan) across all people.
        &quot;Total Tax&quot; excludes voluntary pension contributions.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-gray-700">
                Tax Component
              </th>
              {persons.map((p) => (
                <th
                  key={p.label}
                  className="px-4 py-2.5 text-right font-medium text-gray-700"
                >
                  {p.label}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-bold text-gray-900">
                Combined
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((row) => {
              const values = persons.map((p) => p.breakdown[row.key]);
              const combined = values.reduce((a, b) => a + b, 0);
              return (
                <tr key={row.label}>
                  <td className="px-4 py-2 text-left text-gray-800">
                    {row.label}
                  </td>
                  {values.map((v, i) => (
                    <td
                      key={persons[i].label}
                      className={`px-4 py-2 text-right ${row.color}`}
                    >
                      {row.key === "grossAnnual" || row.key === "takeHome"
                        ? formatCurrency(v)
                        : `-${formatCurrency(v)}`}
                    </td>
                  ))}
                  <td
                    className={`px-4 py-2 text-right ${row.color} border-l border-gray-200`}
                  >
                    {row.key === "grossAnnual" || row.key === "takeHome"
                      ? formatCurrency(combined)
                      : `-${formatCurrency(combined)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Breakdown table component (for side-by-side display)
// ──────────────────────────────────────────────────────────────

function PersonBreakdown({
  breakdown,
  workingHours,
  taxYear,
  personLabel,
}: {
  breakdown: TaxBreakdown;
  workingHours: WorkingHours;
  taxYear: string;
  personLabel: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Tax &amp; NIC Breakdown — {personLabel}
      </h2>
      <p className="text-xs text-gray-600 mb-4">
        Tax-free allowance, income-tax bands (20% / 40% / 45%) and
        National Insurance, shown in every time frequency. Bold
        figures are totals. Based on {taxYear} UK tax rates
        (rates frozen until 2028).
      </p>
      <TaxBreakdownTable
        breakdown={breakdown}
        workingHours={workingHours}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main calculator
// ──────────────────────────────────────────────────────────────

export default function TakeHomeSalaryCalculator() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // ── People state (initialised from URL) ─────────────────────
  const [numPeople, setNumPeople] = useState(() => {
    const raw = searchParams?.get("people");
    return raw === "2" ? 2 : 1;
  });

  const [person1, setPerson1] = useState<PersonConfig>(() =>
    readPersonConfig(searchParams, ""),
  );

  const [person2, setPerson2] = useState<PersonConfig>(() =>
    readPersonConfig(searchParams, "2"),
  );

  // ── Derived breakdowns ─────────────────────────────────────
  const breakdown1 = useMemo(
    () =>
      calculateTaxBreakdown(person1.annualSalary, getTaxRates(person1.taxYear), {
        pensionRate: person1.pensionRate,
        employerPensionMatchRate: person1.employerPensionMatchRate,
        studentLoanPlan: person1.studentLoanPlan,
      }),
    [person1],
  );

  const breakdown2 = useMemo(
    () =>
      calculateTaxBreakdown(person2.annualSalary, getTaxRates(person2.taxYear), {
        pensionRate: person2.pensionRate,
        employerPensionMatchRate: person2.employerPensionMatchRate,
        studentLoanPlan: person2.studentLoanPlan,
      }),
    [person2],
  );

  // ── Keep URL in sync ─────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams();
    writePersonConfig(params, person1, "");
    if (numPeople === 2) {
      params.set("people", "2");
      writePersonConfig(params, person2, "2");
    }
    window.history.replaceState(
      null,
      "",
      `${pathname}?${params.toString()}`,
    );
  }, [
    person1,
    person2,
    numPeople,
    pathname,
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Take Home Salary Calculator"
        description="Calculate your net pay after UK Income Tax and National Insurance. Add a second person to compare cumulative tax across different configurations."
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Toggle for second person */}
        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={() => setNumPeople(numPeople === 2 ? 1 : 2)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              numPeople === 2
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "bg-blue-100 text-blue-700 hover:bg-blue-200"
            }`}
          >
            {numPeople === 2 ? "− Remove Second Person" : "+ Add Second Person"}
          </button>
        </div>

        {/* Input forms + summaries — side by side when two people */}
        <div
          className={
            numPeople === 2
              ? "grid grid-cols-1 lg:grid-cols-2 gap-8"
              : "grid grid-cols-1 lg:grid-cols-3 gap-8"
          }
        >
          {/* Person 1: controls + summary */}
          <div className={numPeople === 2 ? "lg:col-span-1" : "lg:col-span-1"}>
            <TaxInputForm
              config={person1}
              onChange={setPerson1}
              personNumber={1}
            />
            <TaxSummaryCard
              breakdown={breakdown1}
              pensionRate={person1.pensionRate}
              employerPensionMatchRate={person1.employerPensionMatchRate}
              personLabel="Person 1"
            />
          </div>

          {/* Person 2: controls + summary (when active) */}
          {numPeople === 2 && (
            <div className="lg:col-span-1">
              <TaxInputForm
                config={person2}
                onChange={setPerson2}
                personNumber={2}
                showRemoveButton
                onRemove={() => setNumPeople(1)}
              />
              <TaxSummaryCard
                breakdown={breakdown2}
                pensionRate={person2.pensionRate}
                employerPensionMatchRate={person2.employerPensionMatchRate}
                personLabel="Person 2"
              />
            </div>
          )}

          {/* Breakdown table (only for single person — side-by-side when two) */}
          {numPeople === 1 && (
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Tax &amp; NIC Breakdown
                </h2>
                <p className="text-xs text-gray-600 mb-4">
                  Tax-free allowance, income-tax bands (20% / 40% / 45%) and
                  National Insurance, shown in every time frequency. Bold
                  figures are totals. Based on {person1.taxYear} UK tax rates
                  (rates frozen until 2028).
                </p>
                <TaxBreakdownTable
                  breakdown={breakdown1}
                  workingHours={person1.workingHours}
                />
              </div>
            </div>
          )}
        </div>

        {/* Two-person layout: breakdown tables side by side */}
        {numPeople === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            <PersonBreakdown
              breakdown={breakdown1}
              workingHours={person1.workingHours}
              taxYear={person1.taxYear}
              personLabel="Person 1"
            />
            <PersonBreakdown
              breakdown={breakdown2}
              workingHours={person2.workingHours}
              taxYear={person2.taxYear}
              personLabel="Person 2"
            />
          </div>
        )}

        {/* Cumulative tax comparison (only when two people) */}
        {numPeople === 2 && (
          <CumulativeTaxComparison
            persons={[
              { label: "Person 1", breakdown: breakdown1 },
              { label: "Person 2", breakdown: breakdown2 },
            ]}
          />
        )}
      </main>
    </div>
  );
}
