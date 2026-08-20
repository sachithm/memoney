/**
 * UK Income Tax and National Insurance calculation logic.
 *
 * Rates and thresholds cover the 2023/24 through 2026/2027 tax years (UK
 * personal-allowance and threshold freezes announced in the 2021 Spending
 * Review run until 2028). The 2026/2027 tax year is the default.
 *
 * Sources: HMRC "Income Tax rates and Tax Thresholds" and "National Insurance
 * rates and thresholds" pages. All figures are for England, Wales and Northern
 * Ireland (Scotland has its own income-tax bands).
 */

// ──────────────────────────────────────────────────────────────
// Tax rate definitions
// ──────────────────────────────────────────────────────────────

export interface TaxRates {
  /** Human-readable tax-year label, e.g. "2026/2027". */
  taxYear: string;
  // Income Tax
  /** Personal Allowance (0% band), £12,570 for 2023/24–2026/27. */
  personalAllowance: number;
  /** Income above this starts tapering the PA by £1 per £2. */
  personalAllowanceTaperThreshold: number;
  /** End of the 20% band / start of the 40% band, £50,270. */
  basicRateThreshold: number;
  /** End of the 40% band / start of the 45% band, £125,140. */
  higherRateThreshold: number;
  basicRate: number; // 0.20
  higherRate: number; // 0.40
  additionalRate: number; // 0.45
  // National Insurance (Class 1, employee)
  /** NIC starts here, £12,570. */
  nicPrimaryThreshold: number;
  /** NIC main rate ends here, £50,270. */
  nicUpperEarningsLimit: number;
  nicLowerRate: number; // 0.12
  nicUpperRate: number; // 0.02
}

/** Rates for the 2026/2027 tax year (April 2026 – April 2027). */
export const TAX_RATES_2026_2027: TaxRates = {
  taxYear: "2026/2027",
  personalAllowance: 12_570,
  personalAllowanceTaperThreshold: 100_000,
  basicRateThreshold: 50_270,
  higherRateThreshold: 125_140,
  basicRate: 0.20,
  higherRate: 0.40,
  additionalRate: 0.45,
  nicPrimaryThreshold: 12_570,
  nicUpperEarningsLimit: 50_270,
  nicLowerRate: 0.12,
  nicUpperRate: 0.02,
};

/** All available tax years (rates are identical due to the freeze). */
export const AVAILABLE_TAX_YEARS: TaxRates[] = [
  TAX_RATES_2026_2027,
  { ...TAX_RATES_2026_2027, taxYear: "2025/2026" },
  { ...TAX_RATES_2026_2027, taxYear: "2024/2025" },
  { ...TAX_RATES_2026_2027, taxYear: "2023/2024" },
];

// ──────────────────────────────────────────────────────────────
// Student Loan plans
// ──────────────────────────────────────────────────────────────

/** UK student-loan repayment plan. */
export interface StudentLoanPlan {
  /** Human-readable name, e.g. "Plan 2". */
  name: string;
  /** Repayment percentage (e.g. 0.09 for 9%). */
  rate: number;
  /** Income threshold above which repayment kicks in. */
  threshold: number;
}

/**
 * Registered UK student-loan plans.  Thresholds are frozen at 2024/25 levels
 * (the UK government froze thresholds until 2028/29).  "none" is a sentinel
 * that disables the deduction entirely.
 */
export const STUDENT_LOAN_PLANS: Record<string, StudentLoanPlan> = {
  none: { name: "None", rate: 0, threshold: Infinity },
  plan1: { name: "Plan 1", rate: 0.09, threshold: 23_761 },
  plan2: { name: "Plan 2", rate: 0.09, threshold: 27_295 },
  plan4: { name: "Plan 4", rate: 0.09, threshold: 27_660 },
  plan5: { name: "Plan 5", rate: 0.09, threshold: 27_660 },
  plan7: { name: "Postgraduate (Plan 7)", rate: 0.06, threshold: 21_125 },
};

/** Calculate the student-loan repayment for a given gross income and plan. */
export function calculateStudentLoan(
  grossIncome: number,
  plan: StudentLoanPlan,
): number {
  if (plan.rate <= 0) return 0;
  const aboveThreshold = Math.max(0, grossIncome - plan.threshold);
  return aboveThreshold * plan.rate;
}

/** Look up rates for a tax-year label, falling back to the latest. */
export function getTaxRates(taxYear: string): TaxRates {
  return AVAILABLE_TAX_YEARS.find((r) => r.taxYear === taxYear) ??
    TAX_RATES_2026_2027;
}

// ──────────────────────────────────────────────────────────────
// Working-hours configuration (for frequency conversion)
// ──────────────────────────────────────────────────────────────

export type SalaryFrequency = "hourly" | "daily" | "monthly" | "annual";

export interface WorkingHours {
  /** Total paid hours worked in a typical month. */
  hoursPerMonth: number;
  daysPerWeek: number;
  weeksPerYear: number;
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  hoursPerMonth: 162.5,
  daysPerWeek: 5,
  weeksPerYear: 52,
};

