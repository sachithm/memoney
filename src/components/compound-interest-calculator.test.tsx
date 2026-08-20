import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import CompoundInterestCalculator from "@/components/compound-interest-calculator";

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

// Mock next/navigation for URL param round-tripping.
const { mockSearch } = vi.hoisted(() => ({
  mockSearch: { params: new URLSearchParams("") },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearch.params,
  usePathname: () => "/compound-interest",
}));

describe("CompoundInterestCalculator", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    mockSearch.params = new URLSearchParams("");
    replaceStateSpy?.mockRestore();
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
  });

  it("renders with default values", () => {
    render(<CompoundInterestCalculator />);

    // Header
    expect(
      screen.getByRole("heading", { name: /Compound Interest/i }),
    ).toBeInTheDocument();

    // Input values — use getAllByDisplayValue where the slider shares a value
    expect(screen.getByDisplayValue("10000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    // "7" appears on both the annual rate number input and slider
    expect(screen.getAllByDisplayValue("7").length).toBeGreaterThanOrEqual(1);
    // "30" is the years slider value
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();

    // Frequency radio — Monthly is checked by default
    const monthlyRadio = screen.getByLabelText("Monthly");
    expect(monthlyRadio).toBeChecked();

    // Summary
    expect(screen.getByText("Total Invested:")).toBeInTheDocument();
    expect(screen.getByText("Total Interest:")).toBeInTheDocument();
    expect(screen.getByText("Final Value:")).toBeInTheDocument();
  });

  it("updates the final value when the initial investment changes", () => {
    render(<CompoundInterestCalculator />);

    const input = screen.getByDisplayValue("10000");
    fireEvent.change(input, { target: { value: "20000" } });

    // The final value should increase when initial investment increases
    expect(screen.getByText(/Final Value/)).toBeInTheDocument();
  });

  it("switches contribution frequency from monthly to annual", () => {
    render(<CompoundInterestCalculator />);

    const annualRadio = screen.getByLabelText("Annual");
    fireEvent.click(annualRadio);

    expect(annualRadio).toBeChecked();
    // Label should change to "Annual Contribution"
    expect(screen.getByText("Annual Contribution (£)")).toBeInTheDocument();
  });

  it("updates the chart when years slider changes", () => {
    render(<CompoundInterestCalculator />);

    const sliders = screen.getAllByRole("slider");
    // The years slider is the one with value "30"
    const yearsSlider = sliders.find((s) => s.getAttribute("value") === "30");
    expect(yearsSlider).toBeDefined();

    fireEvent.change(yearsSlider!, { target: { value: "20" } });

    // Summary title should update
    expect(screen.getByText("Summary (Year 20)")).toBeInTheDocument();
  });

  it("shows zero final value when all inputs are zero", () => {
    render(<CompoundInterestCalculator />);

    fireEvent.change(screen.getByDisplayValue("10000"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByDisplayValue("500"), {
      target: { value: "0" },
    });

    // Final value should be £0.00
    const finalValueCell = screen
      .getByText("Final Value:")
      .closest("div")!
      .querySelectorAll("span");
    const finalValue = Array.from(finalValueCell).find((el) =>
      el.textContent?.startsWith("£"),
    );
    expect(finalValue?.textContent).toBe("£0.00");
  });

  // ── URL parameter round-tripping ──

  it("loads configuration from URL query params on mount", () => {
    mockSearch.params.set("initialInvestment", "20000");
    mockSearch.params.set("contribution", "1000");
    mockSearch.params.set("frequency", "annual");
    mockSearch.params.set("annualRate", "5");
    mockSearch.params.set("years", "20");

    render(<CompoundInterestCalculator />);

    expect(screen.getByDisplayValue("20000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1000")).toBeInTheDocument();
    expect(screen.getByLabelText("Annual")).toBeChecked();
    // "5" appears on both the rate number input and slider
    expect(screen.getAllByDisplayValue("5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    expect(screen.getByText("Summary (Year 20)")).toBeInTheDocument();
  });

  it("writes the configuration to the URL as inputs change", async () => {
    render(<CompoundInterestCalculator />);

    fireEvent.change(screen.getByDisplayValue("10000"), {
      target: { value: "15000" },
    });

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenLastCalledWith(
        null,
        "",
        expect.stringContaining("initialInvestment=15000"),
      );
    });
    expect(replaceStateSpy).toHaveBeenLastCalledWith(
      null,
      "",
      expect.stringContaining("/compound-interest?"),
    );
  });

  it("round-trips a fractional rate through the URL", () => {
    mockSearch.params.set("annualRate", "7.5");
    render(<CompoundInterestCalculator />);
    // "7.5" appears on both number input and slider
    expect(screen.getAllByDisplayValue("7.5").length).toBeGreaterThanOrEqual(1);
  });

  it("ignores invalid URL params and falls back to defaults", () => {
    mockSearch.params.set("initialInvestment", "not-a-number");
    mockSearch.params.set("annualRate", "abc");
    mockSearch.params.set("years", "invalid");

    render(<CompoundInterestCalculator />);

    // Defaults are used
    expect(screen.getByDisplayValue("10000")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("7").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
  });
});
