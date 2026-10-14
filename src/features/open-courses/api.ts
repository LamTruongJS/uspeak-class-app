import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Khoá học mở đăng ký — luật + kiểu copy từ uspeak-class-fe
 * (stores/class: useOpenRegistrationClasses, components/open-courses/open-course.utils.ts).
 * Sửa luật lọc ở web thì sửa cả đây.
 */
export interface OpenCourseClass {
  _id: string;
  class_code: string;
  class_name: string;
  display_name?: string;
  course: { _id: string; course_code: string; course_name: string; course_type: 'zoom' | 'elearning' } | null;
  course_type: 'zoom' | 'elearning' | 'combo';
  status_class: string;
  start_date: string;
  end_date: string | null;
  duration: number;
  class_time: string | null;
  teacher: { _id: string; name: string; avatar?: string } | null;
  price: number;
  /** Giá sau ưu đãi công khai (có ưu đãi thì < price) */
  final_price?: number | null;
  promotion?: {
    promotion_code: string;
    promotion_name: string;
    discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discount_value: number;
    discount_amount: number;
  } | null;
  max_students: number | null;
  active_students: number;
  class_image?: string | null;
  url_sales_page?: string | null;
  is_published_web?: boolean | null;
  createdAt: string;
}

const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase();

/**
 * Lớp được hiện cho học viên: chưa tắt "Public lên website" (data cũ thiếu cờ vẫn tính là public) và không
 * phải lớp nội bộ (STEAM, training giáo viên) — `isPublicRegistrationClass` của web.
 */
export function isPublicCourse(c: OpenCourseClass) {
  if (c.is_published_web === false) return false;
  const s = fold([c.class_code, c.class_name, c.display_name, c.course?.course_code, c.course?.course_name].filter(Boolean).join(' '));
  if (s.includes('STEAM')) return false;
  return !(s.includes('TRAINING') && (s.includes('GIAO VIEN') || s.includes('TEACHER')));
}

export function courseSearchText(c: OpenCourseClass) {
  return fold([c.class_code, c.class_name, c.display_name, c.course?.course_name, c.teacher?.name].filter(Boolean).join(' '));
}

export const foldQuery = fold;

/** Giá cuối + có ưu đãi không (`getPricing` của web). */
export function pricing(c: OpenCourseClass) {
  const hasPromo = !!c.promotion && (c.final_price ?? c.price) < c.price;
  return { hasPromo, finalPrice: hasPromo ? c.final_price! : c.price, saved: hasPromo ? c.price - c.final_price! : 0 };
}

/** Nhãn giảm giá trên ảnh bìa: luôn quy ra % so với giá gốc ("-40757k" của ưu đãi tiền mặt khó đọc). */
export function discountLabel(c: OpenCourseClass) {
  const p = pricing(c);
  if (!p.hasPromo || c.price <= 0) return null;
  return `-${Math.max(1, Math.round((p.saved / c.price) * 100))}%`;
}

/** "N buổi" — null khi lớp không có số buổi (E-Learning, combo nhập 0). */
export const sessionsText = (c: OpenCourseClass) => (c.course_type !== 'elearning' && c.duration > 0 ? `${c.duration} buổi` : null);

/** Số ngày tới khai giảng (null nếu không rõ / đã qua). */
export function daysUntil(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date())) / 86_400_000);
  return diff >= 0 ? diff : null;
}

export const COURSE_TYPE_LABEL: Record<string, string> = { zoom: 'Học Zoom', elearning: 'E-Learning', combo: 'Combo' };

export type OpenCourseSort = 'newest' | 'soonest' | 'price-asc' | 'price-desc';

export const SORTS: { value: OpenCourseSort; label: string }[] = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'soonest', label: 'Khai giảng sớm' },
  { value: 'price-asc', label: 'Giá thấp' },
  { value: 'price-desc', label: 'Giá cao' },
];

export function sortCourses(list: OpenCourseClass[], sort: OpenCourseSort) {
  const t = (v: string | null | undefined, fallback: number) => {
    const x = v ? new Date(v).getTime() : Number.NaN;
    return Number.isNaN(x) ? fallback : x;
  };
  return [...list].sort((a, b) => {
    switch (sort) {
      case 'price-asc':
        return pricing(a).finalPrice - pricing(b).finalPrice;
      case 'price-desc':
        return pricing(b).finalPrice - pricing(a).finalPrice;
      case 'soonest':
        return t(a.start_date, Infinity) - t(b.start_date, Infinity);
      default:
        return t(b.createdAt, -Infinity) - t(a.createdAt, -Infinity);
    }
  });
}

/**
 * GET /classes/open-registration — route RIÊNG cho học viên (class-be, thêm 14/10/2026, cần deploy): GET /classes
 * chỉ cho nhân sự (học viên bị 403) và trả cả thông tin Zoom. Route mới đã lọc OPEN_REGISTRATION + public và lược field.
 */
export function useOpenCourses() {
  return useQuery({
    queryKey: ['open-courses'],
    staleTime: 60_000,
    queryFn: async () => ((await api.get<{ data: OpenCourseClass[] }>('/classes/open-registration')).data.data ?? []).filter(isPublicCourse),
  });
}
