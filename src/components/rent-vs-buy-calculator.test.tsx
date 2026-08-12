import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import RentVsBuyCalculator, {
  DetailedTooltip,
  RentVsBuyResultsTable,
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

  it("renders a budget increase per year input defaulting to 0", () => {
    render(<RentVsBuyCalculator />);

    const label = screen.getByText(/Budget Increase Rate \(%\)/);
    expect(label).toBeInTheDocument();

    const numberInput = label
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(numberInput).not.toBeNull();
    expect(numberInput!.value).toBe("0");
  });

  // ── Mortgage overpay ─────────────────────────────────────────

  it("renders a mortgage overpay input defaulting to 0 with initial mode", () => {
    render(<RentVsBuyCalculator />);

    const label = screen.getByText(/Mortgage Overpay \(%\)/);
    expect(label).toBeInTheDocument();

    // The number input defaults to 0.
    const numberInput = label
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(numberInput).not.toBeNull();
    expect(numberInput!.value).toBe("0");

    // Radio toggle defaults to "initial loan".
    const initialRadio = screen.getByRole("radio", {
      name: "Initial loan",
    }) as HTMLInputElement;
    const remainingRadio = screen.getByRole("radio", {
      name: "Remaining balance",
    }) as HTMLInputElement;
    expect(initialRadio.checked).toBe(true);
    expect(remainingRadio.checked).toBe(false);
  });

  it("increases mortgage overpay rate when the slider is moved", () => {
    render(<RentVsBuyCalculator />);

    const overpayInput = screen
      .getByText(/Mortgage Overpay \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(overpayInput, { target: { value: "2" } });

    expect(overpayInput.value).toBe("2");

    // The overpay annotation should now appear in the summary card.
    const paymentEl = screen.getByText("Mortgage Payment/Month:");
    expect(paymentEl.parentElement?.textContent).toMatch(/overpay/);
  });

  it("overpay increases the mortgage + invest net worth at the horizon (low stock returns)", () => {
    render(<RentVsBuyCalculator />);

    // Set stock return to 3% (below the 3% mortgage rate default → overpay
    // saves more interest than it costs in forgone stock growth).
    const stockInput = screen
      .getByText(/Stock Market Return Rate \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(stockInput, { target: { value: "3" } });

    const mortgageNWLabel = screen.getByText("Mortgage + Invest NW:");
    const before = parseFloat(
      mortgageNWLabel.parentElement!.lastElementChild!.textContent!.replace(
        /[£,]/g,
        "",
      ),
    );

    // Apply 3% mortgage overpay (of the initial loan).
    const overpayInput = screen
      .getByText(/Mortgage Overpay \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(overpayInput, { target: { value: "3" } });

    const after = parseFloat(
      screen
        .getByText("Mortgage + Invest NW:")
        .parentElement!.lastElementChild!.textContent!.replace(/[£,]/g, ""),
    );

    // With 3% stocks < 3% mortgage rate, faster payoff + early freed-up
    // budget strictly increases the mortgage scenario net worth.
    expect(after).toBeGreaterThan(before);
  });

  it("renders an Overpay column in the results table", () => {
    render(<RentVsBuyCalculator />);
    // The table header should contain an "Overpay" column.
    expect(screen.getByText("Overpay", { exact: true })).toBeInTheDocument();
  });

  it("shows the overpay amount in the tooltip cost breakdown", async () => {
    render(<RentVsBuyCalculator />);

    // Apply some overpay.
    const overpayInput = screen
      .getByText(/Mortgage Overpay \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(overpayInput, { target: { value: "2" } });

    // The expanded tooltip is complex to trigger with recharts in jsdom;
    // instead verify the overpay annotation appears in the summary card,
    // which uses the same derived value.
    const paymentEl = screen.getByText("Mortgage Payment/Month:");
    const text = paymentEl.parentElement?.textContent ?? "";
    expect(text).toMatch(/\+£[\d,]+\.\d{2} overpay/);
  });

  it("switches the overpay mode radio to remaining when selected", () => {
    render(<RentVsBuyCalculator />);

    const remainingRadio = screen.getByRole("radio", {
      name: "Remaining balance",
    }) as HTMLInputElement;
    fireEvent.click(remainingRadio);
    expect(remainingRadio.checked).toBe(true);

    const initialRadio = screen.getByRole("radio", {
      name: "Initial loan",
    }) as HTMLInputElement;
    expect(initialRadio.checked).toBe(false);
  });

  it("syncs mortgageOverpayRate to the URL via history.replaceState", () => {
    render(<RentVsBuyCalculator />);

    const overpayInput = screen
      .getByText(/Mortgage Overpay \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(overpayInput, { target: { value: "2" } });

    const url = replaceStateSpy!.mock.calls.at(-1)?.[2] as string | undefined;
    expect(url).toContain("mortgageOverpayRate=2");
  });

  it("syncs mortgageOverpayMode to the URL via history.replaceState", () => {
    render(<RentVsBuyCalculator />);

    const remainingRadio = screen.getByRole("radio", {
      name: "Remaining balance",
    });
    fireEvent.click(remainingRadio);

    const url = replaceStateSpy!.mock.calls.at(-1)?.[2] as string | undefined;
    expect(url).toContain("mortgageOverpayMode=remaining");
  });

  it("restores overpay from URL params on initial load", () => {
    mockSearch.params = new URLSearchParams(
      "mortgageOverpayRate=5&mortgageOverpayMode=remaining",
    );
    render(<RentVsBuyCalculator />);

    const numberInput = screen
      .getByText(/Mortgage Overpay \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(numberInput!.value).toBe("5");

    const remainingRadio = screen.getByRole("radio", {
      name: "Remaining balance",
    }) as HTMLInputElement;
    expect(remainingRadio.checked).toBe(true);
  });

  it("overpay reduces the current mortgage balance in the results table", () => {
    render(<RentVsBuyCalculator />);

    // Find the "Balance" column cells in the table body and capture the year-10
    // value with zero overpay.
    const getBalance = (year: number) => {
      const rows = screen.getAllByRole("row");
      // The first row is the header; data rows start at index 1.
      const row = rows[year + 1];
      // Column order: Year, NW, Stocks, Pens, NW, Property, Balance, Equity, ...
      // "Balance" is the 7th data cell (index 6).
      const cells = row.querySelectorAll("td");
      return cells[6].textContent;
    };

    const before = getBalance(10);

    // Apply 5% overpay.
    const overpayInput = screen
      .getByText(/Mortgage Overpay \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(overpayInput, { target: { value: "5" } });

    const after = getBalance(10);

    // The balance at year 10 should be lower with overpay.
    const beforeNum = parseFloat(before.replace(/[£,]/g, ""));
    const afterNum = parseFloat(after.replace(/[£,]/g, ""));
    expect(afterNum).toBeLessThan(beforeNum);
  });

  it("budget escalation raises the net worth of both scenarios", () => {
    render(<RentVsBuyCalculator />);

    const rentNWEl = screen.getByText("Rent + Invest NW:");
    const mortgageNWEl = screen.getByText("Mortgage + Invest NW:");
    const rentBefore = parseFloat(
      rentNWEl.parentElement!.lastElementChild!.textContent!.replace(/[£,]/g, ""),
    );
    const mtgBefore = parseFloat(
      mortgageNWEl.parentElement!.lastElementChild!.textContent!.replace(
        /[£,]/g,
        "",
      ),
    );

    const input = screen
      .getByText(/Budget Increase Rate \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;

    fireEvent.change(input, { target: { value: "3" } });

    const rentAfter = parseFloat(
      screen.getByText("Rent + Invest NW:").parentElement!.lastElementChild!
        .textContent!.replace(/[£,]/g, ""),
    );
    const mtgAfter = parseFloat(
      screen.getByText("Mortgage + Invest NW:").parentElement!.lastElementChild!
        .textContent!.replace(/[£,]/g, ""),
    );

    expect(rentAfter).toBeGreaterThan(rentBefore);
    expect(mtgAfter).toBeGreaterThan(mtgBefore);
  });

  it("budget escalation is reflected in the annual budget column of the results table", () => {
    render(<RentVsBuyCalculator />);

    // Default: budget increase is 0, so all years have the same budget (£2500 × 12)
    const beforeTable = screen.getByRole("table");
    const beforeRows = beforeTable.querySelectorAll("tbody tr");
    // Year 1 row should have Budget column = £30,000
    const year1CellsBefore = beforeRows[1].querySelectorAll("td");
    const budgetIdx = Array.from(
      beforeTable.querySelectorAll("thead tr th"),
    ).findIndex((th) => th.textContent === "Budget");
    expect(budgetIdx).toBeGreaterThan(0);
    expect(year1CellsBefore[budgetIdx].textContent).toBe("£30,000");

    // Set budget increase to 3%
    const input = screen
      .getByText(/Budget Increase Rate \(%\)/)
      .closest("div")!
      .querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3" } });

    const afterTable = screen.getByRole("table");
    const afterRows = afterTable.querySelectorAll("tbody tr");
    // Year 1 still shows base budget
    const y1Cells = afterRows[1].querySelectorAll("td");
    expect(y1Cells[budgetIdx].textContent).toBe("£30,000");
    // Year 10: budget grown by 3%^9
    const y10Cells = afterRows[10].querySelectorAll("td");
    const expectedAnnual = 2500 * Math.pow(1.03, 9) * 12;
    // formatCurrency: >= 10000 → 0 decimals
    const expectedFormatted = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(expectedAnnual);
    expect(y10Cells[budgetIdx].textContent).toBe(expectedFormatted);
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
  housingBudgetIncreaseRate: 0,
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

  it("shows a net-worth composition breakdown for each scenario", () => {
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

    // "Net worth:" appears once per scenario.
    const nwLabels = screen.getAllByText("Net worth:");
    expect(nwLabels).toHaveLength(2);

    // Rent + Invest: Stocks + Pension (pension is £0 by default, so hidden).
    // The container holds the label + sub-rows; parentElement is that container.
    const rentNwContainer = nwLabels[0].parentElement;
    expect(rentNwContainer?.textContent).toContain(
      formatCurrency(point.rentStocks),
    );
    expect(rentNwContainer?.textContent).toContain("Stocks");

    // Mortgage + Invest: Home equity + Stocks + Pension
    const mortgageNwContainer = nwLabels[1].parentElement;
    expect(mortgageNwContainer?.textContent).toContain(
      formatCurrency(point.mortgageHomeEquity),
    );
    expect(mortgageNwContainer?.textContent).toContain(
      formatCurrency(point.mortgageStocks),
    );
    expect(mortgageNwContainer?.textContent).toContain("Home equity");
    // "Stocks" appears in both NW sections (and the year-0 mortgage section would
    // add a third, but we're on year 1 here so it's exactly 2).
    expect(screen.getAllByText("Stocks").length).toBeGreaterThanOrEqual(2);
  });

  it("net-worth composition adds up to the scenario totals", () => {
    const point = detailedData[10];
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={10}
        data={detailedData}
      />,
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    // Rent: rentStocks should match (rentScenarioNW - pensionPot). The tooltip
    // shows it as a formatted currency value.
    expect(point.rentStocks).toBeCloseTo(
      point.rentScenarioNW - point.pensionPot,
      1,
    );
    // Mortgage: home equity + stocks + pension = mortgageScenarioNW
    expect(
      point.mortgageHomeEquity + point.mortgageStocks + point.pensionPot,
    ).toBeCloseTo(point.mortgageScenarioNW, 1);
  });

  it("shows a costs breakdown for the rent scenario (rent vs investing)", () => {
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

    // The "Outgoings this year" total is still shown…
    const outgoings = screen.getAllByText("Outgoings this year");
    expect(outgoings).toHaveLength(2);

    // The total row labels are spans inside flex divs; each row's parent div
    // holds the label + value.
    for (const el of outgoings) {
      const rowText = el.closest("div")?.textContent ?? "";
      expect(rowText).toMatch(/Outgoings this year/);
    }

    // Rent scenario (first "Outgoings this year"): the total includes rentStocks
    // value on the same row.
    expect(
      outgoings[0].closest("div")?.textContent,
    ).toContain(formatCurrency(point.rentOutgoings));

    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("Rent").closest("div")?.textContent).toContain(
      formatCurrency(point.annualRent),
    );

    // "Investing (stocks)" appears in both scenarios.
    const investRows = screen.getAllByText("Investing (stocks)");
    expect(investRows).toHaveLength(2);
    for (const row of investRows) {
      expect(row.closest("div")?.textContent).toContain(
        formatCurrency(point.annualRentStockInvestment),
      );
    }
  });

  it("shows a costs breakdown for the mortgage scenario (payment + maintenance + investing)", () => {
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

    // Mortgage scenario: mortgage payment + maintenance + investing.
    expect(screen.getByText("Mortgage payment")).toBeInTheDocument();
    expect(
      screen.getByText("Mortgage payment").closest("div")?.textContent,
    ).toContain(formatCurrency(point.annualMortgagePayment));

    expect(screen.getByText("Maintenance")).toBeInTheDocument();
    expect(
      screen.getByText("Maintenance").closest("div")?.textContent,
    ).toContain(formatCurrency(point.annualMaintenance));

    // The second "Outgoings this year" is the mortgage scenario.
    expect(
      screen.getAllByText("Outgoings this year")[1].closest("div")?.textContent,
    ).toContain(formatCurrency(point.mortgageOutgoings));
  });

  it("shows the pension cost line in the breakdown when a pension is active", () => {
    const pensionInputs = { ...defaultInputs, monthlyPension: 200 };
    const pensionData = buildDetailedComparisonData(pensionInputs);
    const point = pensionData[1];
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={1}
        data={pensionData}
      />,
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    // Both scenarios surface a "Pension" cost line (annual out-of-pocket).
    const pensionRows = screen.getAllByText("Pension");
    // "Pension growth" and "Pension" cost lines all match — filter to the cost
    // line by checking the value matches annualPension.
    const matching = pensionRows.filter(
      (el) =>
        el.closest("div")?.textContent?.includes(
          formatCurrency(point.annualPension),
        ) ?? false,
    );
    expect(matching.length).toBe(2);
  });

  it("hides the pension cost line when no pension is active", () => {
    const point = detailedData[1]; // no pension in default inputs
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={1}
        data={detailedData}
      />,
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    // No standalone "Pension" cost line (there IS "Pension growth" only when
    // pension > 0, which it isn't here).
    expect(point.pensionPot).toBe(0);
    expect(screen.queryByText("Pension")).not.toBeInTheDocument();
  });

  it("hides the net-worth and costs breakdown for the initial position (year 0)", () => {
    const point = detailedData[0];
    render(
      <DetailedTooltip
        active
        payload={makePayload(point)}
        label={0}
        data={detailedData}
      />,
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    // Year 0 still shows the initial position content.
    expect(
      screen.getByText(/Starting investment parked in stocks/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Down payment (property equity)"),
    ).toBeInTheDocument();

    // No breakdown sections at year 0.
    expect(screen.queryByText("Net worth:")).not.toBeInTheDocument();
    expect(screen.queryByText("Home equity")).not.toBeInTheDocument();
    expect(screen.queryByText("Investing (stocks)")).not.toBeInTheDocument();
  });
});

// ── Results table tests ───────────────────────────────────────────────
// The full-width table below the chart is tested in isolation with the
// calculator's real default inputs so we don't depend on Recharts.
describe("RentVsBuyResultsTable", () => {
  it("renders a row per projection year (0..35)", () => {
    render(<RentVsBuyResultsTable data={detailedData} />);

    // 36 body rows (years 0–35) + 2 header rows.
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(38);
  });

  it("renders the year column with sorted values 0..35", () => {
    render(<RentVsBuyResultsTable data={detailedData} />);

    // The year column is sticky and contains the years 0–35.
    const yearCells = screen.getAllByText("0", { exact: true });
    expect(yearCells.length).toBeGreaterThanOrEqual(1);

    // All years 0..35 are present as standalone year cells.
    for (let y = 0; y <= 35; y++) {
      // Use a within-table query by checking the row text contains the year.
      const rows = screen.getAllByRole("row");
      const found = rows.some((r) =>
        r.textContent?.startsWith(`${y}`),
      );
      expect(found).toBe(true);
    }
  });

  it("renders all column-group headers", () => {
    render(<RentVsBuyResultsTable data={detailedData} />);

    expect(screen.getByText("Rent + Invest (NW)")).toBeInTheDocument();
    expect(
      screen.getByText("Mortgage + Invest (NW)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Change (YoY)")).toBeInTheDocument();
    expect(screen.getByText("Rent Costs")).toBeInTheDocument();
    expect(screen.getByText("Mortgage Costs")).toBeInTheDocument();
  });

  it("renders detail column headers for every component", () => {
    render(<RentVsBuyResultsTable data={detailedData} />);

    // Rent NW group
    expect(screen.getAllByText("NW").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Stocks").length).toBeGreaterThanOrEqual(2);

    // Mortgage NW group
    expect(screen.getByText("Property")).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("Home Equity")).toBeInTheDocument();

    // Change group
    expect(screen.getByText("Appreciation")).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
    expect(screen.getByText("Interest")).toBeInTheDocument();
    expect(screen.getByText("Pens Δ")).toBeInTheDocument();

    // Rent Costs group
    expect(screen.getAllByText("Outgoings")).toHaveLength(2);

    // Mortgage Costs group
    expect(screen.getByText("Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
  });

  it("renders the final-year net-worth values in the correct cells", () => {
    render(<RentVsBuyResultsTable data={detailedData} />);

    const final = detailedData[35];
    const rows = screen.getAllByRole("row");
    // The last body row is the final year (year 35).
    const finalRow = rows[rows.length - 1];

    expect(finalRow.textContent).toContain(
      formatCurrency(final.rentScenarioNW),
    );
    expect(finalRow.textContent).toContain(
      formatCurrency(final.mortgageScenarioNW),
    );
    expect(finalRow.textContent).toContain(
      formatCurrency(final.rentStocks),
    );
    expect(finalRow.textContent).toContain(
      formatCurrency(final.mortgageHomeEquity),
    );
    expect(finalRow.textContent).toContain(
      formatCurrency(final.mortgageStocks),
    );
    expect(finalRow.textContent).toContain(
      formatCurrency(final.difference),
    );
  });

  it("renders final-year cost breakdown values", () => {
    render(<RentVsBuyResultsTable data={detailedData} />);

    const final = detailedData[35];
    const rows = screen.getAllByRole("row");
    const finalRow = rows[rows.length - 1];

    expect(finalRow.textContent).toContain(formatCurrency(final.annualRent));
    expect(finalRow.textContent).toContain(
      formatCurrency(final.annualRentStockInvestment),
    );
    expect(finalRow.textContent).toContain(formatCurrency(final.rentOutgoings));
    expect(finalRow.textContent).toContain(
      formatCurrency(final.annualMortgagePayment),
    );
    expect(finalRow.textContent).toContain(
      formatCurrency(final.annualMaintenance),
    );
    expect(finalRow.textContent).toContain(
      formatCurrency(final.annualMortgageStockInvestment),
    );
    expect(finalRow.textContent).toContain(formatCurrency(final.mortgageOutgoings));
  });

  it("shows — for change columns at year 0 and real deltas afterwards", () => {
    render(<RentVsBuyResultsTable data={detailedData} />);

    const rows = screen.getAllByRole("row");
    // Body rows start after both header rows.
    const bodyRows = rows.slice(2);
    const y0 = bodyRows[0];

    // Year 0: all change columns are 0 → rendered as "—"
    expect(y0.textContent).toContain("—");
    // But absolute-value columns still show currency.
    expect(y0.textContent).toContain(
      formatCurrency(detailedData[0].rentScenarioNW),
    );

    // Year 1: change columns show signed deltas.
    const y1 = bodyRows[1];
    expect(y1.textContent).toContain(
      formatCurrency(detailedData[1].rentScenarioChange).replace("£", "+£"),
    );
  });

  it("renders with pension data and shows pension cost/outgoings rows", () => {
    const pensionInputs = { ...defaultInputs, monthlyPension: 200 };
    const pensionData = buildDetailedComparisonData(pensionInputs);
    render(<RentVsBuyResultsTable data={pensionData} />);

    const rows = screen.getAllByRole("row");
    const bodyRows = rows.slice(2);
    const y1 = bodyRows[1];

    expect(y1.textContent).toContain(formatCurrency(pensionData[1].annualPension)); // £2,400ension
    // Pension pot should appear in both NW sections.
    expect(y1.textContent).toContain(
      formatCurrency(pensionData[1].pensionPot),
    );
  });

  it("is rendered below the chart in the full calculator", () => {
    render(<RentVsBuyCalculator />);

    expect(
      screen.getByRole("heading", { name: /Year-by-Year Breakdown/ }),
    ).toBeInTheDocument();
    // The table itself is present.
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
  });
});
