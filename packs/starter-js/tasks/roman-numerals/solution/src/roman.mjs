const TABLE = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
const CANONICAL = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/** Convert an integer from 1 to 3999 to a Roman numeral. */
export function toRoman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999)
    throw new RangeError("toRoman expects an integer from 1 to 3999");
  let out = "";
  for (const [value, symbol] of TABLE) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
}

/** Convert a canonical Roman numeral to an integer. */
export function fromRoman(s) {
  const text = String(s).toUpperCase();
  if (!text || !CANONICAL.test(text)) throw new SyntaxError(`not a Roman numeral: ${s}`);
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const v = VALUES[text[i]];
    const next = VALUES[text[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}
