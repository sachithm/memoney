import { describe, it, expect } from "vitest";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/utils";

describe("formatCurrency", () => {
  it("formats large amounts without decimals", () => {
    expect(formatCurrency(10000)).toBe("£10,000");
  });

  it("formats small amounts with 2 decimals", () => {
    expect(formatCurrency(99.99)).toBe("£99.99");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("£0.00");
  });

  it("handles negative amounts", () => {
    // -500 → abs 500 < 10000 → 2 decimal places
    expect(formatCurrency(-500)).toBe("-£500.00");
  });

  it("formats null as em dash", () => {
    expect(formatCurrency(null)).toBe("—");
  });

  it("formats undefined as em dash", () => {
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("handles large numbers with commas", () => {
    expect(formatCurrency(1234567)).toBe("£1,234,567");
  });

  it("handles small positive numbers with decimals", () => {
    expect(formatCurrency(5.5)).toBe("£5.50");
  });

  it("handles negative small amounts", () => {
    expect(formatCurrency(-5.5)).toBe("-£5.50");
  });
});

describe("formatDate", () => {
  it("formats ISO string to GB date", () => {
    const result = formatDate("2024-03-15T00:00:00.000Z");
    expect(result).toMatch(/15 Mar 2024/);
  });

  it("formats Date object", () => {
    const result = formatDate(new Date(2024, 0, 15));
    expect(result).toMatch(/15 Jan 2024/);
  });

  it("returns valid date string", () => {
    const result = formatDate("2023-06-01T00:00:00.000Z");
    expect(result).toMatch(/\d{1,2} [A-Z][a-z]{2} \d{4}/);
  });
});

describe("toDateInputValue", () => {
  it("converts ISO string to YYYY-MM-DD", () => {
    expect(toDateInputValue("2024-03-15T10:30:00.000Z")).toBe("2024-03-15");
  });

  it("converts Date object to YYYY-MM-DD", () => {
    // Use UTC to avoid timezone issues — toDateInputValue calls toISOString()
    expect(toDateInputValue(new Date(Date.UTC(2024, 5, 20)))).toBe("2024-06-20");
  });

  it("returns a 10-character string", () => {
    const result = toDateInputValue("2024-01-01T00:00:00.000Z");
    expect(result.length).toBe(10);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
