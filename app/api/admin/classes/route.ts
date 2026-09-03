import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Sinh mã lớp từ tên: bỏ dấu, viết hoa, nối bằng gạch ngang. "Minh Trí Kim Cương K13" -> "MINH-TRI-KIM-CUONG-K13" */
function slugifyCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, (m) => (m === "Đ" ? "D" : "d"))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Admin tạo lớp mới (dùng ngay trong form tạo chiến dịch). */
export async function POST(req: NextRequest) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return jsonError("Thiếu tên lớp");
  const code = (String(body.code ?? "").trim() || slugifyCode(name)).toUpperCase();
  if (!code) return jsonError("Mã lớp không hợp lệ");

  const { data: dup } = await db.from("classes").select("id, name, is_active").ilike("code", code).maybeSingle();
  if (dup) return jsonError(`Mã lớp "${code}" đã tồn tại (lớp: ${dup.name})`, 409);

  const { data, error } = await db
    .from("classes")
    .insert({ name, code, is_active: true })
    .select("id, name, code")
    .single();
  if (error || !data) return jsonError(error?.message ?? "Không tạo được lớp", 500);

  return NextResponse.json({ class: data });
}