/** Total paid hours in a year based on the working-hours config. */
export function hoursPerYear(h: WorkingHours): number {
  return h.hoursPerMonth * 12;
}

/** Total paid days in a year based on the working-hours config. */
export function daysPerYear(h: WorkingHours): number {
  return h.daysPerWeek * h.weeksPerYear;
}

/** Total paid hours in a week (derived from monthly hours). */
export function hoursPerWeek(h: WorkingHours): number {
  return hoursPerYear(h) / h.weeksPerYear;
}

// ──────────────────────────────────────────────────────────────
// Frequency conversion
// ──────────────────────────────────────────────────────────────

/** Convert a salary expressed in `freq` into an annual figure. */
export function annualFromFrequency(
  amount: number,
  freq: SalaryFrequency,
  h: WorkingHours,
): number {
  switch (freq) {
    case "hourly":
      return amount * hoursPerYear(h);
    case "daily":
      return amount * daysPerYear(h);
    case "monthly":
      return amount * 12;
    case "annual":
      return amount;
  }
}

/** Convert an annual figure into a per-`freq` amount. */
export function fromAnnual(
  annual: number,
  freq: SalaryFrequency,
  h: WorkingHours,
): number {
  switch (freq) {
    case "hourly":
      return annual / hoursPerYear(h);
    case "daily":
      return annual / daysPerYear(h);
    case "monthly":
      return annual / 12;
    case "annual":
      return annual;
  }
}

// ──────────────────────────────────────────────────────────────
// Tax breakdown
// ──────────────────────────────────────────────────────────────

export interface TaxBreakdown {
  grossAnnual: number;
  /** Employee pension contribution (before-tax, deducted from gross). */
  employeePension: number;
  /** Employer pension match (does not reduce take-home, % of gross). */
  employerPension: number;
  /** Taxable income after employee pension sacrifice (used for tax & NIC). */
  taxableIncome: number;
  /** Personal allowance after taper (0% band), capped at gross. */
  taxFreeAllowance: number;
  /** Income taxed at 20% and the tax due. */
  basicRateTaxable: number;
  basicRateTax: number;
  /** Income taxed at 40% and the tax due. */
  higherRateTaxable: number;
  higherRateTax: number;
  /** Income taxed at 45% and the tax due. */
  additionalRateTaxable: number;
  additionalRateTax: number;
  /** NIC: earnings between PT and UEL, taxed at 12%. */
  nicLowerTaxable: number;
  nicLowerTax: number;
  /** NIC: earnings above UEL, taxed at 2%. */
  nicUpperTaxable: number;
  nicUpperTax: number;
  /** Totals. */
  totalIncomeTax: number;
  totalNic: number;
  /** Income tax + NIC only (excludes pension & student loan). */
  totalIncomeAndNic: number;
  /** Student-loan repayment (based on gross, pre-pension income). */
  studentLoan: number;
  /** Everything deducted from gross (tax + NIC + pension + student loan). */
  totalDeductions: number;
  takeHome: number;
  /** effectiveTaxRate = totalDeductions / grossAnnual (0–1). */
  effectiveTaxRate: number;
  /** takeHomePercentage = takeHome / grossAnnual (0–1). */
  takeHomePercentage: number;
}

/**
 * Options for {@link calculateTaxBreakdown}.
 */
export interface TaxBreakdownOptions {
  /** Employee pension percentage of gross (0–100), taken before tax. */
  pensionRate?: number;
  /** Employer pension match percentage of gross (0–100). */
  employerPensionMatchRate?: number;
  /** Student-loan plan name (must be a key of {@link STUDENT_LOAN_PLANS}). */
  studentLoanPlan?: keyof typeof STUDENT_LOAN_PLANS;
}

/**
 * Compute the full UK Income Tax + NIC (+ pension + student loan) breakdown for
 * a given gross annual salary using the supplied tax rates.
 *
 * Optional pension and student-loan deductions can be supplied; when omitted
 * they default to zero, producing the same result as before those features
 * existed.
 */
