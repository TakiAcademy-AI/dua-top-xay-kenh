import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, jsonError } from "@/lib/api";
import { sanitizePrizes } from "@/lib/prizes";

export const dynamic = "force-dynamic";

/**
 * Sửa/đổi trạng thái chiến dịch.
 * - Thông tin + công thức chỉ sửa được khi draft/open (đóng băng khi đã chạy — chống thay luật giữa cuộc đua).
 * - action: pause | resume | finish (kết thúc sớm, UI phải xác nhận 2 bước).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Dữ liệu không hợp lệ");

  const { data: camp } = await db.from("campaigns").select("*").eq("id", params.id).maybeSingle();
  if (!camp) return jsonError("Không tìm thấy chiến dịch", 404);

  if (body.action) {
    const transitions: Record<string, { from: string[]; to: string }> = {
      pause: { from: ["running"], to: "paused" },
      resume: { from: ["paused"], to: "running" },
      finish: { from: ["running", "paused", "open"], to: "finished" },
    };
    const t = transitions[body.action];
    if (!t) return jsonError("action không hợp lệ");
    if (!t.from.includes(camp.status)) return jsonError(`Không thể ${body.action} khi trạng thái là ${camp.status}`);
    await db.from("campaigns").update({ status: t.to }).eq("id", camp.id);
    await db.from("audit_logs").insert({
      actor_id: "admin", action: `campaign_${body.action}`, target_type: "campaign", target_id: camp.id,
      detail: { from: camp.status, to: t.to },
    });
    return NextResponse.json({ ok: true, status: t.to });
  }

  // Chia 2 nhóm trường:
  // - THÔNG TIN (sửa mọi lúc): tên, ngày kết thúc (kéo dài/rút ngắn), hạn chốt đăng ký, giải thưởng
  // - LUẬT CHƠI (đóng băng khi đã bắt đầu — chống thay luật giữa cuộc đua): ngày bắt đầu,
  //   trọng số điểm, chỉ tiêu video/tuần, chuẩn hóa baseline
  const patch: Record<string, unknown> = {};
  if (body.prize !== undefined) patch.prize = body.prize ? String(body.prize).slice(0, 200) : null;
  if (body.prizes !== undefined) patch.prizes = sanitizePrizes(body.prizes);
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return jsonError("Tên chiến dịch không được để trống");
    patch.name = name.slice(0, 200);
  }
  if (body.end_date !== undefined) patch.end_date = body.end_date;
  if (body.registration_deadline !== undefined) patch.registration_deadline = body.registration_deadline || null;

  const RULE_FIELDS = ["start_date", "weekly_quota", "weights", "normalize_by_baseline"] as const;
  const ruleChanged = RULE_FIELDS.filter((f) => {
    if (body[f] === undefined) return false;
    return JSON.stringify(body[f]) !== JSON.stringify(camp[f]);
  });
  const started = !["draft", "open"].includes(camp.status);
  if (ruleChanged.length && started) {
    return jsonError(
      "Chiến dịch đã bắt đầu — luật tính điểm bị đóng băng (ngày bắt đầu, trọng số, chỉ tiêu tuần, chuẩn hóa). " +
      "Tên, ngày kết thúc, hạn đăng ký và giải thưởng vẫn sửa được bình thường."
    );
  }
  for (const f of ruleChanged) patch[f] = body[f];

  // Sửa danh sách lớp áp dụng (mọi lúc — mở rộng đường đua giữa chừng là nhu cầu thật).
  // Bỏ lớp chỉ chặn đăng ký mới; học viên đã ghi danh vẫn giữ nguyên trong chiến dịch.
  let classIds: string[] | null = null;
  if (body.class_ids !== undefined) {
    if (!Array.isArray(body.class_ids)) return jsonError("class_ids phải là danh sách");
    const ids: string[] = body.class_ids.map(String);
    if (camp.scope === "class" && !ids.length) return jsonError("Chiến dịch theo lớp phải có ít nhất 1 lớp");
    classIds = ids;
  }

  if (!Object.keys(patch).length && classIds === null) return jsonError("Không có gì để cập nhật");

  const start = String(patch.start_date ?? camp.start_date);
  const end = String(patch.end_date ?? camp.end_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return jsonError("Ngày không đúng định dạng");
  if (end <= start) return jsonError("Ngày kết thúc phải sau ngày bắt đầu");
  if (patch.weights && Object.values(patch.weights as Record<string, number>).some((v) => !Number.isFinite(Number(v)) || Number(v) < 0)) {
    return jsonError("Trọng số phải là số không âm");
  }
  if (patch.weekly_quota !== undefined && (!Number.isFinite(Number(patch.weekly_quota)) || Number(patch.weekly_quota) < 0)) {
    return jsonError("Chỉ tiêu tuần phải là số không âm");
  }

  if (Object.keys(patch).length) {
    const { error } = await db.from("campaigns").update(patch).eq("id", camp.id);
    if (error) return jsonError("Không cập nhật được", 500);
  }

  if (classIds !== null) {
    await db.from("campaign_classes").delete().eq("campaign_id", camp.id);
    if (classIds.length) {
      const { error: ccErr } = await db
        .from("campaign_classes")
        .insert(classIds.map((class_id) => ({ campaign_id: camp.id, class_id })));
      if (ccErr) return jsonError("Không cập nhật được danh sách lớp", 500);
    }
  }

  await db.from("audit_logs").insert({
    actor_id: "admin", action: "update_campaign", target_type: "campaign", target_id: camp.id,
    detail: { changed: [...Object.keys(patch), ...(classIds !== null ? ["class_ids"] : [])], patch, class_ids: classIds } as any,
  });
  return NextResponse.json({ ok: true });
}
