/**
 * Pure financial calculation functions for the Rent vs Buy comparison.
 *
 * Model:
 *  - Both scenarios share the same **starting investment** and the same
 *    **total monthly amount** (`monthlyHousingBudget`) — the total money the
 *    user has available each month to spend on housing *and* to invest.
 *  - **Rent scenario**  : starting investment → stocks; each month the leftover
 *                         (total − rent) → stocks. **Rent is a user-provided
 *                         input**, not derived, so the comparison reflects the
 *                         user's actual housing cost. Rent may escalate annually
 *                         at `rentIncreaseRate`%, shrinking the yearly stock
 *                         contribution over time.
 *  - **Mortgage scenario**: starting investment → down payment; each month the
 *                         leftover (total − mortgage − maintenance) → stocks.
 *
 * Net worth at year *t*:
 *  - Rent     = futureValue(startingInvestment, stockRate, monthlyRentInvest, t)
 *  - Mortgage = homeEquity(t) + futureValue(0, stockRate, monthlyMortgageInvest, t)
 *    where homeEquity = propertyValue·(1+appreciation)^t − remainingMortgage(t)
 *
 * **Breakeven rent**: the monthly rent at which the two scenarios produce equal
 * net worth at the projection horizon. Below this rent, renting wins; above it,
 * buying wins. See {@link breakevenRent}.
 */
import {
  monthlyPaymentForLoan,
  remainingBalance,
  futureValue,
} from "./mortgage-calculations";

export interface RentVsBuyInputs {
  /** Lump sum available up-front (down payment or stock investment). */
  startingInvestment: number;
  /** Purchase price of the property. */
  propertyValue: number;
  /** Total monthly amount the user has to spend on housing *and* to invest. */
  monthlyHousingBudget: number;
  /**
   * The user's actual monthly rent. This is an input (not derived) so the
   * comparison reflects real-world housing cost. Defaults to
   * `monthlyMortgagePayment + monthlyMaintenanceCost` (a "fair" comparison)
   * in the UI, but the user is free to override it.
   */
  monthlyRent: number;
  /**
   * Annual rent increase rate (%). Rent grows year-on-year as
   * `monthlyRent * (1 + rentIncreaseRate / 100) ^ year`. `0` keeps rent
   * constant (the default); e.g. `3` means rent rises 3% per year. The rent
   * scenario's stock contribution therefore shrinks in later years.
   */
  rentIncreaseRate: number;
  /**
   * Annual increase rate (%) applied to the total monthly housing budget.
   * The budget grows year-on-year as `monthlyHousingBudget *
   * (1 + housingBudgetIncreaseRate / 100) ^ year`. `0` keeps the budget
   * constant (the default); e.g. `3` means the budget rises 3% per year (e.g.
   * wage growth), increasing the amount available for housing and stock
   * investment in **both** scenarios.
   */
  housingBudgetIncreaseRate: number;
  /**
   * Optional monthly mortgage overpayment as a percentage of the loan.
   * An overpayment is an *extra* amount paid toward the mortgage principal
   * each month, on top of the regular amortising payment. This reduces the
   * outstanding balance faster, lowering total interest paid and (if large
   * enough) paying the loan off before the end of the term.
   *
   * The overpay is deducted from the mortgage-scenario stock investment — the
   * total monthly amount is fixed, so every pound overpaid against the loan
   * is a pound not invested in stocks.
   *
   * `0` (the default) disables overpayment and preserves the original model.
   */
  mortgageOverpayRate?: number;
  /**
   * How to compute the monthly mortgage overpayment from `mortgageOverpayRate`:
   *
   * - `"initial"`   — a fixed percentage of the **original** loan amount
   *                   (`propertyValue − downPayment`). The monthly overpay is
   *                   constant for the whole term.
   * - `"remaining"` — a percentage of the **current outstanding balance**.
   *                   The overpay shrinks as the loan is repaid, so it is
   *                   largest early and tapers off.
   *
   * Defaults to `"initial"` for backward compatibility.
   */
  mortgageOverpayMode?: "initial" | "remaining";
  /** Annual mortgage interest rate (%). */
  mortgageRate: number;
  /** Mortgage term in years. */
  mortgageTermYears: number;
  /** Annual property appreciation rate (%). */
  propertyAppreciationRate: number;
  /** Annual stock market return rate (%). */
  stockReturnRate: number;
  /** Fixed monthly maintenance cost of owning the property. */
  monthlyMaintenanceCost: number;
  /**
   * Monthly amount earmarked for a pension. This is the *out-of-pocket* figure —
   * the money you actually pay out of your bank account each month. It reduces
   * the stock investment in *both* scenarios by this amount.
   *
   * The actual amount paid *into* the pension pot is `monthlyPension` (net) or
   * `monthlyPension * (5 / 3)` when {@link RentVsBuyInputs.pensionGross} is set
   * (a tax-relief uplift directed into the pot, not deducted from stocks). The
   * pot grows at the stock return rate (see {@link RentVsBuyDerived.pensionRate})
   * and is the same pot in each scenario, so it cancels out of the breakeven
   * calculation — but the gross ×5/3 uplift is a real bonus that makes gross-mode
   * net worth strictly higher than net mode.
   *
   * Optional / defaults to `0` (== no pension) so legacy callers are unaffected.
   */
  monthlyPension?: number;
  /**
   * Whether to add the tax recompensation (×5/3) on top of the out-of-pocket
   * `monthlyPension`. When `true` the pension pot receives `monthlyPension * 5/3`;
   * when `false` the slider value is invested directly (net). The out-of-pocket
   * amount deducted from stocks / affordability is always the slider value.
   *
   * Optional / defaults to `false` (net) so legacy callers are unaffected.
   */
  pensionGross?: boolean;
  /** Number of years to project. */
  projectionYears: number;
}

