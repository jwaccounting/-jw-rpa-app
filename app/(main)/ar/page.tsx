"use client";
/**
 * app/ar/page.tsx — หน้านำเข้า AR (IN/RE)
 * วางไว้ที่: C:\Users\Asus\jw-accounting-app\app\ar\page.tsx
 */

import { useState, useRef } from "react";
import {
  importIN, importRE, getOpenInvoices,
  parseINExcel, parseREExcel,
  InvoiceRow, ReceiptRow, OpenInvoice, ArImportResult,
} from "@/lib/arApi";

type Tab = "in" | "re";

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default function ArPage() {
  const [tab, setTab]         = useState<Tab>("in");

  // IN state
  const [inFile, setInFile]   = useState<File | null>(null);
  const [inRows, setInRows]   = useState<InvoiceRow[]>([]);
  const [inRes,  setInRes]    = useState<ArImportResult | null>(null);
  const [inLoading, setInL]   = useState(false);
  const inRef = useRef<HTMLInputElement>(null);

  // RE state
  const [reFile, setReFile]   = useState<File | null>(null);
  const [reRows, setReRows]   = useState<ReceiptRow[]>([]);
  const [reRes,  setReRes]    = useState<ArImportResult | null>(null);
  const [reLoading, setReL]   = useState(false);
  const reRef = useRef<HTMLInputElement>(null);

  // Open AR
  const [openAR, setOpenAR]   = useState<OpenInvoice[]>([]);
  const [openLoading, setOL]  = useState(false);
  const [cusFilter, setCus]   = useState("");

  const [error, setError]     = useState("");

  // ── IN handlers ─────────────────────────────────────────────
  async function handleInFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setInFile(f); setInRes(null); setError("");
    try {
      const rows = await parseINExcel(f);
      setInRows(rows);
    } catch (err: unknown) {
      setError(String(err));
    }
  }

  async function handleInImport() {
    if (!inRows.length) return;
    setInL(true); setError("");
    try {
      const res = await importIN(inRows);
      setInRes(res);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setInL(false);
    }
  }

  // ── RE handlers ─────────────────────────────────────────────
  async function handleReFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setReFile(f); setReRes(null); setError("");
    try {
      const rows = await parseREExcel(f);
      setReRows(rows);
    } catch (err: unknown) {
      setError(String(err));
    }
  }

  async function handleReImport() {
    if (!reRows.length) return;
    setReL(true); setError("");
    try {
      const res = await importRE(reRows);
      setReRes(res);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setReL(false);
    }
  }

  // ── Open AR ────────────────────────────────────────────────
  async function handleOpenAR() {
    setOL(true); setError("");
    try {
      const list = await getOpenInvoices(cusFilter || undefined);
      setOpenAR(list);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setOL(false);
    }
  }

  // ── UI ──────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-blue-900 mb-6">
        นำเข้า AR — ใบแจ้งหนี้ & รับชำระหนี้
      </h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["in","re"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-full font-medium text-sm transition-all ${
              tab === t
                ? "bg-blue-700 text-white shadow"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}>
            {t === "in" ? "📄 ใบแจ้งหนี้ (IN)" : "💰 รับชำระหนี้ (RE)"}
          </button>
        ))}
      </div>

      {/* ── IN Tab ── */}
      {tab === "in" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-3">1. เลือกไฟล์ IN_template.xlsx</h2>
            <input ref={inRef} type="file" accept=".xlsx" onChange={handleInFile} className="hidden" />
            <button onClick={() => inRef.current?.click()}
              className="px-4 py-2 bg-blue-50 border border-blue-300 rounded-lg text-blue-700 hover:bg-blue-100 text-sm">
              📂 เลือกไฟล์ Excel
            </button>
            {inFile && <span className="ml-3 text-sm text-gray-500">{inFile.name}</span>}
          </div>

          {inRows.length > 0 && (
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="font-semibold text-gray-700 mb-3">
                2. ตรวจสอบข้อมูล ({inRows.length} ใบ)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-blue-900 text-white">
                      {["เลขที่","วันที่","ลูกค้า","อ้างอิง","VAT","รายการ","ยอดรวม"].map(h => (
                        <th key={h} className="px-3 py-2 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inRows.map((r, i) => {
                      const total = r.items.reduce((s, it) => s + it.trnval, 0);
                      return (
                        <tr key={i} className={i%2===0?"bg-gray-50":""}>
                          <td className="px-3 py-1.5 font-mono">{r.docnum}</td>
                          <td className="px-3 py-1.5">{r.docdat}</td>
                          <td className="px-3 py-1.5">{r.cuscod}</td>
                          <td className="px-3 py-1.5">{r.youref}</td>
                          <td className="px-3 py-1.5 text-center">{r.flgvat==="2"?"รวม":"แยก"}</td>
                          <td className="px-3 py-1.5 text-center">{r.items.length}</td>
                          <td className="px-3 py-1.5 text-right">{fmt(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <button onClick={handleInImport} disabled={inLoading}
                  className="px-6 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 font-medium">
                  {inLoading ? "กำลังนำเข้า..." : "✅ นำเข้า Express"}
                </button>
              </div>
            </div>
          )}

          {inRes && (
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="font-semibold text-gray-700 mb-3">3. ผลลัพธ์</h2>
              <div className="flex gap-4 mb-3">
                <span className="text-green-600 font-medium">✅ สำเร็จ {inRes.success}</span>
                <span className="text-yellow-600 font-medium">⏭ ซ้ำ {inRes.skipped}</span>
                <span className="text-red-600 font-medium">❌ ผิดพลาด {inRes.error}</span>
              </div>
              <div className="space-y-1 text-sm max-h-48 overflow-y-auto">
                {inRes.details.map((d, i) => (
                  <div key={i} className={`flex gap-3 px-2 py-1 rounded ${
                    d.status==="ok"?"bg-green-50 text-green-800":
                    d.status==="dup"?"bg-yellow-50 text-yellow-800":"bg-red-50 text-red-800"
                  }`}>
                    <span className="font-mono">{d.docnum}</span>
                    <span>{d.status==="ok"?"สำเร็จ":d.status==="dup"?"ซ้ำ (ข้าม)":d.msg}</span>
                    {d.netamt && <span className="ml-auto">{fmt(d.netamt)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RE Tab ── */}
      {tab === "re" && (
        <div className="space-y-4">
          {/* Open AR lookup */}
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
            <h2 className="font-semibold text-blue-800 mb-3">🔍 ดูบิล IN ที่ยังค้างชำระ</h2>
            <div className="flex gap-2">
              <input value={cusFilter} onChange={e => setCus(e.target.value)}
                placeholder="รหัสลูกค้า (ว่าง=ทั้งหมด)"
                className="border rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <button onClick={handleOpenAR} disabled={openLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
                {openLoading ? "กำลังโหลด..." : "ค้นหา"}
              </button>
            </div>
            {openAR.length > 0 && (
              <div className="mt-3 overflow-x-auto max-h-52 overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-blue-900 text-white">
                    <tr>
                      {["เลขที่","วันที่","ลูกค้า","ยอดรวม","ชำระแล้ว","คงค้าง"].map(h => (
                        <th key={h} className="px-3 py-2 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {openAR.map((r,i) => (
                      <tr key={i} className={i%2===0?"bg-white":"bg-blue-50"}>
                        <td className="px-3 py-1.5 font-mono">{r.docnum}</td>
                        <td className="px-3 py-1.5">{r.docdat?.slice(0,10)}</td>
                        <td className="px-3 py-1.5">{r.cuscod}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(r.netamt)}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(r.rcvamt)}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-blue-700">{fmt(r.remamt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-3">1. เลือกไฟล์ RE_template.xlsx</h2>
            <input ref={reRef} type="file" accept=".xlsx" onChange={handleReFile} className="hidden" />
            <button onClick={() => reRef.current?.click()}
              className="px-4 py-2 bg-blue-50 border border-blue-300 rounded-lg text-blue-700 hover:bg-blue-100 text-sm">
              📂 เลือกไฟล์ Excel
            </button>
            {reFile && <span className="ml-3 text-sm text-gray-500">{reFile.name}</span>}
          </div>

          {reRows.length > 0 && (
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="font-semibold text-gray-700 mb-3">
                2. ตรวจสอบข้อมูล ({reRows.length} ใบ)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-blue-900 text-white">
                      {["เลขที่RE","วันที่","ลูกค้า","วิธีชำระ","ยอดชำระ","WHT","โอนจริง","จับคู่"].map(h => (
                        <th key={h} className="px-3 py-2 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reRows.map((r, i) => {
                      const total  = r.items.reduce((s,it)=>s+it.rcvamt,0);
                      const net_tf = total - r.whtamt;
                      return (
                        <tr key={i} className={i%2===0?"bg-gray-50":""}>
                          <td className="px-3 py-1.5 font-mono">{r.rcpnum}</td>
                          <td className="px-3 py-1.5">{r.rcpdat}</td>
                          <td className="px-3 py-1.5">{r.cuscod}</td>
                          <td className="px-3 py-1.5 text-center">
                            {r.paytyp==="T"?"โอน":r.paytyp==="C"?"เช็ก":"สด"}
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmt(total)}</td>
                          <td className="px-3 py-1.5 text-right text-orange-600">
                            {r.whtamt>0?fmt(r.whtamt):"-"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold">{fmt(net_tf)}</td>
                          <td className="px-3 py-1.5 text-center">{r.items.length} บิล</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <button onClick={handleReImport} disabled={reLoading}
                  className="px-6 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 font-medium">
                  {reLoading ? "กำลังนำเข้า..." : "✅ นำเข้า Express"}
                </button>
              </div>
            </div>
          )}

          {reRes && (
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="font-semibold text-gray-700 mb-3">3. ผลลัพธ์</h2>
              <div className="flex gap-4 mb-3">
                <span className="text-green-600 font-medium">✅ สำเร็จ {reRes.success}</span>
                <span className="text-yellow-600 font-medium">⏭ ซ้ำ {reRes.skipped}</span>
                <span className="text-red-600 font-medium">❌ ผิดพลาด {reRes.error}</span>
              </div>
              <div className="space-y-1 text-sm max-h-48 overflow-y-auto">
                {reRes.details.map((d, i) => (
                  <div key={i} className={`flex gap-3 px-2 py-1 rounded ${
                    d.status==="ok"?"bg-green-50 text-green-800":
                    d.status==="dup"?"bg-yellow-50 text-yellow-800":"bg-red-50 text-red-800"
                  }`}>
                    <span className="font-mono">{d.rcpnum ?? d.docnum}</span>
                    <span>{d.status==="ok"?"สำเร็จ":d.status==="dup"?"ซ้ำ (ข้าม)":d.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
