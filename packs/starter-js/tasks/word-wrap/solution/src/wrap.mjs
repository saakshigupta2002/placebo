/**
 * Word-wrap text so no line is longer than `width`.
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
export function wrap(text, width) {
  if (!Number.isInteger(width) || width <= 0)
    throw new RangeError("width must be a positive integer");
  return text
    .split("\n")
    .map((paragraph) => {
      const lines = [];
      let line = "";
      for (let word of paragraph.split(/ +/).filter(Boolean)) {
        if (word.length > width) {
          if (line) lines.push(line);
          while (word.length > width) {
            lines.push(word.slice(0, width));
            word = word.slice(width);
          }
          line = word;
        } else if (!line) {
          line = word;
        } else if (line.length + 1 + word.length <= width) {
          line += ` ${word}`;
        } else {
          lines.push(line);
          line = word;
        }
      }
      if (line) lines.push(line);
      return lines.join("\n");
    })
    .join("\n");
}
