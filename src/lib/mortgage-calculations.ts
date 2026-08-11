/**
 * Pure financial calculation functions for mortgage analysis.
 * These are extracted from the calculator component so they can be unit-tested independently.
 */

/** Monthly rate from annual percentage rate. */
export function monthlyRateFromAnnual(annualRate: number): number {
  return annualRate / 100 / 12;
}

/** Monthly mortgage payment for a fully-amortising loan. */
export function monthlyPaymentForLoan(
  loan: number,
  annualRate: number,
  years: number,
): number {
  const r = monthlyRateFromAnnual(annualRate);
  const n = years * 12;
  if (r === 0) return loan / n;
  return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/** Loan amount affordable with a given monthly payment over `years` at `annualRate`. */
export function loanForMonthlyPayment(
  payment: number,
  annualRate: number,
  years: number,
): number {
  const r = monthlyRateFromAnnual(annualRate);
  const n = years * 12;
  if (r === 0) return payment * n;
  return (payment * (1 - Math.pow(1 + r, -n))) / r;
}

/** Remaining mortgage balance after `yearsElapsed` years of `monthlyPayment`. */
export function remainingBalance(
  loan: number,
  annualRate: number,
  monthlyPayment: number,
  yearsElapsed: number,
): number {
  const r = monthlyRateFromAnnual(annualRate);
  const months = Math.round(yearsElapsed * 12);
  if (months === 0) return loan;
  if (r === 0) {
    return Math.max(0, loan - monthlyPayment * months);
  }
  const growth = Math.pow(1 + r, months);
  const balance = loan * growth - (monthlyPayment * (growth - 1)) / r;
  return Math.max(0, balance);
}

/** Months until the loan is fully repaid. Returns null if payment ≤ interest-only. */
export function payoffMonths(
  loan: number,
  annualRate: number,
  monthlyPayment: number,
): number | null {
  const r = monthlyRateFromAnnual(annualRate);
  if (r === 0) {
    if (monthlyPayment <= 0) return null;
    return loan / monthlyPayment;
  }
  if (monthlyPayment <= loan * r) return null;
  return Math.log(monthlyPayment / (monthlyPayment - loan * r)) / Math.log(1 + r);
}

/** Future value of an initial investment plus monthly contributions, compounding monthly. */
export function futureValue(
  initial: number,
  annualRate: number,
  monthlyContribution: number,
  yearsElapsed: number,
): number {
  const r = annualRate / 100 / 12;
  const months = Math.round(yearsElapsed * 12);
  if (months === 0) return initial;
  if (r === 0) {
    return initial + monthlyContribution * months;
  }
  const growth = Math.pow(1 + r, months);
  return initial * growth + (monthlyContribution * (growth - 1)) / r;
}

/**
 * Compute the payoff status message for display in the "Fix Deposit" summary.
 *
 * @returns A human-readable description of when (or if) the mortgage is paid off.
 */
export function getPayoffMessage(
  payoffMonth: number, // months until payoff, or Infinity if never
  years: number, // total term in years
): string {
  const payoffYear = payoffMonth / 12;
  if (payoffMonth === Infinity) {
    return "Not repaid (payment ≤ interest)";
  }
  if (payoffMonth <= years * 12 + 1) {
    if (payoffMonth < years * 12 - 1) {
      return `Paid off in ${payoffYear.toFixed(1)} years`;
    }
    return `Paid off at year ${years}`;
  }
  return `Not repaid by year ${years} (payoff in ${payoffYear.toFixed(1)} years)`;
}
