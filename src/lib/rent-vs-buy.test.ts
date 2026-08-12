import { describe, it, expect } from "vitest";
import {
  deriveValues,
  rentScenarioNetWorth,
  mortgageScenarioNetWorth,
  mortgageScenarioComponents,
  buildComparisonData,
  buildDetailedComparisonData,
  findCrossoverYear,
  breakevenRent,
  type RentVsBuyInputs,
  monthlyOverpayForYear,
  mortgageBalanceAtYear,
} from "./rent-vs-buy";
import { monthlyPaymentForLoan, futureValue } from "./mortgage-calculations";

// Default "fair comparison" rent: mortgage payment + maintenance on the
// default inputs, so the initial scenario is identical to the old model
// where rent was auto-derived.
const defaultRent = monthlyPaymentForLoan(270000, 5, 30) + 200;

const defaultInputs: RentVsBuyInputs = {
  startingInvestment: 30000,
  propertyValue: 300000,
  monthlyHousingBudget: 2000,
  monthlyRent: defaultRent,
  rentIncreaseRate: 0,
  housingBudgetIncreaseRate: 0,
  mortgageRate: 5,
  mortgageTermYears: 30,
  propertyAppreciationRate: 4,
  stockReturnRate: 7,
  monthlyMaintenanceCost: 200,
  mortgageOverpayRate: 0,
  mortgageOverpayMode: "initial",
  projectionYears: 30,
};

describe("deriveValues", () => {
  it("computes correct mortgage and housing values", () => {
    const d = deriveValues(defaultInputs);
    expect(d.downPayment).toBe(30000);
    expect(d.mortgageAmount).toBe(270000);
    expect(d.monthlyMortgagePayment).toBeCloseTo(1449.42, 2);
    expect(d.monthlyRent).toBeCloseTo(defaultRent, 2);
    // Rent scenario invests whatever is left after rent
    expect(d.monthlyStockInvestment).toBeCloseTo(2000 - defaultRent, 2);
    // Mortgage scenario invests what's left after mortgage + maintenance
    expect(d.monthlyMortgageStockInvestment).toBeCloseTo(2000 - 1449.42 - 200, 2);
    expect(d.affordable).toBe(true);
  });

  it("returns affordable=false when budget is below rent", () => {
    const d = deriveValues({
      ...defaultInputs,
      monthlyHousingBudget: 1000,
    });
    expect(d.affordable).toBe(false);
    expect(d.monthlyStockInvestment).toBe(0);
  });

  it("handles zero down payment (no starting investment)", () => {
    const d = deriveValues({
      ...defaultInputs,
      startingInvestment: 0,
    });
    expect(d.downPayment).toBe(0);
    expect(d.mortgageAmount).toBe(300000);
  });

  it("treats rent as a user input independent of down payment", () => {
    const d = deriveValues({
      ...defaultInputs,
      startingInvestment: 500000,
    });
    expect(d.downPayment).toBe(300000);
    expect(d.mortgageAmount).toBe(0);
    expect(d.monthlyMortgagePayment).toBe(0);
    // Rent is whatever the user typed — it does NOT collapse to the maintenance cost
    expect(d.monthlyRent).toBe(defaultInputs.monthlyRent);
    expect(d.monthlyStockInvestment).toBeCloseTo(
      2000 - defaultInputs.monthlyRent,
      2,
    );
  });

  it("decouples rent from the mortgage rate", () => {
    const d = deriveValues({
      ...defaultInputs,
      mortgageRate: 0,
    });
    // Zero-interest: linear amortisation 270000 / 360 = 750
    expect(d.monthlyMortgagePayment).toBeCloseTo(750, 2);
    // Rent is a user input, unaffected by the mortgage rate
    expect(d.monthlyRent).toBeCloseTo(defaultRent, 2);
    // Rent scenario investment = budget − rent (unchanged)
    expect(d.monthlyStockInvestment).toBeCloseTo(2000 - defaultRent, 2);
    // Mortgage scenario investment = budget − payment(0%) − maintenance
    expect(d.monthlyMortgageStockInvestment).toBeCloseTo(2000 - 750 - 200, 2);
  });
});

describe("rentScenarioNetWorth", () => {
  it("at year 0 equals the starting investment", () => {
    const d = deriveValues(defaultInputs);
    const nw = rentScenarioNetWorth(defaultInputs, d, 0);
    expect(nw).toBeCloseTo(30000, 2);
  });

  it("at year 30 matches manual calculation", () => {
    const d = deriveValues(defaultInputs);
    const nw = rentScenarioNetWorth(defaultInputs, d, 30);
    // Python-verified: 671194.33
    expect(nw).toBeCloseTo(671194.33, 0);
  });

  it("grows with stock return rate", () => {
    const d = deriveValues(defaultInputs);
    const low = rentScenarioNetWorth(
      { ...defaultInputs, stockReturnRate: 0 },
      d,
      30,
    );
    const high = rentScenarioNetWorth(
      { ...defaultInputs, stockReturnRate: 10 },
      d,
      30,
    );
    expect(high).toBeGreaterThan(low);
  });

  it("with zero stock return equals starting + monthly contributions", () => {
    const d = deriveValues(defaultInputs);
    const nw = rentScenarioNetWorth(
      { ...defaultInputs, stockReturnRate: 0 },
      d,
      30,
    );
    // 30000 + monthlyStockInvestment * 360
    const expected = 30000 + d.monthlyStockInvestment * 360;
    expect(nw).toBeCloseTo(expected, 0);
  });

  it("falls when rent exceeds the total monthly pool (nothing left to invest)", () => {
    const inputs = { ...defaultInputs, monthlyRent: 5000 };
    const d = deriveValues(inputs);
    expect(d.monthlyStockInvestment).toBe(0);
    // With nothing left to invest, the rent scenario is just the lump sum compounding
    const nw = rentScenarioNetWorth(inputs, d, 30);
    expect(nw).toBeCloseTo(futureValue(30000, 7, 0, 30), 0);
  });

  it("equals the starting investment at year 0 even with rent escalation", () => {
    const inputs = { ...defaultInputs, rentIncreaseRate: 3 };
    const d = deriveValues(inputs);
    expect(rentScenarioNetWorth(inputs, d, 0)).toBeCloseTo(
      inputs.startingInvestment,
      2,
    );
  });

  it("is lower when rent escalates than when rent is constant", () => {
    const d = deriveValues(defaultInputs);
    const noEscalation = rentScenarioNetWorth(defaultInputs, d, 30);
    expect(noEscalation).toBeCloseTo(671194.33, 0);

    const escalating = rentScenarioNetWorth(
      { ...defaultInputs, rentIncreaseRate: 3 },
      d,
      30,
    );
    // Rent rises each year, so later contributions are smaller → lower NW.
    expect(escalating).toBeLessThan(noEscalation);
  });

  it("is higher when the housing budget escalates (more to invest each year)", () => {
    const d = deriveValues(defaultInputs);
    const noEscalation = rentScenarioNetWorth(defaultInputs, d, 30);
    expect(noEscalation).toBeCloseTo(671194.33, 0);

    const escalating = rentScenarioNetWorth(
      { ...defaultInputs, housingBudgetIncreaseRate: 3 },
      d,
      30,
    );
    // Budget grows each year, so later contributions are larger → higher NW.
    expect(escalating).toBeGreaterThan(noEscalation);
  });

  it("grows rent each year, so the breakeven rent drops relative to inflation", () => {
    // With a 3% rent escalation the rent scenario is weaker, so a higher-than-
    // breakeven rent is needed to flip the comparison toward buying.
    const d = deriveValues(defaultInputs);
    const beNoEscalation = breakevenRent(defaultInputs, d);
    const beEscalating = breakevenRent(
      { ...defaultInputs, rentIncreaseRate: 3 },
      d,
    );
    expect(beEscalating).not.toBeNull();
    expect(beEscalating).toBeLessThan(beNoEscalation!);
  });
});

