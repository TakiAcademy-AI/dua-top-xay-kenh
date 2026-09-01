import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Bảng xếp hạng public — không bao giờ trả SĐT. Cache CDN 5 phút. */
export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  if (!campaignId) return jsonError("Thiếu campaign_id");
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("campaign_participants")
    .select("student_id, total_score, current_rank, prev_rank, students!inner(public_id, full_name, class_id, classes(name))")
    .eq("campaign_id", campaignId)
    .order("current_rank", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) return jsonError("Không đọc được bảng xếp hạng", 500);

  const rows = (data ?? [])
    .map((r: any) => ({
      student_id: r.student_id,
      rank: r.current_rank,
      prev_rank: r.prev_rank,
      name: r.students.full_name,
      public_id: r.students.public_id,
      class_name: r.students.classes?.name ?? null,
      total_score: Number(r.total_score),
    }))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));

  return NextResponse.json(
    { rows },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
  );
}