export interface RentVsBuyDataPoint {
  year: number;
  rentScenarioNW: number;
  mortgageScenarioNW: number;
  difference: number;
}

/** Down-payment / mortgage-derived values computed once from the inputs. */
export interface RentVsBuyDerived {
  downPayment: number;
  mortgageAmount: number;
  monthlyMortgagePayment: number;
  /** Monthly amount invested in stocks in the *rent* scenario. */
  monthlyStockInvestment: number;
  /** Monthly amount invested in stocks in the *mortgage* scenario. */
  monthlyMortgageStockInvestment: number;
  /**
   * Actual monthly amount paid into the pension pot (= `monthlyPension` in net
   * mode, × `5 / 3` in gross mode). The gross uplift is a tax-relief bonus paid
   * *into* the pot, so it is NOT deducted from the stock investment — only the
   * out-of-pocket `monthlyPension` slider value is.
   */
  pensionInvested: number;
  /**
   * Out-of-pocket pension contribution (the slider value, ×1). This is the
   * amount deducted from the stock investment / affordability.
   */
  monthlyPension: number;
  /**
   * Annual growth rate (%) applied to the pension pot. The pension is a
   * stock-market investment, so it grows at the *stock* return rate
   * (`inputs.stockReturnRate`). In net mode the pot grows at the same rate as
   * the regular stock contributions, but the gross ×5/3 uplift means the pot
   * still ends up larger than the amount diverted from stocks — it is NOT a
   * zero-sum trade-off.
   */
  pensionRate: number;
  monthlyRent: number;
  /**
   * Constant monthly mortgage overpayment (for `"initial"` mode only).
   * Computed once in {@link deriveValues} as `mortgageAmount × rate / 100 / 12`.
   * When `mortgageOverpayMode` is `"remaining"` this is `0` — the overpay is
   * recomputed each year from the then-current balance.
   */
  monthlyOverpay: number;
  /**
   * Total monthly mortgage outflow = regular payment + overpay. Used for the
   * "initial" mode where the overpay is constant. For "remaining" mode this is
   * still the regular payment + the *initial* overpay (a representative figure
   * shown in the summary; the tooltip/table show per-year values).
   */
  effectiveMonthlyMortgagePayment: number;
  affordable: boolean;
}

/**
 * Compute derived mortgage / housing values from the raw inputs.
 *
 * The rent scenario invests whatever is left of the total monthly amount
 * after paying rent; the mortgage scenario invests what's left after the mortgage
 * payment and maintenance. These are independent because rent is now a
 * user-provided input.
 */
export function deriveValues(inputs: RentVsBuyInputs): RentVsBuyDerived {
  const downPayment = Math.min(inputs.startingInvestment, inputs.propertyValue);
  const mortgageAmount = Math.max(0, inputs.propertyValue - downPayment);
  const monthlyMortgagePayment =
    mortgageAmount > 0
      ? monthlyPaymentForLoan(
          mortgageAmount,
          inputs.mortgageRate,
          inputs.mortgageTermYears,
        )
      : 0;

  // Pension: a monthly contribution, optionally gross (×5/3). Optional inputs
  // default to 0 / false so legacy callers see no difference.
  const pensionRaw = inputs.monthlyPension ?? 0;
  const pensionInvested = pensionRaw * (inputs.pensionGross ? 5 / 3 : 1);
  // The pension is invested in the stock market, so it grows at the stock
  // return rate (not the mortgage rate).
  const pensionRate = inputs.stockReturnRate;

  // Mortgage overpayment — an extra monthly amount paid toward the principal,
  // reducing the outstanding balance faster. In "initial" mode the overpay is
  // a fixed percentage of the original loan; in "remaining" mode it is a
  // percentage of the current balance and is recomputed each year (so it
  // starts at a representative value here and the per-year exact amount is
  // resolved in the simulation loop).
  const overpayRate = inputs.mortgageOverpayRate ?? 0;
  const overpayMode = inputs.mortgageOverpayMode ?? "initial";
  const monthlyOverpay =
    overpayMode === "initial"
      ? mortgageAmount > 0
        ? (mortgageAmount * overpayRate) / 100 / 12
        : 0
      : 0; // "remaining" mode — computed per-year in the simulation

  // Rent scenario: pension is paid out of pocket at the slider value, so only
  // that is subtracted before the rest goes to stocks.
  const monthlyStockInvestment = Math.max(
    0,
    inputs.monthlyHousingBudget - inputs.monthlyRent - pensionRaw,
  );

  // Mortgage scenario: mortgage payment + overpay + maintenance + pension are
  // "spent", the rest goes to stocks. When the mortgage is paid off the
  // payment and overpay drop to 0 and the freed-up cash goes to stocks —
  // that is handled per-year in buildDetailedComparisonData /
  // mortgageStocksWithEscalation, so the figure here is the *initial* rate
  // (before any early-payoff adjustment).
  const monthlyMortgageStockInvestment = Math.max(
    0,
    inputs.monthlyHousingBudget -
      monthlyMortgagePayment -
      monthlyOverpay -
      inputs.monthlyMaintenanceCost -
      pensionRaw,
  );

  const effectiveMonthlyMortgagePayment = monthlyMortgagePayment + monthlyOverpay;

  return {
    downPayment,
    mortgageAmount,
    monthlyMortgagePayment,
    monthlyOverpay,
    effectiveMonthlyMortgagePayment,
    monthlyStockInvestment,
    monthlyMortgageStockInvestment,
    pensionInvested,
    pensionRate,
    monthlyPension: pensionRaw,
    monthlyRent: inputs.monthlyRent,
    affordable:
      inputs.monthlyHousingBudget >= inputs.monthlyRent + pensionRaw,
  };
}

