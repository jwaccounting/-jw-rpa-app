"use client";

import { useState, useRef, useCallback } from "react";
import {
  parseDeleteExcel,
  validateDelete,
  executeDelete,
  type DeletePreviewRow,
  type DeleteValidateRow,
} from "@/lib/deleteApi";

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  IN: { bg: "#DBEAFE", color: "#1E40AF" },
  JV: { bg: "#EDE9FE", color: "#5B21B6" },
  PV: { bg: "#FEF3C7", color: "#92400E" },
  RV: { bg: "#D1FAE5", color: "#065F46" },
  SV: { bg: "#F3E8FF", color: "#6B21A8" },
  BW: { bg: "#FCE7F3", color: "#9D174D" },
  UV: { bg: "#F1F5F9", color: "#334155" },
  RE: { bg: "#ECFDF5", color: "#047857" },
};

const DOC_TITLES: Record<string, string> = {
  IN: "ใบแจ้งหนี้ขาย",      JV: "สมุดรายวันทั่วไป",
  PV: "สมุดรายวันจ่าย",      RV: "สมุดรายวันรับ",
  SV: "สมุดรายวันขาย",       BW: "สมุดรายวันถอนเงิน",
  UV: "สมุดรายวันซื้อ",      RE: "รับชำระหนี้",
};

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] ?? { bg: "#F1F5F9", color: "#334155" };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.color, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {type}
    </span>
  );
}

function StatusIcon({ status }: { status: DeleteValidateRow["status"] }) {
  if (status === "ok")   return <span style={{ color: "#16A34A", fontSize: 13 }}>✓</span>;
  if (status === "warn") return <span style={{ color: "#D97706", fontSize: 13 }}>⚠</span>;
  return <span style={{ color: "#DC2626", fontSize: 13 }}>✕</span>;
}

type Step = "upload" | "preview" | "validating" | "validated" | "deleting" | "done";