describe("mortgageScenarioNetWorth", () => {
  it("at year 0 equals the starting investment (as down payment)", () => {
    const d = deriveValues(defaultInputs);
    const nw = mortgageScenarioNetWorth(defaultInputs, d, 0);
    expect(nw).toBeCloseTo(30000, 2);
  });

  it("at year 30 matches manual calculation", () => {
    const d = deriveValues(defaultInputs);
    const nw = mortgageScenarioNetWorth(defaultInputs, d, 30);
    // Python-verified: 1421748.81
    expect(nw).toBeCloseTo(1421748.81, 0);
  });

  it("includes home equity that grows with property appreciation", () => {
    const d = deriveValues(defaultInputs);
    const lowAppr = mortgageScenarioNetWorth(
      { ...defaultInputs, propertyAppreciationRate: 0 },
      d,
      30,
    );
    const highAppr = mortgageScenarioNetWorth(
      { ...defaultInputs, propertyAppreciationRate: 10 },
      d,
      30,
    );
    expect(highAppr).toBeGreaterThan(lowAppr);
  });

  it("with zero mortgage (all cash purchase), net worth is property + stocks", () => {
    const inputs = { ...defaultInputs, startingInvestment: 300000 };
    const d = deriveValues(inputs);
    expect(d.mortgageAmount).toBe(0);
    const nw = mortgageScenarioNetWorth(inputs, d, 0);
    expect(nw).toBeCloseTo(300000, 0);
  });

  it("does not change when the rent input changes", () => {
    const d = deriveValues(defaultInputs);
    const baseline = mortgageScenarioNetWorth(defaultInputs, d, 30);
    const withLowerRent = mortgageScenarioNetWorth(
      { ...defaultInputs, monthlyRent: 1000 },
      d,
      30,
    );
    expect(withLowerRent).toBeCloseTo(baseline, 0);
  });

  it("is higher when the housing budget escalates (more left for stocks)", () => {
    const d = deriveValues(defaultInputs);
    const noEscalation = mortgageScenarioNetWorth(defaultInputs, d, 30);
    expect(noEscalation).toBeCloseTo(1421748.81, 0);

    const escalating = mortgageScenarioNetWorth(
      { ...defaultInputs, housingBudgetIncreaseRate: 3 },
      d,
      30,
    );
    // Budget grows each year → larger stock contributions → higher NW.
    expect(escalating).toBeGreaterThan(noEscalation);
  });
});

describe("buildComparisonData", () => {
  it("returns one data point per year plus the final year", () => {
    const data = buildComparisonData(defaultInputs);
    expect(data).toHaveLength(31); // 0..30 inclusive
  });

  it("first data point has year 0 with equal scenarios", () => {
    const data = buildComparisonData(defaultInputs);
    expect(data[0].year).toBe(0);
    expect(data[0].rentScenarioNW).toBeCloseTo(30000, 2);
    expect(data[0].mortgageScenarioNW).toBeCloseTo(30000, 2);
    expect(data[0].difference).toBeCloseTo(0, 2);
  });

  it("last data point has year 30 with mortgage ahead", () => {
    const data = buildComparisonData(defaultInputs);
    expect(data[30].year).toBe(30);
    expect(data[30].rentScenarioNW).toBeCloseTo(671194.33, 0);
    expect(data[30].mortgageScenarioNW).toBeCloseTo(1421748.81, 0);
    expect(data[30].difference).toBeCloseTo(-750554.48, 0);
  });

  it("difference changes monotonically in default scenario (mortgage always ahead after year 0)", () => {
    const data = buildComparisonData(defaultInputs);
    // After year 0, mortgage should be ahead (difference negative)
    for (let i = 1; i < data.length; i++) {
      expect(data[i].difference).toBeLessThan(0);
    }
  });
});

describe("findCrossoverYear", () => {
  it("returns null when mortgage is always ahead (no crossover)", () => {
    const data = buildComparisonData(defaultInputs);
    expect(findCrossoverYear(data)).toBeNull();
  });

  it("finds crossover when stock returns are high and appreciation is low", () => {
    // With 12% stock returns and 2% appreciation, rent overtakes mortgage
    const inputs: RentVsBuyInputs = {
      ...defaultInputs,
      propertyAppreciationRate: 2,
      stockReturnRate: 12,
    };
    const data = buildComparisonData(inputs);
    const crossover = findCrossoverYear(data);
    expect(crossover).not.toBeNull();
    // Python-verified: crossover between year 19 and 20, ≈ 19.1
    expect(crossover!).toBeGreaterThanOrEqual(19);
    expect(crossover!).toBeLessThan(21);
  });

  it("returns null when difference is always positive", () => {
    const data: ReturnType<typeof buildComparisonData> = [];
    for (let y = 0; y <= 10; y++) {
      data.push({
        year: y,
        rentScenarioNW: 100000 + y * 1000,
        mortgageScenarioNW: 50000 + y * 1000,
        difference: 50000, // always positive
      });
    }
    expect(findCrossoverYear(data)).toBeNull();
  });

  it("returns null when difference starts at 0 but stays one sign (no real crossover)", () => {
    const data: ReturnType<typeof buildComparisonData> = [
      { year: 0, rentScenarioNW: 100, mortgageScenarioNW: 100, difference: 0 },
      { year: 1, rentScenarioNW: 200, mortgageScenarioNW: 150, difference: 50 },
      { year: 2, rentScenarioNW: 300, mortgageScenarioNW: 200, difference: 100 },
    ];
    // No sign change — difference goes from 0 to positive, not a crossover
    expect(findCrossoverYear(data)).toBeNull();
  });

  it("finds crossover between positive and negative", () => {
    const data: ReturnType<typeof buildComparisonData> = [
      { year: 0, rentScenarioNW: 100, mortgageScenarioNW: 50, difference: 50 },
      { year: 1, rentScenarioNW: 150, mortgageScenarioNW: 100, difference: 50 },
      { year: 2, rentScenarioNW: 180, mortgageScenarioNW: 220, difference: -40 },
    ];
    const result = findCrossoverYear(data);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(1.55, 1); // ~1 + 50/(50+40) = 1.555...
  });
});

