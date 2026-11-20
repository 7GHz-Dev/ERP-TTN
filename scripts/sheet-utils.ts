/** อ่านค่าจากไฟล์ .xlsx (ใช้ร่วมกันระหว่างสคริปต์นำเข้า) */
import ExcelJS from "exceljs";

export type Cell = string | number | boolean | Date | null;
export type Rec = Record<string, Cell>;

export const clean = (s: unknown) =>
  s === null || s === undefined ? "" : String(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
export const str = (v: Cell) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  const s = clean(v);
  return s === "" || s === "-" ? null : s;
};
export const num = (v: Cell) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
export const date = (v: Cell) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
};
export const bool = (v: Cell) => v === true || v === "TRUE";

export function cellValue(c: ExcelJS.Cell): Cell {
  const v = c.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("error" in o) return null;
    if ("result" in o) return (o.result as Cell) ?? null;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text);
    return null;
  }
  return v as Cell;
}

export function readSheet(wb: ExcelJS.Workbook, name: string, headerRow: number): Rec[] {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`ไม่พบชีต "${name}"`);
  const headers: string[] = [];
  ws.getRow(headerRow).eachCell({ includeEmpty: true }, (c, col) => (headers[col] = clean(cellValue(c))));
  const out: Rec[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rec: Rec = {};
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const v = cellValue(row.getCell(col));
      rec[h] = v;
      if (v !== null && v !== "") any = true;
    });
    if (any) out.push(rec);
  }
  return out;
}