/**
 * Value of the pension pot after `yearsElapsed` years.
 *
 * The pension is funded with a *constant* monthly contribution
 * (`derived.pensionInvested`) and grows at the stock return rate
 * (`derived.pensionRate`). It is the same pot in both scenarios, which is why
 * it cancels out of the breakeven calculation (see {@link breakevenRent}).
 *
 * At t === 0 nothing has been contributed yet, so the pot is 0.
 */
function pensionPotFor(
  _inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  yearsElapsed: number,
): number {
  if (derived.pensionInvested === 0 || yearsElapsed <= 0) return 0;
  return futureValue(0, derived.pensionRate, derived.pensionInvested, yearsElapsed);
}

/**
 * Net worth for the **Rent + Invest** scenario after `yearsElapsed`.
 *
 * Starting investment is put in stocks; each month the leftover (after
 * rent and the pension contribution) is also invested in stocks. The pension
 * contribution grows in a separate pot at the stock return rate and is added on
 * top.
 *
 * With a constant rent (the default, `rentIncreaseRate === 0`) the monthly
 * contribution is flat, so this delegates to the closed-form {@link futureValue}
 * and is bit-identical to the original model (the pension adds 0). When rent
 * escalates annually, the yearly contribution block shrinks; see
 * {@link rentScenarioNetWorthWithEscalation}.
 */
export function rentScenarioNetWorth(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  yearsElapsed: number,
): number {
  // Use the closed-form only when both rent and budget are constant.
  if (
    inputs.rentIncreaseRate === 0 &&
    inputs.housingBudgetIncreaseRate === 0
  ) {
    return (
      futureValue(
        inputs.startingInvestment,
        inputs.stockReturnRate,
        derived.monthlyStockInvestment,
        yearsElapsed,
      ) + pensionPotFor(inputs, derived, yearsElapsed)
    );
  }

  return rentScenarioNetWorthWithEscalation(inputs, derived, yearsElapsed);
}

/**
 * Rent + invest net worth when rent escalates annually by `rentIncreaseRate`.
 *
 * Rent in year `y` (0-indexed) is `monthlyRent * (1 + g) ^ y` where
 * `g = rentIncreaseRate / 100`; each year the leftover of the total monthly
 * amount after rent is invested in stocks. The lump-sum starting investment is
 * held in stocks for the full horizon.
 *
 * Each year's 12 monthly contributions are valued at end-of-year using the
 * monthly stock return (via {@link futureValue}), then compounded forward to
 * the horizon. With `g === 0` this is mathematically equal to
 * `futureValue(startingInvestment, stockReturnRate, monthlyStockInvestment, n)`.
 */
export function rentScenarioNetWorthWithEscalation(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  yearsElapsed: number,
): number {
  const rm = inputs.stockReturnRate / 100 / 12;
  const g = inputs.rentIncreaseRate / 100;
  const gB = inputs.housingBudgetIncreaseRate / 100;
  const totalMonths = Math.round(yearsElapsed * 12);
  const growthToHorizon = Math.pow(1 + rm, totalMonths);

  // Lump-sum starting investment, compounding to the horizon.
  let total = inputs.startingInvestment * growthToHorizon;

  // Future value, at month 12, of 12 end-of-month £1 contributions.
  const annualBlockFV = futureValue(0, inputs.stockReturnRate, 1, 1);
  // Only the out-of-pocket slider value is deducted from the stock investment
  // each year; the ×5/3 tax uplift goes straight into the pension pot.
  const monthlyPension = derived.monthlyPension;

  for (let y = 0; y < yearsElapsed; y++) {
    const rentY = inputs.monthlyRent * Math.pow(1 + g, y);
    // Budget also escalates (e.g. wage growth), increasing investment power.
    const budgetY = inputs.monthlyHousingBudget * Math.pow(1 + gB, y);
    const monthlyInvest = Math.max(
      0,
      budgetY - rentY - monthlyPension,
    );
    if (monthlyInvest <= 0) continue;
    // Months from the end of year y to the horizon (0 for the final year).
    const monthsRemaining = 12 * (yearsElapsed - y - 1);
    total += monthlyInvest * annualBlockFV * Math.pow(1 + rm, monthsRemaining);
  }

  // Constant monthly pension contribution growing at the stock return rate.
  return total + pensionPotFor(inputs, derived, yearsElapsed);
}

/**
 * The component pieces of the **Mortgage + Invest** scenario after
 * `yearsElapsed` years, broken out so the UI can explain *why* the net worth
 * moved the way it did.
 *
 * - `currentPropertyValue` — market value of the property (appreciation only).
 * - `currentMortgageBalance` — outstanding loan balance (falls as principal is
 *   repaid; 0 for an all‑cash purchase).
 * - `homeEquity` = `currentPropertyValue − currentMortgageBalance` (clamped ≥ 0).
 * - `stocks` — value of the monthly stock contributions (no lump sum, since the
 *   starting investment went to the down payment). This excludes the pension.
 * - `pensionPot` — value of the pension contributions (constant monthly amount
 *   at the stock return rate). This is the same pot as in the rent scenario.
 *
 * Net worth = `homeEquity + stocks + pensionPot`.
 */
export interface MortgageScenarioComponents {
  currentPropertyValue: number;
  currentMortgageBalance: number;
  homeEquity: number;
  stocks: number;
  pensionPot: number;
}

/**
 * Stock value in the mortgage scenario when the housing budget escalates
 * annually. Each year's 12 monthly contributions (budget − effective payment
 * − overpay − maintenance − pension) are valued at end-of-year via
 * {@link futureValue} and then compounded forward to the horizon. When the
 * budget is constant and the overpay is constant ("initial" mode or none),
 * this is mathematically equal to the closed-form
 * `futureValue(0, rate, monthlyMortgageStockInvestment, n)`.
 */
