import { NextRequest, NextResponse } from "next/server";
import { startDailyScrape } from "@/lib/scrape";
import { checkCronSecret, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Cron 05:30 (giờ VN) — quét trực tiếp toàn bộ kênh. */
async function handle(req: NextRequest) {
  if (!checkCronSecret(req)) return jsonError("Sai CRON_SECRET", 401);
  try {
    const result = await startDailyScrape();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[daily-scrape]", e);
    return jsonError(e.message ?? "Lỗi khởi chạy quét", 500);
  }
}
export const GET = handle;
export const POST = handle;
