import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TakeHomeSalaryCalculator, {
  TaxBreakdownTable,
} from "@/components/take-home-salary-calculator";
import {
  calculateTaxBreakdown,
  fromAnnual,
  DEFAULT_WORKING_HOURS,
  TAX_RATES_2026_2027,
  AVAILABLE_TAX_YEARS,
  type SalaryFrequency,
  type WorkingHours,
  type TaxBreakdown,
} from "@/lib/tax-calculations";
import { formatCurrency } from "@/lib/utils";

const WH = DEFAULT_WORKING_HOURS;

/** Replicate the component's cell pipeline: annual → freq → round2 → formatCurrency. */
const fmt = (annualValue: number, freq: SalaryFrequency): string =>
  formatCurrency(parseFloat(fromAnnual(annualValue, freq, WH).toFixed(2)));

/** Find a <tr> whose first <td> textContent contains `label`, return all cell texts. */
const findRowCells = (container: HTMLElement, label: string): string[] => {
  const rows = within(container).getAllByRole("row");
  const row = rows.find((r) => {
    const cells = r.querySelectorAll("td");
    return cells.length > 0 && cells[0].textContent?.includes(label);
  });
  if (!row) throw new Error(`Row with label "${label}" not found`);
  return Array.from(row.querySelectorAll("td")).map((td) => td.textContent);
};

// ──────────────────────────────────────────────────────────────
// TaxBreakdownTable (isolated)
// ──────────────────────────────────────────────────────────────

describe("TaxBreakdownTable", () => {
  const breakdown35k: TaxBreakdown = calculateTaxBreakdown(35_000, TAX_RATES_2026_2027);
  const breakdown60k: TaxBreakdown = calculateTaxBreakdown(60_000, TAX_RATES_2026_2027);
  const breakdown150k: TaxBreakdown = calculateTaxBreakdown(150_000, TAX_RATES_2026_2027);

  it("renders 5 column headers", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Component",
      "Hour",
      "Day",
      "Month",
      "Annual",
    ]);
  });

  it("renders 9 data rows plus 1 header row (10 total)", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    expect(screen.getAllByRole("row")).toHaveLength(10);
  });

  it("renders all expected row labels", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    const labels = [
      "Gross Salary",
      "Tax-Free Allowance",
      "Income Tax @ 20%",
      "Income Tax @ 40%",
      "Income Tax @ 45%",
      "National Insurance (12%)",
      "National Insurance (2%)",
      "Total Tax & NIC",
      "Take-Home Pay",
    ];
    labels.forEach((label) => {
      expect(findRowCells(table, label).length).toBeGreaterThan(0);
    });
  });

  // ── Annual column values for £35k ──

  it("shows correct annual gross salary", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Gross Salary")[4]).toBe(fmt(35_000, "annual"));
  });

  it("shows correct annual tax-free allowance (£12,570)", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Tax-Free Allowance")[4]).toBe(
      fmt(12_570, "annual"),
    );
  });

  it("shows correct 20% income tax (£4,486) with taxable amount in label", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    const cells = findRowCells(table, "Income Tax @ 20%");
    // Label cell includes the taxable amount
    expect(cells[0]).toContain("£22,430");
    expect(cells[4]).toBe(fmt(4_486, "annual"));
  });

  it("shows £0 for 40% and 45% bands when salary is below threshold", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Income Tax @ 40%")[4]).toBe(fmt(0, "annual"));
    expect(findRowCells(table, "Income Tax @ 45%")[4]).toBe(fmt(0, "annual"));
    expect(findRowCells(table, "National Insurance (2%)")[4]).toBe(
      fmt(0, "annual"),
    );
  });

  it("shows correct NIC 12% value (£2,691.60)", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "National Insurance (12%)")[4]).toBe(
      fmt(2_691.6, "annual"),
    );
  });

  it("shows correct total deductions (£7,177.60)", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Total Tax & NIC")[4]).toBe(
      fmt(7_177.6, "annual"),
    );
  });

  it("shows correct take-home (£27,822)", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Take-Home Pay")[4]).toBe(
      fmt(27_822.4, "annual"),
    );
  });

  // ── Hourly column values ──

  it("shows correct hourly gross salary", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Gross Salary")[1]).toBe(fmt(35_000, "hourly"));
  });

  it("shows correct hourly take-home", () => {
    render(<TaxBreakdownTable breakdown={breakdown35k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Take-Home Pay")[1]).toBe(
      fmt(27_822.4, "hourly"),
    );
  });

  // ── Higher-rate bands for £60k ──

  it("shows non-zero 40% band for £60k salary", () => {
    render(<TaxBreakdownTable breakdown={breakdown60k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Income Tax @ 40%")[4]).toBe(
      fmt(3_892, "annual"),
    );
    expect(findRowCells(table, "Income Tax @ 40%")[0]).toContain("£9,730");
  });

  it("shows NIC 2% for £60k salary", () => {
    render(<TaxBreakdownTable breakdown={breakdown60k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "National Insurance (2%)")[4]).toBe(
      fmt(194.6, "annual"),
    );
  });

  // ── Additional-rate band for £150k ──

  it("shows non-zero 45% band for £150k salary", () => {
    render(<TaxBreakdownTable breakdown={breakdown150k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Income Tax @ 45%")[4]).toBe(
      fmt(11_187, "annual"),
    );
    expect(findRowCells(table, "Income Tax @ 45%")[0]).toContain("£24,860");
  });

  it("shows zero tax-free allowance (PA tapered) for £150k", () => {
    render(<TaxBreakdownTable breakdown={breakdown150k} workingHours={WH} />);
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Tax-Free Allowance")[4]).toBe(
      fmt(0, "annual"),
    );
  });

  // ── Working hours change ──

  it("updates hourly column when working hours change", () => {
    const breakdown = calculateTaxBreakdown(35_000, TAX_RATES_2026_2027);
    const { rerender } = render(
      <TaxBreakdownTable breakdown={breakdown} workingHours={WH} />,
    );

    const table = screen.getByRole("table");
    // Default: 162.5 hrs/month → 1950 hrs/year → 35000/1950 = 17.95
    expect(findRowCells(table, "Gross Salary")[1]).toBe(
      formatCurrency(35_000 / 1_950),
    );

    // Switch to 180 hrs/month → 2160 hrs/year → 35000/2160 = 16.20
    const whHigh: WorkingHours = { ...WH, hoursPerMonth: 180 };
    rerender(
      <TaxBreakdownTable breakdown={breakdown} workingHours={whHigh} />,
    );
    expect(findRowCells(table, "Gross Salary")[1]).toBe(
      formatCurrency(35_000 / 2_160),
    );
  });
});

