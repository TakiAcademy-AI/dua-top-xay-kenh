/** Cơ cấu giải thưởng tùy biến của chiến dịch. */

export type Prize = { label: string; reward: string };

/** Làm sạch input từ client: tối đa 10 giải, cắt độ dài, bỏ dòng trống. */
export function sanitizePrizes(input: unknown): Prize[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 10)
    .map((p: any) => ({
      label: String(p?.label ?? "").trim().slice(0, 60),
      reward: String(p?.reward ?? "").trim().slice(0, 200),
    }))
    .filter((p) => p.reward);
}

/** Danh sách giải để hiển thị: ưu tiên cơ cấu chi tiết, fallback về dòng prize cũ. */
export function displayPrizes(prizes: unknown, prize: string | null | undefined): Prize[] {
  const list = sanitizePrizes(prizes);
  if (list.length) return list;
  if (prize?.trim()) return [{ label: "Giải thưởng", reward: prize.trim() }];
  return [];
}
