import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Hồ sơ công khai của học viên (bấm vào một dòng trên bảng xếp hạng).
 * Chỉ trả tên, ID, lớp, kênh, điểm — KHÔNG BAO GIỜ trả số điện thoại.
 */
export async function GET(req: NextRequest) {
  const publicId = req.nextUrl.searchParams.get("public_id")?.trim().toUpperCase();
  if (!publicId) return jsonError("Thiếu public_id");
  const db = supabaseAdmin();

  const { data: student } = await db
    .from("students")
    .select("id, public_id, full_name, status, created_at, classes(name)")
    .eq("public_id", publicId)
    .maybeSingle();
  if (!student || student.status === "locked") return jsonError("Không tìm thấy học viên", 404);

  const { data: channels } = await db
    .from("channels")
    .select("id, platform, username, url, status")
    .eq("student_id", student.id)
    .in("status", ["pending", "verified"])
    .order("created_at");

  const chIds = (channels ?? []).map((c) => c.id);
  const latestByCh = new Map<string, any>();
  if (chIds.length) {
    const { data: snaps } = await db
      .from("channel_snapshots")
      .select("channel_id, snapshot_date, followers, total_views, videos_count")
      .in("channel_id", chIds)
      .order("snapshot_date", { ascending: false })
      .limit(chIds.length * 3);
    for (const s of snaps ?? []) if (!latestByCh.has(s.channel_id)) latestByCh.set(s.channel_id, s);
  }

  const { data: parts } = await db
    .from("campaign_participants")
    .select("campaign_id, total_score, current_rank, campaigns(name, status)")
    .eq("student_id", student.id);

  const { data: entries } = await db
    .from("score_entries")
    .select("campaign_id, metric, points")
    .eq("student_id", student.id);
  const breakdownByCamp = new Map<string, Record<string, number>>();
  for (const e of entries ?? []) {
    if (!breakdownByCamp.has(e.campaign_id)) breakdownByCamp.set(e.campaign_id, {});
    const b = breakdownByCamp.get(e.campaign_id)!;
    b[e.metric] = (b[e.metric] ?? 0) + Number(e.points);
  }

  return NextResponse.json(
    {
      student: {
        public_id: student.public_id,
        full_name: student.full_name,
        class_name: (student as any).classes?.name ?? null,
        joined_at: String(student.created_at).slice(0, 10),
      },
      channels: (channels ?? []).map((c) => {
        const s = latestByCh.get(c.id);
        return {
          platform: c.platform,
          username: c.username,
          url: c.url,
          verified: c.status === "verified",
          followers: s?.followers ?? null,
          total_views: s?.total_views != null ? Number(s.total_views) : null,
          videos_count: s?.videos_count ?? null,
        };
      }),
      participations: (parts ?? []).map((p: any) => ({
        campaign_name: p.campaigns?.name,
        campaign_status: p.campaigns?.status,
        rank: p.current_rank,
        total_score: Number(p.total_score),
        breakdown: Object.fromEntries(
          Object.entries(breakdownByCamp.get(p.campaign_id) ?? {}).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
      })),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
  );
}
