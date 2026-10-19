/**
 * Turn a title into a URL slug.
 * @param {string} title
 * @returns {string}
 */
export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "-");
}
