export type CurrencyDetection =
  | { kind: "none" }
  | { kind: "code"; code: string }
  | { kind: "ambiguous"; marker: string };

// Israeli issuers print a bare "$" for US dollars and spell other dollars out
// by code, so a bare "$" resolves to USD while "C$" or "R$" stays ambiguous,
// as do "¥" and "kr", each of which names several currencies.
const MARKERS: { pattern: RegExp; code: string | null }[] = [
  { pattern: /(?<![A-Z])(?!US\$)[A-Z]{1,2}\$/u, code: null },
  { pattern: /US\$|\$/u, code: "USD" },
  { pattern: /₪|ש["״']?ח|\bNIS\b/iu, code: "ILS" },
  { pattern: /€|אירו|יורו/u, code: "EUR" },
  { pattern: /£|ליש["״']?ט/u, code: "GBP" },
  { pattern: /דולר/u, code: "USD" },
  { pattern: /¥|\bkr\b/iu, code: null },
];

const ISO_CODE = /\b[A-Z]{3}\b/g;
const KNOWN_ISO_CODES = new Set(Intl.supportedValuesOf("currency"));
const ANY_CURRENCY_SYMBOL = /\p{Sc}/u;

/** Text naming two different currencies, or a symbol shared by several, is ambiguous. */
export function detectCurrency(text: string): CurrencyDetection {
  const codes = new Set<string>();
  let ambiguousMarker: string | null = null;

  for (const isoCode of text.match(ISO_CODE) ?? []) {
    if (KNOWN_ISO_CODES.has(isoCode)) {
      codes.add(isoCode);
    }
  }

  const textWithoutCodes = text.replace(ISO_CODE, "");
  for (const { pattern, code } of MARKERS) {
    const match = textWithoutCodes.match(pattern);
    if (!match) {
      continue;
    }
    if (code === null) {
      ambiguousMarker = match[0];
    } else {
      codes.add(code);
    }
  }

  const nothingRecognised = codes.size === 0 && ambiguousMarker === null;
  const unknownSymbol = nothingRecognised
    ? textWithoutCodes.match(ANY_CURRENCY_SYMBOL)?.[0]
    : undefined;
  if (unknownSymbol) {
    ambiguousMarker = unknownSymbol;
  }

  if (ambiguousMarker !== null || codes.size > 1) {
    return {
      kind: "ambiguous",
      marker: ambiguousMarker ?? [...codes].join("/"),
    };
  }
  const [code] = codes;
  return code === undefined ? { kind: "none" } : { kind: "code", code };
}