// ──────────────────────────────────────────────────────────────
// TakeHomeSalaryCalculator (full component)
// ──────────────────────────────────────────────────────────────

describe("TakeHomeSalaryCalculator", () => {
  it("renders with default salary £35,000", () => {
    render(<TakeHomeSalaryCalculator />);

    // The salary input should show 35000 (annual)
    expect(screen.getByRole("spinbutton")).toHaveValue(35_000);
  });

  it("shows correct table values for default £35,000", () => {
    render(<TakeHomeSalaryCalculator />);

    const table = screen.getByRole("table");
    const breakdown = calculateTaxBreakdown(35_000, TAX_RATES_2026_2027);

    // Gross annual
    expect(findRowCells(table, "Gross Salary")[4]).toBe(
      formatCurrency(breakdown.grossAnnual),
    );
    // Take-Home annual
    expect(findRowCells(table, "Take-Home Pay")[4]).toBe(
      formatCurrency(breakdown.takeHome),
    );
  });

  it("shows correct summary values", () => {
    render(<TakeHomeSalaryCalculator />);

    // Find the summary card by its heading
    const summaryHeading = screen.getByText(/Take-Home Summary/);
    const summaryCard = summaryHeading.closest("div")!;
    const summary = within(summaryCard);

    const breakdown = calculateTaxBreakdown(35_000, TAX_RATES_2026_2027);

    expect(
      summary.getByText(formatCurrency(breakdown.grossAnnual)),
    ).toBeInTheDocument();
    expect(
      summary.getByText(`-${formatCurrency(breakdown.totalDeductions)}`),
    ).toBeInTheDocument();
    expect(
      summary.getByText(formatCurrency(breakdown.takeHome)),
    ).toBeInTheDocument();
  });

  it("updates the table when the salary input changes", () => {
    render(<TakeHomeSalaryCalculator />);

    const salaryInput = screen.getByRole("spinbutton");
    fireEvent.change(salaryInput, { target: { value: "60000" } });

    const table = screen.getByRole("table");
    expect(findRowCells(table, "Gross Salary")[4]).toBe("£60,000");

    // Take-home should match £60k breakdown
    const breakdown = calculateTaxBreakdown(60_000, TAX_RATES_2026_2027);
    expect(findRowCells(table, "Take-Home Pay")[4]).toBe(
      formatCurrency(breakdown.takeHome),
    );
  });

  it("switches frequency to monthly and shows converted input value", () => {
    render(<TakeHomeSalaryCalculator />);

    fireEvent.click(screen.getByRole("button", { name: "Per Month" }));

    const salaryInput = screen.getByRole("spinbutton");
    // 35000 / 12 = 2916.67
    expect(salaryInput).toHaveValue(2916.67);

    // Annual column should still show £35,000 (annual salary is the source of truth)
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Gross Salary")[4]).toBe("£35,000");
  });

  it("converts a monthly salary entry to annual for the table", () => {
    render(<TakeHomeSalaryCalculator />);

    // Switch to monthly and enter £5,000/month → £60,000 annual
    fireEvent.click(screen.getByRole("button", { name: "Per Month" }));
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "5000" },
    });

    const table = screen.getByRole("table");
    expect(findRowCells(table, "Gross Salary")[4]).toBe("£60,000");
  });

  it("expands working hours section and shows default values", () => {
    render(<TakeHomeSalaryCalculator />);

    // Collapsed: no working-hours inputs visible
    expect(screen.queryByDisplayValue("162.5")).not.toBeInTheDocument();

    // Expand
    fireEvent.click(screen.getByRole("button", { name: /Working Hours/ }));

    expect(screen.getByDisplayValue("162.5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("52")).toBeInTheDocument();
  });

  it("renders the tax rules section with band rates and thresholds", () => {
    render(<TakeHomeSalaryCalculator />);

    expect(screen.getByText("Tax Rules (2026/2027)")).toBeInTheDocument();
    // Tax-free allowance threshold (£12,570 → no decimals), shown twice
    // (Personal Allowance and NIC primary threshold)
    expect(screen.getAllByText("£12,570").length).toBeGreaterThanOrEqual(2);
    // NIC upper earnings limit
    expect(screen.getByText("£50,270")).toBeInTheDocument();
    // Rate labels in the tax rules section
    expect(screen.getByText("Personal Allowance")).toBeInTheDocument();
    expect(screen.getByText("Basic rate")).toBeInTheDocument();
    expect(screen.getByText("Higher rate")).toBeInTheDocument();
    expect(screen.getByText("Additional rate")).toBeInTheDocument();
    // NIC rate labels
    expect(screen.getByText("NIC primary threshold")).toBeInTheDocument();
    expect(screen.getByText("NIC upper limit")).toBeInTheDocument();
    expect(screen.getByText("NIC main rate")).toBeInTheDocument();
    expect(screen.getByText("NIC additional rate")).toBeInTheDocument();
  });

  it("updates the tax rules header when the tax year changes", () => {
    render(<TakeHomeSalaryCalculator />);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "2023/2024" } });

    expect(screen.getByText("Tax Rules (2023/2024)")).toBeInTheDocument();
  });

  it("switches currency frequency when frequency button is clicked", () => {
    render(<TakeHomeSalaryCalculator />);

    // Default: annual, gross = 35000
    expect(screen.getByRole("spinbutton")).toHaveValue(35_000);

    // Switch to monthly
    fireEvent.click(screen.getByRole("button", { name: "Per Month" }));
    // 35000 / 12 = 2916.67 (display value rounded)
    expect(screen.getByRole("spinbutton")).toHaveValue(2916.67);

    // Annual column should still show 35000
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Gross Salary")[4]).toBe("£35,000");

    // Switch back to annual
    fireEvent.click(screen.getByRole("button", { name: "Per Year" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(35_000);
  });

  it("updates hourly rate when hours-per-month changes", () => {
    render(<TakeHomeSalaryCalculator />);

    // Expand working hours
    fireEvent.click(screen.getByRole("button", { name: /Working Hours/ }));

    // Change hours per month from 162.5 to 180
    const hoursInput = screen.getByDisplayValue("162.5");
    fireEvent.change(hoursInput, { target: { value: "180" } });

    // Hourly gross should change: 35000 / (180 × 12) = 35000 / 2160 ≈ 16.20
    const table = screen.getByRole("table");
    expect(findRowCells(table, "Gross Salary")[1]).toBe(
      formatCurrency(35_000 / (180 * 12)),
    );
  });

  it("updates tax year when selector changes", () => {
    render(<TakeHomeSalaryCalculator />);

    // Initially 2026/2027
    expect(screen.getByText(/Based on 2026\/2027/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "2024/2025" },
    });

    expect(screen.getByText(/Based on 2024\/2025/)).toBeInTheDocument();
  });

  it("renders all tax year options in the selector", () => {
    render(<TakeHomeSalaryCalculator />);

    const select = screen.getByRole("combobox");
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.map((o) => o.textContent)).toEqual(
      AVAILABLE_TAX_YEARS.map((y) => `UK ${y.taxYear}`),
    );
  });

  it("shows £0.00 values when salary is zero", () => {
    render(<TakeHomeSalaryCalculator />);

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "0" },
    });

    const table = screen.getByRole("table");
    expect(findRowCells(table, "Gross Salary")[4]).toBe("£0.00");
    expect(findRowCells(table, "Take-Home Pay")[4]).toBe("£0.00");
    expect(findRowCells(table, "Total Tax & NIC")[4]).toBe("£0.00");
  });

  it("shows higher-rate tax for a £60,000 salary", () => {
    render(<TakeHomeSalaryCalculator />);
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "60000" },
    });

    const table = screen.getByRole("table");
    const breakdown = calculateTaxBreakdown(60_000, TAX_RATES_2026_2027);

    expect(findRowCells(table, "Income Tax @ 40%")[4]).toBe(
      formatCurrency(breakdown.higherRateTax),
    );
    expect(findRowCells(table, "Income Tax @ 20%")[4]).toBe(
      formatCurrency(breakdown.basicRateTax),
    );
  });

  it("renders a PageHeader with the correct title", () => {
    render(<TakeHomeSalaryCalculator />);
    expect(
      screen.getByRole("heading", { name: "Take Home Salary Calculator" }),
    ).toBeInTheDocument();
  });
});