describe("breakevenRent", () => {
  it("is the rent at which rent and mortgage scenarios tie at the horizon", () => {
    const inputs = defaultInputs;
    const derived = deriveValues(inputs);
    const target = mortgageScenarioNetWorth(
      inputs,
      derived,
      inputs.projectionYears,
    );

    const breakeven = breakevenRent(inputs, derived);
    expect(breakeven).not.toBeNull();
    expect(breakeven).toBeGreaterThan(0);
    expect(Number.isFinite(breakeven!)).toBe(true);

    // At the breakeven rent, the rent scenario reaches the mortgage target
    const atBreakeven = { ...inputs, monthlyRent: breakeven! };
    const rentNW = rentScenarioNetWorth(
      atBreakeven,
      deriveValues(atBreakeven),
      inputs.projectionYears,
    );
    expect(rentNW).toBeCloseTo(target, 1);
  });

  it("defaults put rent above breakeven, so buying wins", () => {
    const derived = deriveValues(defaultInputs);
    const breakeven = breakevenRent(defaultInputs, derived);
    expect(breakeven).not.toBeNull();
    // Default rent (~1649) is above the breakeven (~1034) → buying wins
    expect(defaultInputs.monthlyRent).toBeGreaterThan(breakeven!);
  });

  it("with rent escalation, the breakeven rent ties the scenarios at the horizon", () => {
    const inputs = { ...defaultInputs, rentIncreaseRate: 3 };
    const derived = deriveValues(inputs);
    const target = mortgageScenarioNetWorth(
      inputs,
      derived,
      inputs.projectionYears,
    );

    const breakeven = breakevenRent(inputs, derived);
    expect(breakeven).not.toBeNull();
    expect(Number.isFinite(breakeven as number)).toBe(true);

    // At the breakeven initial rent, the escalating rent scenario reaches the
    // mortgage target — validating the bisection inverse.
    const atBreakeven = { ...inputs, monthlyRent: breakeven as number };
    const rentNW = rentScenarioNetWorth(
      atBreakeven,
      deriveValues(atBreakeven),
      inputs.projectionYears,
    );
    expect(rentNW).toBeCloseTo(target, 1);
  });

  it("returns Infinity (rent always wins) when the lump sum alone beats buying", () => {
    // Very high stock returns + zero appreciation make the rent scenario's
    // lump-sum investment alone exceed the mortgage scenario.
    const inputs = {
      ...defaultInputs,
      stockReturnRate: 20,
      propertyAppreciationRate: 0,
      monthlyHousingBudget: 1649.42,
    };
    const derived = deriveValues(inputs);
    expect(breakevenRent(inputs, derived)).toBe(Infinity);

    // Sanity: even at the maximum rent (= full budget), renting still wins
    const maxRentInputs = { ...inputs, monthlyRent: inputs.monthlyHousingBudget };
    const rentNW = rentScenarioNetWorth(
      maxRentInputs,
      deriveValues(maxRentInputs),
      inputs.projectionYears,
    );
    const mortgageNW = mortgageScenarioNetWorth(
      inputs,
      derived,
      inputs.projectionYears,
    );
    expect(rentNW).toBeGreaterThanOrEqual(mortgageNW);
  });

  it("returns null (buying always wins) when rent can't catch up even at £0", () => {
    // Zero stock returns + high appreciation make the mortgage target huge.
    const inputs = {
      ...defaultInputs,
      stockReturnRate: 0,
      propertyAppreciationRate: 10,
    };
    const derived = deriveValues(inputs);
    expect(breakevenRent(inputs, derived)).toBeNull();

    // Sanity: even at £0 rent, renting still loses
    const zeroRentInputs = { ...inputs, monthlyRent: 0 };
    const rentNW = rentScenarioNetWorth(
      zeroRentInputs,
      deriveValues(zeroRentInputs),
      inputs.projectionYears,
    );
    const mortgageNW = mortgageScenarioNetWorth(
      inputs,
      derived,
      inputs.projectionYears,
    );
    expect(rentNW).toBeLessThan(mortgageNW);
  });

  it("rises when stock returns rise (rent scenario's lump sum compounds faster)", () => {
    const derived = deriveValues(defaultInputs);
    const lowReturn = breakevenRent(
      { ...defaultInputs, stockReturnRate: 4 },
      derived,
    );
    const highReturn = breakevenRent(
      { ...defaultInputs, stockReturnRate: 12 },
      derived,
    );
    expect(lowReturn).not.toBeNull();
    expect(highReturn).not.toBeNull();
    // The rent scenario keeps its starting investment in stocks (compounding
    // the whole time) while the mortgage scenario's lump sum is tied up in
    // real estate. Higher stock returns therefore favour renting, pushing the
    // breakeven rent upward.
    expect(highReturn!).toBeGreaterThan(lowReturn!);
  });

  it("remains finite when the housing budget escalates", () => {
    const inputs = { ...defaultInputs, housingBudgetIncreaseRate: 5 };
    const derived = deriveValues(inputs);
    const result = breakevenRent(inputs, derived);
    expect(result).not.toBeNull();
    expect(result).not.toBe(Infinity);
    expect(Number.isFinite(result as number)).toBe(true);
  });
});

