const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

export function extractEmail(value: string): string | undefined {
  const match = value.match(EMAIL_RE);
  return match ? match[0].toLowerCase() : undefined;
}
