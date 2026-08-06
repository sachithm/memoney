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