describe("buildDetailedComparisonData", () => {
  it("returns one detailed data point per year plus the final year", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    expect(data).toHaveLength(31); // 0..30 inclusive
  });

  it("matches buildComparisonData totals for each year", () => {
    const basic = buildComparisonData(defaultInputs);
    const detailed = buildDetailedComparisonData(defaultInputs);
    expect(detailed).toHaveLength(basic.length);
    for (let i = 0; i < basic.length; i++) {
      expect(detailed[i].rentScenarioNW).toBeCloseTo(basic[i].rentScenarioNW, 2);
      expect(detailed[i].mortgageScenarioNW).toBeCloseTo(
        basic[i].mortgageScenarioNW,
        2,
      );
      expect(detailed[i].difference).toBeCloseTo(basic[i].difference, 2);
    }
  });

  it("year 0 is the starting position with no movement", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    const y0 = data[0];
    // Both scenarios start with the starting investment (£30,000)
    expect(y0.rentScenarioNW).toBeCloseTo(30000, 2);
    expect(y0.mortgageScenarioNW).toBeCloseTo(30000, 2);
    expect(y0.difference).toBeCloseTo(0, 2);

    // Mortgage scenario: whole starting investment is the down payment,
    // property is purchased outright-equity'd, no stocks yet.
    expect(y0.mortgageHomeEquity).toBeCloseTo(30000, 2);
    expect(y0.mortgageStocks).toBeCloseTo(0, 2);
    expect(y0.currentPropertyValue).toBeCloseTo(300000, 2);
    expect(y0.currentMortgageBalance).toBeCloseTo(270000, 2);

    // No movement at year 0 (nothing to compare against yet)
    expect(y0.rentScenarioChange).toBe(0);
    expect(y0.mortgageScenarioChange).toBe(0);
    expect(y0.mortgageAppreciation).toBe(0);
    expect(y0.mortgagePrincipalPaid).toBe(0);
    expect(y0.mortgageStocksChange).toBe(0);

    // Up-front cost at year 0 is the down payment / starting investment
    expect(y0.rentOutgoings).toBeCloseTo(30000, 2);
    expect(y0.mortgageOutgoings).toBeCloseTo(30000, 2);
  });

  it("year 30 totals match the known mortgage/worth figures", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    const y30 = data[30];
    expect(y30.rentScenarioNW).toBeCloseTo(671194.33, 0);
    expect(y30.mortgageScenarioNW).toBeCloseTo(1421748.81, 0);
    // The mortgage net worth is exactly home equity + stocks
    expect(y30.mortgageHomeEquity + y30.mortgageStocks).toBeCloseTo(
      y30.mortgageScenarioNW,
      1,
    );
    // The property is fully paid off by the end of the 30-year term
    expect(y30.currentMortgageBalance).toBeCloseTo(0, 1);
  });

  it("mortgage scenario change decomposes into appreciation + principal + stocks", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    // Check several years — the three sub-components must sum to the total
    // mortgage-scenario change (this is how the tooltip attributes movement).
    for (const t of [1, 2, 10, 15, 29, 30]) {
      const p = data[t];
      const parts = p.mortgageAppreciation + p.mortgagePrincipalPaid + p.mortgageStocksChange;
      expect(parts).toBeCloseTo(p.mortgageScenarioChange, 1);
    }
  });

  it("reports mortgage interest paid each year as payment×12 minus principal", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    const { monthlyMortgagePayment } = deriveValues(defaultInputs);
    const annualPayment = monthlyMortgagePayment * 12;
    // Year 0: no payment has been made yet → no interest.
    expect(data[0].interestPaidThisYear).toBe(0);
    // Each subsequent year: interest = annual payment − principal repaid this year.
    // (Principal + interest together make up the mortgage payment.)
    for (const t of [1, 2, 10, 15, 29, 30]) {
      const p = data[t];
      expect(p.interestPaidThisYear).toBeCloseTo(
        annualPayment - p.mortgagePrincipalPaid,
        1,
      );
    }
    // Front-loaded amortisation: early years are mostly interest, late years mostly principal.
    expect(data[1].interestPaidThisYear).toBeGreaterThan(data[1].mortgagePrincipalPaid);
    expect(data[30].interestPaidThisYear).toBeLessThan(data[1].interestPaidThisYear);
  });

  it("reports £0 mortgage interest for an all-cash purchase (no loan)", () => {
    const inputs: RentVsBuyInputs = {
      ...defaultInputs,
      propertyValue: 30000,
      startingInvestment: 30000,
    };
    const data = buildDetailedComparisonData(inputs);
    // mortgageAmount = 0 → monthlyMortgagePayment = 0 → no interest, no principal.
    for (const t of [0, 1, 15, 30]) {
      expect(data[t].interestPaidThisYear).toBe(0);
      expect(data[t].mortgagePrincipalPaid).toBe(0);
    }
  });

  it("rent scenario change is the year-over-year net-worth delta", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    const y29 = data[29];
    const y30 = data[30];
    expect(y30.rentScenarioChange).toBeCloseTo(
      y30.rentScenarioNW - y29.rentScenarioNW,
      1,
    );
  });

  it("outgoings for year 1 equal the annual recurring housing cost (no escalation)", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    const derived = deriveValues(defaultInputs);
    const y1 = data[1];
    // defaultRent ≈ £1649.42; annual rent = 1649.4184 * 12
    const expectedAnnualRent = defaultRent * 12;
    expect(y1.rentOutgoings).toBeCloseTo(expectedAnnualRent, 2);
    // Mortgage outgoings = (monthly mortgage payment + maintenance) * 12
    const expectedMortgageOut =
      (derived.monthlyMortgagePayment + defaultInputs.monthlyMaintenanceCost) * 12;
    expect(y1.mortgageOutgoings).toBeCloseTo(expectedMortgageOut, 1);
    expect(y1.rentOutgoings).toBeCloseTo(y1.mortgageOutgoings, 1);
  });

  it("rent outgoings escalate with the rent increase rate", () => {
    const inputs = { ...defaultInputs, rentIncreaseRate: 3 };
    const data = buildDetailedComparisonData(inputs);
    // Year 1 = base rent, year 2 = +3%, year 3 = +3% again, etc.
    const y1 = inputs.monthlyRent * 12;
    const y2 = inputs.monthlyRent * Math.pow(1.03, 1) * 12;
    const y3 = inputs.monthlyRent * Math.pow(1.03, 2) * 12;
    expect(data[1].rentOutgoings).toBeCloseTo(y1, 2);
    expect(data[2].rentOutgoings).toBeCloseTo(y2, 2);
    expect(data[3].rentOutgoings).toBeCloseTo(y3, 2);
  });

  it("rentStocks equals rentScenarioNW minus the pension pot", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    for (const t of [0, 1, 5, 15, 30]) {
      const p = data[t];
      expect(p.rentStocks).toBeCloseTo(p.rentScenarioNW - p.pensionPot, 1);
    }
  });

  it("annualRent tracks the escalated rent for each year", () => {
    const inputs = { ...defaultInputs, rentIncreaseRate: 3 };
    const data = buildDetailedComparisonData(inputs);
    for (const t of [1, 2, 3, 10]) {
      const expected =
        inputs.monthlyRent * Math.pow(1.03, t - 1) * 12;
      expect(data[t].annualRent).toBeCloseTo(expected, 2);
    }
    // Year 0: no rent has been paid yet.
    expect(data[0].annualRent).toBe(0);
  });

  it("annualRentStockInvestment shrinks as rent escalates", () => {
    const inputs = { ...defaultInputs, rentIncreaseRate: 3 };
    const data = buildDetailedComparisonData(inputs);
    // Year 1 uses the base rent, so the investment is the max affordable amount.
    const y1Invest = Math.max(
      0,
      inputs.monthlyHousingBudget - inputs.monthlyRent,
    );
    expect(data[1].annualRentStockInvestment).toBeCloseTo(y1Invest * 12, 2);
    // Later years: rent rises, so less is left for stocks.
    expect(data[2].annualRentStockInvestment).toBeLessThan(
      data[1].annualRentStockInvestment,
    );
    // Year 0: no recurring investment.
    expect(data[0].annualRentStockInvestment).toBe(0);
  });

  it("annualMortgagePayment, annualMaintenance and annualMortgageStockInvestment are the monthly values × 12", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    const derived = deriveValues(defaultInputs);
    for (const t of [1, 5, 15, 30]) {
      const p = data[t];
      expect(p.annualMortgagePayment).toBeCloseTo(
        derived.monthlyMortgagePayment * 12,
        1,
      );
      expect(p.annualMaintenance).toBeCloseTo(
        defaultInputs.monthlyMaintenanceCost * 12,
        1,
      );
      expect(p.annualMortgageStockInvestment).toBeCloseTo(
        derived.monthlyMortgageStockInvestment * 12,
        1,
      );
    }
    // Year 0: no recurring payments.
    expect(data[0].annualMortgagePayment).toBe(0);
    expect(data[0].annualMaintenance).toBe(0);
    expect(data[0].annualMortgageStockInvestment).toBe(0);
  });

  it("annualPension is 0 without a pension and ×12 with one", () => {
    // No pension → annualPension is 0 everywhere.
    const dataNoPension = buildDetailedComparisonData(defaultInputs);
    for (const t of [0, 1, 15]) {
      expect(dataNoPension[t].annualPension).toBe(0);
      expect(dataNoPension[t].pensionPot).toBe(0);
    }

    // With a pension → annualPension = monthlyPension × 12 (year 0 excluded).
    const dataPension = buildDetailedComparisonData({
      ...defaultInputs,
      monthlyPension: 200,
    });
    expect(dataPension[0].annualPension).toBe(0);
    expect(dataPension[0].pensionPot).toBe(0);
    for (const t of [1, 15, 30]) {
      expect(dataPension[t].annualPension).toBeCloseTo(200 * 12, 2);
    }
  });

  it("rent scenario cost breakdown sums to the total monthly budget", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    for (const t of [1, 5, 15, 30]) {
      const p = data[t];
      // rentOutgoings (rent + pension) + investing = total budget for the year.
      expect(p.rentOutgoings + p.annualRentStockInvestment).toBeCloseTo(
        defaultInputs.monthlyHousingBudget * 12,
        0,
      );
    }
  });

  it("annualBudget is 0 at year 0 and equals the monthly budget × 12 at year 1", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    expect(data[0].annualBudget).toBe(0);
    expect(data[1].annualBudget).toBeCloseTo(
      defaultInputs.monthlyHousingBudget * 12,
      2,
    );
  });

  it("annualBudget escalates with housingBudgetIncreaseRate", () => {
    const inputs = { ...defaultInputs, housingBudgetIncreaseRate: 3 };
    const data = buildDetailedComparisonData(inputs);
    // Year 1: base budget × 12
    expect(data[1].annualBudget).toBeCloseTo(2000 * 12, 2);
    // Year 2: +3%
    expect(data[2].annualBudget).toBeCloseTo(2000 * Math.pow(1.03, 1) * 12, 2);
    // Year 3: +3% again
    expect(data[3].annualBudget).toBeCloseTo(2000 * Math.pow(1.03, 2) * 12, 2);
  });

  it("cost breakdown sums to the escalated annual budget when budget grows", () => {
    const inputs = { ...defaultInputs, housingBudgetIncreaseRate: 3 };
    const data = buildDetailedComparisonData(inputs);
    for (const t of [1, 5, 15, 30]) {
      const p = data[t];
      // rentOutgoings + investing = annualBudget (not the initial budget × 12)
      expect(p.rentOutgoings + p.annualRentStockInvestment).toBeCloseTo(
        p.annualBudget,
        0,
      );
      // mortgageOutgoings + investing = annualBudget
      expect(p.mortgageOutgoings + p.annualMortgageStockInvestment).toBeCloseTo(
        p.annualBudget,
        0,
      );
    }
  });

  it("mortgage stock investment grows over time with budget escalation", () => {
    const inputs = { ...defaultInputs, housingBudgetIncreaseRate: 3 };
    const data = buildDetailedComparisonData(inputs);
    // Year 1 uses the base budget
    const y1Invest = Math.max(
      0,
      inputs.monthlyHousingBudget -
        deriveValues(inputs).monthlyMortgagePayment -
        inputs.monthlyMaintenanceCost,
    );
    expect(data[1].annualMortgageStockInvestment).toBeCloseTo(y1Invest * 12, 2);
    // Year 10 has a higher budget → larger investment
    const y10Budget = inputs.monthlyHousingBudget * Math.pow(1.03, 9);
    const y10Invest = Math.max(
      0,
      y10Budget -
        deriveValues(inputs).monthlyMortgagePayment -
        inputs.monthlyMaintenanceCost,
    );
    expect(data[10].annualMortgageStockInvestment).toBeCloseTo(
      y10Invest * 12,
      2,
    );
    expect(data[10].annualMortgageStockInvestment).toBeGreaterThan(
      data[1].annualMortgageStockInvestment,
    );
  });

  it("mortgage scenario cost breakdown sums to the total monthly budget", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    for (const t of [1, 5, 15, 30]) {
      const p = data[t];
      // mortgageOutgoings (payment + maintenance + pension) + investing
      // = total budget for the year.
      expect(p.mortgageOutgoings + p.annualMortgageStockInvestment).toBeCloseTo(
        defaultInputs.monthlyHousingBudget * 12,
        0,
      );
    }
  });

  it("mortgage scenario net worth decomposes into home equity + stocks + pension", () => {
    const data = buildDetailedComparisonData(defaultInputs);
    for (const t of [0, 1, 5, 15, 30]) {
      const p = data[t];
      expect(p.mortgageHomeEquity + p.mortgageStocks + p.pensionPot).toBeCloseTo(
        p.mortgageScenarioNW,
        1,
      );
    }
  });

  it("cost breakdown includes pension when a pension is active", () => {
    const inputs = { ...defaultInputs, monthlyPension: 200 };
    const data = buildDetailedComparisonData(inputs);
    const y1 = data[1];
    expect(y1.annualPension).toBeCloseTo(2400, 2);
    // rentOutgoings now includes the pension: annualRent + annualPension
    expect(y1.rentOutgoings).toBeCloseTo(y1.annualRent + y1.annualPension, 2);
    // mortgageOutgoings includes pension: payment + maintenance + pension
    expect(y1.mortgageOutgoings).toBeCloseTo(
      y1.annualMortgagePayment + y1.annualMaintenance + y1.annualPension,
      2,
    );
    // The full breakdown (housing + pension + investing) still equals the budget.
    expect(y1.rentOutgoings + y1.annualRentStockInvestment).toBeCloseTo(
      defaultInputs.monthlyHousingBudget * 12,
      0,
    );
    expect(
      y1.mortgageOutgoings + y1.annualMortgageStockInvestment,
    ).toBeCloseTo(defaultInputs.monthlyHousingBudget * 12, 0);
  });
});