function mortgageStocksWithEscalation(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  yearsElapsed: number,
): number {
  if (yearsElapsed <= 0) return 0;

  const rm = inputs.stockReturnRate / 100 / 12;
  const gB = inputs.housingBudgetIncreaseRate / 100;
  // Future value, at month 12, of 12 end-of-month £1 contributions.
  const annualBlockFV = futureValue(0, inputs.stockReturnRate, 1, 1);

  let total = 0;
  for (let y = 0; y < yearsElapsed; y++) {
    // Projection-year y is 0-indexed; the "display year" is y+1 (1-indexed).
    const yearNum = y + 1;
    const budgetY = inputs.monthlyHousingBudget * Math.pow(1 + gB, y);
    const monthlyOverpayY = monthlyOverpayForYear(inputs, derived, yearNum);
    const effectivePayment = effectiveMonthlyMortgagePaymentForYear(
      inputs,
      derived,
      yearNum,
    );
    const monthlyInvest = Math.max(
      0,
      budgetY -
        effectivePayment -
        monthlyOverpayY -
        inputs.monthlyMaintenanceCost -
        derived.monthlyPension,
    );
    if (monthlyInvest <= 0) continue;
    // Months from the end of year y to the horizon (0 for the final year).
    const monthsRemaining = 12 * (yearsElapsed - y - 1);
    total += monthlyInvest * annualBlockFV * Math.pow(1 + rm, monthsRemaining);
  }
  // No lump-sum term: the starting investment went to the down payment.
  return total;
}

/**
 * {@link MortgageScenarioComponents}. Extracted from {@link mortgageScenarioNetWorth}
 * so the chart tooltip can attribute net-worth movement to appreciation,
 * principal paydown and stock growth.
 */
export function mortgageScenarioComponents(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  yearsElapsed: number,
): MortgageScenarioComponents {
  // Property value with monthly compounding appreciation
  const monthlyAppreciation = inputs.propertyAppreciationRate / 100 / 12;
  const months = Math.round(yearsElapsed * 12);
  const currentPropertyValue =
    inputs.propertyValue * Math.pow(1 + monthlyAppreciation, months);

  // Remaining mortgage balance after `yearsElapsed` years, accounting for any
  // monthly overpayment. Uses the closed-form remainingBalance when there is
  // no "remaining"-mode overpay; otherwise month-by-month simulation.
  const currentMortgageBalance = mortgageBalanceAtYear(
    inputs,
    derived,
    yearsElapsed,
  );

  // Home equity = property value minus what's still owed
  const homeEquity = Math.max(0, currentPropertyValue - currentMortgageBalance);

  // Stock investments (no lump-sum because starting investment went to down payment).
  // The closed-form FV is only valid when the monthly stock contribution is constant
  // — i.e. no budget escalation AND no overpay (which could cause early payoff
  // and a step-change in the stock contribution). When either is present, we
  // loop year-by-year to compound each year's contribution to the horizon.
  const overpayRate = inputs.mortgageOverpayRate ?? 0;
  // The closed-form FV is only valid when both the budget and the mortgage
  // outflow are constant for the entire term — i.e. no budget escalation AND
  // no overpay (which could cause early payoff and a step-change in the stock
  // contribution). When either is present, loop year-by-year.
  const stocks =
    inputs.housingBudgetIncreaseRate === 0 && overpayRate === 0
      ? futureValue(
          0,
          inputs.stockReturnRate,
          derived.monthlyMortgageStockInvestment,
          yearsElapsed,
        )
      : mortgageStocksWithEscalation(inputs, derived, yearsElapsed);
  // Pension pot (constant monthly contribution at the stock return rate).
  const pensionPot = pensionPotFor(inputs, derived, yearsElapsed);

  return { currentPropertyValue, currentMortgageBalance, homeEquity, stocks, pensionPot };
}

/**
 * Net worth for the **Mortgage + Invest** scenario after `yearsElapsed`.
 *
 * Starting investment is the down payment.  Home equity = current property
 * value − remaining mortgage.  Monthly leftovers go to stocks.  The pension
 * pot (constant monthly contribution at the stock return rate) is added on top —
 * see {@link MortgageScenarioComponents.pensionPot}.
 *
 * This is just {@link mortgageScenarioComponents}`().homeEquity + .stocks +
 * .pensionPot`; kept as a function for backwards compatibility and the lib
 * tests.
 */
export function mortgageScenarioNetWorth(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  yearsElapsed: number,
): number {
  const c = mortgageScenarioComponents(inputs, derived, yearsElapsed);
  return c.homeEquity + c.stocks + c.pensionPot;
}

/**
 * The richer, per-year breakdown used by the chart tooltip. Extends the basic
 * {@link RentVsBuyDataPoint} with the component pieces and year-over-year
 * change attribution so the tooltip can explain *where* each scenario's net
 * worth came from and *how much* was spent on housing that year.
 */
