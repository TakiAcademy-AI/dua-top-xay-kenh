import { NextRequest, NextResponse } from "next/server";
import { runDailyScoring } from "@/lib/scoring";
import { checkCronSecret, jsonError } from "@/lib/api";
import { todayVN } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Cron 06:00 (giờ VN) — tính điểm từ snapshots. Truyền ?date=YYYY-MM-DD để tính lại ngày cũ. */
async function handle(req: NextRequest) {
  if (!checkCronSecret(req)) return jsonError("Sai CRON_SECRET", 401);
  const date = req.nextUrl.searchParams.get("date") || todayVN();
  try {
    const report = await runDailyScoring(date);
    return NextResponse.json(report);
  } catch (e: any) {
    console.error("[daily-scoring]", e);
    return jsonError(e.message ?? "Lỗi tính điểm", 500);
  }
}
export const GET = handle;
export const POST = handle;
