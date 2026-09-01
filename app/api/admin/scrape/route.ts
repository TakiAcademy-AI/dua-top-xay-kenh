import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, jsonError } from "@/lib/api";
import { startDailyScrape } from "@/lib/apify";
import { runDailyScoring } from "@/lib/scoring";
import { todayVN } from "@/lib/format";
import { PLATFORMS } from "@/lib/channels";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Cổng kết nối Apify: trạng thái token, cấu hình Actor, nhật ký run + chi phí, cảnh báo kênh. */
export async function GET() {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();
  const today = todayVN();

  const { data: configs } = await db.from("platform_configs").select("*").order("platform");
  const { data: runs } = await db
    .from("scrape_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  // Chi phí Apify hôm nay + 30 ngày
  const { data: costRows } = await db
    .from("scrape_runs")
    .select("cost_usd, started_at")
    .gte("started_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  let costToday = 0;
  let cost30d = 0;
  for (const r of costRows ?? []) {
    const c = Number(r.cost_usd ?? 0);
    cost30d += c;
    if (String(r.started_at).slice(0, 10) === today) costToday += c;
  }

  // Cảnh báo: kênh đang theo dõi nhưng chưa có snapshot hôm nay + kênh bị gắn cờ
  const { data: channels } = await db
    .from("channels")
    .select("id, platform, username, status, students(public_id, full_name)")
    .in("status", ["pending", "verified", "flagged"]);
  const { data: todaySnaps } = await db
    .from("channel_snapshots")
    .select("channel_id")
    .eq("snapshot_date", today);
  const scanned = new Set((todaySnaps ?? []).map((s) => s.channel_id));

  const fmtCh = (c: any) => ({
    id: c.id,
    platform: c.platform,
    username: c.username,
    status: c.status,
    student: c.students ? `${c.students.full_name} (${c.students.public_id})` : null,
  });
  const notScanned = (channels ?? []).filter((c) => !scanned.has(c.id)).map(fmtCh);
  const flagged = (channels ?? []).filter((c) => c.status === "flagged").map(fmtCh);

  return NextResponse.json({
    token_set: Boolean(process.env.APIFY_TOKEN),
    webhook_secret_set: Boolean(process.env.APIFY_WEBHOOK_SECRET),
    app_url: process.env.APP_URL || "http://localhost:3300",
    today,
    configs: configs ?? [],
    runs: runs ?? [],
    cost: { today: costToday, last_30d: cost30d },
    channels_total: (channels ?? []).length,
    channels_scanned_today: scanned.size,
    not_scanned: notScanned.slice(0, 50),
    flagged,
  });
}

/** Thao tác tay: action=scrape (quét ngay) | score (tính điểm lại hôm nay). */
export async function POST(req: NextRequest) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === "scrape") {
      if (!process.env.APIFY_TOKEN) return jsonError("Chưa có APIFY_TOKEN trong .env.local");
      const result = await startDailyScrape();
      const db = supabaseAdmin();
      await db.from("audit_logs").insert({
        actor_id: "admin", action: "manual_scrape", target_type: "system", detail: result as any,
      });
      return NextResponse.json(result);
    }
    if (body.action === "score") {
      const date = body.date || todayVN();
      const report = await runDailyScoring(date);
      const db = supabaseAdmin();
      await db.from("audit_logs").insert({
        actor_id: "admin", action: "manual_scoring", target_type: "system", detail: report as any,
      });
      return NextResponse.json(report);
    }
    return jsonError("action phải là scrape hoặc score");
  } catch (e: any) {
    console.error("[admin/scrape]", e);
    return jsonError(e.message ?? "Lỗi thao tác", 500);
  }
}

/** Sửa cấu hình Actor theo nền tảng (đổi Actor khi lỗi, bật/tắt nền tảng). */
export async function PATCH(req: NextRequest) {
  const auth = requireAdmin();
  if ("error" in auth) return auth.error;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => null);
  if (!body?.platform || !PLATFORMS.includes(body.platform)) return jsonError("platform không hợp lệ");

  const patch: Record<string, unknown> = {};
  if (body.apify_actor !== undefined) {
    const actor = String(body.apify_actor).trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(actor)) return jsonError("Actor phải dạng ten-tac-gia/ten-actor");
    patch.apify_actor = actor;
  }
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
  if (!Object.keys(patch).length) return jsonError("Không có gì để sửa");

  const { data: existing } = await db
    .from("platform_configs")
    .select("platform")
    .eq("platform", body.platform)
    .maybeSingle();
  if (existing) {
    const { error } = await db.from("platform_configs").update(patch).eq("platform", body.platform);
    if (error) return jsonError("Không lưu được cấu hình", 500);
  } else {
    if (!patch.apify_actor) return jsonError("Nền tảng chưa có cấu hình — cần nhập Actor");
    const { error } = await db.from("platform_configs").insert({ platform: body.platform, ...patch });
    if (error) return jsonError("Không lưu được cấu hình", 500);
  }
  await db.from("audit_logs").insert({
    actor_id: "admin", action: "update_platform_config", target_type: "platform", target_id: body.platform, detail: patch as any,
  });
  return NextResponse.json({ ok: true });
}