export function calculateTaxBreakdown(
  grossAnnual: number,
  rates: TaxRates,
  options?: TaxBreakdownOptions,
): TaxBreakdown {
  const pensionRate = options?.pensionRate ?? 0;
  const employerPensionMatchRate = options?.employerPensionMatchRate ?? 0;
  const studentLoanPlan =
    STUDENT_LOAN_PLANS[options?.studentLoanPlan ?? "none"] ??
    STUDENT_LOAN_PLANS.none;

  const gross = Math.max(0, grossAnnual);

  // ── Pension (salary sacrifice) ──────────────────────────────
  const employeePension = gross * (pensionRate / 100);
  const employerPension = gross * (employerPensionMatchRate / 100);
  const taxableIncome = gross - employeePension;

  // ── Student loan (on gross, pre-pension) ────────────────────
  const studentLoan = calculateStudentLoan(gross, studentLoanPlan);

  // ── Personal allowance with taper for high earners ──────────
  // PA is reduced by £1 for every £2 of income above the taper threshold.
  // Taper is based on taxable income (post-pension).
  let pa = rates.personalAllowance;
  if (taxableIncome > rates.personalAllowanceTaperThreshold) {
    pa = Math.max(0, pa - (taxableIncome - rates.personalAllowanceTaperThreshold) / 2);
  }
  pa = Math.min(gross, pa);

  // ── Income Tax (on taxable income) ──────────────────────────
  const paBandWidth = rates.basicRateThreshold - pa;
  const basicRateTaxable = Math.min(Math.max(taxableIncome - pa, 0), paBandWidth);
  const basicRateTax = basicRateTaxable * rates.basicRate;

  const higherRateTaxable = Math.min(
    Math.max(taxableIncome - rates.basicRateThreshold, 0),
    rates.higherRateThreshold - rates.basicRateThreshold,
  );
  const higherRateTax = higherRateTaxable * rates.higherRate;

  const additionalRateTaxable = Math.max(taxableIncome - rates.higherRateThreshold, 0);
  const additionalRateTax = additionalRateTaxable * rates.additionalRate;

  const totalIncomeTax = basicRateTax + higherRateTax + additionalRateTax;

  // ── National Insurance (Class 1 employee, on taxable income) ─
  const nicPt = rates.nicPrimaryThreshold;
  const nicUel = rates.nicUpperEarningsLimit;

  const nicLowerTaxable = Math.min(
    Math.max(taxableIncome - nicPt, 0),
    nicUel - nicPt,
  );
  const nicLowerTax = nicLowerTaxable * rates.nicLowerRate;

  const nicUpperTaxable = Math.max(taxableIncome - nicUel, 0);
  const nicUpperTax = nicUpperTaxable * rates.nicUpperRate;

  const totalNic = nicLowerTax + nicUpperTax;
  const totalIncomeAndNic = totalIncomeTax + totalNic;

  // ── Totals ──────────────────────────────────────────────────
  const totalDeductions = totalIncomeAndNic + employeePension + studentLoan;
  const takeHome = gross - totalDeductions;

  const effectiveTaxRate = gross > 0 ? totalDeductions / gross : 0;
  const takeHomePercentage = gross > 0 ? takeHome / gross : 0;

  return {
    grossAnnual: gross,
    employeePension,
    employerPension,
    taxableIncome,
    taxFreeAllowance: pa,
    basicRateTaxable,
    basicRateTax,
    higherRateTaxable,
    higherRateTax,
    additionalRateTaxable,
    additionalRateTax,
    nicLowerTaxable,
    nicLowerTax,
    nicUpperTaxable,
    nicUpperTax,
    totalIncomeTax,
    totalNic,
    totalIncomeAndNic,
    studentLoan,
    totalDeductions,
    takeHome,
    effectiveTaxRate,
    takeHomePercentage,
  };
}

// ──────────────────────────────────────────────────────────────
// Table structure (consumed by the UI component)
// ──────────────────────────────────────────────────────────────

/** A single row in the breakdown table. */
export interface TaxTableRow {
  key: string;
  label: string;
  /** Annual amount in this row (converted to other frequencies by the UI). */
  valueKey: keyof TaxBreakdown;
  /** Optional taxable-amount field, shown in the label for transparency. */
  taxableKey?: keyof TaxBreakdown;
  /** Row category — drives bold / colour styling. */
  type: "gross" | "allowance" | "tax" | "total" | "takehome" | "employer";
}

/**
 * Ordered rows for the results table. The UI converts each row's annual
 * `valueKey` into hour / day / month / annual columns.
 */
export const TAX_TABLE_ROWS: TaxTableRow[] = [
  { key: "gross",          label: "Gross Salary",               valueKey: "grossAnnual",             type: "gross" },
  { key: "pension",        label: "Salary Sacrifice",           valueKey: "employeePension",         type: "allowance" },
  { key: "allowance",      label: "Tax-Free Allowance (0%)",    valueKey: "taxFreeAllowance",        type: "allowance" },
  { key: "basic",          label: "Income Tax @ 20%",           valueKey: "basicRateTax",            taxableKey: "basicRateTaxable",         type: "tax" },
  { key: "higher",         label: "Income Tax @ 40%",           valueKey: "higherRateTax",           taxableKey: "higherRateTaxable",        type: "tax" },
  { key: "additional",     label: "Income Tax @ 45%",           valueKey: "additionalRateTax",       taxableKey: "additionalRateTaxable",  type: "tax" },
  { key: "nic-12",         label: "National Insurance (12%)",   valueKey: "nicLowerTax",             taxableKey: "nicLowerTaxable",          type: "tax" },
  { key: "nic-2",          label: "National Insurance (2%)",    valueKey: "nicUpperTax",             taxableKey: "nicUpperTaxable",          type: "tax" },
  { key: "student-loan",   label: "Student Loan",               valueKey: "studentLoan",             type: "tax" },
  { key: "total-income-nic", label: "Total Tax & NIC",          valueKey: "totalIncomeAndNic",       type: "total" },
  { key: "total",          label: "Total Deductions",           valueKey: "totalDeductions",         type: "total" },
  { key: "employer",       label: "Employer Pension Match",     valueKey: "employerPension",         type: "employer" },
  { key: "takehome",       label: "Take-Home Pay",              valueKey: "takeHome",               type: "takehome" },
];