describe("pension", () => {
  it("defaults the pension to 0 (no effect) when inputs omit it", () => {
    const d = deriveValues(defaultInputs);
    expect(d.pensionInvested).toBe(0);
    expect(d.pensionRate).toBe(defaultInputs.stockReturnRate);
    expect(d.monthlyPension).toBe(0);
    // Stock investments are untouched when there is no pension.
    expect(d.monthlyStockInvestment).toBeCloseTo(2000 - defaultRent, 4);
    expect(d.monthlyMortgageStockInvestment).toBeCloseTo(
      2000 - 1449.42 - 200,
      2,
    );
  });

  it("deducts a net pension from both scenarios' stock investments", () => {
    const inputs = { ...defaultInputs, monthlyPension: 200 };
    const d = deriveValues(inputs);
    expect(d.pensionInvested).toBeCloseTo(200, 6);
    expect(d.monthlyPension).toBe(200);
    // rent scenario: budget − rent − pension
    expect(d.monthlyStockInvestment).toBeCloseTo(2000 - defaultRent - 200, 4);
    // mortgage scenario: budget − mortgage − maintenance − pension
    expect(d.monthlyMortgageStockInvestment).toBeCloseTo(
      2000 - d.monthlyMortgagePayment - 200 - 200,
      2,
    );
  });

  it("inflates the pension pot by 5/3 when gross without shrinking stocks further", () => {
    const net = deriveValues({ ...defaultInputs, monthlyPension: 200, pensionGross: false });
    const gross = deriveValues({ ...defaultInputs, monthlyPension: 200, pensionGross: true });
    // Out-of-pocket slider is identical in both modes, so the stock investment
    // (which deducts the slider, not the ×5/3) is the same.
    expect(gross.monthlyPension).toBeCloseTo(net.monthlyPension, 6);
    expect(gross.monthlyStockInvestment).toBeCloseTo(net.monthlyStockInvestment, 6);
    expect(gross.monthlyMortgageStockInvestment).toBeCloseTo(
      net.monthlyMortgageStockInvestment,
      6,
    );
    // The pension *pot* receives the ×5/3 tax uplift, so it is larger in gross.
    expect(gross.pensionInvested).toBeCloseTo((200 * 5) / 3, 5);
    expect(net.pensionInvested).toBeCloseTo(200, 6);
    expect(gross.pensionInvested).toBeGreaterThan(net.pensionInvested);
  });

  it("rent scenario net worth includes the pension pot, grown at the stock rate", () => {
    const inputs = { ...defaultInputs, monthlyPension: 200 };
    const d = deriveValues(inputs);
    const horizon = inputs.projectionYears;
    const withPension = rentScenarioNetWorth(inputs, d, horizon);
    // rent NW = stocks (budget − rent − pension, grown at the stock rate)
    //         + pension pot (pension contribution grown at the STOCK rate).
    const expectedStocks = futureValue(
      inputs.startingInvestment,
      inputs.stockReturnRate,
      d.monthlyStockInvestment,
      horizon,
    );
    expect(d.pensionRate).toBe(defaultInputs.stockReturnRate);
    const expectedPensionPot = futureValue(0, d.pensionRate, d.pensionInvested, horizon);
    expect(withPension).toBeCloseTo(expectedStocks + expectedPensionPot, 1);

    // NET mode is zero-sum: monthlyPension is diverted from stocks into the
    // pension (which grows at the same stock rate), so net worth is unchanged.
    const withoutPension = rentScenarioNetWorth(
      { ...inputs, monthlyPension: 0 },
      deriveValues({ ...inputs, monthlyPension: 0 }),
      horizon,
    );
    expect(withPension).toBeCloseTo(withoutPension, 1);

    // GROSS mode is NOT zero-sum: the ×5/3 uplift grows at the stock rate, so
    // the pension pot (and thus net worth) ends up strictly larger.
    const grossPension = rentScenarioNetWorth(
      { ...inputs, monthlyPension: 200, pensionGross: true },
      deriveValues({ ...inputs, monthlyPension: 200, pensionGross: true }),
      horizon,
    );
    expect(grossPension).toBeGreaterThan(withPension);
  });

  it("year 0 net worth is unchanged by the pension (pot is 0)", () => {
    const inputs = { ...defaultInputs, monthlyPension: 200, pensionGross: true };
    const d = deriveValues(inputs);
    expect(rentScenarioNetWorth(inputs, d, 0)).toBeCloseTo(
      inputs.startingInvestment,
      2,
    );
    expect(mortgageScenarioNetWorth(inputs, d, 0)).toBeCloseTo(
      inputs.startingInvestment,
      2,
    );
  });

  it("mortgage scenario net worth includes the pension pot (and stocks exclude it)", () => {
    const inputs = { ...defaultInputs, monthlyPension: 200 };
    const d = deriveValues(inputs);
    const horizon = inputs.projectionYears;
    const c = mortgageScenarioComponents(inputs, d, horizon);
    const nw = mortgageScenarioNetWorth(inputs, d, horizon);
    // Net worth = home equity + stocks + pension pot
    expect(nw).toBeCloseTo(c.homeEquity + c.stocks + c.pensionPot, 2);
    // The pension pot grows at the stock return rate (d.pensionRate).
    expect(c.pensionPot).toBeCloseTo(
      futureValue(0, d.pensionRate, d.pensionInvested, horizon),
      1,
    );
    // Regular stocks are grown at the stock rate and exclude the pension.
    expect(c.stocks).toBeCloseTo(
      futureValue(
        0,
        inputs.stockReturnRate,
        d.monthlyMortgageStockInvestment,
        horizon,
      ),
      1,
    );
  });

  it("grows the pension at the stock return rate", () => {
    const inputs = { ...defaultInputs, monthlyPension: 200 };
    const d = deriveValues(inputs);
    const horizon = inputs.projectionYears;
    const last = buildDetailedComparisonData(inputs)[horizon];
    // The pension is a stock-market investment, so it compounds at the stock
    // return rate (not the mortgage rate).
    const atStockRate = futureValue(0, d.pensionRate, d.pensionInvested, horizon);
    expect(last.pensionPot).toBeCloseTo(atStockRate, 1);
    expect(d.pensionRate).toBe(defaultInputs.stockReturnRate);
    // The stock-return and mortgage rates differ in the defaults, so the
    // pension's growth rate is meaningfully the stock rate (not the mortgage).
    expect(d.pensionRate).not.toBe(defaultInputs.mortgageRate);
  });

  it("escalating rent scenario carries the pension pot at the stock return rate", () => {
    const inputs = { ...defaultInputs, monthlyPension: 200, rentIncreaseRate: 3 };
    const d = deriveValues(inputs);
    const horizon = inputs.projectionYears;
    const last = buildDetailedComparisonData(inputs)[horizon];
    expect(last.pensionPot).toBeCloseTo(
      futureValue(0, d.pensionRate, d.pensionInvested, horizon),
      1,
    );
    expect(last.pensionGrowth).toBeCloseTo(
      last.pensionPot - buildDetailedComparisonData(inputs)[horizon - 1].pensionPot,
      2,
    );
    expect(last.pensionGrowth).toBeGreaterThan(0);
  });

  it("attributes the mortgage change to appreciation + principal + stocks + pension growth", () => {
    const inputs = { ...defaultInputs, monthlyPension: 200 };
    const data = buildDetailedComparisonData(inputs);
    for (const t of [1, 2, 10, 15, 29, 30]) {
      const p = data[t];
      const parts =
        p.mortgageAppreciation +
        p.mortgagePrincipalPaid +
        p.mortgageStocksChange +
        p.pensionGrowth;
      expect(parts).toBeCloseTo(p.mortgageScenarioChange, 1);
    }
  });

  it("outgoings include the out-of-pocket pension (rent + pension / mortgage + maintenance + pension)", () => {
    const inputs = { ...defaultInputs, monthlyPension: 200 };
    const d = deriveValues(inputs);
    const data = buildDetailedComparisonData(inputs);
    const y1 = data[1];
    // "total spent" = money out of the bank account = rent + the out-of-pocket
    // pension SLIDER (not the ×5/3 tax uplift, which is a bonus into the pot).
    expect(y1.rentOutgoings).toBeCloseTo(
      defaultRent * 12 + d.monthlyPension * 12,
      2,
    );
    // mortgage scenario total spent = mortgage + maintenance + pension (slider)
    expect(y1.mortgageOutgoings).toBeCloseTo(
      (d.monthlyMortgagePayment +
        defaultInputs.monthlyMaintenanceCost +
        d.monthlyPension) *
        12,
      1,
    );

    // In gross mode the outgoings must still use the out-of-pocket slider, NOT
    // the inflated pension pot (which would over-state the money spent).
    const grossD = deriveValues({ ...inputs, pensionGross: true });
    const grossY1 = buildDetailedComparisonData({
      ...inputs,
      pensionGross: true,
    })[1];
    expect(grossY1.rentOutgoings).toBeCloseTo(
      defaultRent * 12 + grossD.monthlyPension * 12,
      2,
    );
    expect(grossY1.rentOutgoings).not.toBeCloseTo(
      defaultRent * 12 + grossD.pensionInvested * 12,
      1,
    );
  });

  it("breakeven rent is unchanged by a pension funded from the budget", () => {
    const d = deriveValues(defaultInputs);
    const beNoPension = breakevenRent(defaultInputs, d);
    const inputs = { ...defaultInputs, monthlyPension: 200, pensionGross: true };
    const beWithPension = breakevenRent(inputs, deriveValues(inputs));
    expect(beNoPension).not.toBeNull();
    expect(beWithPension).toBeCloseTo(beNoPension!, 4);
  });
});

