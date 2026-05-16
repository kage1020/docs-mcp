function isCjk(cp: number): boolean {
  return (
    (cp >= 0x3000 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x2ffff)
  );
}

export function tokenCount(s: string): number {
  if (typeof s !== "string" || s.length === 0) return 0;
  const byteCount = Buffer.byteLength(s, "utf8");
  let cjk = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isCjk(cp)) cjk++;
  }
  return Math.ceil(Math.max(byteCount / 4, cjk));
}
