"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  importRE, getOpenInvoices, parseREExcel, getGlAccounts,
  type ReceiptRow, type OpenInvoice, type GlAccount, type ReGlAccts,
} from "@/lib/arApi";

// ─── Types ────────────────────────────────────────────────────

interface StatementTxn {
  date: string;
  amount: number;
  description: string;
  ref: string;
  channel: string;
}

type MatchType = "matched" | "unmatched";
type Confidence = "high" | "medium" | "low";

interface MatchRow {
  id: string;
  txn: StatementTxn;
  matchType: MatchType;
  selectedCuscod: string;
  selectedInvDocnums: string[];   // ← multi-invoice
  rcpnum: string;
  whtamt: number;
  fee: number;
  otherexp: number;
  confidence: Confidence;
  selected: boolean;
  pendCuscod: string;
}

// ─── Helpers ──────────────────────────────────────────────────

function autoMatch(txn: StatementTxn, invoices: OpenInvoice[]): {
  docnums: string[];
  cuscod: string;
  confidence: Confidence;
  whtamt: number;
} {
  // 1) ยอดตรงเป๊ะ
  for (const inv of invoices) {
    if (Math.abs(inv.remamt - txn.amount) < 0.5)
      return { docnums: [inv.docnum], cuscod: inv.cuscod, confidence: "high", whtamt: 0 };
  }
  // 2) WHT 3%
  for (const inv of invoices) {
    const wht = Math.round((inv.remamt * 3) / 103 * 100) / 100;
    if (Math.abs(inv.remamt - txn.amount - wht) < 1)
      return { docnums: [inv.docnum], cuscod: inv.cuscod, confidence: "high", whtamt: wht };
  }
  // 3) WHT 5%
  for (const inv of invoices) {
    const wht = Math.round((inv.remamt * 5) / 105 * 100) / 100;
    if (Math.abs(inv.remamt - txn.amount - wht) < 1)
      return { docnums: [inv.docnum], cuscod: inv.cuscod, confidence: "high", whtamt: wht };
  }
  // 4) ยอดใกล้เคียง ±500
  const closest = invoices.reduce<{ inv: OpenInvoice | null; diff: number }>(
    (best, inv) => { const d = Math.abs(inv.remamt - txn.amount); return d < best.diff ? { inv, diff: d } : best; },
    { inv: null, diff: Infinity }
  );
  if (closest.inv && closest.diff <= 500)
    return { docnums: [closest.inv.docnum], cuscod: closest.inv.cuscod, confidence: "medium", whtamt: 0 };
  return { docnums: [], cuscod: "", confidence: "low", whtamt: 0 };
}

function genRcpnum(date: string, idx: number): string {
  const parts = date.split("/");
  if (parts.length === 3) {
    const yy = parts[2].slice(-2);
    const mm = parts[1].padStart(2, "0");
    return `RE${yy}${mm}${String(idx + 1).padStart(3, "0")}`;
  }
  return `RE${String(idx + 1).padStart(8, "0")}`;
}

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
const fmtInput = (n: number) => n === 0 ? "" : n.toLocaleString("th-TH");
const parseInput = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;

// ─── Page ─────────────────────────────────────────────────────

