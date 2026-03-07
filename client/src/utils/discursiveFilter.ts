export const FUNCTION_WORDS = new Set([
  "the","a","an","and","or","but","if","then","else",
  "i","you","he","she","it","we","they",
  "me","him","her","us","them",
  "my","your","his","their","our","its",
  "this","that","these","those",
  "is","was","are","were","be","been","being",
  "do","does","did","have","has","had",
  "shall","will","would","should","may","might","must",
  "to","of","in","on","at","by","for","from","with","about"
]);

export function isContentWord(token: string): boolean {
  return !FUNCTION_WORDS.has(token.toLowerCase());
}

export function filterContentWords(words: string[]): string[] {
  return words.filter(isContentWord);
}
