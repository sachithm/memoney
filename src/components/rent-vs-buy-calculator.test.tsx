import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import RentVsBuyCalculator, {
  DetailedTooltip,
} from "@/components/rent-vs-buy-calculator";
import { buildDetailedComparisonData } from "@/lib/rent-vs-buy";
import { monthlyPaymentForLoan } from "@/lib/mortgage-calculations";
import { formatCurrency } from "@/lib/utils";

// Mock ResponsiveContainer so the chart renders in happy-dom (no real dimensions)
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div data-testid="chart-container">{children}</div>
    ),
  };
});

// Mock next/navigation: the calculator reads its initial state from the URL and
// writes the current configuration back to the address bar on every change.
// The URLSearchParams mock is mutated per-test so individual tests can seed a
// starting URL (or leave it empty for defaults).
const { mockRouter, mockSearch } = vi.hoisted(() => ({
  mockRouter: { replace: vi.fn(), push: vi.fn() },
  mockSearch: { params: new URLSearchParams("") },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearch.params,
  usePathname: () => "/rent-vs-buy",
}));

// New default scenario (src/components/rent-vs-buy-calculator.tsx):
// starting 45000, property 450000, budget 2500, mortgageRate 3, term 35,
// appreciation 2, stockReturn 10, maintenance 300, rentIncrease 2,
// rent = monthlyPaymentForLoan(405000, 3, 35) + 300 ≈ 1858.64.
// Default monthly rent ≈ mortgage payment + maintenance ≈ £1,858.64. We match
// with a partial regex because the rendered float has many digits.
const DEFAULT_MONTH = /1858/;

