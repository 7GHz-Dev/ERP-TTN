// วันที่ทั้งหมดในระบบเป็นสตริง ISO "YYYY-MM-DD" (ไม่มีเวลา) และอิงเวลาไทย

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_WEEKDAYS_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export function todayBangkok(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function isISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function addDays(iso: string, n: number): string {
  const dt = toUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

/** a - b เป็นจำนวนวัน */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86_400_000);
}

export function weekday(iso: string): number {
  return toUTC(iso).getUTCDay();
}

/** "18 พ.ย. 69" */
export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${String(y + 543).slice(-2)}`;
}

/** "พ. 18 พ.ย." */
export function formatThaiDayShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${TH_WEEKDAYS[weekday(iso)]} ${d} ${TH_MONTHS[m - 1]}`;
}

/** "วันพุธที่ 18 พฤศจิกายน 2569" */
export function formatThaiDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `วัน${TH_WEEKDAYS_FULL[weekday(iso)]}ที่ ${d} ${TH_MONTHS_FULL[m - 1]} ${y + 543}`;
}

export function weekdayShort(iso: string): string {
  return TH_WEEKDAYS[weekday(iso)];
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}
