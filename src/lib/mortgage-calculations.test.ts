import { describe, it, expect } from "vitest";
import {
  monthlyRateFromAnnual,
  monthlyPaymentForLoan,
  loanForMonthlyPayment,
  remainingBalance,
  payoffMonths,
  futureValue,
  getPayoffMessage,
} from "@/lib/mortgage-calculations";

describe("monthlyRateFromAnnual", () => {
  it("converts 5% annual to monthly", () => {
    expect(monthlyRateFromAnnual(5)).toBeCloseTo(0.05 / 12, 10);
  });

  it("returns 0 for 0% annual rate", () => {
    expect(monthlyRateFromAnnual(0)).toBe(0);
  });

  it("handles negative rates", () => {
    expect(monthlyRateFromAnnual(-3)).toBeCloseTo(-0.03 / 12, 10);
  });
});

describe("monthlyPaymentForLoan", () => {
  // Standard amortisation: 270k loan, 5% annual, 30 years
  // r = 0.05/12, n = 360
  // payment = loan * r * (1+r)^n / ((1+r)^n - 1)
  it("computes standard 30-year £270k mortgage at 5%", () => {
    const loan = 270000;
    const payment = monthlyPaymentForLoan(loan, 5, 30);
    // Manual check: ~£1,449.42
    expect(payment).toBeCloseTo(1449.42, 2);
  });

  it("payment should amortise the loan exactly (balance → 0 at term)", () => {
    const loan = 200000;
    const rate = 4.5;
    const years = 25;
    const pmt = monthlyPaymentForLoan(loan, rate, years);
    const bal = remainingBalance(loan, rate, pmt, years);
    expect(bal).toBeCloseTo(0, 2);
  });

  it("returns 0 for zero loan", () => {
    expect(monthlyPaymentForLoan(0, 5, 30)).toBe(0);
  });

  it("handles zero-interest rate (linear amortisation)", () => {
    const pmt = monthlyPaymentForLoan(120000, 0, 10);
    expect(pmt).toBeCloseTo(1000, 2); // 120000 / (10*12) = 1000
  });

  it("higher rate → higher payment", () => {
    const pmtLow = monthlyPaymentForLoan(300000, 3, 30);
    const pmtHigh = monthlyPaymentForLoan(300000, 7, 30);
    expect(pmtHigh).toBeGreaterThan(pmtLow);
  });

  it("longer term → lower payment", () => {
    const pmtShort = monthlyPaymentForLoan(300000, 5, 15);
    const pmtLong = monthlyPaymentForLoan(300000, 5, 30);
    expect(pmtLong).toBeLessThan(pmtShort);
  });
});

describe("loanForMonthlyPayment", () => {
  it("is the inverse of monthlyPaymentForLoan", () => {
    const loan = 250000;
    const rate = 5;
    const years = 25;
    const pmt = monthlyPaymentForLoan(loan, rate, years);
    const recoveredLoan = loanForMonthlyPayment(pmt, rate, years);
    expect(recoveredLoan).toBeCloseTo(loan, 2);
  });

  it("returns 0 for zero payment", () => {
    expect(loanForMonthlyPayment(0, 5, 30)).toBe(0);
  });

  it("handles zero-interest rate", () => {
    // payment * n months = loan
    expect(loanForMonthlyPayment(1000, 0, 10)).toBeCloseTo(120000, 2);
  });

  it("higher payment → larger loan", () => {
    const loanLow = loanForMonthlyPayment(1000, 5, 30);
    const loanHigh = loanForMonthlyPayment(2000, 5, 30);
    expect(loanHigh).toBeGreaterThan(loanLow);
  });
});

