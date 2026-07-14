export const LEXICAL_FUNCTION_WORDS = new Set([
  "a", "an", "the",
  "this", "that", "these", "those",
  "i", "me", "my", "mine",
  "you", "your", "yours",
  "he", "him", "his",
  "she", "her", "hers",
  "we", "us", "our", "ours",
  "they", "them", "their", "theirs",
  "it", "its",
  "who", "whom", "whose", "which", "what",
  "of", "to", "in", "on", "at", "by", "for", "from",
  "with", "into", "unto", "upon", "about", "above", "below",
  "under", "over", "between", "through", "against", "within",
  "without", "after", "before", "during", "along", "across",
  "as", "than", "then", "if", "but", "or", "nor", "yet", "so",
  "and", "not", "no", "nor",
  "am", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "will", "would", "shall", "should",
  "may", "might", "can", "could", "must",
  "thou", "thee", "thy", "thine", "ye",
  "hath", "doth", "dost", "art", "hast",
  "wert", "wast", "shalt", "shouldst", "wouldst", "wilt",
  "tis", "'tis", "twas", "'twas",
  "ere", "ne'er", "e'er", "o'er",
  "more", "most", "very", "much", "many", "such",
  "here", "there", "where", "when", "how", "why",
  "up", "down", "out", "off", "away", "back",
  "now", "then", "again", "still", "well", "too", "also",
  "all", "both", "each", "every", "any", "some", "no",
  "one", "two", "three", "four", "five",
  "first", "last", "next", "own",
  "him", "hath", "come", "go", "make", "take", "know", "see",
]);

export function isLexicalContentWord(token: string): boolean {
  return !LEXICAL_FUNCTION_WORDS.has(token.toLowerCase());
}

const CONTRACTION_FRAGMENTS = new Set(["ll", "ve", "re", "d", "m"]);

const EARLY_MODERN_FRAGMENTS = new Set(["ne", "er", "ta", "en"]);

const LEMMA_CORRECTIONS: Record<string, string> = {
  "thi": "this",
  "whi": "which",
  "the": "the",
};

/**
 * Lexical-only cleanup pass applied after processTokens().
 * Removes confirmed contraction fragments and malformed lightweight-lemma
 * artefacts. Returns null to signal that the token should be dropped.
 *
 * @param token      The token after processTokens() / lightLemmatize().
 * @param contentMode  True when "Content Words Only" view is active.
 *                     Early Modern split-form artefacts are only removed
 *                     in content mode (they are rare but could legitimately
 *                     appear as abbreviations in All Words mode).
 */
export function cleanLexicalToken(token: string, contentMode: boolean): string | null {
  const lower = token.toLowerCase();

  const corrected = LEMMA_CORRECTIONS[lower] ?? lower;

  if (CONTRACTION_FRAGMENTS.has(corrected)) return null;

  if (contentMode && EARLY_MODERN_FRAGMENTS.has(corrected)) return null;

  return corrected;
}
