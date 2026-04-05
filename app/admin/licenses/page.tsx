"use client";
// ============================================================
// วางไฟล์นี้ที่: E:\jw-rpa-app\app\admin\licenses\page.tsx
// ============================================================

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface License {
  id: string;
  machine_id: string;
  customer_name: string;
  customer_email: string | null;
  is_active: boolean;
  expire_date: string | null;
  plan: string;
  notes: string | null;
  created_at: string;
}

const EMPTY = { machine_id: "", customer_name: "", customer_email: "", plan: "standard", is_active: true, expire_date: "", notes: "" };

export default function AdminLicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [logs, setLogs]         = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"licenses" | "logs">("licenses");
  const [modal, setModal]       = useState(false);
  const [editing, setEditing]   = useState<License | null>(null);
  const [form, setForm]         = useState({ ...EMPTY });
  const [search, setSearch]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: lics }, { data: lg }] = await Promise.all([
      supabase.from("licenses").select("*").order("created_at", { ascending: false }),
      supabase.from("license_logs").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (lics) setLicenses(lics);
    if (lg)   setLogs(lg);
    setLoading(false);
  }

  function notify(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY });
    setModal(true);
  }

  function openEdit(l: License) {
    setEditing(l);
    setForm({
      machine_id: l.machine_id,
      customer_name: l.customer_name,
      customer_email: l.customer_email || "",
      plan: l.plan,
      is_active: l.is_active,
      expire_date: l.expire_date ? l.expire_date.slice(0, 10) : "",
      notes: l.notes || "",
    });
    setModal(true);
  }

  async function save() {
    if (!form.machine_id.trim() || !form.customer_name.trim()) {
      notify("กรุณากรอก Machine ID และชื่อลูกค้า", false);
      return;
    }
    setSaving(true);
    const payload = {
      machine_id:     form.machine_id.trim().toUpperCase(),
      customer_name:  form.customer_name.trim(),
      customer_email: form.customer_email.trim() || null,
      plan:           form.plan,
      is_active:      form.is_active,
      expire_date:    form.expire_date ? new Date(form.expire_date).toISOString() : null,
      notes:          form.notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("licenses").update(payload).eq("id", editing.id)
      : await supabase.from("licenses").insert(payload);
    setSaving(false);
    if (error) { notify(error.message, false); return; }
    notify(editing ? "อัปเดตสำเร็จ ✓" : "เพิ่ม License สำเร็จ ✓");
    setModal(false);
    fetchAll();
  }

  async function toggleActive(l: License) {
    await supabase.from("licenses").update({ is_active: !l.is_active }).eq("id", l.id);
    notify(l.is_active ? "ระงับ License แล้ว" : "เปิดใช้งานแล้ว");
    fetchAll();
  }

  async function remove(id: string) {
    if (!confirm("ยืนยันลบ?")) return;
    await supabase.from("licenses").delete().eq("id", id);
    notify("ลบสำเร็จ");
    fetchAll();
  }

  const filtered = licenses.filter(l =>
    l.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    l.machine_id.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total:    licenses.length,
    active:   licenses.filter(l => l.is_active).length,
    inactive: licenses.filter(l => !l.is_active).length,
    expired:  licenses.filter(l => l.expire_date && new Date(l.expire_date) < new Date()).length,
  };

  const logColor: Record<string, string> = {
    granted: "text-green-700 bg-green-100",
    denied:  "text-red-700 bg-red-100",
    expired: "text-orange-700 bg-orange-100",
  };

  return (
    <div className="min-h-screen bg-slate-50 font-[Sarabun,sans-serif] text-sm">

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium ${toast.ok ? "bg-green-500" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}

      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-gray-800">🔑 จัดการ License (Machine ID)</h1>
          <p className="text-xs text-gray-400">JW Accounting RPA System</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + เพิ่ม License
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            ["ทั้งหมด",   stats.total,    "bg-blue-500"],
            ["ใช้งานได้", stats.active,   "bg-green-500"],
            ["ระงับ",     stats.inactive, "bg-gray-400"],
            ["หมดอายุ",   stats.expired,  "bg-red-400"],
          ].map(([label, val, color]) => (
            <div key={String(label)} className="bg-white rounded-xl border p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white font-bold`}>{val}</div>
              <span className="text-gray-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {(["licenses", "logs"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
              {t === "licenses" ? "🔑 Licenses" : "📋 Activity Log"}
            </button>
          ))}
        </div>

        {/* License Table */}
        {tab === "licenses" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ / Machine ID..."
                className="w-72 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  {["ลูกค้า", "Machine ID", "แพ็กเกจ", "หมดอายุ", "สถานะ", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">กำลังโหลด...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
                ) : filtered.map(l => {
                  const expired = l.expire_date && new Date(l.expire_date) < new Date();
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{l.customer_name}</p>
                        <p className="text-xs text-gray-400">{l.customer_email || "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{l.machine_id}</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${l.plan === "premium" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {l.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {l.expire_date ? (
                          <span className={expired ? "text-red-500" : ""}>
                            {new Date(l.expire_date).toLocaleDateString("th-TH")}
                            {expired && " (หมดแล้ว)"}
                          </span>
                        ) : (
                          <span className="text-gray-400">ไม่มีวันหมดอายุ</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive(l)}
                          className={`px-2 py-1 rounded-full text-xs font-medium ${l.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {l.is_active ? "✓ ใช้งาน" : "✗ ระงับ"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button onClick={() => openEdit(l)} className="text-blue-600 hover:underline">แก้ไข</button>
                          <button onClick={() => remove(l.id)} className="text-red-500 hover:underline">ลบ</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Logs */}
        {tab === "logs" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  {["เวลา", "Machine ID", "Action", "Version"].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400 text-xs">{new Date(l.created_at).toLocaleString("th-TH")}</td>
                    <td className="px-4 py-2"><code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{l.machine_id}</code></td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${logColor[l.action] || "bg-gray-100 text-gray-600"}`}>
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{l.agent_ver || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="font-bold text-gray-800">{editing ? "แก้ไข License" : "เพิ่ม License ใหม่"}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Machine ID *</label>
                <input value={form.machine_id} onChange={e => setForm({ ...form, machine_id: e.target.value })}
                  placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">ชื่อลูกค้า *</label>
                <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })}
                  placeholder="บริษัท ABC จำกัด"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                <input value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })}
                  type="email" placeholder="contact@abc.com"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">แพ็กเกจ</label>
                  <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">วันหมดอายุ</label>
                  <input type="date" value={form.expire_date} onChange={e => setForm({ ...form, expire_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 accent-blue-600" />
                <span className="text-sm text-gray-700">เปิดใช้งาน</span>
              </label>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">หมายเหตุ</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">ยกเลิก</button>
              <button onClick={save} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