describe("remainingBalance", () => {
  const loan = 270000;
  const rate = 5;
  const years = 30;
  const pmt = monthlyPaymentForLoan(loan, rate, years);

  it("returns full loan at year 0", () => {
    expect(remainingBalance(loan, rate, pmt, 0)).toBe(loan);
  });

  it("returns ~0 at the end of the term (standard payment)", () => {
    const bal = remainingBalance(loan, rate, pmt, years);
    expect(bal).toBeCloseTo(0, 2);
  });

  it("balance decreases over time", () => {
    const bal5 = remainingBalance(loan, rate, pmt, 5);
    const bal10 = remainingBalance(loan, rate, pmt, 10);
    const bal20 = remainingBalance(loan, rate, pmt, 20);
    expect(bal5).toBeGreaterThan(bal10);
    expect(bal10).toBeGreaterThan(bal20);
    expect(bal20).toBeLessThan(bal5);
  });

  it("higher payment → lower balance at same year", () => {
    const balStandard = remainingBalance(loan, rate, pmt, 10);
    const balHigher = remainingBalance(loan, rate, pmt * 1.5, 10);
    expect(balHigher).toBeLessThan(balStandard);
  });

  it("never goes below 0", () => {
    const bal = remainingBalance(loan, rate, pmt * 3, 15);
    expect(bal).toBe(0);
  });

  it("handles zero interest rate", () => {
    const pmt0 = loan / (30 * 12);
    const bal10 = remainingBalance(loan, 0, pmt0, 10);
    expect(bal10).toBeCloseTo(loan * (1 - 10 / 30), 2);
  });

  it("balance is capped at 0 when overpaid", () => {
    const bal = remainingBalance(100000, 5, 5000, 5);
    expect(bal).toBe(0);
  });
});

describe("payoffMonths", () => {
  it("returns ~360 months for standard 30-year payment", () => {
    const loan = 270000;
    const pmt = monthlyPaymentForLoan(loan, 5, 30);
    const months = payoffMonths(loan, 5, pmt);
    expect(months).not.toBeNull();
    expect(months).toBeCloseTo(360, 1);
  });

  it("higher payment → fewer months", () => {
    const loan = 270000;
    const standard = monthlyPaymentForLoan(loan, 5, 30);
    const normalPayoff = payoffMonths(loan, 5, standard);
    const fastPayoff = payoffMonths(loan, 5, standard * 2);
    expect(normalPayoff).not.toBeNull();
    expect(fastPayoff).not.toBeNull();
    expect(fastPayoff!).toBeLessThan(normalPayoff!);
  });

  it("returns null when payment ≤ interest-only", () => {
    const loan = 270000;
    const interestOnly = loan * (5 / 100 / 12);
    // Payment below interest-only → loan grows, never repaid
    expect(payoffMonths(loan, 5, interestOnly * 0.9)).toBeNull();
  });

  it("returns null for zero payment", () => {
    expect(payoffMonths(270000, 5, 0)).toBeNull();
  });

  it("handles zero interest rate", () => {
    const months = payoffMonths(120000, 0, 1000);
    expect(months).toBeCloseTo(120, 5);
  });
});

describe("futureValue", () => {
  it("returns initial at year 0", () => {
    expect(futureValue(10000, 7, 500, 0)).toBe(10000);
  });

  it("zero rate: initial + contributions", () => {
    // 10000 + 500*12*3 = 10000 + 18000 = 28000
    expect(futureValue(10000, 0, 500, 3)).toBeCloseTo(28000, 2);
  });

  it("compounds monthly", () => {
    // 10000 at 7% for 1 year with 500/month
    const r = 0.07 / 12;
    const n = 12;
    const expected =
      10000 * Math.pow(1 + r, n) + 500 * (Math.pow(1 + r, n) - 1) / r;
    expect(futureValue(10000, 7, 500, 1)).toBeCloseTo(expected, 2);
  });

  it("positive rate → growth > simple sum", () => {
    const fv = futureValue(10000, 10, 0, 10);
    const simple = 10000; // no contributions
    expect(fv).toBeGreaterThan(simple);
  });

  it("longer term → higher future value", () => {
    const fv10 = futureValue(10000, 7, 500, 10);
    const fv20 = futureValue(10000, 7, 500, 20);
    expect(fv20).toBeGreaterThan(fv10);
  });
});

describe("getPayoffMessage", () => {
  it("returns early payoff message", () => {
    // 14.6 years payoff, 30 year term
    expect(getPayoffMessage(14.6 * 12, 30)).toBe("Paid off in 14.6 years");
  });

  it("returns on-term message when payoff ≈ term", () => {
    expect(getPayoffMessage(360, 30)).toBe("Paid off at year 30");
  });

  it("returns not-repaid message when payoff > term", () => {
    expect(getPayoffMessage(70 * 12, 30)).toBe(
      "Not repaid by year 30 (payoff in 70.0 years)",
    );
  });

  it("returns interest-only message for Infinity", () => {
    expect(getPayoffMessage(Infinity, 30)).toBe("Not repaid (payment ≤ interest)");
  });
});
