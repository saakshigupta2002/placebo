const SYMBOLS = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP"]);

/**
 * Format integer minor units as money, e.g. 123456 -> "$1,234.56".
 * @param {number} cents
 * @param {string} currency
 */
export function formatMoney(cents, currency = "USD") {
  if (!Number.isInteger(cents)) throw new TypeError("cents must be an integer");
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const abs = Math.abs(cents);
  const whole = decimals ? Math.floor(abs / 100) : abs;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = decimals ? `.${String(abs % 100).padStart(2, "0")}` : "";
  return `${cents < 0 ? "-" : ""}${symbol}${grouped}${fraction}`;
}
