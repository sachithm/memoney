import { describe, expect, it } from "vitest";
import {
  TAX_RATES_2026_2027,
  AVAILABLE_TAX_YEARS,
  getTaxRates,
  calculateTaxBreakdown,
  annualFromFrequency,
  fromAnnual,
  hoursPerYear,
  daysPerYear,
  DEFAULT_WORKING_HOURS,
  TAX_TABLE_ROWS,
} from "@/lib/tax-calculations";

const RATES = TAX_RATES_2026_2027;

// ──────────────────────────────────────────────────────────────
// Tax rate / year lookup
// ──────────────────────────────────────────────────────────────

describe("getTaxRates", () => {
  it("returns the 2026/2027 rates by default", () => {
    expect(getTaxRates("2026/2027")).toBe(TAX_RATES_2026_2027);
  });

  it("falls back to the latest year for unknown labels", () => {
    expect(getTaxRates("9999/9999")).toBe(TAX_RATES_2026_2027);
  });

  it("returns every available year in the list", () => {
    expect(AVAILABLE_TAX_YEARS.map((r) => r.taxYear)).toEqual([
      "2026/2027",
      "2025/2026",
      "2024/2025",
      "2023/2024",
    ]);
  });

  it("uses the correct UK thresholds", () => {
    expect(RATES.personalAllowance).toBe(12_570);
    expect(RATES.basicRateThreshold).toBe(50_270);
    expect(RATES.higherRateThreshold).toBe(125_140);
    expect(RATES.nicPrimaryThreshold).toBe(12_570);
    expect(RATES.nicUpperEarningsLimit).toBe(50_270);
  });
});

// ──────────────────────────────────────────────────────────────
// Working hours / frequency conversion
// ──────────────────────────────────────────────────────────────

describe("working hours", () => {
  it("computes annual hours and days from defaults", () => {
    expect(hoursPerYear(DEFAULT_WORKING_HOURS)).toBe(1_950); // 37.5 × 52
    expect(daysPerYear(DEFAULT_WORKING_HOURS)).toBe(260); // 5 × 52
  });
});

describe("annualFromFrequency", () => {
  it("converts hourly → annual", () => {
    expect(annualFromFrequency(10, "hourly", DEFAULT_WORKING_HOURS)).toBe(19_500);
  });

  it("converts daily → annual", () => {
    expect(annualFromFrequency(100, "daily", DEFAULT_WORKING_HOURS)).toBe(26_000);
  });

  it("converts monthly → annual", () => {
    expect(annualFromFrequency(2_000, "monthly", DEFAULT_WORKING_HOURS)).toBe(24_000);
  });

  it("passes annual through", () => {
    expect(annualFromFrequency(30_000, "annual", DEFAULT_WORKING_HOURS)).toBe(30_000);
  });
});

describe("fromAnnual", () => {
  it("converts annual → hourly", () => {
    expect(fromAnnual(19_500, "hourly", DEFAULT_WORKING_HOURS)).toBe(10);
  });

  it("converts annual → daily", () => {
    expect(fromAnnual(26_000, "daily", DEFAULT_WORKING_HOURS)).toBe(100);
  });

  it("converts annual → monthly", () => {
    expect(fromAnnual(24_000, "monthly", DEFAULT_WORKING_HOURS)).toBe(2_000);
  });

  it("converts annual → annual (identity)", () => {
    expect(fromAnnual(30_000, "annual", DEFAULT_WORKING_HOURS)).toBe(30_000);
  });
});

// ──────────────────────────────────────────────────────────────
// Tax breakdown — income tax bands
// ──────────────────────────────────────────────────────────────

