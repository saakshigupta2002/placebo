/**
 * Parse CSV text into rows of string fields.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCSV(text) {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split(","));
}
