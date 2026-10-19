const SYMBOLS = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

/**
 * Format integer cents as money, e.g. 123456 -> "$1,234.56".
 * @param {number} cents
 * @param {string} currency
 */
export function formatMoney(cents, currency = "USD") {
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const amount = (cents / 100).toFixed(2);
  return symbol + amount;
}