describe("calculateTaxBreakdown — income tax", () => {
  it("returns zeros for a zero salary", () => {
    const b = calculateTaxBreakdown(0, RATES);
    expect(b.grossAnnual).toBe(0);
    expect(b.takeHome).toBe(0);
    expect(b.totalDeductions).toBe(0);
    expect(b.effectiveTaxRate).toBe(0);
    expect(b.takeHomePercentage).toBe(0);
  });

  it("clamps negative salaries to zero", () => {
    const b = calculateTaxBreakdown(-5_000, RATES);
    expect(b.grossAnnual).toBe(0);
    expect(b.takeHome).toBe(0);
  });

  it("tax-free for income below personal allowance", () => {
    const b = calculateTaxBreakdown(10_000, RATES);
    expect(b.taxFreeAllowance).toBe(10_000);
    expect(b.basicRateTax).toBe(0);
    expect(b.higherRateTax).toBe(0);
    expect(b.additionalRateTax).toBe(0);
    expect(b.takeHome).toBe(10_000);
    expect(b.totalDeductions).toBe(0);
  });

  it("calculates basic-rate tax for a £30 000 salary", () => {
    const b = calculateTaxBreakdown(30_000, RATES);
    // PA = 12 570, taxable above PA = 30 000 - 12 570 = 17 430
    expect(b.taxFreeAllowance).toBe(12_570);
    expect(b.basicRateTaxable).toBe(17_430);
    expect(b.basicRateTax).toBe(3_486); // 17 430 × 20%
    expect(b.higherRateTax).toBe(0);
    expect(b.additionalRateTax).toBe(0);
    // NIC: 17 430 × 12% = 2 091.60
    expect(b.nicLowerTax).toBe(2_091.60);
    expect(b.nicUpperTax).toBe(0);
    expect(b.totalIncomeTax).toBe(3_486);
    expect(b.totalNic).toBe(2_091.60);
    expect(b.totalDeductions).toBe(5_577.60);
    expect(b.takeHome).toBe(24_422.40);
  });

  it("applies 40% higher-rate tax for a £60 000 salary", () => {
    const b = calculateTaxBreakdown(60_000, RATES);
    expect(b.taxFreeAllowance).toBe(12_570);
    // Basic: 37 700 × 20% = 7 540
    expect(b.basicRateTaxable).toBe(37_700);
    expect(b.basicRateTax).toBe(7_540);
    // Higher: (60 000 - 50 270) = 9 730 × 40% = 3 892
    expect(b.higherRateTaxable).toBe(9_730);
    expect(b.higherRateTax).toBe(3_892);
    expect(b.additionalRateTax).toBe(0);
    expect(b.totalIncomeTax).toBe(11_432);
    // NIC: 37 700 × 12% = 4 524, + 9 730 × 2% = 194.60
    expect(b.nicLowerTax).toBe(4_524);
    expect(b.nicUpperTaxable).toBe(9_730);
    expect(b.nicUpperTax).toBe(194.60);
    expect(b.totalNic).toBe(4_718.60);
    expect(b.totalDeductions).toBe(16_150.60);
    expect(b.takeHome).toBe(43_849.40);
  });

  it("applies 45% additional-rate tax for a £150 000 salary", () => {
    const b = calculateTaxBreakdown(150_000, RATES);
    // PA tapered to 0 (150k - 100k = 50k, /2 = 25k > 12.57k)
    expect(b.taxFreeAllowance).toBe(0);
    expect(b.basicRateTaxable).toBe(50_270);
    expect(b.basicRateTax).toBe(10_054); // 50 270 × 20%
    expect(b.higherRateTaxable).toBe(74_870);
    expect(b.higherRateTax).toBe(29_948); // 74 870 × 40%
    expect(b.additionalRateTaxable).toBe(24_860);
    expect(b.additionalRateTax).toBe(11_187); // 24 860 × 45%
    expect(b.totalIncomeTax).toBe(51_189);
    // NIC: 37 700 × 12% = 4 524, + (150 000 - 50 270) × 2% = 99 730 × 2% = 1 994.60
    expect(b.nicLowerTax).toBe(4_524);
    expect(b.nicUpperTaxable).toBe(99_730);
    expect(b.nicUpperTax).toBeCloseTo(1_994.60, 6);
    expect(b.totalNic).toBeCloseTo(6_518.60, 6);
    expect(b.totalDeductions).toBeCloseTo(57_707.60, 6);
    expect(b.takeHome).toBeCloseTo(92_292.40, 6);
  });
});

// ──────────────────────────────────────────────────────────────
// Personal allowance taper
// ──────────────────────────────────────────────────────────────

describe("calculateTaxBreakdown — PA taper", () => {
  it("keeps full PA at exactly £100 000", () => {
    const b = calculateTaxBreakdown(100_000, RATES);
    expect(b.taxFreeAllowance).toBe(12_570);
  });

  it("reduces PA for income above £100 000", () => {
    // 120 000 - 100 000 = 20 000 → reduction = 10 000 → PA = 2 570
    const b = calculateTaxBreakdown(120_000, RATES);
    expect(b.taxFreeAllowance).toBe(2_570);
    expect(b.basicRateTaxable).toBe(47_700); // 50 270 - 2 570
    expect(b.basicRateTax).toBe(9_540); // 47 700 × 20%
    expect(b.higherRateTaxable).toBe(69_730);
    expect(b.higherRateTax).toBe(27_892); // 69 730 × 40%
    expect(b.additionalRateTaxable).toBe(0);
  });

  it("reduces PA to zero at £125 140", () => {
    const b = calculateTaxBreakdown(125_140, RATES);
    expect(b.taxFreeAllowance).toBe(0);
    // 125 140 - 0 → all bands filled
    expect(b.basicRateTaxable).toBe(50_270);
    expect(b.higherRateTaxable).toBe(74_870);
    expect(b.additionalRateTaxable).toBe(0);
    expect(b.totalIncomeTax).toBe(40_002); // 10 054 + 29 948
  });

  it("PA never goes below zero", () => {
    const b = calculateTaxBreakdown(200_000, RATES);
    expect(b.taxFreeAllowance).toBe(0);
    expect(b.additionalRateTaxable).toBe(200_000 - 125_140); // 74 860
    expect(b.additionalRateTax).toBe(74_860 * 0.45);
  });
});

