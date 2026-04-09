/**
 * arApi.ts — AR (IN/RE) API functions สำหรับ JW RPA Agent
 * วางไว้ที่: C:\Users\Asus\jw-accounting-app\lib\arApi.ts
 */

const getAgentUrl = () => {
  try {
    const s = localStorage.getItem("jw-rpa-settings");
    if (s) return JSON.parse(s)?.state?.agentUrl ?? "http://localhost:9999";
  } catch {}
  return "http://localhost:9999";
};

// ─── Types ────────────────────────────────────────────────────

export interface InItem {
  stkcod:  string;
  stkdes:  string;
  loccod:  string;
  trnqty:  number;
  tqucod:  string;
  unitpr:  number;
  discamt: number;
  trnval:  number;
}

export interface InvoiceRow {
  docnum:   string;
  docdat:   string;       // DD/MM/YY (พ.ศ. 2 หลัก)
  cuscod:   string;
  custname: string;       // ชื่อลูกค้า
  youref:   string;
  flgvat:   "1" | "2";
  paytrm:   number;
  items:    InItem[];
}

export interface ReItem {
  docnum:  string;       // IN ที่จับคู่
  rcvamt:  number;
  vatamt:  number;
}

export interface ReceiptRow {
  rcpnum:   string;
  rcpdat:   string;       // DD/MM/YY (พ.ศ. 2 หลัก)
  cuscod:   string;
  paytyp:   "T" | "C" | "E";
  bnkcod:   string;
  chqnum:   string;
  chqdat:   string;       // วันที่เช็ก DD/MM/YY
  whtrat:   number;
  whtamt:   number;
  fee:      number;       // ค่าธรรมเนียมธนาคาร
  otherexp: number;       // ค่าใช้จ่ายอื่น
  transfer: number;       // เงินโอนเข้าบัญชีจริง
  suspend:  number;       // บัญชีพัก
  custname: string;       // ชื่อลูกค้า
  remark:   string;
  items:    ReItem[];
}

export interface OpenInvoice {
  docnum:  string;
  docdat:  string;
  cuscod:  string;
  netamt:  number;
  rcvamt:  number;
  remamt:  number;
}

export interface ArImportResult {
  success: number;
  skipped: number;
  error:   number;
  details: { docnum?: string; rcpnum?: string; status: string; msg?: string; netamt?: number }[];
}

// ─── Functions ────────────────────────────────────────────────

/** นำเข้าใบแจ้งหนี้ขาย (IN) */
export async function importIN(invoices: InvoiceRow[]): Promise<ArImportResult> {
  const url = getAgentUrl();
  const res = await fetch(`${url}/import/in`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ invoices }),
  });
  if (!res.ok) throw new Error(`importIN failed: ${res.statusText}`);
  return res.json();
}

export interface GlAccount {
  acctno: string;
  acctnam: string;
}

export interface ReGlAccts {
  whtAcct?:   string;
  feeAcct?:   string;
  otherAcct?: string;
}

/** ดึงผังบัญชีจาก Express (GLACC.DBF) */
export async function getGlAccounts(): Promise<GlAccount[]> {
  const url = getAgentUrl();
  const res = await fetch(`${url}/glacc`);
  if (!res.ok) throw new Error(`getGlAccounts failed: ${res.statusText}`);
  return res.json();
}

/** นำเข้ารับชำระหนี้ (RE) */
export async function importRE(
  receipts: ReceiptRow[],
  glAccts?: ReGlAccts
): Promise<ArImportResult> {
  const url = getAgentUrl();
  const res = await fetch(`${url}/import/re`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ receipts, gl_accts: glAccts ?? {} }),
  });
  if (!res.ok) throw new Error(`importRE failed: ${res.statusText}`);
  return res.json();
}

