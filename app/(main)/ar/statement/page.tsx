"use client";

import { useState, useRef, useCallback } from "react";
import { getOpenInvoices, importRE, type OpenInvoice, type ReceiptRow } from "@/lib/arApi";

// ─── Types ────────────────────────────────────────────────────

interface StatementTxn {
  date: string;        // DD/MM/YY (พ.ศ. 2 หลัก)
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
  invoice: OpenInvoice | null;
  selectedCuscod: string;   // ลูกค้าที่เลือกจาก dropdown
  rcpnum: string;
  whtamt: number;
  fee: number;
  transfer: number;
  suspend: number;
  confidence: Confidence;
  selected: boolean;
  pendCuscod: string;
}

// ─── Helpers ──────────────────────────────────────────────────

function autoMatch(txn: StatementTxn, invoices: OpenInvoice[]): {
  invoice: OpenInvoice | null;
  confidence: Confidence;
  whtamt: number;
} {
  // 1) ยอดตรงเป๊ะ
  for (const inv of invoices) {
    if (Math.abs(inv.remamt - txn.amount) < 0.5)
      return { invoice: inv, confidence: "high", whtamt: 0 };
  }
  // 2) หัก WHT 3% (คำนวณย้อนกลับ)
  for (const inv of invoices) {
    const wht = Math.round((inv.remamt * 3) / 103 * 100) / 100;
    if (Math.abs(inv.remamt - txn.amount - wht) < 1)
      return { invoice: inv, confidence: "high", whtamt: wht };
  }
  // 3) หัก WHT 5%
  for (const inv of invoices) {
    const wht = Math.round((inv.remamt * 5) / 105 * 100) / 100;
    if (Math.abs(inv.remamt - txn.amount - wht) < 1)
      return { invoice: inv, confidence: "high", whtamt: wht };
  }
  // 4) ยอดใกล้เคียง ±500
  const closest = invoices.reduce<{ inv: OpenInvoice | null; diff: number }>(
    (best, inv) => {
      const diff = Math.abs(inv.remamt - txn.amount);
      return diff < best.diff ? { inv, diff } : best;
    },
    { inv: null, diff: Infinity }
  );
  if (closest.inv && closest.diff <= 500)
    return { invoice: closest.inv, confidence: "medium", whtamt: 0 };

  return { invoice: null, confidence: "low", whtamt: 0 };
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

// ─── Badge ────────────────────────────────────────────────────

function MatchBadge({ type, confidence }: { type: MatchType; confidence: Confidence }) {
  if (type === "matched") {
    const [bg, color, label] =
      confidence === "high"
        ? ["#DCFCE7", "#166534", "✓ จับคู่แล้ว"]
        : ["#DBEAFE", "#1E40AF", "~ คาดการณ์"];
    return (
      <span style={{ background: bg, color, padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700 }}>
        {label}
      </span>
    );
  }
  return (
    <span style={{ background: "#FEF9C3", color: "#854D0E", padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700 }}>
      ⚠ บัญชีพัก
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function StatementPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep]         = useState<"upload" | "analyzing" | "matching" | "importing" | "done">("upload");
  const [error, setError]       = useState<string | null>(null);
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [allInvoices, setAllInvoices] = useState<OpenInvoice[]>([]);
  const [result, setResult]     = useState<{ success: number; skipped: number; errors: number } | null>(null);
  const [defaultPendCuscod, setDefaultPendCuscod] = useState("PEND");

  const selectedRows   = matchRows.filter(r => r.selected);
  const matchedCount   = selectedRows.filter(r => r.matchType === "matched").length;
  const unmatchedCount = selectedRows.filter(r => r.matchType === "unmatched").length;

  // ── Analyze PDF ──
  const analyze = useCallback(async (f: File) => {
    setFile(f); setError(null); setStep("analyzing");
    try {
      // base64
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = () => rej(new Error("อ่านไฟล์ไม่ได้"));
        reader.readAsDataURL(f);
      });

      // Claude Vision — timeout 110 วินาที
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 110000);
      let apiRes: Response;
      try {
        apiRes = await fetch("/api/parse-statement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64 }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!apiRes.ok) {
        const err = await apiRes.json();
        throw new Error(err.error ?? "วิเคราะห์ Statement ไม่สำเร็จ");
      }
      const { transactions } = (await apiRes.json()) as { transactions: StatementTxn[] };
      if (!transactions?.length) throw new Error("ไม่พบรายการเงินเข้าใน Statement");

      // Open invoices
      const invoices = await getOpenInvoices();
      setAllInvoices(invoices);

      // Auto-match
      const rows: MatchRow[] = transactions.map((txn, i) => {
        const { invoice, confidence, whtamt } = autoMatch(txn, invoices);
        return {
          id: String(i),
          txn,
          matchType: invoice ? "matched" : "unmatched",
          invoice,
          selectedCuscod: invoice?.cuscod ?? "",
          rcpnum:   genRcpnum(txn.date, i),
          whtamt,
          fee:      0,
          transfer: invoice ? txn.amount : 0,
          suspend:  invoice ? 0 : txn.amount,
          confidence,
          selected: true,
          pendCuscod: defaultPendCuscod,
        };
      });
      setMatchRows(rows);
      setStep("matching");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
      setError(e instanceof Error && e.name === "AbortError" ? "หมดเวลา — PDF อาจใหญ่เกินไป ลองใช้ PDF ที่เล็กกว่า" : msg);
      setStep("upload");
    }
  }, [defaultPendCuscod]);

  // ── Update single row ──
  const updateRow = (id: string, patch: Partial<MatchRow>) =>
    setMatchRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  // ── เมื่อเลือกลูกค้า ──
  const selectCuscod = (id: string, cuscod: string) => {
    setMatchRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      return {
        ...r,
        selectedCuscod: cuscod,
        invoice: null,
        matchType: "unmatched" as MatchType,
        transfer: 0,
        suspend: r.txn.amount,
        pendCuscod: cuscod || r.pendCuscod,
      };
    }));
  };

  // ── เมื่อเลือก Invoice ──
  const selectInvoice = (id: string, docnum: string) => {
    const inv = allInvoices.find(i => i.docnum === docnum) ?? null;
    setMatchRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      return {
        ...r,
        invoice: inv,
        matchType: inv ? "matched" as MatchType : "unmatched" as MatchType,
        confidence: "high" as Confidence,
        transfer: inv ? r.txn.amount : 0,
        suspend: inv ? 0 : r.txn.amount,
      };
    }));
  };

  // ── Import ──
  const handleImport = async () => {
    if (!selectedRows.length) return;
    setStep("importing"); setError(null);
    try {
      const receipts: ReceiptRow[] = selectedRows.map(r => ({
        rcpnum:   r.rcpnum,
        rcpdat:   r.txn.date,
        cuscod:   r.invoice?.cuscod ?? r.pendCuscod,
        custname: r.invoice ? (r.invoice.cuscod) : r.txn.description,
        paytyp:   "T" as const,
        bnkcod:   "KBANK",
        chqnum:   r.txn.ref || r.rcpnum,
        chqdat:   r.txn.date,
        whtrat:   0,
        whtamt:   r.whtamt,
        fee:      r.fee,
        transfer: r.transfer,
        suspend:  r.suspend,
        remark:   r.txn.description.slice(0, 50),
        items:    r.invoice
          ? [{ docnum: r.invoice.docnum, rcvamt: r.invoice.remamt, vatamt: 0 }]
          : [],
      }));
      const res = await importRE(receipts);
      setResult({ success: res.success, skipped: res.skipped ?? 0, errors: res.error ?? 0 });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ");
      setStep("matching");
    }
  };

  const reset = () => {
    setFile(null); setMatchRows([]); setStep("upload");
    setError(null); setResult(null);
  };

  // ─── UI ───────────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 36px 36px" }}>

      {/* Header */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏦</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>นำเข้าจาก Bank Statement (KBANK)</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
              PDF Statement → AI วิเคราะห์ → จับคู่ใบแจ้งหนี้ → สร้าง RE อัตโนมัติ
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: "#DC2626" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Config */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 24px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>รหัสลูกค้า (บัญชีพักรายการไม่พบคู่):</span>
        <input
          value={defaultPendCuscod}
          onChange={e => setDefaultPendCuscod(e.target.value)}
          style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 10px", fontSize: 12, width: 100, fontFamily: "inherit" }}
        />
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>ต้องเป็นรหัสลูกค้าที่มีอยู่ใน Express</span>
      </div>

      {/* Upload */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 14 }}>1. อัปโหลด PDF Statement KBANK</div>
        <div
          onClick={() => step !== "analyzing" && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) analyze(f); }}
          style={{
            border: `1.5px dashed ${dragging ? "#3B82F6" : file ? "#22C55E" : "#D1D5DB"}`,
            borderRadius: 10, padding: "28px 24px", textAlign: "center",
            cursor: step === "analyzing" ? "wait" : "pointer",
            background: dragging ? "#EFF6FF" : file ? "#F0FDF4" : "#FAFAFA",
            transition: "all 0.2s",
          }}>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) analyze(f); }} />
          {step === "analyzing" ? (
            <>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 13, color: "#3B82F6", fontWeight: 600 }}>AI กำลังวิเคราะห์ Statement...</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>กรุณารอสักครู่</div>
            </>
          ) : file ? (
            <>
              <div style={{ fontSize: 20, marginBottom: 4 }}>✅</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#15803D" }}>{file.name}</div>
              <div style={{ fontSize: 11, color: "#86EFAC", marginTop: 3 }}>คลิกเพื่อเปลี่ยนไฟล์</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, marginBottom: 8, color: "#9CA3AF" }}>📄</div>
              <div style={{ fontSize: 13, color: "#9CA3AF" }}>คลิกหรือลาก PDF Statement KBANK มาวางที่นี่</div>
              <div style={{ fontSize: 11, color: "#D1D5DB", marginTop: 4 }}>.pdf เท่านั้น</div>
            </>
          )}
        </div>
      </div>

      {/* Match Table */}
      {step === "matching" && matchRows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>2. ผลการจับคู่รายการ</div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, background: "#DCFCE7", color: "#166534", padding: "3px 10px", borderRadius: 20 }}>✓ จับคู่ {matchedCount}</span>
              <span style={{ fontSize: 11, fontWeight: 600, background: "#FEF9C3", color: "#854D0E", padding: "3px 10px", borderRadius: 20 }}>⚠ บัญชีพัก {unmatchedCount}</span>
              <span style={{ fontSize: 11, fontWeight: 600, background: "#F3F4F6", color: "#374151", padding: "3px 10px", borderRadius: 20 }}>รวม {matchRows.length}</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["☑", "วันที่", "ยอดโอน (บาท)", "รายละเอียด Statement", "ลูกค้า", "รหัสลูกค้า", "ชื่อลูกค้า", "Invoice ค้างชำระ", "เลขที่ RE", "WHT", "ค่าธรรมเนียม", "สถานะ"].map(h => (
                    <th key={h} style={{
                      padding: "8px 10px",
                      textAlign: ["ยอดโอน (บาท)", "WHT", "ค่าธรรมเนียม"].includes(h) ? "right" : "left",
                      color: "#6B7280", fontWeight: 600,
                      borderBottom: "1px solid #E5E7EB",
                      whiteSpace: "nowrap", fontSize: 11,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matchRows.map(r => {
                  // รายชื่อลูกค้าที่มี IN ค้าง (unique)
                  const cuscodList = Array.from(new Set(allInvoices.map(i => i.cuscod))).sort();
                  // Invoice ของลูกค้าที่เลือก
                  const invList = allInvoices.filter(i => i.cuscod === r.selectedCuscod);
                  return (
                    <tr key={r.id} style={{
                      borderBottom: "1px solid #F3F4F6",
                      background: !r.selected ? "#F9FAFB" : r.matchType === "unmatched" ? "#FEFCE8" : "#F0FDF4",
                      opacity: r.selected ? 1 : 0.5,
                    }}>
                      {/* checkbox */}
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <input type="checkbox" checked={r.selected}
                          onChange={e => updateRow(r.id, { selected: e.target.checked })} />
                      </td>
                      {/* วันที่ */}
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#374151" }}>{r.txn.date}</td>
                      {/* ยอด */}
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#1D4ED8", whiteSpace: "nowrap" }}>
                        {fmt(r.txn.amount)}
                      </td>
                      {/* รายละเอียด */}
                      <td style={{ padding: "8px 10px", color: "#374151", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.txn.description || r.txn.ref || "-"}
                      </td>
                      {/* Dropdown ลูกค้า */}
                      <td style={{ padding: "6px 8px", minWidth: 120 }}>
                        <select
                          value={r.selectedCuscod}
                          onChange={e => selectCuscod(r.id, e.target.value)}
                          style={{ border: `1px solid ${r.selectedCuscod ? "#86EFAC" : "#FCD34D"}`, borderRadius: 6, padding: "3px 6px", fontSize: 11, width: "100%", fontFamily: "inherit", background: r.selectedCuscod ? "#F0FDF4" : "#FEFCE8", cursor: "pointer" }}>
                          <option value="">— เลือกลูกค้า —</option>
                          {cuscodList.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      {/* รหัสลูกค้า */}
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#374151", fontWeight: 600, fontSize: 12 }}>
                        {r.selectedCuscod || <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      {/* ชื่อลูกค้า */}
                      <td style={{ padding: "8px 10px", color: "#374151", fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.selectedCuscod
                          ? (allInvoices.find(i => i.cuscod === r.selectedCuscod) as any)?.cusname || <span style={{ color: "#9CA3AF" }}>ไม่พบชื่อ</span>
                          : <span style={{ color: "#D1D5DB" }}>—</span>
                        }
                      </td>
                      {/* Dropdown Invoice */}
                      <td style={{ padding: "6px 8px", minWidth: 180 }}>
                        {r.selectedCuscod ? (
                          <select
                            value={r.invoice?.docnum ?? ""}
                            onChange={e => selectInvoice(r.id, e.target.value)}
                            style={{ border: `1px solid ${r.invoice ? "#86EFAC" : "#D1D5DB"}`, borderRadius: 6, padding: "3px 6px", fontSize: 11, width: "100%", fontFamily: "inherit", background: r.invoice ? "#F0FDF4" : "#fff", cursor: "pointer" }}>
                            <option value="">— เลือก Invoice —</option>
                            {invList.map(inv => (
                              <option key={inv.docnum} value={inv.docnum}>
                                {inv.docnum} | ค้าง {fmt(inv.remamt)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: "#9CA3AF", fontSize: 11 }}>เลือกลูกค้าก่อน</span>
                        )}
                      </td>
                      {/* เลขที่ RE */}
                      <td style={{ padding: "8px 10px" }}>
                        <input value={r.rcpnum}
                          onChange={e => updateRow(r.id, { rcpnum: e.target.value })}
                          style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "3px 8px", fontSize: 11, width: 110, fontFamily: "inherit" }} />
                      </td>
                      {/* WHT */}
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <input type="number" value={r.whtamt} min={0}
                          onChange={e => updateRow(r.id, { whtamt: Number(e.target.value) })}
                          style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "3px 6px", fontSize: 11, width: 72, textAlign: "right", fontFamily: "inherit" }} />
                      </td>
                      {/* ค่าธรรมเนียม */}
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <input type="number" value={r.fee} min={0}
                          onChange={e => updateRow(r.id, { fee: Number(e.target.value) })}
                          style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "3px 6px", fontSize: 11, width: 72, textAlign: "right", fontFamily: "inherit" }} />
                      </td>
                      {/* สถานะ */}
                      <td style={{ padding: "8px 10px" }}>
                        <MatchBadge type={r.matchType} confidence={r.confidence} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer summary */}
              <tfoot>
                <tr style={{ background: "#F9FAFB", borderTop: "2px solid #E5E7EB" }}>
                  <td colSpan={2} style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700 }}>รวม {selectedRows.length} รายการ</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#1D4ED8" }}>
                    {fmt(selectedRows.reduce((s, r) => s + r.txn.amount, 0))}
                  </td>
                  <td colSpan={9} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* คำอธิบาย */}
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#F0F9FF", borderRadius: 8, fontSize: 11, color: "#0369A1", lineHeight: 1.7 }}>
            <strong>หมายเหตุ:</strong> รายการ &ldquo;จับคู่แล้ว&rdquo; จะตัดยอดลูกหนี้ตามใบแจ้งหนี้ | รายการ &ldquo;บัญชีพัก&rdquo; จะบันทึกเข้าบัญชีพักรอจับคู่ภายหลัง | แก้ไขเลขที่ RE / WHT / ค่าธรรมเนียม ได้ก่อนกด Import
          </div>
        </div>
      )}

      {/* Done */}
      {step === "done" && result && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
          <div style={{
            background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10,
            padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>✅</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#15803D" }}>นำเข้าเสร็จสมบูรณ์</div>
                <div style={{ fontSize: 12, color: "#166534", marginTop: 2 }}>
                  สำเร็จ {result.success} รายการ
                  {result.skipped > 0 ? ` · ซ้ำ ${result.skipped}` : ""}
                  {result.errors > 0 ? ` · ผิดพลาด ${result.errors}` : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ background: "#DCFCE7", color: "#166534", padding: "4px 14px", borderRadius: 20, fontWeight: 700, fontSize: 12 }}>✓ {result.success}</span>
              {result.errors > 0 && <span style={{ background: "#FEE2E2", color: "#991B1B", padding: "4px 14px", borderRadius: 20, fontWeight: 700, fontSize: 12 }}>✕ {result.errors}</span>}
            </div>
          </div>
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button onClick={reset} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: "#3B82F6", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              นำเข้า Statement ใหม่
            </button>
          </div>
        </div>
      )}

      {/* Import Button */}
      {step === "matching" && (
        <button
          disabled={selectedRows.length === 0}
          onClick={handleImport}
          style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: selectedRows.length > 0 ? "#3B82F6" : "#E5E7EB",
            color: selectedRows.length > 0 ? "#fff" : "#9CA3AF",
            fontSize: 14, fontWeight: 700,
            cursor: selectedRows.length > 0 ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}>
          🏦 นำเข้า {selectedRows.length} รายการ
          {matchedCount > 0 && ` · ตัดหนี้ ${matchedCount}`}
          {unmatchedCount > 0 && ` · บัญชีพัก ${unmatchedCount}`}
        </button>
      )}

      {step === "importing" && (
        <button disabled style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#E5E7EB", color: "#9CA3AF", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>
          ⏳ กำลังนำเข้า...
        </button>
      )}
    </div>
  );
}
