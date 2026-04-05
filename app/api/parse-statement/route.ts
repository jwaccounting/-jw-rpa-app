// app/api/parse-statement/route.ts
import { NextRequest, NextResponse } from "next/server";

// ขยาย timeout เป็น 120 วินาที (Claude Vision ใช้เวลานาน)
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { pdfBase64 } = await req.json();
    if (!pdfBase64) return NextResponse.json({ error: "ไม่พบ PDF" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ไม่พบ ANTHROPIC_API_KEY ใน .env.local" }, { status: 500 });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            {
              type: "text",
              text: `อ่าน Bank Statement KBANK นี้และแยกรายการเงินเข้า (credit) ทั้งหมด
ตอบเป็น JSON array เท่านั้น ห้ามมี markdown backtick หรือข้อความอื่นนอกจาก JSON:
[{"date":"DD/MM/YY","amount":number,"description":"ชื่อผู้โอนหรือรายละเอียด","ref":"เลขที่อ้างอิง TXN","channel":"โอน"}]
กฎ:
- date ให้ใช้ format DD/MM/YY โดย YY เป็น พ.ศ. 2 หลัก เช่น 68 แทน 2568
- amount เป็นตัวเลขบาท ไม่มี comma
- เอาเฉพาะรายการเงินเข้า (รับเงิน/เครดิต) เท่านั้น
- ถ้าไม่มีเลขอ้างอิง ให้ ref เป็น string ว่าง ""`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Claude API: ${errText}` }, { status: 500 });
    }

    const data = await response.json();
    const text: string = (data.content ?? [])
      .map((c: { type: string; text?: string }) => (c.type === "text" ? c.text : ""))
      .join("");

    const clean = text.replace(/```json|```/g, "").trim();
    const transactions = JSON.parse(clean);
    return NextResponse.json({ transactions });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
