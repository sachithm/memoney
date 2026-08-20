import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import MortgageComparisonCalculator from "@/components/mortgage-comparison-calculator";

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

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock next/navigation for URL param round-tripping.
const { mockSearch } = vi.hoisted(() => ({
  mockSearch: { params: new URLSearchParams("") },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearch.params,
  usePathname: () => "/mortgage-comparison",
}));

describe("MortgageComparisonCalculator component", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    mockSearch.params = new URLSearchParams("");
    replaceStateSpy?.mockRestore();
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
  });

  it("renders with default values", () => {
    render(<MortgageComparisonCalculator />);

    // Header
    expect(
      screen.getByRole("heading", { name: "Mortgage Comparison Calculator" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to Dashboard/ }),
    ).toBeInTheDocument();

    // Mode toggle
    expect(screen.getByText("Fix Deposit")).toBeInTheDocument();
    expect(screen.getByText("Fix Term")).toBeInTheDocument();

    // Input values — use getAllByDisplayValue where multiple elements share a value
    expect(screen.getByDisplayValue("30000")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("10").length).toBeGreaterThanOrEqual(1);
    // "5" appears for both mortgage rate number input and slider
    expect(screen.getAllByDisplayValue("5").length).toBeGreaterThanOrEqual(1);
    // "4" appears for both appreciation rate number input and slider
    expect(screen.getAllByDisplayValue("4").length).toBeGreaterThanOrEqual(1);
    // "30" could appear for years slider
    expect(screen.getAllByDisplayValue("30").length).toBeGreaterThanOrEqual(1);
    // "7" appears for stock return rate number input and slider
    expect(screen.getAllByDisplayValue("7").length).toBeGreaterThanOrEqual(1);

    // Summary
    expect(screen.getByText("Total Spent:")).toBeInTheDocument();
    expect(screen.getByText("Total Interest Paid:")).toBeInTheDocument();
    expect(screen.getByText("Property Net Equity:")).toBeInTheDocument();
  });

  it("shows mortgage multiplier and payoff in Fix Deposit mode", () => {
    render(<MortgageComparisonCalculator />);

    // The multiplier slider label should be visible
    expect(screen.getByText("Mortgage Multiplier")).toBeInTheDocument();

    // The Fix Term-only "Property Value" input label should NOT be present
    // (the chart legend "Property Value" label is different — it's in a <span>)
    const pvLabels = screen.getAllByText("Property Value");
    // At least one should exist (in the chart legend), but not in the input form
    // The input label in Fix Term mode is a <label> element
    const labelElements = pvLabels.filter((el) =>
      el.tagName.toLowerCase() === "label",
    );
    expect(labelElements.length).toBe(0);
  });

  it("switches to Fix Term mode and shows Property Value input label", () => {
    render(<MortgageComparisonCalculator />);

    const fixTermButton = screen.getByRole("button", { name: "Fix Term" });
    fireEvent.click(fixTermButton);

    // Multiplier should be hidden
    expect(screen.queryByText("Mortgage Multiplier")).not.toBeInTheDocument();
    // Property Value input label should be visible (it's a <label> element)
    const pvLabels = screen.getAllByText("Property Value");
    const labelElements = pvLabels.filter((el) =>
      el.tagName.toLowerCase() === "label",
    );
    expect(labelElements.length).toBe(1);
  });

  it("switches back to Fix Deposit mode", () => {
    render(<MortgageComparisonCalculator />);

    const fixTermButton = screen.getByRole("button", { name: "Fix Term" });
    const fixDepositButton = screen.getByRole("button", { name: "Fix Deposit" });

    fireEvent.click(fixTermButton);
    expect(screen.queryByText("Mortgage Multiplier")).not.toBeInTheDocument();

    fireEvent.click(fixDepositButton);
    expect(screen.getByText("Mortgage Multiplier")).toBeInTheDocument();
  });

  it("shows standard and current monthly payment values", () => {
    render(<MortgageComparisonCalculator />);

    // Find the paragraph containing Standard and Current
    const paymentInfo = screen.getByText(/Standard:/, { exact: false });
    expect(paymentInfo).toHaveTextContent("£1,449.42");
    expect(paymentInfo).toHaveTextContent("Current:");
  });

  it("toggles stock market comparison on/off", () => {
    render(<MortgageComparisonCalculator />);

    // Stock market input should be visible
    expect(
      screen.getByText("Stock Market Annual Return (%)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Stock Market Value:")).toBeInTheDocument();

    // Toggle off
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Stock market input should be hidden
    expect(
      screen.queryByText("Stock Market Annual Return (%)"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Stock Market Value:")).not.toBeInTheDocument();
  });

  it("updates mortgage rate when changed", () => {
    render(<MortgageComparisonCalculator />);

    // Find the mortgage rate number input (value "5", type "number")
    const rateInputs = screen.getAllByDisplayValue("5");
    const rateInput = rateInputs.find(
      (el) => el.getAttribute("type") === "number",
    );
    expect(rateInput).toBeDefined();

    fireEvent.change(rateInput!, { target: { value: "6" } });

    // The mortgage rate should update to 6
    const updatedInputs = screen.getAllByDisplayValue("6");
    expect(updatedInputs.length).toBeGreaterThanOrEqual(1);
  });

  it("updates summary title when years slider changes", () => {
    render(<MortgageComparisonCalculator />);

    // Find the years slider (range input with value "30")
    const sliders = screen.getAllByRole("slider");
    const yearsSlider = sliders.find((s) => s.getAttribute("value") === "30");
    expect(yearsSlider).toBeDefined();

    fireEvent.change(yearsSlider!, { target: { value: "20" } });

    // Summary title should update
    expect(screen.getByText("Summary (Year 20)")).toBeInTheDocument();
  });

  it("shows payoff message in fix-deposit mode", () => {
    render(<MortgageComparisonCalculator />);

    expect(screen.getByText("Mortgage Payoff:")).toBeInTheDocument();
    // With standard payment and 30-year term, should show "Paid off at year 30"
    expect(screen.getByText(/Paid off/)).toBeInTheDocument();
  });

  it("shows total spent and interest in chart legend", () => {
    render(<MortgageComparisonCalculator />);

    expect(screen.getByText("Interest Paid (red area)")).toBeInTheDocument();
    expect(screen.getByText("Total Spent")).toBeInTheDocument();
  });

  it("shows Property Value display label in Fix Term mode", () => {
    render(<MortgageComparisonCalculator />);

    // Switch to Fix Term
    const fixTermButton = screen.getByRole("button", { name: "Fix Term" });
    fireEvent.click(fixTermButton);

    // The <label> "Property Value" should exist
    const pvLabels = screen.getAllByText("Property Value");
    const labelElements = pvLabels.filter((el) =>
      el.tagName.toLowerCase() === "label",
    );
    expect(labelElements.length).toBe(1);
  });

  // ── URL parameter round-tripping ──

  it("loads configuration from URL query params on mount", () => {
    mockSearch.params.set("initialInvestment", "50000");
    mockSearch.params.set("mortgageRate", "6");
    mockSearch.params.set("appreciationRate", "3");
    mockSearch.params.set("years", "20");
    mockSearch.params.set("paymentMode", "fix-term");
    mockSearch.params.set("showStockComparison", "0");

    render(<MortgageComparisonCalculator />);

    expect(screen.getByDisplayValue("50000")).toBeInTheDocument();
    // "6" appears on both mortgage rate number input and slider
    expect(screen.getAllByDisplayValue("6").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    // Fix Term mode should be active
    expect(
      screen.getByRole("button", { name: "Fix Term" }),
    ).toHaveClass("border-blue-500");
    // Stock comparison should be hidden
    expect(
      screen.queryByText("Stock Market Annual Return (%)"),
    ).not.toBeInTheDocument();
  });

  it("writes the configuration to the URL as inputs change", async () => {
    render(<MortgageComparisonCalculator />);

    fireEvent.change(screen.getByDisplayValue("30000"), {
      target: { value: "40000" },
    });

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenLastCalledWith(
        null,
        "",
        expect.stringContaining("initialInvestment=40000"),
      );
    });
    expect(replaceStateSpy).toHaveBeenLastCalledWith(
      null,
      "",
      expect.stringContaining("/mortgage-comparison?"),
    );
  });

  it("writes monthlyPayment as 'standard' when reset", async () => {
    render(<MortgageComparisonCalculator />);

    // Click "Reset to standard" — this should write monthlyPayment=standard to URL
    fireEvent.click(screen.getByRole("button", { name: "Reset to standard" }));

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenLastCalledWith(
        null,
        "",
        expect.stringContaining("monthlyPayment=standard"),
      );
    });
  });

  it("writes showStockComparison to the URL when toggled", async () => {
    render(<MortgageComparisonCalculator />);

    // Toggle off
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenLastCalledWith(
        null,
        "",
        expect.stringContaining("showStockComparison=0"),
      );
    });
  });

  it("ignores invalid URL params and falls back to defaults", () => {
    mockSearch.params.set("initialInvestment", "not-a-number");
    mockSearch.params.set("mortgageRate", "abc");
    mockSearch.params.set("years", "invalid");
    mockSearch.params.set("paymentMode", "nonsense");
    mockSearch.params.set("monthlyPayment", "not-a-number");

    render(<MortgageComparisonCalculator />);

    // Defaults are used
    expect(screen.getByDisplayValue("30000")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
  });
});
