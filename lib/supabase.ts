import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Client service-role, chỉ dùng phía server (API routes / cron). */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      // Next.js App Router cache mặc định các fetch GET (Data Cache) khiến API đọc DB
      // trả dữ liệu cũ dù route đã force-dynamic. Ép no-store cho mọi truy vấn Supabase.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cached;
}