describe("mortgage overpayment", () => {
  const overpayInputs = {
    ...defaultInputs,
    mortgageOverpayRate: 1,
    mortgageOverpayMode: "initial" as const,
  };

  it("deriveValues computes monthlyOverpay as rate% of the initial loan / 12", () => {
    const d = deriveValues(overpayInputs);
    // 270000 * 1% / 100 / 12 = 225
    expect(d.monthlyOverpay).toBeCloseTo(225, 2);
    // Total outflow = regular payment + overpay
    expect(d.effectiveMonthlyMortgagePayment).toBeCloseTo(
      d.monthlyMortgagePayment + 225,
      2,
    );
    // Stocks get what's left after payment + overpay + maintenance
    // (no pension on defaults)
    expect(d.monthlyMortgageStockInvestment).toBeCloseTo(
      2000 - d.monthlyMortgagePayment - 225 - 200,
      2,
    );
  });

  it("deriveValues with zero overpay has monthlyOverpay === 0", () => {
    const d = deriveValues(defaultInputs);
    expect(d.monthlyOverpay).toBe(0);
    expect(d.effectiveMonthlyMortgagePayment).toBeCloseTo(
      d.monthlyMortgagePayment,
      6,
    );
  });

  it("mortgage balance is lower with overpay than without", () => {
    const withOverpay = mortgageBalanceAtYear(overpayInputs, deriveValues(overpayInputs), 10);
    const withoutOverpay = mortgageBalanceAtYear(defaultInputs, deriveValues(defaultInputs), 10);
    expect(withOverpay).toBeLessThan(withoutOverpay);
  });

  it("initial-mode overpay is constant across years (until payoff)", () => {
    const d = deriveValues(overpayInputs);
    const y1 = monthlyOverpayForYear(overpayInputs, d, 1);
    const y5 = monthlyOverpayForYear(overpayInputs, d, 5);
    const y10 = monthlyOverpayForYear(overpayInputs, d, 10);
    expect(y1).toBeCloseTo(225, 2);
    expect(y5).toBeCloseTo(225, 2);
    expect(y10).toBeCloseTo(225, 2);
  });

  it("remaining-mode overpay shrinks as the loan is repaid", () => {
    const d = deriveValues({
      ...defaultInputs,
      mortgageOverpayRate: 1,
      mortgageOverpayMode: "remaining" as const,
    });
    const y1 = monthlyOverpayForYear(
      { ...defaultInputs, mortgageOverpayRate: 1, mortgageOverpayMode: "remaining" },
      d,
      1,
    );
    const y5 = monthlyOverpayForYear(
      { ...defaultInputs, mortgageOverpayRate: 1, mortgageOverpayMode: "remaining" },
      d,
      5,
    );
    // At year 1 the balance is close to the initial loan, so overpay ≈ same
    // as initial mode (270000 × 1% / 12 ≈ 225).
    expect(y1).toBeCloseTo(225, 0);
    // By year 5 the balance has shrunk, so the overpay is smaller.
    expect(y5).toBeLessThan(y1);
    // And it is still positive (loan not yet paid off).
    expect(y5).toBeGreaterThan(0);
  });

  it("remaining-mode overpay reaches 0 once the loan is paid off", () => {
    const inputs = {
      ...defaultInputs,
      mortgageOverpayRate: 1,
      mortgageOverpayMode: "remaining" as const,
    };
    // With 1% remaining-mode overpay the loan is paid off well before 30 years.
    // After payoff, both regular payment and overpay should be 0.
    const data = buildDetailedComparisonData(inputs);
    const payoffYear = data.findIndex(
      (p) => p.currentMortgageBalance < 0.01,
    );
    expect(payoffYear).toBeGreaterThan(0);
    expect(payoffYear).toBeLessThan(data.length - 1);
    // Year 0: no overpay (no recurring payments yet)
    expect(data[0].annualOverpay).toBe(0);
    // Before payoff: overpay is positive
    expect(data[Math.min(payoffYear - 1, data.length - 1)].annualOverpay).toBeGreaterThan(0);
    // After payoff: overpay is 0
    const afterPayoff = data[payoffYear + 1];
    expect(afterPayoff.annualOverpay).toBe(0);
    expect(afterPayoff.annualMortgagePayment).toBe(0);
    expect(afterPayoff.currentMortgageBalance).toBeCloseTo(0, 2);
  });

  it("annualOverpay is 0 at year 0 and equals monthlyOverpay × 12 thereafter (initial mode)", () => {
    const data = buildDetailedComparisonData(overpayInputs);
    expect(data[0].annualOverpay).toBe(0);
    const d = deriveValues(overpayInputs);
    for (const t of [1, 5, 15, 20]) {
      // Stop if the loan has been paid off by then.
      if (data[t].currentMortgageBalance < 0.01) {
        expect(data[t].annualOverpay).toBe(0);
      } else {
        expect(data[t].annualOverpay).toBeCloseTo(d.monthlyOverpay * 12, 2);
      }
    }
  });

  it("interest paid each year accounts for the overpay", () => {
    const inputs = {
      ...defaultInputs,
      mortgageOverpayRate: 1,
      mortgageOverpayMode: "initial" as const,
    };
    const data = buildDetailedComparisonData(inputs);
    const d = deriveValues(inputs);
    for (const t of [1, 2, 10, 15]) {
      if (data[t].currentMortgageBalance < 0.01 && t > 0) {
        // If paid off by this year, no more interest.
        if (data[t - 1].currentMortgageBalance < 0.01) continue;
      }
      const p = data[t];
      if (p.mortgagePrincipalPaid === 0 && p.currentMortgageBalance === 0) continue;
      // interest = (regular payment + overpay) × 12 − principal repaid
      const expectedInterest =
        (d.monthlyMortgagePayment + d.monthlyOverpay) * 12 - p.mortgagePrincipalPaid;
      expect(p.interestPaidThisYear).toBeCloseTo(expectedInterest, 0);
    }
    // Total interest over the life of the loan is lower with overpay.
    const withOverpay = buildDetailedComparisonData(inputs).reduce(
      (sum, p) => sum + p.interestPaidThisYear, 0,
    );
    const withoutOverpay = buildDetailedComparisonData(defaultInputs).reduce(
      (sum, p) => sum + p.interestPaidThisYear, 0,
    );
    expect(withOverpay).toBeLessThan(withoutOverpay);
  });

  it("cost breakdown still sums to the total monthly budget with overpay", () => {
    const data = buildDetailedComparisonData(overpayInputs);
    for (const t of [1, 5, 10, 20]) {
      const p = data[t];
      // mortgageOutgoings (payment + overpay + maintenance + pension) + investing
      // = total budget for the year.
      expect(p.mortgageOutgoings + p.annualMortgageStockInvestment).toBeCloseTo(
        p.annualBudget,
        0,
      );
    }
  });

  it("after early payoff, more budget goes to stocks (mortgage payment + overpay freed up)", () => {
    const inputs = {
      ...defaultInputs,
      mortgageOverpayRate: 2,
      mortgageOverpayMode: "initial" as const,
    };
    const data = buildDetailedComparisonData(inputs);
    // Find the payoff year.
    const payoffYear = data.findIndex(
      (p) => p.currentMortgageBalance < 0.01 && p.year > 0,
    );
    expect(payoffYear).toBeGreaterThan(0);
    // One year before payoff: regular payment + overpay are being made.
    const beforePayoff = data[payoffYear - 1];
    expect(beforePayoff.annualMortgagePayment).toBeGreaterThan(0);
    expect(beforePayoff.annualOverpay).toBeGreaterThan(0);
    // After payoff: no payment, no overpay — all budget goes to stocks (minus maintenance).
    const afterPayoff = data[Math.min(payoffYear + 1, data.length - 1)];
    expect(afterPayoff.annualMortgagePayment).toBe(0);
    expect(afterPayoff.annualOverpay).toBe(0);
    // More money available for stocks after payoff.
    expect(afterPayoff.annualMortgageStockInvestment).toBeGreaterThan(
      beforePayoff.annualMortgageStockInvestment,
    );
  });

  it("mortgage scenario net worth is higher with overpay when stock returns are below the mortgage rate", () => {
    // With 3% stock returns and 5% mortgage rate, overpaying is strictly
    // beneficial: the interest saved by paying down the loan early grows at
    // 5%, while the forgone stock contributions only grow at 3%. Plus, once
    // the mortgage is paid off, the freed-up budget goes to stocks (at 3%),
    // which still beats paying 5% mortgage interest.
    const overpay = {
      ...defaultInputs,
      mortgageOverpayRate: 1,
      mortgageOverpayMode: "initial" as const,
      stockReturnRate: 3,
    };
    const noOverpay = { ...defaultInputs, stockReturnRate: 3 };
    const nwWith = mortgageScenarioNetWorth(overpay, deriveValues(overpay), 30);
    const nwWithout = mortgageScenarioNetWorth(
      noOverpay,
      deriveValues(noOverpay),
      30,
    );
    expect(nwWith).toBeGreaterThan(nwWithout);
  });

  it("breakeven rent is lower with overpay when stock returns are below the mortgage rate", () => {
    // Higher mortgage NW → rent scenario must work harder → breakeven rent drops.
    const overpay = {
      ...defaultInputs,
      mortgageOverpayRate: 1,
      mortgageOverpayMode: "initial" as const,
      stockReturnRate: 3,
    };
    const noOverpay = { ...defaultInputs, stockReturnRate: 3 };
    const beWith = breakevenRent(overpay, deriveValues(overpay));
    const beWithout = breakevenRent(noOverpay, deriveValues(noOverpay));
    expect(beWith).not.toBeNull();
    expect(beWithout).not.toBeNull();
    expect(beWith!).toBeLessThan(beWithout!);
  });
});

