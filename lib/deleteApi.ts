/**
 * deleteApi.ts — ลบรายการออกจาก Express DBF
 * วางไว้ที่: E:\jw-rpa-app\lib\deleteApi.ts
 */

const getAgentUrl = () => "http://localhost:9999";

// ─── Types ────────────────────────────────────────────────────

export interface DeletePreviewRow {
  docNo:   string;
  doctype: string;   // IN, JV, PV, RV, SV, UV, BW
  desc:    string;
}

export interface DeleteValidateRow {
  docnum:  string;
  cuscod:  string;
  cusname: string;
  netamt:  number;
  docstat: string;
  status:  "ok" | "warn" | "error";
  message: string;
}

export interface DeleteResult {
  deleted: number;
  errors:  number;
  details: { docNo: string; status: string }[];
}

// ─── Excel Parser ─────────────────────────────────────────────

/**
 * อ่าน Excel แบบฟอร์มลบเอกสาร
 * รองรับคอลัมน์: เลขที่เอกสาร, ประเภท, หมายเหตุ
 */
export async function parseDeleteExcel(file: File): Promise<DeletePreviewRow[]> {
  const XLSX = await import("xlsx");
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: "array", raw: true, cellDates: false });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];

  // หา header row
  let headerIdx = 0;
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (row.some(c => String(c).includes("เลขที่เอกสาร") || String(c).includes("เลขที่"))) {
      headerIdx = i;
      break;
    }
  }

  const COL_MAP: Record<string, string> = {
    "เลขที่เอกสาร": "docno",
    "เลขที่":       "docno",
    "ประเภท":       "type",
    "หมายเหตุ":     "desc",
    "ลำดับ":        "no",
  };

  const headers = allRows[headerIdx].map(h => String(h).trim());
  const dataRows = allRows.slice(headerIdx + 1);

  return dataRows.map(row => {
    const out: Record<string, string> = {};
    headers.forEach((h, i) => {
      const key = COL_MAP[h] ?? h;
      out[key] = String(row[i] ?? "").trim();
    });
    const docno = out["docno"] ?? "";
    if (!docno || docno === "nan") return null;
    const doctype = (out["type"] || docno.substring(0, 2)).toUpperCase();
    return { docNo: docno, doctype, desc: out["desc"] ?? "" };
  }).filter(Boolean) as DeletePreviewRow[];
}

// ─── Agent API ────────────────────────────────────────────────

/**
 * ตรวจสอบรายการก่อนลบ — เช็ค DBF จริง
 */
export async function validateDelete(
  doctype: string,
  docnums: string[]
): Promise<DeleteValidateRow[]> {
  const url = getAgentUrl();
  const res = await fetch(`${url}/delete/validate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ doctype, docnums }),
  });
  if (!res.ok) throw new Error(`validateDelete failed: ${res.statusText}`);
  const data = await res.json();
  return data.results ?? [];
}

/**
 * ลบรายการออกจาก DBF
 */
export async function executeDelete(
  doctype: string,
  docnums: string[]
): Promise<DeleteResult> {
  const url = getAgentUrl();
  const res = await fetch(`${url}/delete`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ doctype, docnums }),
  });
  if (!res.ok) throw new Error(`executeDelete failed: ${res.statusText}`);
  const raw = await res.json();
  return {
    deleted: raw.success ?? 0,
    errors:  raw.error   ?? 0,
    details: (raw.details ?? []).map((d: { docnum: string; status: string }) => ({
      docNo:  d.docnum,
      status: d.status,
    })),
  };
}
