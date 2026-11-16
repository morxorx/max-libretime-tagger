const CURLY_SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B\u2032]/g;
const CURLY_DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u2033]/g;

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeShowName(raw: string): string {
  return collapseWhitespace(raw)
    .replace(CURLY_SINGLE_QUOTES, "'")
    .replace(CURLY_DOUBLE_QUOTES, '"');
}

export function showKey(name: string): string {
  return normalizeShowName(name).normalize("NFKC").toLocaleLowerCase();
}