export interface RentVsBuyDetailedDataPoint extends RentVsBuyDataPoint {
  /** Current market value of the property (appreciation only). */
  currentPropertyValue: number;
  /** Outstanding mortgage balance (0 for an all-cash purchase). */
  currentMortgageBalance: number;
  /** Home equity = property value − outstanding mortgage (≥ 0). */
  mortgageHomeEquity: number;
  /** Stocks held in the mortgage scenario (monthly contributions grown). */
  mortgageStocks: number;
  /** Pension pot after this year (constant monthly contribution at the mortgage
   *  rate; the same pot is held in both scenarios, so it cancels in breakeven). */
  pensionPot: number;
  /** Rent-scenario net-worth change vs the previous year (0 at year 0). */
  rentScenarioChange: number;
  /** Mortgage-scenario net-worth change vs the previous year (0 at year 0). */
  mortgageScenarioChange: number;
  /** Property-value appreciation vs the previous year (0 at year 0). */
  mortgageAppreciation: number;
  /** Mortgage principal repaid vs the previous year, as a positive number (0 at year 0). */
  mortgagePrincipalPaid: number;
  /**
   * Interest paid on the mortgage during this year = annual mortgage payment
   * (`monthlyMortgagePayment × 12`) minus the principal repaid this year.
   * Excludes maintenance (a separate owning cost) and is 0 at year 0 / for an
   * all-cash purchase.
   */
  interestPaidThisYear: number;
  /** Growth of the mortgage-scenario stock holding vs the previous year (0 at year 0). */
  mortgageStocksChange: number;
  /** Growth of the pension pot vs the previous year (0 at year 0). Added to the
   *  mortgage-scenario change attribution alongside appreciation, principal and
   *  stock growth (and to the rent scenario's change). */
  pensionGrowth: number;
  /**
   * Housing outgoings during this year. At year 0 this is the up-front cost —
   * the down payment (mortgage scenario) or the starting investment (rent
   * scenario); for later years it is the recurring annual housing payment.
   */
  rentOutgoings: number;
  mortgageOutgoings: number;
  /**
   * Stocks held in the **rent** scenario at this point (= rentScenarioNW −
   * pensionPot). The rent scenario's net worth is entirely stocks + pension,
   * so this is the stocks slice. 0 at year 0 is just the starting investment.
   */
  rentStocks: number;
  /** Annual rent paid during this projection year (escalates with rentIncreaseRate). 0 at year 0. */
  annualRent: number;
  /** Annual housing budget for this year (escalates with housingBudgetIncreaseRate). 0 at year 0. */
  annualBudget: number;
  /** Annual amount invested in stocks in the rent scenario. 0 at year 0. */
  annualRentStockInvestment: number;
  /** Annual mortgage payment (monthlyMortgagePayment × 12). 0 at year 0 and for an all-cash purchase. */
  annualMortgagePayment: number;
  /** Annual maintenance cost (monthlyMaintenanceCost × 12). 0 at year 0. */
  annualMaintenance: number;
  /** Annual amount invested in stocks in the mortgage scenario (monthlyMortgageStockInvestment × 12). 0 at year 0. */
  annualMortgageStockInvestment: number;
  /** Annual out-of-pocket pension contribution (monthlyPension × 12, the slider value). 0 at year 0. */
  annualPension: number;
  /**
   * Annual mortgage overpayment for this year (= monthly overpay × 12).
   * In "initial" mode this is constant; in "remaining" mode it shrinks as the
   * loan is repaid and is 0 once the mortgage is paid off. 0 at year 0.
   */
  annualOverpay: number;
}

/**
 * Annual rent paid during a given projection year.
 *
 * Rent escalates year-on-year by `rentIncreaseRate`%: rent in projection-year
 * `y` (0-indexed; y=0 is the first year of payments) is
 * `monthlyRent * (1 + rate) ^ y`. The data point at `year: t` has completed
 * `t` years of payments, so the most recent year's rent rate is `(1 + rate)^(t-1)`
 * for `t >= 1`. At `t === 0` no payments have happened yet.
 */
function annualRentForYear(
  inputs: RentVsBuyInputs,
  year: number,
): number {
  if (year <= 0) return 0;
  return (
    inputs.monthlyRent * Math.pow(1 + inputs.rentIncreaseRate / 100, year - 1) * 12
  );
}

/**
 * Monthly stock investment in the rent scenario during a given projection
 * year, accounting for rent escalation. Rent grows year-on-year by
 * `rentIncreaseRate`%, shrinking the leftover available for stocks. The
 * out-of-pocket pension slider is deducted first (the ×5/3 tax uplift is a
 * bonus into the pot, not deducted from stocks). Returns 0 at year 0 (no
 * recurring payments have happened yet).
 */
function monthlyRentStockInvestmentForYear(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  year: number,
): number {
  if (year <= 0) return 0;
  const g = inputs.rentIncreaseRate / 100;
  const rentAtYear = inputs.monthlyRent * Math.pow(1 + g, year - 1);
  const budgetAtYear = monthlyBudgetForYear(inputs, year);
  return Math.max(
    0,
    budgetAtYear - rentAtYear - derived.monthlyPension,
  );
}

/**
 * Monthly housing budget at projection year `year` (1-indexed; year 0 → 0).
 * The budget escalates annually by `housingBudgetIncreaseRate`%, modelling
 * wage or income growth that increases the total amount available for housing
 * and investing.
 */
function monthlyBudgetForYear(
  inputs: RentVsBuyInputs,
  year: number,
): number {
  if (year <= 0) return 0;
  return inputs.monthlyHousingBudget * Math.pow(1 + inputs.housingBudgetIncreaseRate / 100, year - 1);
}

/**
 * Monthly stock investment in the *mortgage* scenario during a given projection
 * year, accounting for budget escalation and mortgage overpayment. As the
 * monthly housing budget grows (e.g. wage growth), the leftover after the
 * mortgage payment, overpay, maintenance and the pension slider grows too.
 * Returns 0 at year 0.
 */
function monthlyMortgageStockInvestmentForYear(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  year: number,
): number {
  if (year <= 0) return 0;
  const budgetAtYear = monthlyBudgetForYear(inputs, year);
  const monthlyOverpayAtYear = monthlyOverpayForYear(inputs, derived, year);
  const effectivePayment = effectiveMonthlyMortgagePaymentForYear(
    inputs,
    derived,
    year,
  );
  return Math.max(
    0,
    budgetAtYear -
      effectivePayment -
      monthlyOverpayAtYear -
      inputs.monthlyMaintenanceCost -
      derived.monthlyPension,
  );
}

