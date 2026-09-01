import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Chiến dịch đang mở/đang chạy mới nhất + số liệu hero cho trang đăng ký (public). */
export async function GET() {
  const db = supabaseAdmin();
  const { data: camp } = await db
    .from("campaigns")
    .select("id, name, prize, start_date, end_date, registration_deadline, status, campaign_classes(classes(name))")
    .in("status", ["open", "running"])
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!camp) return NextResponse.json({ campaign: null });

  const { count: students } = await db
    .from("campaign_participants")
    .select("student_id", { count: "exact", head: true })
    .eq("campaign_id", camp.id);

  const { data: parts } = await db
    .from("campaign_participants")
    .select("student_id")
    .eq("campaign_id", camp.id);
  const ids = (parts ?? []).map((p) => p.student_id);
  let channels = 0;
  if (ids.length) {
    const { count } = await db
      .from("channels")
      .select("id", { count: "exact", head: true })
      .in("student_id", ids)
      .neq("status", "removed");
    channels = count ?? 0;
  }

  const classNames = ((camp as any).campaign_classes ?? [])
    .map((cc: any) => cc.classes?.name)
    .filter(Boolean);

  return NextResponse.json({
    campaign: {
      id: camp.id,
      name: camp.name,
      prize: camp.prize,
      end_date: camp.end_date,
      registration_deadline: camp.registration_deadline,
      class_names: classNames,
      students: students ?? 0,
      channels,
    },
  });
}
