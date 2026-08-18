/** Formats a number as a currency string using the given locale. */
export function formatCurrency(
  value: number,
  { currency = "USD", locale = "en-US" }: { currency?: string; locale?: string } = {},
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}