/**
 * Monthly mortgage overpayment during a given projection year.
 *
 * - `"initial"` mode: constant = `mortgageAmount × rate / 100 / 12` (the
 *   overpay is a fixed percentage of the original loan).
 * - `"remaining"` mode: `= currentBalance × rate / 100 / 12` (a percentage of
 *   the outstanding balance at the *start* of the year, so it shrinks as the
 *   loan is repaid).
 *
 * Returns 0 at year 0 (no recurring payments have happened yet) or when the
 * loan has already been paid off.
 */
export function monthlyOverpayForYear(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  year: number,
): number {
  if (year <= 0) return 0;
  const overpayRate = inputs.mortgageOverpayRate ?? 0;
  if (overpayRate === 0 || derived.mortgageAmount === 0) return 0;
  const mode = inputs.mortgageOverpayMode ?? "initial";
  if (mode === "initial") {
    // Check if the mortgage is already paid off — no overpay once the loan
    // is gone (the freed-up cash goes to stocks instead).
    const balanceAtStart = mortgageBalanceAtYear(inputs, derived, year - 1);
    if (balanceAtStart <= 0) return 0;
    return derived.monthlyOverpay;
  }
  // "remaining" mode — percentage of the balance at the start of this year.
  const balanceAtStart = mortgageBalanceAtYear(inputs, derived, year - 1);
  if (balanceAtStart <= 0) return 0;
  return (balanceAtStart * overpayRate) / 100 / 12;
}

/**
 * The regular amortising mortgage payment that is actually paid during a given
 * year. Once the loan is fully repaid this drops to 0 — the freed-up cash goes
 * to stocks instead, which is handled in {@link monthlyMortgageStockInvestmentForYear}
 * and {@link mortgageStocksWithEscalation}.
 *
 * Returns 0 at year 0 (no recurring payments have happened yet) or when the
 * mortgage is already paid off at the start of the year.
 */
function effectiveMonthlyMortgagePaymentForYear(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  year: number,
): number {
  if (year <= 0 || derived.mortgageAmount === 0) return 0;
  const balanceAtStart = mortgageBalanceAtYear(inputs, derived, year - 1);
  if (balanceAtStart <= 0) return 0;
  return derived.monthlyMortgagePayment;
}

/**
 * Outstanding mortgage balance after `yearsElapsed` years, accounting for any
 * monthly overpayment.
 *
 * - **No overpay** (`mortgageOverpayRate === 0`): delegates to the closed-form
 *   `remainingBalance` — fast and exact.
 * - **"initial" mode**: the overpay is constant, so the total monthly payment
 *   (`regular + overpay`) is constant. The closed-form `remainingBalance` is
 *   called with the combined payment — still fast and exact.
 * - **"remaining" mode**: the overpay is a percentage of the *current* balance,
 *   so the monthly payment varies. A month-by-month simulation is used instead
 *   — slower but the only way to capture the feedback between balance and
 *   overpay.
 *
 * In all cases the balance is clamped to 0 once the loan is fully repaid.
 */
export function mortgageBalanceAtYear(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
  yearsElapsed: number,
): number {
  if (derived.mortgageAmount === 0) return 0;
  if (yearsElapsed <= 0) return derived.mortgageAmount;

  const overpayRate = inputs.mortgageOverpayRate ?? 0;
  if (overpayRate === 0 || (inputs.mortgageOverpayMode ?? "initial") === "initial") {
    // Constant overpay (or none): closed-form with the combined payment.
    const totalPayment = derived.monthlyMortgagePayment + derived.monthlyOverpay;
    return remainingBalance(
      derived.mortgageAmount,
      inputs.mortgageRate,
      totalPayment,
      yearsElapsed,
    );
  }

  // "remaining" mode — month-by-month simulation.
  const r = inputs.mortgageRate / 100 / 12;
  const months = Math.round(yearsElapsed * 12);
  let balance = derived.mortgageAmount;

  for (let m = 0; m < months; m++) {
    if (balance <= 0) return 0;
    const interest = balance * r;
    const principal = derived.monthlyMortgagePayment - interest;
    balance -= principal;
    // Overpay is a percentage of the *post-regular-payment* balance.
    const overpay = (balance * overpayRate) / 100 / 12;
    balance -= overpay;
  }
  return Math.max(0, balance);
}

/**
 * Build an array of yearly data points for the chart, enriched with the
 * per-year change attribution and outgoings needed by the expandable tooltip.
 *
 * For each year the mortgage-scenario movement is split into property
 * appreciation, mortgage principal repaid and stock growth (these sum to the
 * mortgage-scenario change, ignoring rounding). The rent scenario is
 * 100% stocks, so its change is reported as a single stock figure.
 */
