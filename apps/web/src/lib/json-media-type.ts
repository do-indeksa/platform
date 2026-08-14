const TOKEN_CHARACTER = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]$/;

// Strict RFC 9110 media-type grammar for the one request type these routes accept.
export function isJsonMediaType(value: string | null): boolean {
  if (value === null) return false;

  let index = skipOptionalWhitespace(value, 0);
  const typeStart = index;
  index = consumeToken(value, index);
  if (index === typeStart || value[index] !== "/") return false;
  const type = value.slice(typeStart, index).toLowerCase();

  index += 1;
  const subtypeStart = index;
  index = consumeToken(value, index);
  if (index === subtypeStart) return false;
  const subtype = value.slice(subtypeStart, index).toLowerCase();
  if (type !== "application" || subtype !== "json") return false;

  index = skipOptionalWhitespace(value, index);
  while (index < value.length) {
    if (value[index] !== ";") return false;

    index = skipOptionalWhitespace(value, index + 1);
    const parameterStart = index;
    index = consumeToken(value, index);
    if (index === parameterStart) return false;

    index = skipOptionalWhitespace(value, index);
    if (value[index] !== "=") return false;

    index = skipOptionalWhitespace(value, index + 1);
    if (value[index] === '"') {
      index = consumeQuotedString(value, index + 1);
      if (index === -1) return false;
    } else {
      const parameterValueStart = index;
      index = consumeToken(value, index);
      if (index === parameterValueStart) return false;
    }

    index = skipOptionalWhitespace(value, index);
  }

  return true;
}

function consumeToken(value: string, start: number): number {
  let index = start;
  while (index < value.length && TOKEN_CHARACTER.test(value[index] ?? "")) {
    index += 1;
  }
  return index;
}

function consumeQuotedString(value: string, start: number): number {
  let index = start;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code === 0x22) return index + 1;
    if (code === 0x5c) {
      index += 1;
      if (index >= value.length || !isQuotedPair(value.charCodeAt(index))) {
        return -1;
      }
    } else if (!isQuotedText(code)) {
      return -1;
    }
    index += 1;
  }
  return -1;
}

function skipOptionalWhitespace(value: string, start: number): number {
  let index = start;
  while (value[index] === " " || value[index] === "\t") index += 1;
  return index;
}

function isQuotedText(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x20 ||
    code === 0x21 ||
    (code >= 0x23 && code <= 0x5b) ||
    (code >= 0x5d && code <= 0x7e) ||
    (code >= 0x80 && code <= 0xff)
  );
}

function isQuotedPair(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x20 ||
    (code >= 0x21 && code <= 0x7e) ||
    (code >= 0x80 && code <= 0xff)
  );
}
