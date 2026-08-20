import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CountryComparer, {
  deriveComparison,
  DEFAULT_COUNTRY_VARS,
} from "@/components/country-comparer";
import { formatCurrency } from "@/lib/utils";

// Mock next/navigation: the calculator reads its initial state from the URL and
// writes the current configuration back to the address bar on every change.
const { mockSearch } = vi.hoisted(() => ({
  mockSearch: { params: new URLSearchParams("") },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearch.params,
  usePathname: () => "/country-comparer",
}));

const DEFAULTS = DEFAULT_COUNTRY_VARS;

/** Convenience: grab an element by id (non-null in tests). */
const byId = (id: string): HTMLElement => document.getElementById(id)!;

/** Find a <tr> whose first <td> textContent contains `label`, return all cell texts. */
const findRowCells = (label: string): string[] => {
  const rows = screen.getAllByRole("row");
  const row = rows.find((r) => {
    const cells = r.querySelectorAll("td");
    return cells.length > 0 && cells[0].textContent?.includes(label);
  });
  if (!row) throw new Error(`Row with label "${label}" not found`);
  return Array.from(row.querySelectorAll("td")).map((td) => td.textContent);
};

// ──────────────────────────────────────────────────────────────
// deriveComparison (pure math)
// ──────────────────────────────────────────────────────────────