export default function DeletePage() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [file,      setFile]      = useState<File | null>(null);
  const [dragging,  setDragging]  = useState(false);
  const [rows,      setRows]      = useState<DeletePreviewRow[]>([]);
  const [validated, setValidated] = useState<DeleteValidateRow[]>([]);
  const [selected,  setSelected]  = useState<string[]>([]);
  const [step,      setStep]      = useState<Step>("upload");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [result,    setResult]    = useState<{ deleted: number; errors: number } | null>(null);

  // doctype จาก rows (ใช้ตัวแรก — สมมติ batch เดียวกัน)
  const doctype = rows[0]?.doctype ?? "IN";

  const handleFile = useCallback(async (f: File) => {
    setFile(f); setError(null); setLoading(true);
    try {
      const preview = await parseDeleteExcel(f);
      if (preview.length === 0) throw new Error("ไม่พบรายการในไฟล์ Excel");
      setRows(preview);
      setStep("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการอ่านไฟล์");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleValidate = async () => {
    setStep("validating"); setError(null);
    try {
      const docnums = rows.map(r => r.docNo);
      const results = await validateDelete(doctype, docnums);
      setValidated(results);
      // เลือกเฉพาะที่ ok/warn (ไม่รวม error)
      setSelected(results.filter(r => r.status !== "error").map(r => r.docnum));
      setStep("validated");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ตรวจสอบไม่สำเร็จ");
      setStep("preview");
    }
  };

  const toggleRow = (docnum: string) =>
    setSelected(p => p.includes(docnum) ? p.filter(x => x !== docnum) : [...p, docnum]);
  const toggleAll = () => {
    const selectable = validated.filter(r => r.status !== "error").map(r => r.docnum);
    setSelected(selected.length === selectable.length ? [] : selectable);
  };

  const handleDelete = async () => {
    setStep("deleting"); setError(null);
    try {
      const res = await executeDelete(doctype, selected);
      setResult({ deleted: res.deleted, errors: res.errors });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการลบ");
      setStep("validated");
    }
  };

  const reset = () => {
    setFile(null); setRows([]); setValidated([]); setSelected([]);
    setStep("upload"); setError(null); setResult(null);
  };

  const selectable = validated.filter(r => r.status !== "error");

  return (
    <div style={{ padding: "0 36px 36px" }}>
      {/* Header */}
      <div style={{ background: "#fff", border: "1px solid #FCA5A5", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🗑</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>ลบรายการ</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>อัปโหลด Excel แบบฟอร์มลบเอกสาร — ระบบตรวจสอบและลบออกจาก Express</div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: "#DC2626" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Upload */}
      {step === "upload" && (
        <>
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#991B1B", display: "flex", gap: 8 }}>
            <span>⚠️</span><span>การลบไม่สามารถกู้คืนได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ</span>
          </div>
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 14 }}>อัปโหลดไฟล์ Excel แบบฟอร์มลบเอกสาร</div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{ border: `1.5px dashed ${dragging ? "#DC2626" : "#FECACA"}`, borderRadius: 10, padding: "40px 24px", textAlign: "center", cursor: "pointer", background: dragging ? "#FEF2F2" : "#FFF5F5", transition: "all 0.2s" }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {loading ? (
                <><div style={{ fontSize: 20, marginBottom: 6 }}>⏳</div><div style={{ fontSize: 13, color: "#6B7280" }}>กำลังอ่านรายการ...</div></>
              ) : (
                <><div style={{ fontSize: 28, marginBottom: 8 }}>📂</div><div style={{ fontSize: 13, color: "#9CA3AF" }}>คลิกหรือลาก Excel มาวางที่นี่</div><div style={{ fontSize: 11, color: "#D1D5DB", marginTop: 4 }}>.xlsx, .xlsm</div></>
              )}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "#9CA3AF", lineHeight: 1.8 }}>
              💡 ไฟล์ต้องมีคอลัมน์ <strong>เลขที่เอกสาร</strong> และ <strong>ประเภท</strong> (เช่น IN, PV, RV, BW)
            </div>
          </div>
        </>
      )}

      {/* Preview — อ่านจาก Excel แล้ว รอกด ตรวจสอบ */}
      {step === "preview" && (
        <>
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#15803D", flex: 1 }}>📄 {file?.name}</span>
              <span style={{ fontSize: 12, color: "#86EFAC" }}>พบ {rows.length} รายการ</span>
              <TypeBadge type={doctype} />
              <span onClick={reset} style={{ fontSize: 12, color: "#64748B", cursor: "pointer", textDecoration: "underline" }}>เปลี่ยน</span>
            </div>
          </div>

          {/* รายการ Preview */}
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "8px 16px", background: "#F9FAFB", fontSize: 12, fontWeight: 600, color: "#374151", display: "flex", gap: 12 }}>
              <span style={{ flex: "0 0 150px" }}>เลขที่เอกสาร</span>
              <span style={{ flex: 1 }}>หมายเหตุ</span>
            </div>
            {rows.map((r) => (
              <div key={r.docNo} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", borderTop: "1px solid #F3F4F6" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#2563EB", flex: "0 0 150px" }}>{r.docNo}</span>
                <span style={{ fontSize: 12, color: "#6B7280", flex: 1 }}>{r.desc || "—"}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={reset} style={{ flex: 1, padding: "11px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              ยกเลิก
            </button>
            <button onClick={handleValidate} style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              🔍 ตรวจสอบรายการใน Express
            </button>
          </div>
        </>
      )}

      {/* Validating */}
      {step === "validating" && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#6B7280", fontSize: 14 }}>
          ⏳ กำลังตรวจสอบรายการใน Express...
        </div>
      )}

      {/* Validated — แสดงผลตรวจสอบ เลือกแล้วกดลบ */}
      {(step === "validated" || step === "deleting") && validated.length > 0 && (
        <>
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#15803D", flex: 1 }}>📄 {file?.name}</span>
              <TypeBadge type={doctype} />
              <span style={{ fontSize: 12, color: "#86EFAC" }}>{DOC_TITLES[doctype] ?? doctype}</span>
              <span onClick={reset} style={{ fontSize: 12, color: "#64748B", cursor: "pointer", textDecoration: "underline" }}>เปลี่ยน</span>
            </div>
          </div>

          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#991B1B", display: "flex", gap: 8 }}>
            <span>⚠️</span><span>ตรวจสอบรายการก่อนกดลบ — ติ๊กออกหากไม่ต้องการลบรายการนั้น</span>
          </div>

          {/* Select all */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "10px 10px 0 0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
              <input type="checkbox" checked={selected.length === selectable.length && selectable.length > 0} onChange={toggleAll} style={{ width: 14, height: 14, accentColor: "#DC2626" }} />
              เลือกทั้งหมด
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>{selected.length}/{validated.length} รายการ</span>
          </div>

          <div style={{ border: "1px solid #E5E7EB", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden", marginBottom: 16 }}>
            {/* Header */}
            <div style={{ display: "flex", gap: 12, padding: "7px 16px", background: "#F3F4F6", fontSize: 11, fontWeight: 600, color: "#6B7280" }}>
              <span style={{ width: 24 }}></span>
              <span style={{ flex: "0 0 150px" }}>เลขที่เอกสาร</span>
              <span style={{ flex: "0 0 100px" }}>รหัสลูกค้า</span>
              <span style={{ flex: 1 }}>ชื่อลูกค้า</span>
              <span style={{ flex: "0 0 90px", textAlign: "right" }}>ยอดเงิน</span>
              <span style={{ flex: "0 0 80px", textAlign: "center" }}>สถานะ</span>
            </div>
            {validated.map((r) => (
              <div key={r.docnum} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: selected.includes(r.docnum) ? "#FFF5F5" : r.status === "error" ? "#F9FAFB" : "#fff", borderTop: "1px solid #F3F4F6", opacity: r.status === "error" ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  checked={selected.includes(r.docnum)}
                  disabled={r.status === "error"}
                  onChange={() => toggleRow(r.docnum)}
                  style={{ width: 14, height: 14, accentColor: "#DC2626", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#2563EB", flex: "0 0 150px" }}>{r.docnum}</span>
                <span style={{ fontSize: 12, color: "#374151", flex: "0 0 100px" }}>{r.cuscod || "—"}</span>
                <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>{r.cusname || "—"}</span>
                <span style={{ fontSize: 12, color: "#374151", flex: "0 0 90px", textAlign: "right" }}>
                  {r.netamt > 0 ? r.netamt.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—"}
                </span>
                <span style={{ fontSize: 11, flex: "0 0 80px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <StatusIcon status={r.status} />
                  <span style={{ color: r.status === "ok" ? "#16A34A" : r.status === "warn" ? "#D97706" : "#DC2626" }}>
                    {r.status === "ok" ? "พบในระบบ" : r.status === "warn" ? r.message : "ไม่พบเอกสาร"}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={reset} style={{ flex: 1, padding: "11px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              ยกเลิก
            </button>
            <button
              disabled={selected.length === 0 || step === "deleting"}
              onClick={handleDelete}
              style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none", background: selected.length > 0 && step !== "deleting" ? "#DC2626" : "#E5E7EB", color: selected.length > 0 && step !== "deleting" ? "#fff" : "#9CA3AF", fontSize: 13, fontWeight: 700, cursor: selected.length > 0 && step !== "deleting" ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              {step === "deleting" ? "⏳ กำลังลบ..." : `🗑 ลบ ${selected.length} รายการออกจาก Express`}
            </button>
          </div>
        </>
      )}

      {/* Done */}
      {step === "done" && result && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#15803D", marginBottom: 8 }}>ลบเรียบร้อยแล้ว</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, fontSize: 13, color: "#6B7280", marginBottom: 28 }}>
            <span>✓ ลบสำเร็จ <strong style={{ color: "#15803D" }}>{result.deleted}</strong></span>
            {result.errors > 0 && <span>✕ ผิดพลาด <strong style={{ color: "#DC2626" }}>{result.errors}</strong></span>}
          </div>
          <button onClick={reset} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            ลบรายการเพิ่มเติม
          </button>
        </div>
      )}
    </div>
  );
}
