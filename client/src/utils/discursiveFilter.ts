export const FUNCTION_WORDS = new Set([
  "the","a","an","and","or","but","if","then","else","nor","yet",
  "i","you","he","she","it","we","they","who","whom","what","which","that",
  "me","him","her","us","them",
  "my","your","his","hers","its","our","ours","theirs",
  "this","that","these","those",
  "is","was","are","were","be","been","being","am",
  "do","does","did","doing",
  "have","has","had","having",
  "shall","will","would","should","may","might","must","can","could",
  "to","of","in","on","at","by","for","from","with","about","into","onto","out","over","under","between","among","through","during",
  "so","as","such","not","no","nor","neither","both","very","too","more","less","most","least",
  "all","each","every","any","some","few","many","much","one","two","three",
  "sir","madam","well","nay","yea","ay",
  "enter","exit","exeunt","aside","within","stage","scene","act",
  "tis","thi","ll","d",
  "good"
]);

export function isContentWord(token: string): boolean {
  return !FUNCTION_WORDS.has(token.toLowerCase());
}

export function filterContentWords(words: string[]): string[] {
  return words.filter(isContentWord);
}