describe("deriveComparison", () => {
  const comp = deriveComparison(DEFAULTS);

  it("computes monthly and yearly income", () => {
    expect(comp.income.monthly).toBe(DEFAULTS.income);
    expect(comp.income.yearly).toBe(DEFAULTS.income * 12);
  });

  it("computes monthly and yearly tax from the cumulative rate", () => {
    // 5000 × 30% = 1500
    expect(comp.tax.monthly).toBe(1500);
    expect(comp.tax.yearly).toBe(18000);
    expect(comp.taxRate).toBe(30);
  });

  it("computes monthly and yearly saved as income − all costs (incl. tax)", () => {
    // 5000 − 1500(tax) − 1500 − 600 − 300 = 1100
    expect(comp.saved.monthly).toBe(1100);
    expect(comp.saved.yearly).toBe(13200);
    expect(comp.totalCosts.monthly).toBe(3900);
    expect(comp.totalCosts.yearly).toBe(46800);
  });

  it("annualises monthly costs by 12", () => {
    expect(comp.housing.monthly).toBe(DEFAULTS.housing);
    expect(comp.housing.yearly).toBe(DEFAULTS.housing * 12);
    expect(comp.living.yearly).toBe(DEFAULTS.living * 12);
    expect(comp.recreational.yearly).toBe(DEFAULTS.recreational * 12);
  });

  it("handles a zero tax rate (no tax deducted)", () => {
    const zeroTax = deriveComparison({ ...DEFAULTS, taxRate: 0 });
    expect(zeroTax.tax.monthly).toBe(0);
    // saved = 5000 − 0(tax) − 1500 − 600 − 300 = 2600
    expect(zeroTax.saved.monthly).toBe(2600);
  });

  it("handles high tax rates that wipe out savings", () => {
    const allTaxed = deriveComparison({
      ...DEFAULTS,
      taxRate: 100,
      housing: 0,
      living: 0,
      recreational: 0,
    });
    expect(allTaxed.saved.monthly).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────
// CountryComparer (full component)
// ──────────────────────────────────────────────────────────────

describe("CountryComparer", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    mockSearch.params = new URLSearchParams("");
    replaceStateSpy?.mockRestore();
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
  });

  it("renders the header and default country names", () => {
    render(<CountryComparer />);

    expect(
      screen.getByRole("heading", { name: "Country Comparer" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Country 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Country 2")).toBeInTheDocument();
  });

  it("renders every default input value for both countries", () => {
    render(<CountryComparer />);

    expect(byId("country1-income")).toHaveValue(DEFAULTS.income);
    // Country 2 mirrors Country 1 by default.
    expect(byId("country2-income")).toHaveValue(DEFAULTS.income);
    expect(byId("country1-taxRate")).toHaveValue(DEFAULTS.taxRate);
  });

  it("renders a comparison table with monthly and yearly columns", () => {
    render(<CountryComparer />);

    const headers = screen.getAllByRole("columnheader");
    // Row 1: Metric + Country 1 (colspan 2) + Country 2 (colspan 2) + Difference = 4
    // Row 2: Metric + Monthly + Yearly + Monthly + Yearly + C2-C1 = 6 → 10 total
    expect(headers.length).toBe(10);
    const labels = headers.map((h) => h.textContent);
    expect(labels).toContain("Monthly");
    expect(labels).toContain("Yearly");
    expect(labels).toContain("Country 1");
    expect(labels).toContain("Country 2");
    expect(labels).toContain("Difference");
  });

  it("shows correct default values in the Income row (monthly + yearly, both countries)", () => {
    render(<CountryComparer />);
    const cells = findRowCells("Income");

    // [Income, C1M, C1Y, C2M, C2Y, Diff]
    expect(cells[1]).toBe(formatCurrency(DEFAULTS.income)); // £5,000.00
    expect(cells[2]).toBe(formatCurrency(DEFAULTS.income * 12)); // £60,000
    // Country 2 is linked → identical
    expect(cells[3]).toBe(formatCurrency(DEFAULTS.income));
    expect(cells[4]).toBe(formatCurrency(DEFAULTS.income * 12));
    // Equal → dash
    expect(cells[5]).toBe("—");
  });

  it("shows the Monthly Saved row computed as income − all costs", () => {
    render(<CountryComparer />);
    const cells = findRowCells("Monthly Saved");

    // 5000 − 1500 − 1500 − 600 − 300 = 1100
    expect(cells[1]).toBe(formatCurrency(1100)); // £1,100.00
    expect(cells[2]).toBe(formatCurrency(13200)); // £13,200
  });

  it("shows the Cumulative Tax row with the rate and tax amounts", () => {
    render(<CountryComparer />);
    const cells = findRowCells("Cumulative Tax");

    // Country 1 spanned cell: "30.0%£1,500.00 / £18,000"
    expect(cells[1]).toContain("30.0%");
    expect(cells[1]).toContain(formatCurrency(1500));
    expect(cells[1]).toContain(formatCurrency(18000));
    expect(cells[2]).toContain("30.0%");
  });

  it("propagates a Country 1 income change to Country 2 (linked)", () => {
    render(<CountryComparer />);

    fireEvent.change(byId("country1-income"), {
      target: { value: "8000" },
    });

    const cells = findRowCells("Income");
    // Both countries show £8,000 / £96,000 (Country 2 still linked)
    expect(cells[1]).toBe(formatCurrency(8000));
    expect(cells[2]).toBe(formatCurrency(96000));
    expect(cells[3]).toBe(formatCurrency(8000));
    expect(cells[4]).toBe(formatCurrency(96000));
  });

  it("overrides Country 2 when Country 2 income is edited (kept separate)", () => {
    render(<CountryComparer />);

    fireEvent.change(byId("country2-income"), {
      target: { value: "9000" },
    });

    const cells = findRowCells("Income");
    expect(cells[1]).toBe(formatCurrency(DEFAULTS.income)); // £5,000.00
    expect(cells[3]).toBe(formatCurrency(9000)); // £9,000.00
  });

  it("auto-unlinks a Country 2 field when it is edited", () => {
    render(<CountryComparer />);

    // Initially the income field link button is the "unlink" action.
    expect(
      screen.getByLabelText('Unlink "Monthly Income (£)" from Country 1'),
    ).toBeInTheDocument();

    fireEvent.change(byId("country2-income"), {
      target: { value: "9000" },
    });

    // After editing, the button flips to "re-link".
    expect(
      screen.getByLabelText('Re-link "Monthly Income (£)" to Country 1'),
    ).toBeInTheDocument();
  });

  it("keeps an overridden Country 2 field separate when Country 1 changes", () => {
    render(<CountryComparer />);

    // Override Country 2 income first.
    fireEvent.change(byId("country2-income"), {
      target: { value: "9000" },
    });
    // Now change Country 1 income — Country 2 must NOT follow.
    fireEvent.change(byId("country1-income"), {
      target: { value: "8000" },
    });

    const cells = findRowCells("Income");
    expect(cells[1]).toBe(formatCurrency(8000)); // Country 1 followed
    expect(cells[3]).toBe(formatCurrency(9000)); // Country 2 stayed overridden
  });

  it("re-links a Country 2 field so it mirrors Country 1 again", () => {
    render(<CountryComparer />);

    fireEvent.change(byId("country2-income"), {
      target: { value: "9000" },
    });

    expect(findRowCells("Income")[3]).toBe(formatCurrency(9000));

    // Click the (now "re-link") button for income.
    fireEvent.click(
      screen.getByLabelText('Re-link "Monthly Income (£)" to Country 1'),
    );

    // Country 2 follows Country 1 again.
    expect(findRowCells("Income")[3]).toBe(formatCurrency(DEFAULTS.income));
    // And the button flips back to the unlink action.
    expect(
      screen.getByLabelText('Unlink "Monthly Income (£)" from Country 1'),
    ).toBeInTheDocument();
  });

  it("syncs every Country 2 field back to Country 1", () => {
    render(<CountryComparer />);

    // Override two fields.
    fireEvent.change(byId("country2-income"), {
      target: { value: "9000" },
    });
    fireEvent.change(byId("country2-housing"), {
      target: { value: "2000" },
    });

    // Two re-link buttons are now present.
    expect(screen.getAllByLabelText(/Re-link/).length).toBe(2);

    // Sync all.
    fireEvent.click(
      screen.getByRole("button", { name: "Sync Country 2 to Country 1" }),
    );

    // Country 2 income/housing follow Country 1 again.
    expect(findRowCells("Income")[3]).toBe(formatCurrency(DEFAULTS.income));
    expect(findRowCells("Housing Cost")[3]).toBe(formatCurrency(DEFAULTS.housing));

    // All five link buttons are back to the unlink action.
    expect(screen.getAllByLabelText(/Unlink/).length).toBe(5);
  });

  it("updates the URL when inputs change", () => {
    render(<CountryComparer />);

    fireEvent.change(byId("country1-income"), {
      target: { value: "8000" },
    });

    expect(replaceStateSpy).toHaveBeenCalled();
    const url = String(replaceStateSpy!.mock.calls.at(-1)?.[2]);
    expect(url).toContain("income=8000");
  });

  it("writes Country 2 overrides to the URL as <key>2 params", () => {
    render(<CountryComparer />);

    fireEvent.change(byId("country2-income"), {
      target: { value: "9000" },
    });

    const url = String(replaceStateSpy!.mock.calls.at(-1)?.[2]);
    expect(url).toContain("income2=9000");
  });

  it("reflects country names in the URL", () => {
    render(<CountryComparer />);

    fireEvent.change(byId("c2Name"), {
      target: { value: "Germany" },
    });

    const url = String(replaceStateSpy!.mock.calls.at(-1)?.[2]);
    expect(url).toContain("c2Name=Germany");
  });

  it("restores a shared configuration from URL params on mount", () => {
    mockSearch.params = new URLSearchParams(
      "c1Name=United+Kingdom&c2Name=Spain&income=8000&taxRate=32&" +
        "income2=9000&housing2=1800",
    );
    render(<CountryComparer />);

    expect(screen.getByDisplayValue("United Kingdom")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Spain")).toBeInTheDocument();

    expect(byId("country1-income")).toHaveValue(8000);
    // Country 2 income overridden → 9000
    expect(byId("country2-income")).toHaveValue(9000);
    // Country 2 housing overridden → 1800
    expect(byId("country2-housing")).toHaveValue(1800);
    // Country 2 living NOT overridden → mirrors Country 1 (default 600)
    expect(byId("country2-living")).toHaveValue(600);

    const cells = findRowCells("Income");
    expect(cells[3]).toBe(formatCurrency(9000));
  });

  it("highlights the country with the higher monthly savings", () => {
    render(<CountryComparer />);

    // Default: identical → equal savings.
    expect(
      screen.getByText(/Both countries yield the same monthly savings/),
    ).toBeInTheDocument();

    // Make Country 2 save more by raising its income.
    fireEvent.change(byId("country2-income"), {
      target: { value: "9000" },
    });

    expect(screen.getByText(/you'd save/, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/more per month in/)).toHaveTextContent(
      /Country 2/,
    );
  });
});
