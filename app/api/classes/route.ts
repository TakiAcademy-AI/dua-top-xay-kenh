import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();
  const { data } = await db.from("classes").select("id, name").eq("is_active", true).order("name");
  return NextResponse.json({ classes: data ?? [] });
}