describe("RentVsBuyCalculator component", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn> | undefined;
  let pushStateSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    // Start each test from a clean URL / history state.
    mockSearch.params = new URLSearchParams("");
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
    replaceStateSpy?.mockRestore();
    pushStateSpy?.mockRestore();
    // The calculator syncs state to the address bar via history.replaceState
    // (no Next.js navigation, so no scroll-to-top), so spy on it to read back
    // the URL it wrote.
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
    pushStateSpy = vi.spyOn(window.history, "pushState");
  });

  it("renders with default values", () => {
    render(<RentVsBuyCalculator />);

    // Header
    expect(
      screen.getByRole("heading", { name: "Rent vs Buy Comparison" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to Dashboard/ }),
    ).toBeInTheDocument();

    // Input values (new defaults). Rates come with a number input *and* a
    // range slider sharing the same value, so they need getAllByDisplayValue.
    expect(screen.getByDisplayValue("45000")).toBeInTheDocument(); // starting investment
    expect(screen.getByDisplayValue("450000")).toBeInTheDocument(); // property value
    expect(screen.getByDisplayValue("2500")).toBeInTheDocument(); // total monthly budget
    expect(screen.getAllByDisplayValue("3").length).toBeGreaterThanOrEqual(1); // mortgage rate 3
    expect(screen.getAllByDisplayValue("35").length).toBeGreaterThanOrEqual(1); // term / horizon 35
    expect(screen.getAllByDisplayValue("2").length).toBeGreaterThanOrEqual(1); // appreciation / rent increase 2
    expect(screen.getByDisplayValue("300")).toBeInTheDocument(); // maintenance
    expect(screen.getAllByDisplayValue("10").length).toBeGreaterThan(0); // stock return 10

    // Monthly rent defaults to mortgage payment + maintenance ≈ £1,858.64
    expect(screen.getByDisplayValue(DEFAULT_MONTH)).toBeInTheDocument();

    // The rent-increase-per-year input defaults to 2 (%/yr)
    expect(
      screen.getByText(/Rent Increase Rate \(%\)/).closest("div")!,
    ).toBeInTheDocument();
    const rentIncreaseInput = screen
      .getByText(/Rent Increase Rate \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(rentIncreaseInput).not.toBeNull();
    expect(rentIncreaseInput!.value).toBe("2");

    // Summary header reflects the (linked) 35-year horizon
    expect(screen.getByText("Summary (Year 35)")).toBeInTheDocument();

    // Summary labels
    expect(screen.getByText("Mortgage Payment/Month:")).toBeInTheDocument();
    expect(screen.getByText("Monthly Rent (£):")).toBeInTheDocument();
    expect(
      screen.getByText("Stock Investment/Month (Rent):"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Stock Investment/Month (Mortgage):"),
    ).toBeInTheDocument();
    expect(screen.getByText("Breakeven Rent:")).toBeInTheDocument();
    expect(screen.getByText("Rent + Invest NW:")).toBeInTheDocument();
    expect(screen.getByText("Mortgage + Invest NW:")).toBeInTheDocument();
  });

  it("shows correct derived values for defaults", () => {
    render(<RentVsBuyCalculator />);

    // Monthly mortgage payment ≈ £1,558.64
    const paymentEl = screen.getByText("Mortgage Payment/Month:");
    const paymentParent = paymentEl.parentElement;
    expect(paymentParent?.textContent).toContain("£1,558.64");

    // Monthly rent ≈ £1,858.64 (default = mortgage + maintenance)
    const rentEl = screen.getByText("Monthly Rent (£):");
    const rentParent = rentEl.parentElement;
    expect(rentParent?.textContent).toContain("£1,858.64");

    // Stock investment (Rent) = 2500 − 1858.64 ≈ £641.36
    const investEl = screen.getByText("Stock Investment/Month (Rent):");
    const investParent = investEl.parentElement;
    expect(investParent?.textContent).toContain("£641.36");

    // Stock investment (Mortgage) = 2500 − 1558.64 − 300 ≈ £641.36
    const mortgageInvestEl = screen.getByText(
      "Stock Investment/Month (Mortgage):",
    );
    const mortgageInvestParent = mortgageInvestEl.parentElement;
    expect(mortgageInvestParent?.textContent).toContain("£641.36");
  });

  it("renders the chart container", () => {
    render(<RentVsBuyCalculator />);
    expect(screen.getByTestId("chart-container")).toBeInTheDocument();
  });

  it("renders chart legend entries", () => {
    render(<RentVsBuyCalculator />);
    expect(screen.getByText("Rent + Invest")).toBeInTheDocument();
    expect(screen.getByText("Mortgage + Invest")).toBeInTheDocument();
  });

  it("renders a back to dashboard link with correct href", () => {
    render(<RentVsBuyCalculator />);
    const link = screen.getByRole("link", { name: /Back to Dashboard/ });
    expect(link).toHaveAttribute("href", "/");
  });

  it("updates starting investment when changed", () => {
    render(<RentVsBuyCalculator />);

    const input = screen.getByDisplayValue("45000");
    fireEvent.change(input, { target: { value: "50000" } });

    expect(screen.getByDisplayValue("50000")).toBeInTheDocument();
  });

  it("updates property value when changed", () => {
    render(<RentVsBuyCalculator />);

    const input = screen.getByDisplayValue("450000");
    fireEvent.change(input, { target: { value: "500000" } });

    expect(screen.getByDisplayValue("500000")).toBeInTheDocument();
  });

  it("updates mortgage rate via slider", () => {
    render(<RentVsBuyCalculator />);

    const sliders = screen.getAllByRole("slider");
    const rateSlider = sliders.find((s) => s.getAttribute("value") === "3");
    expect(rateSlider).toBeDefined();

    fireEvent.change(rateSlider!, { target: { value: "10" } });

    // 405000 @ 10% over 35y ≈ £3,481.67/month — far above the 3% default (£1,558)
    const paymentEl = screen.getByText("Mortgage Payment/Month:");
    const paymentParent = paymentEl.parentElement;
    expect(paymentParent?.textContent).toContain("£3,481.67");
  });

  it("updates projection years via slider", () => {
    render(<RentVsBuyCalculator />);

    expect(screen.getByText("Summary (Year 35)")).toBeInTheDocument();

    const sliders = screen.getAllByRole("slider");
    const yearsSlider = sliders[sliders.length - 1];
    expect(yearsSlider.getAttribute("value")).toBe("35");

    fireEvent.change(yearsSlider, { target: { value: "15" } });

    expect(screen.getByText("Summary (Year 15)")).toBeInTheDocument();
  });

  it("keeps Mortgage Term in sync with Projection Period", () => {
    render(<RentVsBuyCalculator />);

    // Both horizons start locked at 35
    expect(screen.getByText("Summary (Year 35)")).toBeInTheDocument();
    expect(screen.getByText("35 years")).toBeInTheDocument();

    // Projection Period is the last slider and the only editable term control
    const sliders = screen.getAllByRole("slider");
    const yearsSlider = sliders[sliders.length - 1];
    expect(yearsSlider.getAttribute("value")).toBe("35");

    // Editing the projection period also moves the (locked) mortgage term
    fireEvent.change(yearsSlider, { target: { value: "15" } });

    expect(screen.getByText("Summary (Year 15)")).toBeInTheDocument();
    expect(screen.getByText("15 years")).toBeInTheDocument();
    expect(screen.queryByText("35 years")).not.toBeInTheDocument();
  });

  it("renders a rent increase per year input defaulting to 2", () => {
    render(<RentVsBuyCalculator />);

    const label = screen.getByText(/Rent Increase Rate \(%\)/);
    expect(label).toBeInTheDocument();

    const numberInput = label
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(numberInput).not.toBeNull();
    expect(numberInput!.value).toBe("2");

    // A 35-year horizon is shown (default rent escalation is on at 2%/yr)
    expect(screen.getByText("Summary (Year 35)")).toBeInTheDocument();
  });

  it("rent escalation lowers the rent + invest net worth", () => {
    render(<RentVsBuyCalculator />);

    const rentNWLabel = screen.getByText("Rent + Invest NW:");
    const before = parseFloat(
      rentNWLabel.parentElement!.lastElementChild!.textContent!.replace(
        /[£,]/g,
        "",
      ),
    );

    const input = screen
      .getByText(/Rent Increase Rate \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;

    // Pushing escalation from 2% → 5% shrinks later rent contributions,
    // which lowers the rent + invest net worth at the horizon.
    fireEvent.change(input, { target: { value: "5" } });

    const after = parseFloat(
      screen
        .getByText("Rent + Invest NW:")
        .parentElement!.lastElementChild!.textContent!.replace(/[£,]/g, ""),
    );
    expect(after).toBeLessThan(before);
  });

  it("updates mortgage rate changes mortgage scenario investment only", () => {
    render(<RentVsBuyCalculator />);

    // Rent scenario investment = 2500 − 1858.64 ≈ £641.36, independent of mortgage rate
    const rentInvestEl = screen.getByText("Stock Investment/Month (Rent):");
    expect(rentInvestEl.parentElement?.textContent).toContain("£641.36");

    const startInput = screen.getByDisplayValue("45000");
    fireEvent.change(startInput, { target: { value: "100000" } });

    // Larger down payment → smaller mortgage → lower mortgage payment
    const paymentEl = screen.getByText("Mortgage Payment/Month:");
    const paymentParent = paymentEl.parentElement;
    expect(paymentParent?.textContent).not.toContain("£1,558");
  });

  it("updates monthly rent changes rent scenario investment", () => {
    render(<RentVsBuyCalculator />);

    const rentInput = screen.getByDisplayValue(DEFAULT_MONTH);
    fireEvent.change(rentInput, { target: { value: "800" } });

    expect(screen.getByDisplayValue("800")).toBeInTheDocument();
    // Monthly Rent (£) reflects the new value
    const rentLabel = screen.getByText("Monthly Rent (£):");
    expect(rentLabel.parentElement?.textContent).toContain("£800.00");
    // Rent scenario investment = 2500 − 800 = £1,700
    const investEl = screen.getByText("Stock Investment/Month (Rent):");
    expect(investEl.parentElement?.textContent).toContain("£1,700.00");
    // Mortgage scenario investment is unaffected (still ≈ £641.36)
    const mortgageInvestEl = screen.getByText(
      "Stock Investment/Month (Mortgage):",
    );
    expect(mortgageInvestEl.parentElement?.textContent).toContain("£641.36");
  });

  it("updates maintenance cost affects the mortgage scenario investment", () => {
    render(<RentVsBuyCalculator />);

    const mortgageInvestEl = screen.getByText(
      "Stock Investment/Month (Mortgage):",
    );
    const mortgageInvestParent = mortgageInvestEl.parentElement;
    // Default: 2500 − 1558.64 − 300 = £641.36
    expect(mortgageInvestParent?.textContent).toContain("£641.36");

    const input = screen.getByDisplayValue("300");
    fireEvent.change(input, { target: { value: "500" } });
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();

    // Now: 2500 − 1558.64 − 500 = £441.36  (rent is untouched)
    expect(mortgageInvestParent?.textContent).toContain("£441.36");
    // Rent scenario investment is unchanged
    const rentInvestEl = screen.getByText("Stock Investment/Month (Rent):");
    expect(rentInvestEl.parentElement?.textContent).toContain("£641.36");
  });

  it("updates stock return rate via slider", () => {
    render(<RentVsBuyCalculator />);

    const sliders = screen.getAllByRole("slider");
    // Stock return defaults to 10
    const stockSlider = sliders.find((s) => s.getAttribute("value") === "10");
    expect(stockSlider).toBeDefined();

    fireEvent.change(stockSlider!, { target: { value: "5" } });

    const rentNWEl = screen.getByText("Rent + Invest NW:");
    const rentNWParent = rentNWEl.parentElement;
    expect(rentNWParent?.textContent).toContain("£");
  });

  it("shows affordability warning when total monthly is below rent", () => {
    render(<RentVsBuyCalculator />);

    const budgetInput = screen.getByDisplayValue("2500");
    fireEvent.change(budgetInput, { target: { value: "500" } });

    expect(
      screen.getByText(/⚠ Your total monthly amount is below your rent/),
    ).toBeInTheDocument();
  });

  it("shows the winner callout", () => {
    render(<RentVsBuyCalculator />);

    // Default (rent £1,858.64 > breakeven ≈ £1,705.74) → buying wins
    expect(screen.getByText(/wins by/)).toBeInTheDocument();
  });

  it("shows breakeven rent and switches winner when rent crosses it", () => {
    render(<RentVsBuyCalculator />);

    // The breakeven row renders a currency value (~£1,705.74 with 2% escalation)
    const breakevenEl = screen.getByText("Breakeven Rent:");
    expect(breakevenEl.parentElement?.textContent).toMatch(/£\d/);

    // Default rent (£1,858.64) is above the breakeven (£1,705.74) → buying wins
    expect(screen.getByText(/Mortgage \+ Invest wins/)).toBeInTheDocument();

    // Drop rent well below the breakeven → renting wins
    const rentInput = screen.getByDisplayValue(DEFAULT_MONTH);
    fireEvent.change(rentInput, { target: { value: "800" } });

    expect(screen.getByText(/Rent \+ Invest wins/)).toBeInTheDocument();
  });

  it("loads configuration from URL query params on mount", () => {
    mockSearch.params.set("startingInvestment", "100000");
    mockSearch.params.set("propertyValue", "600000");
    mockSearch.params.set("monthlyHousingBudget", "3000");
    mockSearch.params.set("mortgageRate", "5");
    mockSearch.params.set("rentIncreaseRate", "3");
    mockSearch.params.set("termYears", "20");

    render(<RentVsBuyCalculator />);

    // Inputs reflect the URL values rather than the defaults.
    expect(screen.getByDisplayValue("100000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("600000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3000")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Summary (Year 20)")).toBeInTheDocument();
  });

  it("round-trips a fractional value through the URL", () => {
    // monthlyRent is a float; only this param is provided, the rest default.
    mockSearch.params.set("monthlyRent", "2050.75");

    render(<RentVsBuyCalculator />);

    expect(screen.getByDisplayValue("2050.75")).toBeInTheDocument();
  });

  it("writes the configuration to the URL as inputs change", async () => {
    render(<RentVsBuyCalculator />);

    const input = screen.getByDisplayValue("45000"); // starting investment
    fireEvent.change(input, { target: { value: "50000" } });

    // The address bar is updated (via replaceState, not pushState) to reflect the
    // new starting investment together with the other current inputs.
    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenLastCalledWith(
        null,
        "",
        expect.stringContaining("startingInvestment=50000"),
      );
    });
    expect(replaceStateSpy).toHaveBeenLastCalledWith(
      null,
      "",
      expect.stringContaining("propertyValue=450000"),
    );
    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("/rent-vs-buy?"),
    );
    // replaceState (not pushState) keeps the history clean.
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it("ignores invalid URL params and falls back to defaults", () => {
    mockSearch.params.set("startingInvestment", "not-a-number");
    mockSearch.params.set("termYears", "abc");

    render(<RentVsBuyCalculator />);

    // Invalid (non-numeric) values fall back to the defaults.
    expect(screen.getByDisplayValue("45000")).toBeInTheDocument();
    expect(screen.getByText("Summary (Year 35)")).toBeInTheDocument();
  });

  it("renders a pension input and a tax-recompensation checkbox", () => {
    render(<RentVsBuyCalculator />);

    // The pension control is grouped under its own label.
    const pensionInput = screen
      .getByText("Pension (£/month)")
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(pensionInput).not.toBeNull();
    expect(pensionInput!.value).toBe("0"); // defaults to no pension

    // "add tax recompensation" checkbox (off by default → net mode)
    const checkbox = screen.getByLabelText(/add tax recompensation/i);
    expect(checkbox).not.toBeChecked();

    // The summary shows the (net) pension amount invested
    expect(
      screen.getByText("Pension (£/month):").closest("div"),
    ).toHaveTextContent(/£0\.00/);
  });

  it("pension reduces the stock investment in both scenarios", () => {
    render(<RentVsBuyCalculator />);

    const pensionInput = screen
      .getByText("Pension (£/month)")
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(pensionInput, { target: { value: "200" } });

    // Rent scenario: 2500 − 1858.64 − 200 = £441.36
    expect(
      screen.getByText("Stock Investment/Month (Rent):").parentElement,
    ).toHaveTextContent("£441.36");
    // Mortgage scenario: 2500 − 1558.64 − 300 − 200 = £441.36
    expect(
      screen.getByText("Stock Investment/Month (Mortgage):").parentElement,
    ).toHaveTextContent("£441.36");
    // Summary pension row = net amount invested
    expect(
      screen.getByText("Pension (£/month):").parentElement,
    ).toHaveTextContent("£200.00");
  });

  it("tax recompensation inflates the pension pot by 5/3 without shrinking stocks", () => {
    render(<RentVsBuyCalculator />);

    const pensionInput = screen
      .getByText("Pension (£/month)")
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(pensionInput, { target: { value: "210" } });
    fireEvent.click(screen.getByLabelText(/add tax recompensation/i));

    // 210 × 5/3 = 350.00 actually goes into the pension pot
    expect(
      screen.getByText("Pension (£/month):").parentElement,
    ).toHaveTextContent("£350.00");

    // The out-of-pocket slider (210) is what is deducted from stocks — NOT the
    // inflated ×5/3 figure — so rent stock = 2500 − 1858.64 − 210 = £431.36.
    expect(
      screen.getByText("Stock Investment/Month (Rent):").parentElement,
    ).toHaveTextContent("£431.36");
  });

  it("writes the pension and tax-recompensation flag to the URL as inputs change", async () => {
    render(<RentVsBuyCalculator />);

    const pensionInput = screen
      .getByText("Pension (£/month)")
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(pensionInput, { target: { value: "200" } } as never);
    fireEvent.click(screen.getByLabelText(/add tax recompensation/i));

    await waitFor(() => {
      const lastCall = replaceStateSpy!.mock.calls.at(-1)![2] as string;
      expect(lastCall).toContain("monthlyPension=200");
      expect(lastCall).toContain("pensionGross=1");
    });
  });

  it("loads the pension and tax-recompensation flag from the URL on mount", () => {
    mockSearch.params.set("monthlyPension", "500");
    mockSearch.params.set("pensionGross", "1");

    render(<RentVsBuyCalculator />);

    // monthlyPension=500 lands on both the number input and the range slider,
    // so scope to the number input via the pension label.
    const pensionInput = screen
      .getByText("Pension (£/month)")
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    expect(pensionInput.value).toBe("500");
    // The checkbox is checked and the pot receives 500 × 5/3 ≈ 833.33.
    expect(screen.getByLabelText(/add tax recompensation/i)).toBeChecked();
    // 500 × 5/3 ≈ 833.33 actually invested
    expect(
      screen.getByText("Pension (£/month):").parentElement,
    ).toHaveTextContent("£833.33");
  });

  it("shows a red stock-exposure warning when annual stock investment exceeds £20,000", () => {
    // £5,000/month budget → ~£3,141/month goes into stocks in BOTH scenarios
    // → £37,696/year, which beats the £20k tax-free ISA allowance.
    mockSearch.params.set("monthlyHousingBudget", "5000");

    render(<RentVsBuyCalculator />);

    const notes = screen.getAllByText(/Over £20,000 is invested in stocks/);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toHaveClass("text-red-700");
    expect(notes[0]).toHaveTextContent(/per year/);
  });

  it("hides the stock-exposure warning when annual stock investment is below £20,000", () => {
    // Default £2,500/month budget → ~£641/month into stocks → £7,696/year,
    // well under the £20k tax-free ISA allowance → no advisory note.
    render(<RentVsBuyCalculator />);

    expect(
      screen.queryAllByText(/Over £20,000 is invested in stocks/),
    ).toHaveLength(0);
  });
});