/** ดึงรายการ IN ที่ยังค้างชำระ */
export async function getOpenInvoices(cuscod?: string): Promise<OpenInvoice[]> {
  const url = getAgentUrl();
  const params = cuscod ? `?cuscod=${encodeURIComponent(cuscod)}` : "";
  const res = await fetch(`${url}/ar/open${params}`);
  if (!res.ok) throw new Error(`getOpenInvoices failed: ${res.statusText}`);
  const data = await res.json();
  return data.invoices ?? [];
}

/** อ่าน Excel template IN แล้ว parse เป็น InvoiceRow[]
 *  รองรับ format ใหม่: sheet เดียว "Items"
 *  cols: A=วันที่ B=DOCNUM C=SEQNUM D=CUSCOD E=ชื่อลูกค้า F=STKCOD G=STKDES H=TRNQTY I=TQUCOD J=UNITPR K=TRNVAL L=FLGVAT
 *  DOCNUM/CUSCOD/วันที่ fill-down สำหรับ sub-rows
 */
export async function parseINExcel(file: File): Promise<InvoiceRow[]> {
  const XLSX = await import("xlsx");
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: "array", raw: true });
  const ws   = wb.Sheets["Items"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("ไม่พบชีท Items");

  // อ่าน raw rows: row1=field names, row2=Thai desc, row3+=data
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as (string | number | null)[][];
  if (rawRows.length < 3) return [];

  // หา column index จาก row1 (field names)
  const colNames = rawRows[0] as (string | null)[];
  const ci = (name: string) => colNames.findIndex(c => String(c ?? "") === name);
  const iDocnum = ci("DOCNUM");  // B=1
  const iCuscod = ci("CUSCOD");  // D=3
  const iStkcod = ci("STKCOD");  // F=5
  const iStkdes = ci("STKDES");  // G=6
  const iTrnqty = ci("TRNQTY");  // H=7
  const iTqucod = ci("TQUCOD");  // I=8
  const iUnitpr = ci("UNITPR");  // J=9
  const iTrnval = ci("TRNVAL");  // K=10
  const iFlgvat   = ci("FLGVAT");  // L=11
  const iCustname = 4;              // E: ชื่อลูกค้า
  // วันที่ อยู่ col A=0 (ไม่มี field name ภาษาอังกฤษ)
  const iDocdat = 0;

  let lastDocnum = "";
  let lastCuscod = "";
  let lastDocdat = "";
  let lastFlgvat = "0";
  const invoiceMap: Record<string, InvoiceRow> = {};

  for (let i = 2; i < rawRows.length; i++) {   // เริ่ม row3
    const r = rawRows[i];
    const docnumVal = iDocnum >= 0 ? r[iDocnum] : null;
    const cuscodVal = iCuscod >= 0 ? r[iCuscod] : null;
    const docdatVal = r[iDocdat];
    const flgvatVal = iFlgvat >= 0 ? r[iFlgvat] : null;

    // fill-down
    if (docnumVal) lastDocnum = String(docnumVal).trim();
    if (cuscodVal) lastCuscod = String(cuscodVal).trim();
    if (docdatVal) lastDocdat = String(docdatVal).trim();
    if (flgvatVal !== null && flgvatVal !== undefined) lastFlgvat = String(flgvatVal).trim();

    if (!lastDocnum) continue;

    // สร้าง InvoiceRow ถ้ายังไม่มี
    if (!invoiceMap[lastDocnum]) {
      invoiceMap[lastDocnum] = {
        docnum:   lastDocnum,
        docdat:   lastDocdat,
        cuscod:   lastCuscod,
        custname: String(r[4] ?? "").trim(),  // col E = ชื่อลูกค้า
        youref:   "",
        flgvat:   (lastFlgvat || "0") as "1" | "2",
        paytrm:   0,
        items:    [],
      };
    }

    // เพิ่ม item
    const stkcod = iStkcod >= 0 ? String(r[iStkcod] ?? "").trim() : "";
    const trnval = iTrnval >= 0 ? Number(r[iTrnval]) || 0 : 0;
    if (!stkcod && !trnval) continue;   // ข้ามแถวที่ไม่มีข้อมูล

    invoiceMap[lastDocnum].items.push({
      stkcod,
      stkdes:  iStkdes >= 0 ? String(r[iStkdes] ?? "").trim() : "",
      loccod:  "01",
      trnqty:  iTrnqty >= 0 ? Number(r[iTrnqty]) || 1 : 1,
      tqucod:  iTqucod >= 0 ? String(r[iTqucod] ?? "AA").trim() : "AA",
      unitpr:  iUnitpr >= 0 ? Number(r[iUnitpr]) || 0 : 0,
      discamt: 0,
      trnval,
    });
  }

  return Object.values(invoiceMap).filter(r => r.docnum && r.items.length > 0);
}