export function buildDetailedComparisonData(
  inputs: RentVsBuyInputs,
): RentVsBuyDetailedDataPoint[] {
  const derived = deriveValues(inputs);
  const data: RentVsBuyDetailedDataPoint[] = [];

  let prevRentNW = 0;
  let prevMortgageNW = 0;
  let prevPropertyValue = inputs.propertyValue;
  let prevMortgageBalance = derived.mortgageAmount;
  let prevStocks = 0;
  let prevPensionPot = 0;

  for (let t = 0; t <= inputs.projectionYears; t++) {
    const rentNW = rentScenarioNetWorth(inputs, derived, t);
    const c = mortgageScenarioComponents(inputs, derived, t);
    const mortgageNW = c.homeEquity + c.stocks + c.pensionPot;
    const pensionPot = c.pensionPot;

    const appreciation = c.currentPropertyValue - prevPropertyValue;
    const principalPaid = Math.max(
      0,
      prevMortgageBalance - c.currentMortgageBalance,
    );

    // ── Per-year mortgage payment & overpay (accounting for early payoff) ──
    // Once the mortgage is fully repaid, both the regular payment and the
    // overpay drop to 0 — the freed-up cash is reallocated to stocks (handled
    // in the stock-investment calculation below).
    const annualMortgagePayment =
      t === 0 ? 0 : effectiveMonthlyMortgagePaymentForYear(inputs, derived, t) * 12;
    const annualOverpay =
      t === 0 ? 0 : monthlyOverpayForYear(inputs, derived, t) * 12;

    // Interest = what you pay on the loan this year = total mortgage outflow
    // (regular payment + overpay) minus the principal you claw back into equity.
    // £0 at year 0 (no payment made yet) and £0 when the loan is already paid off.
    const interestPaidThisYear =
      t === 0 || prevMortgageBalance === 0
        ? 0
        : derived.monthlyMortgagePayment * 12 + annualOverpay - principalPaid;

    const rentScenarioChange = t === 0 ? 0 : rentNW - prevRentNW;
    const mortgageStocksChange = t === 0 ? 0 : c.stocks - prevStocks;
    const pensionGrowth = t === 0 ? 0 : pensionPot - prevPensionPot;
    const mortgageScenarioChange = t === 0 ? 0 : mortgageNW - prevMortgageNW;

    // Outgoings during this year. At year 0 the "outgoing" is the up-front cost
    // (down payment / starting investment); afterwards it is the recurring
    // annual housing payment *plus* the overpay *plus* the out-of-pocket pension
    // contribution — i.e. the "total spend" for the scenario (pension + rent, or
    // mortgage + overpay + maintenance + pension). The ×5/3 tax uplift is a
    // bonus into the pension pot, not part of the money spent from the bank account.
    const pensionSlider = derived.monthlyPension;
    const rentOutgoings =
      t === 0
        ? inputs.startingInvestment
        : annualRentForYear(inputs, t) + pensionSlider * 12;
    const mortgageOutgoings =
      t === 0
        ? derived.downPayment
        : (annualMortgagePayment +
            annualOverpay +
            inputs.monthlyMaintenanceCost * 12 +
            pensionSlider * 12);

    // ── Net-worth composition (stocks held in each scenario) ──
    // The rent scenario's net worth is stocks + pension; the mortgage
    // scenario already exposes homeEquity, stocks and pensionPot separately.
    const rentStocks = rentNW - pensionPot;

    // ── Cost breakdown (annual recurring spend, 0 at year 0) ──
    // These split the "outgoings" total into the housing / investing /
    // pension components so the tooltip can explain *where* each month's
    // housing budget went. All four components sum to monthlyHousingBudget × 12
    // in the affordable case.
    const annualRent = annualRentForYear(inputs, t);
    const annualBudget = monthlyBudgetForYear(inputs, t) * 12;
    const annualRentStockInvestment =
      monthlyRentStockInvestmentForYear(inputs, derived, t) * 12;
    const annualMaintenance =
      t === 0 ? 0 : inputs.monthlyMaintenanceCost * 12;
    const annualMortgageStockInvestment =
      t === 0
        ? 0
        : monthlyMortgageStockInvestmentForYear(inputs, derived, t) * 12;
    const annualPension = t === 0 ? 0 : pensionSlider * 12;

    data.push({
      year: t,
      rentScenarioNW: rentNW,
      mortgageScenarioNW: mortgageNW,
      difference: rentNW - mortgageNW,
      currentPropertyValue: c.currentPropertyValue,
      currentMortgageBalance: c.currentMortgageBalance,
      mortgageHomeEquity: c.homeEquity,
      mortgageStocks: c.stocks,
      pensionPot,
      rentScenarioChange,
      mortgageScenarioChange,
      mortgageAppreciation: t === 0 ? 0 : appreciation,
      mortgagePrincipalPaid: t === 0 ? 0 : principalPaid,
      interestPaidThisYear: t === 0 ? 0 : interestPaidThisYear,
      mortgageStocksChange,
      pensionGrowth,
      rentOutgoings,
      mortgageOutgoings,
      rentStocks,
      annualRent,
      annualBudget,
      annualRentStockInvestment,
      annualMortgagePayment,
      annualMaintenance,
      annualMortgageStockInvestment,
      annualPension,
      annualOverpay,
    });

    prevRentNW = rentNW;
    prevMortgageNW = mortgageNW;
    prevPropertyValue = c.currentPropertyValue;
    prevMortgageBalance = c.currentMortgageBalance;
    prevStocks = c.stocks;
    prevPensionPot = pensionPot;
  }
  return data;
}

/**
 * Build an array of yearly data points for the chart (basic view).
 *
 * This is a projection of {@link buildDetailedComparisonData} onto the basic
 * {@link RentVsBuyDataPoint} shape, kept for the lib tests and any consumer that
 * only needs the totals.
 */
export function buildComparisonData(
  inputs: RentVsBuyInputs,
): RentVsBuyDataPoint[] {
  return buildDetailedComparisonData(inputs).map((d) => ({
    year: d.year,
    rentScenarioNW: d.rentScenarioNW,
    mortgageScenarioNW: d.mortgageScenarioNW,
    difference: d.difference,
  }));
}

/**
 * The year at which the mortgage scenario overtakes the rent scenario
 * (or vice-versa).  Returns the first year where the gap changes sign,
 * or `null` if it never crosses.
 *
 * A difference of exactly 0 (e.g. at year 0 when both scenarios start
 * equal) is NOT considered a crossover — only genuine sign flips between
 * non-zero values count.
 */
