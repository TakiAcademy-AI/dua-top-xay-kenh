import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { jsonError } from "@/lib/api";
import { autoStartCampaigns } from "@/lib/scoring";
import { todayVN } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Trang riêng của một lớp: thông tin lớp, các chiến dịch của lớp, BXH chiến dịch đang chạy. Public. */
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const db = supabaseAdmin();
  await autoStartCampaigns(todayVN());
  const { data: cls } = await db
    .from("classes")
    .select("id, name, code")
    .ilike("code", params.code)
    .maybeSingle();
  if (!cls) return jsonError("Không tìm thấy lớp", 404);

  const { data: links } = await db.from("campaign_classes").select("campaign_id").eq("class_id", cls.id);
  const campIds = (links ?? []).map((l) => l.campaign_id);

  let campaigns: any[] = [];
  if (campIds.length) {
    const { data } = await db
      .from("campaigns")
      .select("id, name, prize, prizes, status, start_date, end_date, registration_deadline")
      .in("id", campIds)
      .order("start_date", { ascending: false });
    campaigns = data ?? [];
  }

  const { count: studentCount } = await db
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("class_id", cls.id)
    .eq("status", "active");

  // BXH của chiến dịch đang chạy/mở gần nhất của lớp
  const primary = campaigns.find((c) => ["running", "open"].includes(c.status)) ?? null;
  let leaderboard: any[] = [];
  if (primary) {
    const { data: rows } = await db
      .from("campaign_participants")
      .select("student_id, total_score, current_rank, prev_rank, students!inner(public_id, full_name, status)")
      .eq("campaign_id", primary.id)
      .limit(200);
    leaderboard = (rows ?? [])
      .filter((r: any) => r.students?.status === "active")
      .map((r: any) => ({
        student_id: r.student_id,
        rank: r.current_rank,
        prev_rank: r.prev_rank,
        name: r.students.full_name,
        public_id: r.students.public_id,
        total_score: Number(r.total_score),
      }))
      .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
      .slice(0, 50);
  }

  return NextResponse.json(
    {
      class: { id: cls.id, name: cls.name, code: cls.code, students: studentCount ?? 0 },
      campaigns,
      primary_campaign: primary,
      leaderboard,
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
  );
}