/** อ่าน Excel template RE แล้ว parse เป็น ReceiptRow[]
 *  รองรับ 2 format อัตโนมัติ:
 *  - Format เก่า: 2 sheets (Header + Items)
 *  - Format ใหม่: 1 sheet (Items เดียว มีทุก field ในแถวเดียว)
 */
export async function parseREExcel(file: File): Promise<ReceiptRow[]> {
  const XLSX = await import("xlsx");
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: "array", raw: true });

  const hasHeader = !!wb.Sheets["Header"];
  const ws = wb.Sheets["รับชำระหนี้"] ?? wb.Sheets["Items"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("ไม่พบชีท Items");

  // อ่าน raw rows
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as (string | number | null)[][];
  if (rawRows.length < 3) return [];

  // auto-detect: template ใหม่มี group header row1 → ชื่อคอลัมน์อยู่ row2
  // ลอง row0 ก่อน ถ้าไม่เจอ "วันที่รับเงิน" ให้ใช้ row1 แทน
  let colRow = 0;
  let dataStart = 2;
  const row0Names = rawRows[0] as string[];
  if (!row0Names.some(c => String(c ?? "").includes("วันที่รับเงิน"))) {
    colRow = 1;      // new template: row1=group header, row2=col names
    dataStart = 3;   // data starts at row4 (index 3)
  }
  const colNames = rawRows[colRow] as string[];
  const ci = (name: string) => colNames.findIndex(c => String(c ?? "").includes(name));

  const iRcpdat = ci("วันที่รับเงิน");
  const iCuscod = ci("รหัสลูกค้า");
  const iRcpnum = ci("เลขที่ RE");
  const iDocnum = ci("เลขที่ INV");
  const iRcvamt = ci("จำนวนเงิน");
  const iWhtamt = ci("ภาษีหัก");
  const iPaytyp = ci("วิธีชำระ");   // col K ใน RE_template.xlsx (T=โอน C=เช็ก E=สด)
  const iBnkcod = ci("ธนาคาร");
  const iChqnum = ci("เลขเช็ก");
  const iChqdat = ci("วันที่เช็ก");
  const iRemark    = ci("หมายเหตุ");
  const iTransfer  = ci("เงินโอนเข้าบัญชี");
  const iFee       = ci("ค่าธรรมเนียม");
  const iSuspend   = ci("บัญชีพัก");

  const itemMap:   Record<string, ReItem[]>  = {};
  const headerMap: Record<string, Record<string, string | number>> = {};

  for (let i = dataStart; i < rawRows.length; i++) {
    const r = rawRows[i];
    const rcpnum = iRcpnum >= 0 ? String(r[iRcpnum] ?? "").trim() : "";
    const docnum = iDocnum >= 0 ? String(r[iDocnum] ?? "").trim() : "";
    const rcvamt = iRcvamt >= 0 ? Number(r[iRcvamt]) || 0 : 0;
    if (!rcpnum || !docnum || docnum === "รวมทั้งหมด" || !rcvamt) continue;

    // เก็บ header info จากแถวแรกของแต่ละ RE
    if (!headerMap[rcpnum]) {
      headerMap[rcpnum] = {
        rcpdat: iRcpdat >= 0 ? String(r[iRcpdat] ?? "").trim() : "",
        cuscod: iCuscod >= 0 ? String(r[iCuscod] ?? "").trim() : "",
        paytyp: iPaytyp >= 0 ? String(r[iPaytyp] ?? "T").trim() : "T",
        bnkcod: iBnkcod >= 0 ? String(r[iBnkcod] ?? "").trim() : "",
        chqnum: iChqnum >= 0 ? String(r[iChqnum] ?? "").trim() : "",
        chqdat: iChqdat >= 0 ? String(r[iChqdat] ?? "").trim() : "",
        remark: iRemark >= 0 ? String(r[iRemark] ?? "").trim() : "",
        whtamt:   0,
        fee:      0,
        transfer: 0,
        suspend:  0,
        custname: iCuscod >= 0 ? String(r[2] ?? "").trim() : "",  // col C ชื่อลูกค้า
      };
    }
    // รวมยอดต่างๆ ต่อ RE
    headerMap[rcpnum].whtamt   = Number(headerMap[rcpnum].whtamt)   + (iWhtamt   >= 0 ? Number(r[iWhtamt])   || 0 : 0);
    headerMap[rcpnum].fee      = Number(headerMap[rcpnum].fee)      + (iFee      >= 0 ? Number(r[iFee])      || 0 : 0);
    headerMap[rcpnum].suspend  = Number(headerMap[rcpnum].suspend)  + (iSuspend  >= 0 ? Number(r[iSuspend])  || 0 : 0);
    if (iTransfer >= 0 && r[iTransfer]) headerMap[rcpnum].transfer = Number(r[iTransfer]) || 0;

    itemMap[rcpnum] = itemMap[rcpnum] ?? [];
    itemMap[rcpnum].push({
      docnum,
      rcvamt,
      vatamt: iWhtamt >= 0 ? Number(r[iWhtamt]) || 0 : 0,
    });
  }

  // ถ้ามี Header sheet แยก → override ด้วยข้อมูลจาก Header
  if (hasHeader) {
    const ws1 = wb.Sheets["Header"]!;
    const hdrs = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws1, { defval: "" }).slice(1);
    for (const h of hdrs) {
      const rcpnum = String(h["RCPNUM"] ?? "").trim();
      if (!rcpnum) continue;
      headerMap[rcpnum] = {
        ...headerMap[rcpnum],
        rcpdat: String(h["RCPDAT"] ?? headerMap[rcpnum]?.rcpdat ?? "").trim(),
        cuscod: String(h["CUSCOD"] ?? headerMap[rcpnum]?.cuscod ?? "").trim(),
        paytyp: String(h["PAYTYP"] ?? "T").trim(),
        bnkcod: String(h["BNKCOD"] ?? "").trim(),
        chqnum: String(h["CHQNUM"] ?? "").trim(),
        chqdat: String(h["CHQDAT"] ?? "").trim(),
        whtamt: Number(h["WHTAMT"]) || Number(headerMap[rcpnum]?.whtamt) || 0,
        remark: String(h["REMARK"] ?? "").trim(),
      };
    }
  }

  return Object.entries(headerMap)
    .filter(([rcpnum]) => (itemMap[rcpnum]?.length ?? 0) > 0)
    .map(([rcpnum, h]) => ({
      rcpnum,
      rcpdat: String(h.rcpdat).trim(),
      cuscod: String(h.cuscod).trim(),
      paytyp: (String(h.paytyp).trim().toUpperCase() as "T" | "C" | "E") || "T",
      bnkcod: String(h.bnkcod).trim(),
      chqnum: String(h.chqnum).trim(),
      chqdat: String(h.chqdat).trim(),
      whtrat:   0,
      whtamt:   Number(h.whtamt)   || 0,
      fee:      Number(h.fee)      || 0,
      transfer: Number(h.transfer) || 0,
      suspend:  Number(h.suspend)  || 0,
      custname: String(h.custname ?? "").trim(),
      remark:   String(h.remark).trim(),
      items:    itemMap[rcpnum] ?? [],
    }));
}
