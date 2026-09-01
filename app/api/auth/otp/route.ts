import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { jsonError } from "@/lib/api";
import { setSession } from "@/lib/session";
import { normalizePhone } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * action=send  : sinh OTP 6 số, hiệu lực 5 phút.
 *   V1 chưa nối Zalo OA/SMS — mã in ra log server; nếu OTP_DEV_MODE=true thì trả luôn trong response.
 *   Điểm nối tích hợp Zalo OA: gửi `code` cho `phone` tại chỗ đánh dấu TODO bên dưới.
 * action=verify: kiểm mã, tối đa 5 lần thử, đúng thì set session cookie.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Dữ liệu không hợp lệ");
  const phone = normalizePhone(String(body.phone ?? ""));
  if (!phone) return jsonError("Số điện thoại không đúng định dạng");
  const db = supabaseAdmin();

  const { data: student } = await db.from("students").select("id, status").eq("phone", phone).maybeSingle();
  if (!student) return jsonError("Số điện thoại chưa đăng ký", 404);
  if (student.status === "locked") return jsonError("Tài khoản đang bị khóa, liên hệ admin", 403);

  if (body.action === "send") {
    const code = crypto.randomInt(100000, 999999).toString();
    await db.from("otp_codes").upsert(
      { phone, code, expires_at: new Date(Date.now() + 5 * 60_000).toISOString(), attempts: 0 },
      { onConflict: "phone" }
    );
    // TODO tích hợp Zalo OA / SMS provider: gửi `code` tới `phone` tại đây
    console.log(`[OTP] ${phone} -> ${code}`);
    const dev = process.env.OTP_DEV_MODE === "true";
    return NextResponse.json({ sent: true, ...(dev ? { dev_code: code } : {}) });
  }

  if (body.action === "verify") {
    const code = String(body.code ?? "").trim();
    const { data: otp } = await db.from("otp_codes").select("*").eq("phone", phone).maybeSingle();
    if (!otp || new Date(otp.expires_at).getTime() < Date.now()) return jsonError("Mã OTP đã hết hạn, gửi lại mã mới");
    if (otp.attempts >= 5) return jsonError("Nhập sai quá 5 lần, gửi lại mã mới");
    if (otp.code !== code) {
      await db.from("otp_codes").update({ attempts: otp.attempts + 1 }).eq("phone", phone);
      return jsonError("Mã OTP không đúng");
    }
    await db.from("otp_codes").delete().eq("phone", phone);
    setSession({ role: "student", sid: student.id });
    return NextResponse.json({ ok: true });
  }

  return jsonError("action phải là send hoặc verify");
}
