/**
 * Lightweight linguistics utilities for corpus analysis
 */

export function normaliseText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, " ") // replace punctuation with spaces, keep apostrophes
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normaliseText(text).split(" ").filter(t => t.length > 0);
}

export function normaliseHistoricalSpelling(token: string): string {
  const lower = token.toLowerCase();
  if (lower === "haue") return "have";
  if (lower === "loue") return "love";
  return token;
}

export function getStoplist(): Set<string> {
  return new Set([
    "and", "the", "to", "of", "i", "a", "it", "is", "in", "that", "you", "not", "for", "with", "be", "me", "thou", "thee", "thy", "thine", "hath", "doth", "shall", "art", "hast", "come", "do", "go", "st", "re"
  ]);
}

/**
 * Formats a time value (year or decade) to remove trailing .0
 * Handles numbers, strings, and null/undefined safely.
 */
export function formatTimeValue(value: unknown): string {
  if (value === null || value === undefined) return "Unknown";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  // If it's an integer or ends in .0, return as integer string
  if (num % 1 === 0) return Math.floor(num).toString();
  // Otherwise keep decimal (e.g. midpoint years)
  return num.toString();
}

export function lightLemmatize(token: string): string {
  if (token.length <= 3) return token;

  let lemma = token;
  
  // plural: ies -> y
  if (lemma.endsWith("ies")) return lemma.slice(0, -3) + "y";
  
  // plural: s -> '' for length > 3
  if (
    lemma.endsWith("s") &&
    !lemma.endsWith("ss") &&
    !lemma.endsWith("us") &&
    lemma !== "this" &&
    lemma !== "tis" &&
    lemma !== "'tis" &&
    lemma !== "twas" &&
    lemma !== "'twas"
  ) {
    lemma = lemma.slice(0, -1);
  }

  // ing -> '' for length > 5
  if (lemma.length > 5 && lemma.endsWith("ing")) {
    return lemma.slice(0, -3);
  }

  // ed -> '' for length > 4
  if (lemma.length > 4 && lemma.endsWith("ed")) {
    return lemma.slice(0, -2);
  }

  return lemma;
}

export function processTokens(text: string, opts: { useStoplist: boolean; useLemmas: boolean }): string[] {
  const tokens = tokenize(text).map(normaliseHistoricalSpelling);
  const stoplist = getStoplist();
  
  return tokens
    .filter(t => t.length >= 2)
    .filter(t => isNaN(Number(t))) // filter purely numeric
    .filter(t => !opts.useStoplist || !stoplist.has(t))
    .map(t => opts.useLemmas ? lightLemmatize(t) : t);
}
