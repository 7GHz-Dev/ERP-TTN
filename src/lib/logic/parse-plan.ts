import { CONTAINER_RE, isValidContainerNo, normalizeContainerNo } from "./container";

export type ParseWarning = "check-digit" | "duplicate";

export interface ParsedRow {
  container_no: string;
  bl_no: string | null;
  weight_kg: number | null;
  port: string | null;
  warnings: ParseWarning[];
  line: number;
}

const BL_HEADER_RE = /^\s*(?:B\s*\/?\s*L|บีแอล)(?:\s*no\.?)?\s*[:：]\s*([A-Z0-9][A-Z0-9\-()/]*)/i;
const BL_INLINE_RE = /(?:B\s*\/?\s*L(?:\s*no\.?)?)\s*[:：]\s*([A-Z0-9][A-Z0-9\-()/]*)/i;
const PORT_FALLBACK_RE =/^[A-D]\d(?:[A-D]\d)?$/i;
const TON_WORD_RE = /^(ตัน|t|ton|tons)$/i;
const KG_WORD_RE = /^(kg|kgs|กก\.?|กิโล)$/i;

function parseNumber(tok: string): number | null {
  const cleaned = tok.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * แปลงข้อความที่วางมาจาก Excel / LINE เป็นรายการตู้
 * - รองรับคอลัมน์สลับลำดับ (เลขตู้ / BL / น้ำหนัก / ท่า)
 * - บรรทัด "BL: xxxx" จะใช้เป็น BL ของตู้ในบรรทัดถัด ๆ ไป
 * - น้ำหนัก: ตัวเลข < 100 หรือมีคำว่า "ตัน" ถือเป็นตัน, นอกนั้นเป็นกิโลกรัม
 */
export function parsePlanText(text: string, opts: { ports: string[] }): ParsedRow[] {
  const portSet = new Map(opts.ports.map((p) => [p.toUpperCase(), p]));
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  let currentBL: string | null = null;

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((rawLine, idx) => {
    const line = rawLine.replace(/ /g, " ");
    if (!line.trim()) return;

    const containers: string[] = [];
    const rest = line.replace(CONTAINER_RE, (m) => {
      containers.push(normalizeContainerNo(m));
      return " ";
    });

    if (containers.length === 0) {
      const bl = line.match(BL_HEADER_RE);
      if (bl) currentBL = bl[1].toUpperCase();
      return;
    }

    let bl: string | null = null;
    let weight: number | null = null;
    let port: string | null = null;
    let work = rest;

    // "BL: xxxx" ในบรรทัดเดียวกับเลขตู้
    const blInline = work.match(BL_INLINE_RE);
    if (blInline) {
      bl = blInline[1].toUpperCase();
      work = work.replace(BL_INLINE_RE, " ");
    }

    // ตัวเลขมี , คั่นหลักพัน (13,930) ต้องดึงออกก่อนแยกคำด้วย ","
    work = work.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, (m) => {
      if (weight === null) weight = Number(m.replace(/,/g, ""));
      return " ";
    });

    const toks = work
      .split(/[\t,;|]+|\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i];
      const next = toks[i + 1] ?? "";
      const up = tok.toUpperCase();

      if (!port && (portSet.has(up) || PORT_FALLBACK_RE.test(tok))) {
        port = portSet.get(up) ?? up;
        continue;
      }
      const num = parseNumber(tok);
      if (num !== null) {
        if (weight === null) {
          if (TON_WORD_RE.test(next)) weight = num * 1000;
          else if (KG_WORD_RE.test(next)) weight = num;
          else weight = num < 100 ? num * 1000 : num;
        }
        continue;
      }
      const tonInline = tok.match(/^(\d+(?:\.\d+)?)(ตัน|t)$/i);
      if (tonInline && weight === null) {
        weight = Number(tonInline[1]) * 1000;
        continue;
      }
      if (!bl && /^[A-Z0-9][A-Z0-9\-()/]{5,}$/i.test(tok) && /\d/.test(tok)) {
        bl = up;
      }
    }

    for (const c of containers) {
      const warnings: ParseWarning[] = [];
      if (!isValidContainerNo(c)) warnings.push("check-digit");
      if (seen.has(c)) warnings.push("duplicate");
      seen.add(c);
      rows.push({
        container_no: c,
        bl_no: bl ?? currentBL,
        weight_kg: weight !== null ? Math.round(weight * 100) / 100 : null,
        port,
        warnings,
        line: idx + 1,
      });
    }
  });

  return rows;
}