// ── Expandable tooltip tests ──────────────────────────────────────────
// The detailed tooltip is unit-tested in isolation (rendered directly with a
// synthetic active payload) so we don't depend on Recharts' hover hit-testing
// in happy-dom. The data is built from the calculator's real default inputs.
const defaultRent = monthlyPaymentForLoan(405000, 3, 35) + 300; /* ≈ 1858.64 */
const defaultInputs = {
  startingInvestment: 45000,
  propertyValue: 450000,
  monthlyHousingBudget: 2500,
  monthlyRent: defaultRent,
  rentIncreaseRate: 2,
  mortgageRate: 3,
  mortgageTermYears: 35,
  propertyAppreciationRate: 2,
  stockReturnRate: 10,
  monthlyMaintenanceCost: 300,
  projectionYears: 35,
};
const detailedData = buildDetailedComparisonData(defaultInputs);

function makePayload(point: (typeof detailedData)[number]) {
  return [
    { dataKey: "rentScenarioNW", value: point.rentScenarioNW, color: "#3b82f6" },
    { dataKey: "mortgageScenarioNW", value: point.mortgageScenarioNW, color: "#10b981" },
    { dataKey: "difference", value: point.difference, color: undefined },
  ];
}

describe("DetailedTooltip", () => {
  it("renders the collapsed totals for the hovered year", () => {
    const point = detailedData[1];
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={1}
        data={detailedData}
      />,
    );

    expect(screen.getByText("Year 1")).toBeInTheDocument();
    expect(screen.getByText("Show breakdown")).toBeInTheDocument();
    // Collapsed totals are still visible
    expect(screen.getByText("Rent + Invest")).toBeInTheDocument();
    expect(screen.getByText("Mortgage + Invest")).toBeInTheDocument();
  });

  it("expands to show where the mortgage net-worth change came from", () => {
    const point = detailedData[1];
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={1}
        data={detailedData}
      />,
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    // The mortgage total change vs previous year, then split into
    // appreciation + principal + stocks (these are unique to the mortgage
    // section; "Change vs last year" appears in both sections, so we filter).
    const changeRows = screen
      .getAllByText("Change vs last year")
      .map((el) => el.closest("div")?.textContent ?? "");
    expect(
      changeRows.some((t) => t.includes(formatCurrency(point.mortgageScenarioChange))),
    ).toBe(true);

    const apprec = screen
      .getByText("Property appreciation")
      .closest("div");
    expect(apprec?.textContent).toContain(
      formatCurrency(point.mortgageAppreciation),
    );

    const principal = screen
      .getByText("Mortgage principal repaid")
      .closest("div");
    expect(principal?.textContent).toContain(
      formatCurrency(point.mortgagePrincipalPaid),
    );

    const stocks = screen.getByText("Stock growth").closest("div");
    expect(stocks?.textContent).toContain(
      formatCurrency(point.mortgageStocksChange),
    );

    // Outgoings for the year: (mortgage payment + maintenance) * 12
    const outgoings = screen
      .getAllByText("Outgoings this year")
      .map((el) => el.closest("div")?.textContent ?? "");
    expect(
      outgoings.some((t) => t.includes(formatCurrency(point.mortgageOutgoings))),
    ).toBe(true);
    expect(
      outgoings.some((t) => t.includes(formatCurrency(point.rentOutgoings))),
    ).toBe(true);
  });

  it("shows mortgage interest paid in the breakdown (interest + principal ≈ payment)", () => {
    // Interest paid = annual mortgage payment − principal repaid this year.
    // It sits in the mortgage section right after "Mortgage principal repaid".
    const point = detailedData[1]; // year 1
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={1}
        data={detailedData}
      />,
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    const interest = screen.getByText("Interest paid").closest("div");
    expect(interest?.textContent).toContain(
      formatCurrency(point.interestPaidThisYear),
    );

    // Interest is positive in year 1 (mortgage is amortising).
    expect(point.interestPaidThisYear).toBeGreaterThan(0);

    // interest + principal repaid = the annual mortgage payment, i.e. the
    // mortgage portion of the annual outgoings (outgoings also include maintenance).
    expect(
      point.interestPaidThisYear + point.mortgagePrincipalPaid,
    ).toBeCloseTo(
      point.mortgageOutgoings - defaultInputs.monthlyMaintenanceCost * 12,
      1,
    );
  });

  it("shows escalated rent outgoings in later years", () => {
    const point = detailedData[2]; // year 2: rent has risen by 2%
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={2}
        data={detailedData}
      />,
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    const outgoings = screen
      .getAllByText("Outgoings this year")
      .map((el) => el.closest("div")?.textContent ?? "");
    // Rent outgoings have escalated above the (constant) mortgage outgoings
    expect(
      outgoings.some((t) => t.includes(formatCurrency(point.rentOutgoings))),
    ).toBe(true);
    expect(point.rentOutgoings).toBeGreaterThan(point.mortgageOutgoings);
    expect(
      outgoings.some((t) => t.includes(formatCurrency(point.mortgageOutgoings))),
    ).toBe(true);
  });

  it("shows the initial position for year 0", () => {
    const point = detailedData[0];
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={0}
        data={detailedData}
      />,
    );

    expect(
      screen.getByText("Year 0 (initial position)"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Show breakdown"));

    expect(
      screen.getByText("Down payment (property equity)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Property value")).toBeInTheDocument();
    expect(screen.getByText("Stocks")).toBeInTheDocument();

    // All four starting figures
    expect(
      screen.getByText("Down payment (property equity)").closest("div")
        ?.textContent,
    ).toContain(formatCurrency(point.mortgageHomeEquity));

    expect(
      screen.getByText("Property value").closest("div")?.textContent,
    ).toContain(formatCurrency(point.currentPropertyValue));

    expect(screen.getByText("Stocks").closest("div")?.textContent).toContain(
      formatCurrency(point.mortgageStocks),
    );
  });

  it("re-enables pointer events so the expand button is clickable", () => {
    // Recharts pins the tooltip wrapper at pointer-events: none (and the
    // tooltip is positioned at the cursor). The content must opt back into
    // pointer events, otherwise the expand button can never be clicked.
    const point = detailedData[1];
    const { container } = render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={1}
        data={detailedData}
      />,
    );
    const tooltipRoot = container.firstChild as HTMLElement;
    expect(tooltipRoot).toHaveStyle({ pointerEvents: "auto" });
    expect(
      screen.getByRole("button", { name: /show breakdown/i }),
    ).toBeInTheDocument();
  });

  it("shows a pension growth line in the breakdown when a pension is active", () => {
    // A pension redirects some of the monthly budget into a separate pot that
    // grows at the mortgage rate, so the tooltip must call it out.
    const pensionInputs = { ...defaultInputs, monthlyPension: 200 };
    const pensionData = buildDetailedComparisonData(pensionInputs);
    const point = pensionData[1]; // year 1 → pensionGrowth is positive
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={1}
        data={pensionData}
      />,
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    // Both the rent and mortgage sections surface a "Pension growth" line.
    const pensionRows = screen.getAllByText("Pension growth");
    expect(pensionRows).toHaveLength(2);
    for (const row of pensionRows) {
      expect(row.closest("div")?.textContent).toContain(
        formatCurrency(point.pensionGrowth),
      );
    }
  });
});
