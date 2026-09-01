/** Tiện ích ngày giờ theo múi giờ Việt Nam + định dạng số vi-VN. */

export function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isSunday(dateStr: string): boolean {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay() === 0;
}

export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("vi-VN");
}

export function fmtDateVN(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

/** Chuẩn hóa SĐT Việt Nam về dạng 0xxxxxxxxx; trả null nếu sai định dạng. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s.\-()]/g, "");
  const m = digits.match(/^(?:\+?84|0)(\d{9})$/);
  if (!m) return null;
  return `0${m[1]}`;
}
