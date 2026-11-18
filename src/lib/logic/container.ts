// เลขตู้คอนเทนเนอร์ตามมาตรฐาน ISO 6346: 4 ตัวอักษร + 6 ตัวเลข + check digit 1 หลัก

export const CONTAINER_RE = /\b([A-Z]{4})\s?(\d{6})\s?-?\s?(\d)\b/gi;

export function normalizeContainerNo(s: string): string {
  return s.toUpperCase().replace(/[\s\-_.]/g, "");
}

function letterValue(ch: string): number {
  // A=10 แล้วข้ามค่าที่เป็นพหุคูณของ 11 (11, 22, 33)
  let v = 10;
  for (let c = 65; c < ch.charCodeAt(0); c++) {
    v++;
    if (v % 11 === 0) v++;
  }
  return v;
}

/** รับ 10 ตัวแรก (เช่น "CSQU305438") คืน check digit */
export function containerCheckDigit(first10: string): number {
  const s = first10.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = s[i];
    const v = /[A-Z]/.test(ch) ? letterValue(ch) : Number(ch);
    sum += v * 2 ** i;
  }
  return (sum % 11) % 10;
}

export function isContainerShape(s: string): boolean {
  return /^[A-Z]{4}\d{7}$/.test(s);
}

export function isValidContainerNo(raw: string): boolean {
  const s = normalizeContainerNo(raw);
  if (!isContainerShape(s)) return false;
  return containerCheckDigit(s.slice(0, 10)) === Number(s[10]);
}