// ──────────────────────────────────────────────────────────────
// NIC
// ──────────────────────────────────────────────────────────────

describe("calculateTaxBreakdown — national insurance", () => {
  it("no NIC when salary at or below primary threshold", () => {
    const b = calculateTaxBreakdown(12_570, RATES);
    expect(b.nicLowerTax).toBe(0);
    expect(b.nicUpperTax).toBe(0);
    expect(b.totalNic).toBe(0);
  });

  it("12% NIC on earnings above PT up to UEL", () => {
    // 30 000: NIC 12% on (30 000 - 12 570) = 17 430 × 0.12 = 2 091.60
    const b = calculateTaxBreakdown(30_000, RATES);
    expect(b.nicLowerTaxable).toBe(17_430);
    expect(b.nicLowerTax).toBe(2_091.60);
    expect(b.nicUpperTax).toBe(0);
  });

  it("2% NIC on earnings above UEL", () => {
    // 60 000: NIC 2% on (60 000 - 50 270) = 9 730 × 0.02 = 194.60
    const b = calculateTaxBreakdown(60_000, RATES);
    expect(b.nicUpperTaxable).toBe(9_730);
    expect(b.nicUpperTax).toBe(194.60);
  });
});

// ──────────────────────────────────────────────────────────────
// Effective rates
// ──────────────────────────────────────────────────────────────

describe("calculateTaxBreakdown — effective rates", () => {
  it("zero effective rate when salary at PA", () => {
    const b = calculateTaxBreakdown(12_570, RATES);
    // Income tax = 0, NIC = 0 → no deductions
    expect(b.totalIncomeTax).toBe(0);
    expect(b.totalNic).toBe(0);
    expect(b.totalDeductions).toBe(0);
    expect(b.takeHome).toBe(12_570);
    expect(b.effectiveTaxRate).toBeCloseTo(0, 6);
    expect(b.takeHomePercentage).toBeCloseTo(1, 6);
  });

  it("effective tax rate for £30 000", () => {
    const b = calculateTaxBreakdown(30_000, RATES);
    expect(b.effectiveTaxRate).toBeCloseTo(5_577.60 / 30_000, 6);
    expect(b.takeHomePercentage).toBeCloseTo(24_422.40 / 30_000, 6);
  });
});

// ──────────────────────────────────────────────────────────────
// Tax-free and total reconciliation
// ──────────────────────────────────────────────────────────────

describe("calculateTaxBreakdown — reconciliation", () => {
  it("income tax + NIC = totalDeductions", () => {
    const b = calculateTaxBreakdown(80_000, RATES);
    expect(b.totalDeductions).toBeCloseTo(b.totalIncomeTax + b.totalNic, 6);
  });

  it("gross - deductions = take-home", () => {
    const b = calculateTaxBreakdown(80_000, RATES);
    expect(b.takeHome).toBeCloseTo(b.grossAnnual - b.totalDeductions, 6);
  });

  it("tax bands decompose the gross income", () => {
    const gross = 80_000;
    const b = calculateTaxBreakdown(gross, RATES);
    const taxed =
      b.taxFreeAllowance +
      b.basicRateTaxable +
      b.higherRateTaxable +
      b.additionalRateTaxable;
    expect(taxed).toBeCloseTo(gross, 2);
  });
});

// ──────────────────────────────────────────────────────────────
// Table rows
// ──────────────────────────────────────────────────────────────

describe("TAX_TABLE_ROWS", () => {
  it("has rows for every tax component", () => {
    const keys = TAX_TABLE_ROWS.map((r) => r.key);
    expect(keys).toEqual([
      "gross",
      "allowance",
      "basic",
      "higher",
      "additional",
      "nic-12",
      "nic-2",
      "total",
      "takehome",
    ]);
  });

  it("marks total and take-home rows with their types", () => {
    expect(TAX_TABLE_ROWS.find((r) => r.key === "total")?.type).toBe("total");
    expect(TAX_TABLE_ROWS.find((r) => r.key === "takehome")?.type).toBe("takehome");
    expect(TAX_TABLE_ROWS.find((r) => r.key === "gross")?.type).toBe("gross");
  });

  it("every row's valueKey exists on TaxBreakdown", () => {
    const dummy = calculateTaxBreakdown(50_000, RATES);
    for (const row of TAX_TABLE_ROWS) {
      expect(dummy[row.valueKey]).not.toBeUndefined();
      if (row.taxableKey) {
        expect(dummy[row.taxableKey]).not.toBeUndefined();
      }
    }
  });
});