export function findCrossoverYear(
  data: RentVsBuyDataPoint[],
): number | null {
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    // Only consider actual sign changes between non-zero values
    if (prev.difference !== 0 && curr.difference !== 0) {
      if (
        (prev.difference > 0 && curr.difference < 0) ||
        (prev.difference < 0 && curr.difference > 0)
      ) {
        // Linear interpolation for a smoother crossover estimate
        const frac =
          prev.difference / (prev.difference - curr.difference);
        return prev.year + frac;
      }
    }
  }
  return null;
}

/**
 * The **breakeven rent** — the monthly rent at which the rent + invest and
 * mortgage + invest scenarios produce equal net worth at the projection
 * horizon (`inputs.projectionYears`).
 *
 * - If your actual rent is **below** the breakeven, the rent scenario wins.
 * - If your actual rent is **above** the breakeven, the mortgage scenario wins.
 *
 * Return value:
 *  - a finite, non-negative `number` → that is the breakeven rent (£/month).
 *  - `Infinity` → the lump-sum investment alone already beats buying, so
 *    renting wins at **any** rent within the user's total monthly amount.
 *  - `null` → buying always wins; even at £0 rent the rent scenario cannot
 *    catch up to the mortgage scenario over the projection period.
 *
 * With a constant rent (`rentIncreaseRate === 0`) this is derived by inverting
 * the future-value formula (see {@link breakevenRentNoEscalation}). When rent
 * escalates annually there is no closed-form inverse, so the rent is found by
 * bisection over the {@link rentScenarioNetWorthWithEscalation} curve.
 */
export function breakevenRent(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
): number | null {
  if (
    inputs.rentIncreaseRate === 0 &&
    inputs.housingBudgetIncreaseRate === 0
  ) {
    return breakevenRentNoEscalation(inputs, derived);
  }
  return breakevenRentWithEscalation(inputs, derived);
}

/**
 * Breakeven rent for a constant (non-escalating) rent — the closed-form
 * inverse of `futureValue`. Kept separate so the default case stays
 * bit-identical to the original model.
 */
function breakevenRentNoEscalation(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
): number | null {
  const horizon = inputs.projectionYears;
  const target = mortgageScenarioNetWorth(inputs, derived, horizon);
  // The pension pot is identical in both scenarios (same contribution, rate and
  // horizon), so it cancels out of the breakeven equation. Subtract it from the
  // mortgage target before inverting the rent-side future value.
  const targetForRent = target - pensionPotFor(inputs, derived, horizon);
  const initial = inputs.startingInvestment;
  const n = Math.round(horizon * 12);
  if (n <= 0) return null;

  const r = inputs.stockReturnRate / 100 / 12;
  const growth = Math.pow(1 + r, n);

  // Monthly *stock* contribution (excluding the pension) that makes the rent
  // scenario reach `targetForRent`.
  let monthlyInvest: number;
  if (r === 0) {
    monthlyInvest = (targetForRent - initial) / n;
  } else {
    monthlyInvest = (targetForRent - initial * growth) * (r / (growth - 1));
  }

  // `monthlyInvest` is the rent-side stock investment, which is
  // `budget − rent − monthlyPension` (the out-of-pocket pension slider, not the
  // ×5/3 invested amount), so rent = budget − monthlyPension − invest.
  const rent =
    inputs.monthlyHousingBudget - derived.monthlyPension - monthlyInvest;

  // Lump-sum alone already exceeds the mortgage scenario → rent wins at any rent.
  if (rent > inputs.monthlyHousingBudget) return Infinity;
  // Even investing the entire monthly amount (rent = £0) isn't enough → buying wins.
  if (rent < 0) return null;
  return rent;
}

/**
 * Breakeven rent when rent escalates annually. There is no closed-form inverse
 * of the escalating-rent future value, so we bisect over the initial rent.
 *
 * `rentScenarioNetWorth` is monotonically *decreasing* in the initial rent
 * (higher rent → smaller stock contributions → lower net worth). At the
 * maximum rent (= the total monthly amount) nothing is invested and the rent
 * scenario is just the lump sum; at £0 rent everything is invested.
 */
function breakevenRentWithEscalation(
  inputs: RentVsBuyInputs,
  derived: RentVsBuyDerived,
): number | null {
  const target = mortgageScenarioNetWorth(
    inputs,
    derived,
    inputs.projectionYears,
  );
  const budget = inputs.monthlyHousingBudget;
  if (budget <= 0) return null;

  // With a constant (non-escalating) budget the maximum rent that still
  // leaves something to invest is simply `budget`. When the budget escalates
  // annually the maximum rent that exhausts the budget in every year is the
  // budget at the final year — at that rent level nothing is ever invested.
  const maxBudget = inputs.housingBudgetIncreaseRate
    ? inputs.monthlyHousingBudget *
      Math.pow(1 + inputs.housingBudgetIncreaseRate / 100, inputs.projectionYears)
    : budget;

  // f(rent) = rentScenarioNetWorth(rent) − target  (decreasing in rent)
  const valueAtRent = (rent: number): number =>
    rentScenarioNetWorth(
      { ...inputs, monthlyRent: rent },
      derived,
      inputs.projectionYears,
    ) - target;

  // At £0 rent the rent scenario invests the most — if that still loses,
  // buying always wins.
  if (valueAtRent(0) <= 0) return null;

  // At the full (escalated) budget as rent, nothing is invested — if that
  // still wins, renting wins at any affordable rent.
  if (valueAtRent(maxBudget) >= 0) return Infinity;

  // Otherwise bisect for the initial rent that ties at the horizon.
  let lo = 0;
  let hi = maxBudget;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (valueAtRent(mid) > 0) {
      // Rent too low → renting still wins → raise the floor.
      lo = mid;
    } else {
      // Rent too high → buying wins → lower the ceiling.
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
