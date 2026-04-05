"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { importRE, getOpenInvoices, type ReceiptRow, type OpenInvoice } from "@/lib/arApi";

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

interface StatementTxn { date: string; amount: number; description: string; ref: string; channel: string; }

type MatchRow = {
  checked: boolean;
  date: string;
  amount: number;
  description: string;
  ref: string;
  rcpnum: string;
  cuscod: string;
  invDocnum: string;
  whtamt: number;
  fee: number;
};

function genRcpnum(date: string, idx: number): string {
  const parts = date.split("/");
  if (parts.length === 3) {
    const yy = parts[2].slice(-2);
    const mm = parts[1].padStart(2, "0");
    return `ST${yy}${mm}${String(idx + 1).padStart(3, "0")}`;
  }
  return `ST${String(idx + 1).padStart(8, "0")}`;
}

export default function RePage() {
  const pdfRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  const [pdfDrag, setPdfDrag]   = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pendCuscod, setPendCuscod] = useState("PEND");

  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [step, setStep] = useState<"upload"|"match"|"importing"|"done">("upload");
  const [error, setError] = useState<string|null>(null);
  const [result, setResult] = useState<{success:number;skipped:number;errors:number;details:{rcpnum:string;status:string;msg?:string}[]}|null>(null);

  useEffect(() => {
    getOpenInvoices().then(setOpenInvoices).catch(() => {});
  }, []);

  const customers = useMemo(() => {
    const map = new Map<string, string>();
    openInvoices.forEach(inv => { if (!map.has(inv.cuscod)) map.set(inv.cuscod, inv.cusname || ""); });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [openInvoices]);

  const getInvsByCuscod = (cuscod: string) => openInvoices.filter(i => i.cuscod === cuscod);
  const getCustname = (cuscod: string) => customers.find(([cod]) => cod === cuscod)?.[1] ?? "";
  const fmtInput = (n: number) => n === 0 ? "" : n.toLocaleString("th-TH");
  const parseInput = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;

  const matchedCount = rows.filter(r => r.checked && r.cuscod && r.invDocnum).length;
  const pendCount    = rows.filter(r => r.checked && !(r.cuscod && r.invDocnum)).length;
  const allChecked   = rows.length > 0 && rows.every(r => r.checked);

  const handlePdf = useCallback(async (f: File) => {
    setPdfFile(f); setError(null); setAnalyzing(true);
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
      const newRows: MatchRow[] = transactions.map((txn, i) => {
        let cuscod = "", invDocnum = "";
        for (const inv of openInvoices) {
          if (Math.abs(inv.remamt - txn.amount) < 0.5) { cuscod = inv.cuscod; invDocnum = inv.docnum; break; }
        }
        return { checked: true, date: txn.date, amount: txn.amount, description: txn.description, ref: txn.ref, rcpnum: genRcpnum(txn.date, i), cuscod, invDocnum, whtamt: 0, fee: 0 };
      });
      setRows(newRows); setStep("match");
    } catch (e) {
      setError(e instanceof Error && e.name === "AbortError" ? "หมดเวลา" : e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally { setAnalyzing(false); }
  }, [openInvoices]);

  const updateRow = (i: number, patch: Partial<MatchRow>) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const handleImport = async () => {
    setStep("importing"); setError(null);
    const receipts: ReceiptRow[] = rows.filter(r => r.checked).map(r => {
      const inv = openInvoices.find(v => v.docnum === r.invDocnum);
      const rcvamt = inv ? inv.remamt : r.amount;
      const transfer = r.amount - r.whtamt - r.fee;
      return {
        rcpnum: r.rcpnum, rcpdat: r.date, cuscod: r.cuscod || pendCuscod,
        custname: r.description.slice(0, 50), paytyp: "T" as const, bnkcod: "KBANK",
        chqnum: r.ref || r.rcpnum, chqdat: r.date, whtrat: 0, whtamt: r.whtamt, fee: r.fee,
        transfer, suspend: inv ? Math.max(transfer - rcvamt, 0) : transfer,
        remark: r.description.slice(0, 50),
        items: inv ? [{ docnum: inv.docnum, rcvamt, vatamt: 0 }] : [],
      };
    });
    try {
      const res = await importRE(receipts);
      setResult({ success: res.success, skipped: res.skipped ?? 0, errors: res.error ?? 0, details: res.details.map(d => ({ ...d, rcpnum: d.rcpnum ?? "", docnum: d.docnum ?? "" })) });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); setStep("match");
    }
  };

  const reset = () => { setPdfFile(null); setRows([]); setStep("upload"); setError(null); setResult(null); };

  const checkedRows = rows.filter(r => r.checked);

  return (
    <div style={{ padding:"0 36px 36px", fontFamily:"inherit" }}>

      {/* Header */}
      <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:"18px 24px", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:42, height:42, borderRadius:10, background:"#FFF7ED", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:"#EA580C" }}>RE</div>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:"#111827" }}>นำเข้าจาก Bank Statement (KBANK)</div>
            <div style={{ fontSize:12, color:"#6B7280", marginTop:2 }}>PDF Statement → AI วิเคราะห์ → จับคู่ใบแจ้งหนี้ → สร้าง RE อัตโนมัติ</div>
          </div>
          {customers.length > 0 && (
            <div style={{ marginLeft:"auto", fontSize:11, background:"#DCFCE7", color:"#166534", padding:"4px 12px", borderRadius:20, fontWeight:600 }}>
              🔗 Express — {customers.length} ลูกหนี้ / {openInvoices.length} บิล
            </div>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:14 }}>
          <span style={{ fontSize:12, color:"#374151" }}>รหัสลูกค้า (บัญชีพักรายการไม่พบคู่):</span>
          <input value={pendCuscod} onChange={e => setPendCuscod(e.target.value)}
            style={{ border:"1px solid #D1D5DB", borderRadius:6, padding:"4px 10px", fontSize:12, width:90, fontFamily:"inherit" }} />
          <span style={{ fontSize:11, color:"#9CA3AF" }}>ต้องเป็นรหัสลูกค้าที่มีอยู่ใน Express</span>
        </div>
      </div>

      {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, padding:"12px 16px", marginBottom:14, fontSize:13, color:"#DC2626" }}>⚠️ {error}</div>}

      {/* PDF Upload */}
      <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:"20px 24px", marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:12 }}>1. อัปโหลด PDF Statement KBANK</div>
        <div onClick={() => !analyzing && pdfRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setPdfDrag(true); }}
          onDragLeave={() => setPdfDrag(false)}
          onDrop={e => { e.preventDefault(); setPdfDrag(false); const f = e.dataTransfer.files[0]; if (f) handlePdf(f); }}
          style={{ border:`1.5px dashed ${pdfDrag?"#3B82F6":pdfFile?"#22C55E":"#D1D5DB"}`, borderRadius:10, padding:"28px", textAlign:"center", cursor:analyzing?"wait":"pointer", background:pdfDrag?"#EFF6FF":pdfFile?"#F0FDF4":"#FAFAFA", transition:"all 0.2s" }}>
          <input ref={pdfRef} type="file" accept=".pdf" style={{ display:"none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePdf(f); }} />
          {analyzing ? (<><div style={{ fontSize:22, marginBottom:6 }}>🔍</div><div style={{ fontSize:13, color:"#3B82F6", fontWeight:600 }}>AI กำลังวิเคราะห์ Statement...</div><div style={{ fontSize:11, color:"#9CA3AF", marginTop:4 }}>กรุณารอสักครู่</div></>)
          : pdfFile ? (<><div style={{ fontSize:22, marginBottom:4 }}>✅</div><div style={{ fontSize:13, fontWeight:600, color:"#15803D" }}>{pdfFile.name}</div><div style={{ fontSize:11, color:"#86EFAC", marginTop:3 }}>คลิกเพื่อเปลี่ยนไฟล์</div></>)
          : (<><div style={{ fontSize:30, marginBottom:8, color:"#9CA3AF" }}>📄</div><div style={{ fontSize:13, color:"#9CA3AF" }}>คลิกหรือลาก PDF Statement มาวางที่นี่</div><div style={{ fontSize:11, color:"#D1D5DB", marginTop:4 }}>.pdf เท่านั้น</div></>)}
        </div>
      </div>

      {/* Match Table */}
      {(step === "match" || step === "importing") && rows.length > 0 && (
        <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:"20px 24px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#374151" }}>2. ผลการจับคู่รายการ</div>
            <div style={{ display:"flex", gap:8 }}>
              {matchedCount > 0 && <span style={{ fontSize:11, fontWeight:600, background:"#DCFCE7", color:"#166534", padding:"3px 12px", borderRadius:20 }}>✓ จับคู่ {matchedCount}</span>}
              {pendCount > 0   && <span style={{ fontSize:11, fontWeight:600, background:"#FEF9C3", color:"#854D0E", padding:"3px 12px", borderRadius:20 }}>⚠ บัญชีพัก {pendCount}</span>}
              <span style={{ fontSize:11, fontWeight:600, background:"#F3F4F6", color:"#6B7280", padding:"3px 12px", borderRadius:20 }}>รวม {rows.length}</span>
            </div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#F9FAFB", borderBottom:"2px solid #E5E7EB" }}>
                  <th style={{ padding:"8px 10px", textAlign:"center", width:36 }}>
                    <input type="checkbox" checked={allChecked} onChange={e => setRows(prev => prev.map(r => ({ ...r, checked: e.target.checked })))} style={{ cursor:"pointer", accentColor:"#EA580C" }} />
                  </th>
                  {["วันที่","ยอดโอน (บาท)","รายละเอียด Statement","รหัสลูกค้า","ชื่อลูกค้า","Invoice ค้างชำระ","เลขที่ RE","WHT","ค่าธรรมเนียม","สถานะ"].map(h => (
                    <th key={h} style={{ padding:"8px 10px", textAlign:["ยอดโอน (บาท)","WHT","ค่าธรรมเนียม"].includes(h)?"right":"left", color:"#6B7280", fontWeight:600, whiteSpace:"nowrap", borderBottom:"none" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const invOptions = r.cuscod ? getInvsByCuscod(r.cuscod) : [];
                  const matched = !!(r.cuscod && r.invDocnum);
                  return (
                    <tr key={i} style={{ borderBottom:"1px solid #F3F4F6", background: !r.checked ? "#FAFAFA" : matched ? "#F0FDF4" : "#FEFCE8" }}>
                      <td style={{ padding:"8px 10px", textAlign:"center" }}>
                        <input type="checkbox" checked={r.checked} onChange={e => updateRow(i, { checked: e.target.checked })} style={{ cursor:"pointer", accentColor:"#EA580C" }} />
                      </td>
                      <td style={{ padding:"8px 10px", color:"#374151", whiteSpace:"nowrap" }}>{r.date}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:600, whiteSpace:"nowrap" }}>{fmt(r.amount)}</td>
                      <td style={{ padding:"8px 10px", color:"#374151", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.description}>{r.description}</td>
                      <td style={{ padding:"6px 8px", minWidth:130 }}>
                        <select value={r.cuscod} onChange={e => updateRow(i, { cuscod: e.target.value, invDocnum: "" })}
                          style={{ border:"1px solid #D1D5DB", borderRadius:6, padding:"4px 6px", fontSize:11, width:"100%", fontFamily:"inherit" }}>
                          <option value="">— เลือกลูกค้า —</option>
                          {customers.map(([cod]) => <option key={cod} value={cod}>{cod}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:"8px 10px", color:"#374151", fontSize:11, whiteSpace:"nowrap", minWidth:120 }}>
                        {getCustname(r.cuscod) || <span style={{ color:"#D1D5DB" }}>—</span>}
                      </td>
                      <td style={{ padding:"6px 8px", minWidth:200 }}>
                        <select value={r.invDocnum} onChange={e => updateRow(i, { invDocnum: e.target.value })} disabled={!r.cuscod}
                          style={{ border:"1px solid #D1D5DB", borderRadius:6, padding:"4px 6px", fontSize:11, width:"100%", fontFamily:"inherit", background: r.cuscod ? "#fff" : "#F9FAFB", color: r.cuscod ? "#374151" : "#9CA3AF" }}>
                          <option value="">{r.cuscod ? "— เลือก Invoice —" : "เลือกลูกค้าก่อน"}</option>
                          {invOptions.map(inv => <option key={inv.docnum} value={inv.docnum}>{inv.docnum} | ค้าง {fmt(inv.remamt)}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:"6px 8px", minWidth:110 }}>
                        <input value={r.rcpnum} onChange={e => updateRow(i, { rcpnum: e.target.value })}
                          style={{ border:"1px solid #D1D5DB", borderRadius:6, padding:"4px 8px", fontSize:11, width:"100%", fontFamily:"inherit", color:"#EA580C", fontWeight:600 }} />
                      </td>
                      <td style={{ padding:"6px 8px", minWidth:80 }}>
                        <input type="text" value={fmtInput(r.whtamt)} placeholder="0"
                          onChange={e => updateRow(i, { whtamt: parseInput(e.target.value) })}
                          style={{ border:"1px solid #D1D5DB", borderRadius:6, padding:"4px 8px", fontSize:11, width:"100%", fontFamily:"inherit", textAlign:"right" }} />
                      </td>
                      <td style={{ padding:"6px 8px", minWidth:90 }}>
                        <input type="text" value={fmtInput(r.fee)} placeholder="0"
                          onChange={e => updateRow(i, { fee: parseInput(e.target.value) })}
                          style={{ border:"1px solid #D1D5DB", borderRadius:6, padding:"4px 8px", fontSize:11, width:"100%", fontFamily:"inherit", textAlign:"right" }} />
                      </td>
                      <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                        {matched
                          ? <span style={{ fontSize:10, fontWeight:600, background:"#DCFCE7", color:"#166534", padding:"3px 10px", borderRadius:20 }}>✓ จับคู่แล้ว</span>
                          : <span style={{ fontSize:10, fontWeight:600, background:"#FEF9C3", color:"#854D0E", padding:"3px 10px", borderRadius:20 }}>⚠ บัญชีพัก</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:"#F9FAFB", borderTop:"2px solid #E5E7EB" }}>
                  <td colSpan={2} style={{ padding:"8px 10px", fontWeight:700, fontSize:12, color:"#374151" }}>รวม {checkedRows.length} รายการ</td>
                  <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:700 }}>{fmt(checkedRows.reduce((s,r)=>s+r.amount,0))}</td>
                  <td colSpan={8} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Done */}
      {step === "done" && result && (
        <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:"20px 24px", marginBottom:16 }}>
          <div style={{ background:"#F0FDF4", border:"1px solid #86EFAC", borderRadius:10, padding:"16px 20px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:24 }}>✅</span>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:"#15803D" }}>นำเข้าเสร็จสมบูรณ์</div>
                <div style={{ fontSize:12, color:"#166534", marginTop:2 }}>สำเร็จ {result.success} ใบ{result.skipped>0?` · ซ้ำ ${result.skipped} ใบ`:""}{result.errors>0?` · ผิดพลาด ${result.errors} ใบ`:""}</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <span style={{ background:"#DCFCE7", color:"#166534", padding:"4px 14px", borderRadius:20, fontWeight:700, fontSize:12 }}>✓ {result.success}</span>
              {result.skipped>0 && <span style={{ background:"#FEF9C3", color:"#854D0E", padding:"4px 14px", borderRadius:20, fontWeight:700, fontSize:12 }}>⚠ {result.skipped}</span>}
              {result.errors>0  && <span style={{ background:"#FEE2E2", color:"#991B1B", padding:"4px 14px", borderRadius:20, fontWeight:700, fontSize:12 }}>✕ {result.errors}</span>}
            </div>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr style={{ background:"#F9FAFB" }}>{["#","เลขที่ RE","ผล"].map(h=><th key={h} style={{ padding:"8px 12px", textAlign:"left", color:"#6B7280", fontWeight:600, borderBottom:"1px solid #E5E7EB" }}>{h}</th>)}</tr></thead>
            <tbody>
              {result.details.map((d,i)=>(
                <tr key={i} style={{ borderBottom:i<result.details.length-1?"1px solid #F3F4F6":"none", background:d.status==="err"?"#FFF5F5":d.status==="dup"?"#FEFCE8":"#fff" }}>
                  <td style={{ padding:"8px 12px", color:"#9CA3AF" }}>{i+1}</td>
                  <td style={{ padding:"8px 12px", color:"#EA580C", fontWeight:600 }}>{d.rcpnum}</td>
                  <td style={{ padding:"8px 12px" }}>
                    {d.status==="ok"&&<span style={{ fontSize:10, fontWeight:600, background:"#DCFCE7", color:"#166534", padding:"2px 8px", borderRadius:20 }}>✓ นำเข้าแล้ว</span>}
                    {d.status==="dup"&&<span style={{ fontSize:10, fontWeight:600, background:"#FEF9C3", color:"#854D0E", padding:"2px 8px", borderRadius:20 }}>⚠ ซ้ำ</span>}
                    {d.status==="err"&&<><span style={{ fontSize:10, fontWeight:600, background:"#FEE2E2", color:"#991B1B", padding:"2px 8px", borderRadius:20 }}>✕ ผิดพลาด</span>{d.msg&&<span style={{ fontSize:11, color:"#EF4444", marginLeft:6 }}>{d.msg}</span>}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop:20, textAlign:"center" }}>
            <button onClick={reset} style={{ padding:"10px 28px", borderRadius:8, border:"none", background:"#EA580C", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>นำเข้ารายการใหม่</button>
          </div>
        </div>
      )}

      {/* Buttons */}
      {step === "match" && (
        <button disabled={checkedRows.length===0} onClick={handleImport}
          style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:checkedRows.length>0?"#EA580C":"#E5E7EB", color:checkedRows.length>0?"#fff":"#9CA3AF", fontSize:14, fontWeight:700, cursor:checkedRows.length>0?"pointer":"not-allowed", fontFamily:"inherit" }}>
          ⬆ นำเข้า {checkedRows.length} รายการ เข้า Express{matchedCount>0?` (จับคู่ ${matchedCount} · บัญชีพัก ${pendCount})`:""}
        </button>
      )}
      {step === "importing" && (
        <button disabled style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:"#E5E7EB", color:"#9CA3AF", fontSize:14, fontWeight:700, fontFamily:"inherit" }}>⏳ กำลังนำเข้า...</button>
      )}
    </div>
  );
}
