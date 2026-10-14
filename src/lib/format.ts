/**
 * Định dạng ngày/giờ/tiền kiểu Việt Nam. Tự viết thay cho toLocaleDateString('vi-VN') vì
 * Intl của Hermes trên Android không phải máy nào cũng có đủ locale → ra định dạng Mỹ.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const WEEKDAY_FULL = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 13/10/2026 */
export function formatDate(value?: string | number | Date | null): string {
  const d = value ? toDate(value) : null;
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
}

/** 18:00 */
export function formatTime(value?: string | number | Date | null): string {
  const d = value ? toDate(value) : null;
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
}

/** 18:00 · 13/10/2026 */
export function formatDateTime(value?: string | number | Date | null): string {
  const d = value ? toDate(value) : null;
  return d ? `${formatTime(d)} · ${formatDate(d)}` : '—';
}

/** 1.250.000 ₫ */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`;
}

export function hhmm(h: number, m: number) {
  return `${pad(h)}:${pad(m)}`;
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Thứ hai của tuần chứa ngày d */
export function startOfWeek(d: Date) {
  const r = startOfDay(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}
