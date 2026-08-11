export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const absValue = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: absValue >= 10000 ? 0 : 2,
    maximumFractionDigits: absValue >= 10000 ? 0 : 2,
  }).format(absValue);
  return amount < 0 ? `-${formatted}` : formatted;
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  // Pin to UTC so server (Node) and browser render identical strings.
  // Without this, a transaction timestamp near midnight UTC can land on a
  // different *day* in a non-UTC browser, causing an SSR/client hydration
  // mismatch (e.g. "5 Aug 2026" vs "6 Aug 2026").
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function toDateInputValue(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().slice(0, 10);
}

/** Recharts Y-axis tick formatter: render a currency value. */
export const currencyTick = (value: number | string): string =>
  formatCurrency(Number(value));

/** Recharts X-axis tick formatter: render a rounded integer (e.g. a year). */
export const yearTick = (value: number | string): string =>
  String(Math.round(Number(value)));