export default function RePage() {
  // ── ส่วนที่ 1: Excel ──
  const xlsxRef = useRef<HTMLInputElement>(null);
  const [xlsxFile, setXlsxFile]   = useState<File | null>(null);
  const [xlsxDrag, setXlsxDrag]   = useState(false);
  const [xlsxRows, setXlsxRows]   = useState<ReceiptRow[]>([]);
  const [xlsxLoading, setXlsxL]   = useState(false);
  const [xlsxResult, setXlsxResult] = useState<{ success: number; skipped: number; errors: number } | null>(null);
  const [xlsxError, setXlsxError] = useState<string | null>(null);

  // ── ส่วนที่ 2: PDF Statement ──
  const pdfRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile]     = useState<File | null>(null);
  const [pdfDrag, setPdfDrag]     = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pendCuscod, setPendCuscod] = useState("PEND");
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [pdfStep, setPdfStep]     = useState<"upload" | "match" | "importing" | "done">("upload");
  const [pdfError, setPdfError]   = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<{ success: number; skipped: number; errors: number; details: { rcpnum: string; status: string; msg?: string }[] } | null>(null);

  // GL account mapping states
  const [glAccounts, setGlAccounts] = useState<GlAccount[]>([]);
  const [whtAcct,   setWhtAcct]   = useState("");
  const [feeAcct,   setFeeAcct]   = useState("");
  const [otherAcct, setOtherAcct] = useState("");

  useEffect(() => {
    getOpenInvoices().then(setOpenInvoices).catch(() => {});
    getGlAccounts().then(setGlAccounts).catch(() => {});
  }, []);

  const customers = useMemo(() => {
    const map = new Map<string, string>();
    openInvoices.forEach(inv => { if (!map.has(inv.cuscod)) map.set(inv.cuscod, inv.cusname || ""); });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [openInvoices]);

  const getInvsByCuscod = (cuscod: string) => openInvoices.filter(i => i.cuscod === cuscod);
  const getCustname = (cuscod: string) => customers.find(([cod]) => cod === cuscod)?.[1] ?? "";

  const selectedRows   = matchRows.filter(r => r.selected);
  const matchedCount   = matchRows.filter(r => r.selected && r.selectedInvDocnums.length > 0 && r.selectedCuscod).length;
  const unmatchedCount = matchRows.filter(r => r.selected && !(r.selectedInvDocnums.length > 0 && r.selectedCuscod)).length;
  const allChecked     = matchRows.length > 0 && matchRows.every(r => r.selected);

  // ── Excel handlers ──
  const handleXlsxFile = useCallback(async (f: File) => {
    setXlsxFile(f); setXlsxError(null); setXlsxResult(null); setXlsxL(true);
    try {
      const rows = await parseREExcel(f);
      setXlsxRows(rows);
    } catch (e) {
      setXlsxError(e instanceof Error ? e.message : "อ่านไฟล์ไม่ได้");
    } finally { setXlsxL(false); }
  }, []);

  const handleXlsxImport = async () => {
    if (!xlsxRows.length) return;
    setXlsxL(true); setXlsxError(null);
    try {
      const res = await importRE(xlsxRows);
      setXlsxResult({ success: res.success, skipped: res.skipped ?? 0, errors: res.error ?? 0 });
    } catch (e) {
      setXlsxError(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ");
    } finally { setXlsxL(false); }
  };

  // ── PDF handlers ──
  const handlePdf = useCallback(async (f: File) => {
    setPdfFile(f); setPdfError(null); setAnalyzing(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = () => rej(new Error("อ่านไฟล์ไม่ได้"));
        reader.readAsDataURL(f);
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 110000);
      let apiRes: Response;
      try {
        apiRes = await fetch("/api/parse-statement", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64 }), signal: controller.signal,
        });
      } finally { clearTimeout(timer); }
      if (!apiRes.ok) { const err = await apiRes.json(); throw new Error(err.error ?? "วิเคราะห์ไม่สำเร็จ"); }
      const { transactions } = (await apiRes.json()) as { transactions: StatementTxn[] };
      if (!transactions?.length) throw new Error("ไม่พบรายการเงินเข้า");

      const rows: MatchRow[] = transactions.map((txn, i) => {
        const { docnums, cuscod, confidence, whtamt } = autoMatch(txn, openInvoices);
        return {
          id: String(i), txn, matchType: docnums.length > 0 ? "matched" : "unmatched",
          selectedCuscod: cuscod, selectedInvDocnums: docnums,
          rcpnum: genRcpnum(txn.date, i), whtamt, fee: 0, otherexp: 0,
          confidence, selected: true, pendCuscod,
        };
      });
      setMatchRows(rows); setPdfStep("match");
    } catch (e) {
      setPdfError(e instanceof Error && e.name === "AbortError" ? "หมดเวลา" : e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally { setAnalyzing(false); }
  }, [openInvoices, pendCuscod]);

  const updateRow = (id: string, patch: Partial<MatchRow>) =>
    setMatchRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const toggleInvoice = (id: string, docnum: string) => {
    setMatchRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const already = r.selectedInvDocnums.includes(docnum);
      const next = already ? r.selectedInvDocnums.filter(d => d !== docnum) : [...r.selectedInvDocnums, docnum];
      return { ...r, selectedInvDocnums: next, matchType: next.length > 0 ? "matched" : "unmatched" };
    }));
  };

  const handlePdfImport = async () => {
    setPdfStep("importing"); setPdfError(null);
    const receipts: ReceiptRow[] = selectedRows.map(r => {
      const invs = r.selectedInvDocnums.map(dn => openInvoices.find(i => i.docnum === dn)).filter(Boolean) as OpenInvoice[];
      const totalRcv = invs.reduce((s, i) => s + i.remamt, 0);
      const transfer = r.txn.amount;
      const cusname = getCustname(r.selectedCuscod) || r.selectedCuscod || r.txn.description;
      const desc = cusname.slice(0, 50);
      return {
        rcpnum: r.rcpnum, rcpdat: r.txn.date,
        cuscod: r.selectedCuscod || pendCuscod,
        custname: desc,
        paytyp: "T" as const, bnkcod: "KBANK",
        chqnum: r.txn.ref || r.rcpnum, chqdat: r.txn.date,
        whtrat: 0, whtamt: r.whtamt, fee: r.fee, otherexp: r.otherexp,
        transfer, suspend: invs.length > 0 ? Math.max(totalRcv - r.txn.amount - r.whtamt, 0) : transfer,
        remark: desc,
        items: invs.map(inv => ({ docnum: inv.docnum, rcvamt: inv.remamt, vatamt: 0 })),
      };
    });
    const glAccts: ReGlAccts = { whtAcct, feeAcct, otherAcct };
    try {
      const res = await importRE(receipts, glAccts);
      setPdfResult({ success: res.success, skipped: res.skipped ?? 0, errors: res.error ?? 0, details: res.details.map(d => ({ ...d, rcpnum: d.rcpnum ?? "" })) });
      setPdfStep("done");
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); setPdfStep("match");
    }
  };

  const resetPdf = () => { setPdfFile(null); setMatchRows([]); setPdfStep("upload"); setPdfError(null); setPdfResult(null); };

  // ── Export Excel ──
  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("RE Statement");

    // ── คอลัมน์ ──
    const cols = [
      { header: "#",                  key: "no",       width: 5,  align: "center" as const },
      { header: "วันที่",              key: "date",     width: 13, align: "center" as const },
      { header: "ยอดโอน (บาท)",       key: "amount",   width: 16, align: "right"  as const },
      { header: "รายละเอียด",          key: "desc",     width: 35, align: "left"   as const },
      { header: "Ref",                key: "ref",      width: 18, align: "center" as const },
      { header: "รหัสลูกค้า",          key: "cuscod",  width: 12, align: "center" as const },
      { header: "ชื่อลูกค้า",          key: "cusname", width: 28, align: "left"   as const },
      { header: "Invoice ค้างชำระ",   key: "invs",    width: 30, align: "left"   as const },
      { header: "จำนวนบิล",           key: "invqty",  width: 9,  align: "center" as const },
      { header: "ยอดรวม Invoice",     key: "invtotal", width: 16, align: "right"  as const },
      { header: "เลขที่ RE",           key: "rcpnum",  width: 14, align: "center" as const },
      { header: "WHT",                key: "wht",     width: 12, align: "right"  as const },
      { header: "ค่าธรรมเนียม",        key: "fee",     width: 14, align: "right"  as const },
      { header: "ค่าใช้จ่ายอื่น",      key: "other",   width: 14, align: "right"  as const },
      { header: "โอนสุทธิ",           key: "net",     width: 14, align: "right"  as const },
      { header: "สถานะ",              key: "status",  width: 12, align: "center" as const },
      { header: "นำเข้า",             key: "sel",     width: 8,  align: "center" as const },
    ];

    ws.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width }));

    // ── style หัวตาราง ──
    const headerRow = ws.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Cordia New" };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
        right:  { style: "thin", color: { argb: "FFFFFFFF" } },
      };
    });

    const amtFmt = '#,##0.00';
    const amtKeys = new Set(["amount", "invtotal", "wht", "fee", "other", "net"]);

    // ── ข้อมูล ──
    matchRows.forEach((r, i) => {
      const invs = r.selectedInvDocnums.map(dn => openInvoices.find(inv => inv.docnum === dn)).filter(Boolean) as OpenInvoice[];
      const invTotal = invs.reduce((s, inv) => s + inv.remamt, 0);
      const rowData = {
        no: i + 1,
        date: r.txn.date,
        amount: r.txn.amount,
        desc: r.txn.description,
        ref: r.txn.ref,
        cuscod: r.selectedCuscod,
        cusname: getCustname(r.selectedCuscod),
        invs: r.selectedInvDocnums.join(", "),
        invqty: r.selectedInvDocnums.length,
        invtotal: invTotal,
        rcpnum: r.rcpnum,
        wht: r.whtamt,
        fee: r.fee,
        other: r.otherexp,
        net: r.txn.amount,
        status: r.selectedInvDocnums.length > 0 ? "จับคู่แล้ว" : "บัญชีพัก",
        sel: r.selected ? "✓" : "",
      };
      const row = ws.addRow(rowData);
      row.height = 20;
      const bgColor = i % 2 === 0 ? "FFFFFFFF" : "FFEFF6FF";
      row.eachCell((cell, colNum) => {
        const key = cols[colNum - 1]?.key ?? "";
        const align = cols[colNum - 1]?.align ?? "center";
        cell.alignment = { horizontal: align, vertical: "middle" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right:  { style: "thin", color: { argb: "FFE5E7EB" } },
        };
        cell.font = { name: "Cordia New", size: 12 };
        if (amtKeys.has(key) && typeof cell.value === "number") {
          cell.numFmt = amtFmt;
        }
      });
    });

    // ── แถวผลรวม ──
    const totalRow = ws.addRow({
      no: "",
      date: `รวม ${matchRows.length} รายการ`,
      amount: matchRows.reduce((s, r) => s + r.txn.amount, 0),
      desc: "", ref: "", cuscod: "", cusname: "", invs: "",
      invqty: "",
      invtotal: matchRows.reduce((s, r) => {
        const invs = r.selectedInvDocnums.map(dn => openInvoices.find(inv => inv.docnum === dn)).filter(Boolean) as OpenInvoice[];
        return s + invs.reduce((a, inv) => a + inv.remamt, 0);
      }, 0),
      rcpnum: "",
      wht: matchRows.reduce((s, r) => s + r.whtamt, 0),
      fee: matchRows.reduce((s, r) => s + r.fee, 0),
      other: matchRows.reduce((s, r) => s + r.otherexp, 0),
      net: matchRows.reduce((s, r) => s + r.txn.amount, 0),
      status: "", sel: "",
    });
    totalRow.height = 22;
    totalRow.eachCell((cell, colNum) => {
      const key = cols[colNum - 1]?.key ?? "";
      cell.font = { bold: true, name: "Cordia New", size: 12, color: { argb: "FF1D4ED8" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
      cell.alignment = { horizontal: amtKeys.has(key) ? "right" : colNum === 2 ? "left" : "center", vertical: "middle" };
      cell.border = {
        top:    { style: "medium", color: { argb: "FF2563EB" } },
        bottom: { style: "medium", color: { argb: "FF2563EB" } },
        right:  { style: "thin",   color: { argb: "FFE5E7EB" } },
      };
      if (amtKeys.has(key) && typeof cell.value === "number") cell.numFmt = amtFmt;
    });

    // ── download ──
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fname = pdfFile ? pdfFile.name.replace(".pdf", "") : "RE_Statement";
    a.download = `${fname}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── UI ───────────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 36px 36px", fontFamily: "inherit" }}>

      {/* Page Header */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "18px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#EA580C" }}>RE</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>รับชำระหนี้ — นำเข้า RE</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>นำเข้าจาก Excel Template หรือ PDF Statement (AI)</div>
          </div>
          {customers.length > 0 && (
            <div style={{ marginLeft: "auto", fontSize: 11, background: "#DCFCE7", color: "#166534", padding: "4px 12px", borderRadius: 20, fontWeight: 600 }}>
              🔗 Express — {customers.length} ลูกหนี้ / {openInvoices.length} บิล
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ส่วนที่ 1 — นำเข้าจาก Excel Template
      ═══════════════════════════════════════════════════════════ */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>📊</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>ส่วนที่ 1 — นำเข้าจาก Excel Template</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>อัปโหลดไฟล์ RE_template.xlsx ที่กรอกข้อมูลแล้ว</div>
          </div>
        </div>

        {xlsxError && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#DC2626" }}>⚠️ {xlsxError}</div>}

        {/* Drop Zone */}
        <div
          onClick={() => !xlsxLoading && xlsxRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setXlsxDrag(true); }}
          onDragLeave={() => setXlsxDrag(false)}
          onDrop={e => { e.preventDefault(); setXlsxDrag(false); const f = e.dataTransfer.files[0]; if (f) handleXlsxFile(f); }}
          style={{ border: `1.5px dashed ${xlsxDrag ? "#3B82F6" : xlsxFile ? "#22C55E" : "#D1D5DB"}`, borderRadius: 10, padding: "24px", textAlign: "center", cursor: xlsxLoading ? "wait" : "pointer", background: xlsxDrag ? "#EFF6FF" : xlsxFile ? "#F0FDF4" : "#FAFAFA", transition: "all 0.2s" }}>
          <input ref={xlsxRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleXlsxFile(f); }} />
          {xlsxLoading
            ? <><div style={{ fontSize: 22, marginBottom: 6 }}>⏳</div><div style={{ fontSize: 13, color: "#3B82F6", fontWeight: 600 }}>กำลังอ่านไฟล์...</div></>
            : xlsxFile
            ? <><div style={{ fontSize: 22, marginBottom: 4 }}>✅</div><div style={{ fontSize: 13, fontWeight: 600, color: "#15803D" }}>{xlsxFile.name}</div><div style={{ fontSize: 11, color: "#86EFAC", marginTop: 3 }}>คลิกเพื่อเปลี่ยนไฟล์</div></>
            : <><div style={{ fontSize: 28, marginBottom: 8, color: "#9CA3AF" }}>📁</div><div style={{ fontSize: 13, color: "#9CA3AF" }}>คลิกหรือลาก RE_template.xlsx มาวางที่นี่</div><div style={{ fontSize: 11, color: "#D1D5DB", marginTop: 4 }}>.xlsx เท่านั้น</div></>
          }
        </div>

        {/* Preview Table */}
        {xlsxRows.length > 0 && !xlsxResult && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>พบ {xlsxRows.length} รายการ — ตรวจสอบก่อนนำเข้า</div>
            <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #E5E7EB" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["เลขที่ RE", "วันที่", "ลูกค้า", "วิธีชำระ", "โอนจริง", "WHT", "จำนวนบิล"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {xlsxRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "6px 10px", color: "#EA580C", fontWeight: 600 }}>{r.rcpnum}</td>
                      <td style={{ padding: "6px 10px", color: "#374151" }}>{r.rcpdat}</td>
                      <td style={{ padding: "6px 10px", color: "#374151" }}>{r.cuscod}</td>
                      <td style={{ padding: "6px 10px" }}>{r.paytyp === "T" ? "โอน" : r.paytyp === "C" ? "เช็ก" : "สด"}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{fmt(r.transfer)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", color: "#EA580C" }}>{r.whtamt > 0 ? fmt(r.whtamt) : "-"}</td>
                      <td style={{ padding: "6px 10px", textAlign: "center" }}>{r.items.length} บิล</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={handleXlsxImport} disabled={xlsxLoading}
                style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: "#EA580C", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: xlsxLoading ? 0.6 : 1 }}>
                {xlsxLoading ? "⏳ กำลังนำเข้า..." : `⬆ นำเข้า ${xlsxRows.length} รายการ เข้า Express`}
              </button>
            </div>
          </div>
        )}

        {/* Excel Result */}
        {xlsxResult && (
          <div style={{ marginTop: 12, background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>✅</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#15803D" }}>นำเข้าเสร็จสมบูรณ์</div>
                <div style={{ fontSize: 12, color: "#166534" }}>สำเร็จ {xlsxResult.success} ใบ{xlsxResult.skipped > 0 ? ` · ซ้ำ ${xlsxResult.skipped}` : ""}{xlsxResult.errors > 0 ? ` · ผิดพลาด ${xlsxResult.errors}` : ""}</div>
              </div>
            </div>
            <button onClick={() => { setXlsxFile(null); setXlsxRows([]); setXlsxResult(null); }}
              style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: "#EA580C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              นำเข้าใหม่
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ส่วนที่ 2 — วิเคราะห์จาก PDF Statement (AI)
      ═══════════════════════════════════════════════════════════ */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>🤖</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>ส่วนที่ 2 — วิเคราะห์จาก PDF Statement (AI)</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>อัปโหลด Bank Statement PDF — AI จะแยกรายการและจับคู่กับ Invoice อัตโนมัติ</div>
          </div>
        </div>

        {/* Config */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: "#F9FAFB", borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: "#374151" }}>รหัสลูกค้า (บัญชีพัก):</span>
          <input value={pendCuscod} onChange={e => setPendCuscod(e.target.value)}
            style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 10px", fontSize: 12, width: 90, fontFamily: "inherit" }} />
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>ต้องเป็นรหัสลูกค้าที่มีอยู่ใน Express</span>
        </div>

        {pdfError && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#DC2626" }}>⚠️ {pdfError}</div>}

        {/* PDF Drop Zone */}
        <div
          onClick={() => !analyzing && pdfRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setPdfDrag(true); }}
          onDragLeave={() => setPdfDrag(false)}
          onDrop={e => { e.preventDefault(); setPdfDrag(false); const f = e.dataTransfer.files[0]; if (f) handlePdf(f); }}
          style={{ border: `1.5px dashed ${pdfDrag ? "#3B82F6" : pdfFile ? "#22C55E" : "#D1D5DB"}`, borderRadius: 10, padding: "24px", textAlign: "center", cursor: analyzing ? "wait" : "pointer", background: pdfDrag ? "#EFF6FF" : pdfFile ? "#F0FDF4" : "#FAFAFA", transition: "all 0.2s", marginBottom: 14 }}>
          <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePdf(f); }} />
          {analyzing
            ? <><div style={{ fontSize: 22, marginBottom: 6 }}>🔍</div><div style={{ fontSize: 13, color: "#3B82F6", fontWeight: 600 }}>AI กำลังวิเคราะห์ Statement...</div><div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>กรุณารอสักครู่</div></>
            : pdfFile
            ? <><div style={{ fontSize: 22, marginBottom: 4 }}>✅</div><div style={{ fontSize: 13, fontWeight: 600, color: "#15803D" }}>{pdfFile.name}</div><div style={{ fontSize: 11, color: "#86EFAC", marginTop: 3 }}>คลิกเพื่อเปลี่ยนไฟล์</div></>
            : <><div style={{ fontSize: 28, marginBottom: 8, color: "#9CA3AF" }}>📄</div><div style={{ fontSize: 13, color: "#9CA3AF" }}>คลิกหรือลาก PDF Statement KBANK มาวางที่นี่</div><div style={{ fontSize: 11, color: "#D1D5DB", marginTop: 4 }}>.pdf เท่านั้น</div></>
          }
        </div>

        {/* Match Table */}
        {(pdfStep === "match" || pdfStep === "importing") && matchRows.length > 0 && (
          <>
            {/* Stats + Export */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 600, background: "#DCFCE7", color: "#166534", padding: "3px 12px", borderRadius: 20 }}>✓ จับคู่ {matchedCount}</span>
              <span style={{ fontSize: 11, fontWeight: 600, background: "#FEF9C3", color: "#854D0E", padding: "3px 12px", borderRadius: 20 }}>⚠ บัญชีพัก {unmatchedCount}</span>
              <span style={{ fontSize: 11, fontWeight: 600, background: "#F3F4F6", color: "#6B7280", padding: "3px 12px", borderRadius: 20 }}>รวม {matchRows.length}</span>
              <button onClick={exportExcel}
                style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, background: "#16A34A", color: "#fff", padding: "6px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                📥 Export Excel
              </button>
            </div>

            {/* Orange info bar */}
            <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 11, color: "#92400E" }}>
              🤖 AI พบ <strong>{matchRows.length}</strong> รายการจาก <strong>{pdfFile?.name}</strong> — ตรวจสอบและจับคู่ก่อนนำเข้า
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F9FAFB", borderBottom: "2px solid #E5E7EB" }}>
                    <th style={{ padding: "8px 10px", textAlign: "center", width: 36 }}>
                      <input type="checkbox" checked={allChecked} onChange={e => setMatchRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))} style={{ cursor: "pointer", accentColor: "#EA580C" }} />
                    </th>
                    {["วันที่", "", "ยอดโอน (บาท)", "รายละเอียด", "รหัสลูกค้า", "ชื่อลูกค้า", "Invoice ค้างชำระ (เลือกหลายบิลได้)", "เลขที่ RE"].map((h, i) => (
                      <th key={i} style={{ padding: "8px 10px", textAlign: ["ยอดโอน (บาท)"].includes(h) ? "right" : "center", color: "#6B7280", fontWeight: 600, whiteSpace: "nowrap", width: h === "" ? 28 : undefined }}>{h}</th>
                    ))}
                    {/* WHT header + dropdown */}
                    <th style={{ padding: "6px 8px", textAlign: "right", color: "#6B7280", fontWeight: 600, minWidth: 140 }}>
                      <div style={{ fontSize: 11, marginBottom: 3 }}>WHT</div>
                      <select value={whtAcct} onChange={e => setWhtAcct(e.target.value)}
                        style={{ border: "1px solid #D1D5DB", borderRadius: 5, padding: "2px 4px", fontSize: 10, width: "100%", fontFamily: "inherit", background: whtAcct ? "#EFF6FF" : "#fff" }}>
                        <option value="">— เลขที่บัญชี WHT —</option>
                        {glAccounts.map(a => <option key={a.acctno} value={a.acctno}>{a.acctno} {a.acctnam}</option>)}
                      </select>
                    </th>
                    {/* ค่าธรรมเนียม header + dropdown */}
                    <th style={{ padding: "6px 8px", textAlign: "right", color: "#6B7280", fontWeight: 600, minWidth: 150 }}>
                      <div style={{ fontSize: 11, marginBottom: 3 }}>ค่าธรรมเนียม</div>
                      <select value={feeAcct} onChange={e => setFeeAcct(e.target.value)}
                        style={{ border: "1px solid #D1D5DB", borderRadius: 5, padding: "2px 4px", fontSize: 10, width: "100%", fontFamily: "inherit", background: feeAcct ? "#EFF6FF" : "#fff" }}>
                        <option value="">— เลขที่บัญชี ค่าธรรมเนียม —</option>
                        {glAccounts.map(a => <option key={a.acctno} value={a.acctno}>{a.acctno} {a.acctnam}</option>)}
                      </select>
                    </th>
                    {/* ค่าใช้จ่ายอื่น header + dropdown */}
                    <th style={{ padding: "6px 8px", textAlign: "right", color: "#6B7280", fontWeight: 600, minWidth: 150 }}>
                      <div style={{ fontSize: 11, marginBottom: 3 }}>ค่าใช้จ่ายอื่น</div>
                      <select value={otherAcct} onChange={e => setOtherAcct(e.target.value)}
                        style={{ border: "1px solid #D1D5DB", borderRadius: 5, padding: "2px 4px", fontSize: 10, width: "100%", fontFamily: "inherit", background: otherAcct ? "#EFF6FF" : "#fff" }}>
                        <option value="">— เลขที่บัญชี ค่าใช้จ่ายอื่น —</option>
                        {glAccounts.map(a => <option key={a.acctno} value={a.acctno}>{a.acctno} {a.acctnam}</option>)}
                      </select>
                    </th>
                    <th style={{ padding: "8px 10px", textAlign: "center", color: "#6B7280", fontWeight: 600, whiteSpace: "nowrap" }}>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {matchRows.map(r => {
                    const invOptions = r.selectedCuscod ? getInvsByCuscod(r.selectedCuscod) : [];
                    const matched = r.selectedInvDocnums.length > 0 && !!r.selectedCuscod;
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid #F3F4F6", background: !r.selected ? "#FAFAFA" : matched ? "#F0FDF4" : "#FEFCE8", opacity: r.selected ? 1 : 0.5 }}>
                        {/* checkbox */}
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          <input type="checkbox" checked={r.selected} onChange={e => updateRow(r.id, { selected: e.target.checked })} style={{ cursor: "pointer", accentColor: "#EA580C" }} />
                        </td>
                        {/* วันที่ */}
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#374151" }}>{r.txn.date}</td>
                        {/* indicator dot */}
                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                          {(() => {
                            const totalInv = r.selectedInvDocnums.map(dn => openInvoices.find(i => i.docnum === dn)?.remamt ?? 0).reduce((a, b) => a + b, 0);
                            const netInv = totalInv - r.whtamt - r.fee;
                            const exactMatch = matched && Math.abs(r.txn.amount - netInv) < 0.01;
                            return (
                              <span style={{
                                display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                                background: exactMatch ? "#16A34A" : "#F59E0B",
                                boxShadow: exactMatch ? "0 0 4px #16A34A88" : "0 0 4px #F59E0B88",
                              }} title={exactMatch ? `ยอดตรง (${fmt(totalInv)} - WHT ${fmt(r.whtamt)} - ค่าธรรมเนียม ${fmt(r.fee)} = ${fmt(netInv)})` : matched ? `ส่วนต่าง ${fmt(Math.abs(r.txn.amount - netInv))}` : "ยังไม่จับคู่"} />
                            );
                          })()}
                        </td>
                        {/* ยอด */}
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#1D4ED8", whiteSpace: "nowrap" }}>{fmt(r.txn.amount)}</td>
                        {/* รายละเอียด */}
                        <td style={{ padding: "8px 10px", color: "#374151", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.txn.description}>{r.txn.description || r.txn.ref || "-"}</td>
                        {/* Dropdown ลูกค้า */}
                        <td style={{ padding: "6px 8px", minWidth: 120 }}>
                          <select value={r.selectedCuscod}
                            onChange={e => updateRow(r.id, { selectedCuscod: e.target.value, selectedInvDocnums: [], matchType: "unmatched" })}
                            style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 6px", fontSize: 11, width: "100%", fontFamily: "inherit" }}>
                            <option value="">— เลือกลูกค้า —</option>
                            {customers.map(([cod]) => <option key={cod} value={cod}>{cod}</option>)}
                          </select>
                        </td>
                        {/* ชื่อลูกค้า */}
                        <td style={{ padding: "8px 10px", fontSize: 11, whiteSpace: "nowrap", color: "#374151" }}>
                          {getCustname(r.selectedCuscod) || <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                        {/* Multi-invoice checkbox list */}
                        <td style={{ padding: "6px 8px", minWidth: 220 }}>
                          {r.selectedCuscod ? (
                            <div style={{ maxHeight: 100, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 6, padding: "4px 6px", background: "#fff" }}>
                              {invOptions.length === 0
                                ? <span style={{ fontSize: 10, color: "#9CA3AF" }}>ไม่มีบิลค้าง</span>
                                : invOptions.map(inv => (
                                  <label key={inv.docnum} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", cursor: "pointer", fontSize: 11 }}>
                                    <input type="checkbox"
                                      checked={r.selectedInvDocnums.includes(inv.docnum)}
                                      onChange={() => toggleInvoice(r.id, inv.docnum)}
                                      style={{ accentColor: "#EA580C", cursor: "pointer" }} />
                                    <span style={{ color: r.selectedInvDocnums.includes(inv.docnum) ? "#166534" : "#374151", fontWeight: r.selectedInvDocnums.includes(inv.docnum) ? 600 : 400 }}>
                                      {inv.docnum} <span style={{ color: "#6B7280" }}>ค้าง {fmt(inv.remamt)}</span>
                                    </span>
                                  </label>
                                ))
                              }
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "#9CA3AF" }}>เลือกลูกค้าก่อน</span>
                          )}
                          {r.selectedInvDocnums.length > 0 && (
                            <div style={{ fontSize: 10, color: "#166534", marginTop: 3, fontWeight: 600 }}>
                              เลือก {r.selectedInvDocnums.length} บิล · รวม {fmt(r.selectedInvDocnums.map(dn => openInvoices.find(i => i.docnum === dn)?.remamt ?? 0).reduce((a, b) => a + b, 0))}
                            </div>
                          )}
                        </td>
                        {/* เลขที่ RE */}
                        <td style={{ padding: "6px 8px", minWidth: 110 }}>
                          <input value={r.rcpnum} onChange={e => updateRow(r.id, { rcpnum: e.target.value })}
                            style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", fontSize: 11, width: "100%", fontFamily: "inherit", color: "#EA580C", fontWeight: 600 }} />
                        </td>
                        {/* WHT */}
                        <td style={{ padding: "6px 8px", minWidth: 80 }}>
                          <input type="text" value={fmtInput(r.whtamt)} placeholder="0.00"
                            onChange={e => updateRow(r.id, { whtamt: parseInput(e.target.value) })}
                            style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", fontSize: 11, width: "100%", fontFamily: "inherit", textAlign: "right" }} />
                        </td>
                        {/* ค่าธรรมเนียม */}
                        <td style={{ padding: "6px 8px", minWidth: 90 }}>
                          <input type="text" value={fmtInput(r.fee)} placeholder="0.00"
                            onChange={e => updateRow(r.id, { fee: parseInput(e.target.value) })}
                            style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", fontSize: 11, width: "100%", fontFamily: "inherit", textAlign: "right" }} />
                        </td>
                        {/* ค่าใช้จ่ายอื่น */}
                        <td style={{ padding: "6px 8px", minWidth: 90 }}>
                          <input type="text" value={fmtInput(r.otherexp)} placeholder="0.00"
                            onChange={e => updateRow(r.id, { otherexp: parseInput(e.target.value) })}
                            style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", fontSize: 11, width: "100%", fontFamily: "inherit", textAlign: "right" }} />
                        </td>
                        {/* สถานะ */}
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {matched
                            ? <span style={{ fontSize: 10, fontWeight: 600, background: "#DCFCE7", color: "#166534", padding: "3px 10px", borderRadius: 20 }}>✓ จับคู่ {r.selectedInvDocnums.length} บิล</span>
                            : <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF9C3", color: "#854D0E", padding: "3px 10px", borderRadius: 20 }}>⚠ บัญชีพัก</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F9FAFB", borderTop: "2px solid #E5E7EB" }}>
                    <td colSpan={2} style={{ padding: "8px 10px", fontWeight: 700, fontSize: 12, color: "#374151" }}>รวม {selectedRows.length} รายการ</td>
                    <td style={{ padding: "8px 4px" }} />
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#1D4ED8" }}>{fmt(selectedRows.reduce((s, r) => s + r.txn.amount, 0))}</td>
                    <td colSpan={8} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* Done */}
        {pdfStep === "done" && pdfResult && (
          <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "16px 20px", marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#15803D" }}>นำเข้าเสร็จสมบูรณ์</div>
                <div style={{ fontSize: 12, color: "#166534", marginTop: 2 }}>สำเร็จ {pdfResult.success} ใบ{pdfResult.skipped > 0 ? ` · ซ้ำ ${pdfResult.skipped}` : ""}{pdfResult.errors > 0 ? ` · ผิดพลาด ${pdfResult.errors}` : ""}</div>
              </div>
            </div>
            <button onClick={resetPdf}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#EA580C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              นำเข้าใหม่
            </button>
          </div>
        )}
      </div>

      {/* Import Button */}
      {pdfStep === "match" && (
        <button disabled={selectedRows.length === 0} onClick={handlePdfImport}
          style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: selectedRows.length > 0 ? "#EA580C" : "#E5E7EB", color: selectedRows.length > 0 ? "#fff" : "#9CA3AF", fontSize: 14, fontWeight: 700, cursor: selectedRows.length > 0 ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          ⬆ นำเข้า {selectedRows.length} รายการ เข้า Express{matchedCount > 0 ? ` (จับคู่ ${matchedCount} · บัญชีพัก ${unmatchedCount})` : ""}
        </button>
      )}
      {pdfStep === "importing" && (
        <button disabled style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#E5E7EB", color: "#9CA3AF", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>
          ⏳ กำลังนำเข้า...
        </button>
      )}
    </div>
  );
}
