import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { jsonError } from "@/lib/api";
import { setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = String(body?.password ?? "");
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return jsonError("Chưa cấu hình ADMIN_PASSWORD trong .env.local", 500);
  const a = crypto.createHash("sha256").update(password).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return jsonError("Sai mật khẩu", 401);
  setSession({ role: "admin" });
  return NextResponse.json({ ok: true });
}
