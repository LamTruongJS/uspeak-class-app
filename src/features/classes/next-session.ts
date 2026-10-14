import { parseClassTime } from '@/features/schedule/api';
import { addDays, formatDate, hhmm, isSameDay, startOfDay, WEEKDAY_FULL, WEEKDAY_SHORT } from '@/lib/format';

/**
 * Buổi học kế tiếp của 1 lớp, suy từ `class_time` ("T246 05h00 - 06h00") — class-be không trả từng
 * buổi (xem features/schedule/api.ts), web cũng tự trải lịch như vậy.
 */
export interface NextSession {
  start: Date;
  end: Date;
  /** Đang trong giờ học */
  live: boolean;
  /** Sắp bắt đầu (≤ 15 phút) — nút vào lớp nổi bật hơn */
  soon: boolean;
}

export function nextSession(classTime: string | null | undefined, now: number): NextSession | null {
  const p = parseClassTime(classTime);
  if (!p || !p.days.length) return null;
  const today = startOfDay(new Date(now));
  for (let i = 0; i <= 7; i++) {
    const day = addDays(today, i);
    if (!p.days.includes(day.getDay())) continue;
    const start = new Date(day);
    start.setHours(p.startH, p.startM, 0, 0);
    const end = new Date(day);
    end.setHours(p.endH, p.endM, 0, 0);
    if (end.getTime() <= now) continue;
    const live = start.getTime() <= now;
    return { start, end, live, soon: !live && start.getTime() - now <= 15 * 60_000 };
  }
  return null;
}

/** "Hôm nay" / "Ngày mai" / "Thứ sáu, 17/10" */
export function sessionDayLabel(start: Date, now: number) {
  const today = new Date(now);
  if (isSameDay(start, today)) return 'Hôm nay';
  if (isSameDay(start, addDays(startOfDay(today), 1))) return 'Ngày mai';
  return `${WEEKDAY_FULL[start.getDay()]}, ${formatDate(start).slice(0, 5)}`;
}

/** "Còn 2 giờ 15 phút" — chỉ khi trong vòng 24 giờ, xa hơn thì nhãn ngày đã đủ. */
export function countdownLabel(s: NextSession, now: number) {
  if (s.live) return 'Đang diễn ra';
  const mins = Math.max(1, Math.round((s.start.getTime() - now) / 60_000));
  if (mins >= 24 * 60) return null;
  if (mins < 60) return `Bắt đầu sau ${mins} phút`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Còn ${h} giờ${m ? ` ${m} phút` : ''}`;
}

/** "T2 · T4 · T6" + "05:00 – 06:00" để hiện lịch học gọn hơn chuỗi gốc "T246 05h00 - 06h00". */
export function scheduleParts(classTime: string | null | undefined) {
  const p = parseClassTime(classTime);
  if (!p) return null;
  const days = [...p.days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)).map((d) => WEEKDAY_SHORT[d]);
  return { days, time: `${hhmm(p.startH, p.startM)} – ${hhmm(p.endH, p.endM)}` };
}
