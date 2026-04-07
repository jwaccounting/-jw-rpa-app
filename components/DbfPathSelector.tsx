"use client";

/**
 * DbfPathSelector.tsx
 * ──────────────────────────────────────────────────────────────────
 * วิธีใช้:
 *   <DbfPathSelector currentPath={dbfPath} onPathChange={setDbfPath} />
 *
 * Endpoints ที่ใช้ (ผ่าน Next.js proxy /api/agent/...):
 *   GET  /browse-folder  → เปิด Windows folder picker (subprocess tkinter)
 *   GET  /list-drives    → list drives/folders สำหรับ web browser
 *   POST /validate-path  → ตรวจสอบว่ามี DBF ไหม
 *   POST /set-path       → บันทึก path ใหม่
 * ──────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen, FolderSearch, Check, X, Loader2,
  AlertTriangle, ChevronRight, ChevronLeft,
  Database, HardDrive, Keyboard,
} from "lucide-react";

interface FolderItem {
  name: string;
  path: string;
  type: "drive" | "folder";
}

interface PathSelectorProps {
  currentPath: string;
  onPathChange?: (newPath: string) => void;
}

type Mode = "idle" | "browsing" | "web" | "manual" | "confirm" | "saving";

// เรียก agent โดยตรงจาก browser → ใช้ได้ทั้ง localhost และ Vercel deployment
// Chrome/Edge อนุญาต http://localhost จาก HTTPS เป็นกรณีพิเศษ
const AGENT_BASE =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "http://localhost:9999"
    : "/api/agent";
const agent = (path: string) => `${AGENT_BASE}${path}`;
const shortPath = (p: string, max = 38) =>
  !p ? "—" : p.length > max ? "…" + p.slice(-(max - 1)) : p;

export default function DbfPathSelector({ currentPath, onPathChange }: PathSelectorProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [pendingPath, setPendingPath] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const [pathValid, setPathValid] = useState<null | boolean>(null);

  // Web folder browser state
  const [browserPath, setBrowserPath] = useState("");
  const [browserItems, setBrowserItems] = useState<FolderItem[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserHasDbf, setBrowserHasDbf] = useState(false);
  const [browserHistory, setBrowserHistory] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setMode("idle");
    setPendingPath("");
    setManualInput("");
    setError("");
    setPathValid(null);
    setBrowserItems([]);
    setBrowserPath("");
    setBrowserHistory([]);
  }, []);

  /* ── 1. เปิด Windows tkinter dialog ────────────────────────── */
  const handleBrowseNative = useCallback(async () => {
    setMode("browsing");
    setError("");
    try {
      const res = await fetch(agent("/browse-folder"));
      if (!res.ok) throw new Error(`Agent ตอบ HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.success || !data.path) { setMode("idle"); return; }
      setPendingPath(data.path);
      setMode("confirm");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เชื่อมต่อ Agent ไม่ได้");
      setMode("idle");
    }
  }, []);

  /* ── 2. Web-based folder browser ───────────────────────────── */
  const loadBrowserItems = useCallback(async (path: string) => {
    setBrowserLoading(true);
    setBrowserHasDbf(false);
    try {
      const url = path
        ? agent(`/list-drives?path=${encodeURIComponent(path)}`)
        : agent("/list-drives");
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBrowserItems(data.items || []);
      setBrowserPath(data.path || "");
      setBrowserHasDbf(!!data.has_dbf);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "โหลด folder ไม่ได้");
    } finally {
      setBrowserLoading(false);
    }
  }, []);

  const openWebBrowser = useCallback(() => {
    setMode("web");
    setError("");
    loadBrowserItems("");
  }, [loadBrowserItems]);

  const browseInto = useCallback((path: string) => {
    setBrowserHistory((h) => [...h, browserPath]);
    loadBrowserItems(path);
  }, [browserPath, loadBrowserItems]);

  const browseBack = useCallback(() => {
    const prev = browserHistory[browserHistory.length - 1] ?? "";
    setBrowserHistory((h) => h.slice(0, -1));
    loadBrowserItems(prev);
  }, [browserHistory, loadBrowserItems]);

  const selectFromBrowser = useCallback((path: string) => {
    setPendingPath(path);
    setMode("confirm");
  }, []);

  /* ── 3. Manual UNC/local path ──────────────────────────────── */
  const openManual = useCallback(() => {
    setManualInput(currentPath || "");
    setMode("manual");
    setTimeout(() => inputRef.current?.select(), 50);
  }, [currentPath]);

  /* ── validate path ──────────────────────────────────────────── */
  const validatePath = useCallback(async (path: string) => {
    if (!path) return;
    setValidating(true);
    setPathValid(null);
    try {
      const res = await fetch(agent("/validate-path"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      setPathValid(!!data.valid);
    } catch { setPathValid(null); }
    finally { setValidating(false); }
  }, []);

  useEffect(() => {
    if (mode === "confirm" && pendingPath) validatePath(pendingPath);
  }, [mode, pendingPath, validatePath]);

  /* ── 4. ยืนยันบันทึก ────────────────────────────────────────── */
  const handleConfirm = useCallback(async () => {
    setMode("saving");
    try {
      const res = await fetch(agent("/set-path"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbf_path: pendingPath }),
      });
      if (!res.ok) throw new Error(`Agent ตอบ HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onPathChange?.(pendingPath);
      reset();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setMode("confirm");
    }
  }, [pendingPath, onPathChange, reset]);

  const handleManualSubmit = useCallback(() => {
    const p = manualInput.trim();
    if (!p) return;
    setPendingPath(p.replace(/\//g, "\\").replace(/\\+$/, "") + "\\");
    setMode("confirm");
  }, [manualInput]);

  /* ══════════════════════════════════════════════════════════════ */
  /* RENDER                                                         */
  /* ══════════════════════════════════════════════════════════════ */

  if (mode === "idle") return (
    <div className="flex items-center gap-2 flex-wrap">
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200
                   bg-white/80 text-gray-700 text-sm font-mono shadow-sm"
        title={currentPath}
      >
        <Database size={13} className="text-blue-400 shrink-0" />
        <span className="max-w-[200px] truncate leading-none">{shortPath(currentPath)}</span>
      </div>

      {/* เปิด Windows dialog */}
      <button
        onClick={handleBrowseNative}
        title="เปิด Windows folder picker"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                   bg-blue-600 text-white hover:bg-blue-700 active:scale-95
                   transition-all duration-150 shadow-sm"
      >
        <FolderOpen size={14} />
        เลือกโฟลเดอร์
      </button>

      {/* Web browser */}
      <button
        onClick={openWebBrowser}
        title="เบราซ์โฟลเดอร์ในเว็บ"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                   bg-white border border-gray-200 text-gray-600
                   hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700
                   active:scale-95 transition-all duration-150 shadow-sm"
      >
        <FolderSearch size={14} />
        เบราซ์
      </button>

      {/* พิมพ์เอง */}
      <button
        onClick={openManual}
        title="พิมพ์ UNC path เอง เช่น \\Server\Share"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                   bg-white border border-gray-200 text-gray-600
                   hover:bg-gray-50 active:scale-95 transition-all duration-150 shadow-sm"
      >
        <Keyboard size={14} />
        พิมพ์เอง
      </button>

      {error && (
        <span className="flex items-center gap-1 text-xs text-red-500">
          <AlertTriangle size={12} />{error}
        </span>
      )}
    </div>
  );

  if (mode === "browsing") return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-blue-200
                    bg-blue-50 text-blue-700 text-sm shadow-sm">
      <Loader2 size={15} className="animate-spin shrink-0" />
      <span>กำลังเปิด Windows folder picker…</span>
      <span className="text-blue-400 text-xs">(โปรดเลือกโฟลเดอร์ในหน้าต่างที่เปิดขึ้น)</span>
    </div>
  );

  if (mode === "saving") return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-green-200
                    bg-green-50 text-green-700 text-sm shadow-sm">
      <Loader2 size={15} className="animate-spin shrink-0" />
      <span>กำลังบันทึก…</span>
    </div>
  );

  if (mode === "manual") return (
    <div className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200
                    bg-white shadow-sm w-full max-w-lg">
      <div className="text-xs text-gray-500 font-medium">
        พิมพ์ path ที่เก็บข้อมูล Express (รองรับ UNC เช่น \\Server2\f\ExpressI\Autokey)
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
          placeholder={`Z:\\Aulgor\\  หรือ  \\\\Server\\Share\\Folder`}
          className="flex-1 px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
        <button
          onClick={handleManualSubmit}
          disabled={!manualInput.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white
                     hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                     active:scale-95 transition-all"
        >
          ตกลง
        </button>
        <button
          onClick={reset}
          className="p-2 rounded-lg border border-gray-200 text-gray-500
                     hover:bg-gray-50 active:scale-95 transition-all"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );

  if (mode === "web") return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white
                    shadow-md w-full max-w-md overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <button
          onClick={browseBack}
          disabled={browserHistory.length === 0}
          className="p-1 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30
                     disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 text-xs font-mono text-gray-600 truncate">
          {browserPath || "เลือก Drive"}
        </div>
        {browserHasDbf && (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium
                           bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
            <Database size={10} />มีไฟล์ DBF
          </span>
        )}
        <button onClick={reset} className="p-1 rounded text-gray-400 hover:text-gray-600">
          <X size={15} />
        </button>
      </div>

      {/* folder list */}
      <div className="max-h-64 overflow-y-auto">
        {browserLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" />กำลังโหลด…
          </div>
        ) : browserItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">ไม่มีโฟลเดอร์</div>
        ) : (
          browserItems.map((item) => (
            <button
              key={item.path}
              onClick={() => browseInto(item.path)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                         hover:bg-blue-50 border-b border-gray-50 transition-colors group"
            >
              {item.type === "drive"
                ? <HardDrive size={15} className="text-blue-400 shrink-0" />
                : <FolderOpen size={15} className="text-amber-400 shrink-0" />}
              <span className="flex-1 truncate font-mono text-xs">{item.name}</span>
              <ChevronRight size={13} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
            </button>
          ))
        )}
      </div>

      {/* footer */}
      {browserPath && (
        <div className="px-3 py-2 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => selectFromBrowser(browserPath)}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg
                        text-sm font-medium transition-all active:scale-[0.98]
                        ${browserHasDbf
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-200 text-gray-500 hover:bg-gray-300"}`}
          >
            <Check size={14} />
            {browserHasDbf ? "เลือกโฟลเดอร์นี้" : "เลือกโฟลเดอร์นี้ (ไม่พบ DBF)"}
          </button>
        </div>
      )}
    </div>
  );

  if (mode === "confirm") return (
    <div className="flex flex-col gap-2 p-3 rounded-xl border border-amber-200
                    bg-amber-50 shadow-sm w-full max-w-lg">
      <div className="text-xs font-medium text-amber-700">ยืนยันการเปลี่ยนที่เก็บข้อมูล</div>

      <div className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-200
                      rounded-lg font-mono text-xs text-gray-700">
        <FolderOpen size={13} className="text-amber-500 shrink-0" />
        <span className="flex-1 truncate">{pendingPath}</span>
        {validating && <Loader2 size={12} className="animate-spin text-gray-400 shrink-0" />}
        {!validating && pathValid === true && (
          <span className="flex items-center gap-1 text-green-600 text-xs shrink-0">
            <Database size={11} />พบ DBF ✓
          </span>
        )}
        {!validating && pathValid === false && (
          <span className="flex items-center gap-1 text-orange-500 text-xs shrink-0">
            <AlertTriangle size={11} />ไม่พบ DBF
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle size={12} />{error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
                     text-sm font-medium bg-blue-600 text-white hover:bg-blue-700
                     active:scale-95 transition-all"
        >
          <Check size={14} />ยืนยัน
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-500
                     hover:bg-gray-50 active:scale-95 transition-all"
        >
          <X size={15} />
        </button>
      </div>

      {pathValid === false && (
        <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200
                        rounded-lg px-3 py-2">
          ⚠️ ไม่พบไฟล์ DBF ในโฟลเดอร์นี้ — ถ้าแน่ใจว่าถูกต้องกด "ยืนยัน" ได้เลย
        </div>
      )}
    </div>
  );

  return null;
}
