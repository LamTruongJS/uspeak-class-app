import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Wiki Uspeak + Hướng dẫn sử dụng — hai kho dùng CHUNG API, phân biệt bằng `space`
 * ('wiki' | 'guide'), copy từ uspeak-class-fe src/stores/wiki.
 *
 * App chỉ đọc: danh sách + lọc theo loại + tìm, mở bài xem nội dung và tải đính kèm.
 * Soạn / sửa / kéo-thả sắp xếp vẫn làm trên web.
 */
export type WikiSpace = 'wiki' | 'guide';

export interface WikiCategory {
  _id: string;
  ten: string;
  space: WikiSpace;
  sort_order?: number;
}

export interface WikiAttachment {
  key: string;
  name: string;
  size: number;
  type: string;
  /** Link presigned do class-be ký sẵn (hạn vài giờ) — dùng thẳng. */
  url?: string;
}

/** Mục lục có cấu trúc: 1 heading + cấp (1–3) + nội dung riêng (HTML). */
export interface WikiSection {
  key: string;
  tieu_de: string;
  level: number;
  noi_dung: string;
}

export interface WikiDocListItem {
  _id: string;
  space: WikiSpace;
  tieu_de: string;
  tom_tat?: string;
  category_id?: { _id: string; ten: string } | null;
  nguoi_tao_id?: { _id: string; ho_ten?: string; avatar?: string | null } | null;
  luot_xem?: number;
  created_at?: string;
  updated_at?: string;
}

export interface WikiDocDetail extends WikiDocListItem {
  noi_dung: string;
  sections?: WikiSection[];
  dinh_kem: WikiAttachment[];
}

export const WIKI_SPACE_META: Record<WikiSpace, { title: string; subtitle: string }> = {
  wiki: { title: 'Wiki Uspeak', subtitle: 'Quy trình, hướng dẫn, biểu mẫu, nội quy, đào tạo…' },
  guide: { title: 'Hướng dẫn sử dụng', subtitle: 'Hướng dẫn dùng hệ thống cho học viên & nhân sự' },
};

export function useWikiList(space: WikiSpace, params: { category?: string; q?: string }) {
  return useQuery({
    queryKey: ['wiki', space, params.category ?? '', params.q ?? ''],
    staleTime: 60_000,
    queryFn: async () =>
      (
        await api.get<{ items: WikiDocListItem[]; total: number }>('/wiki', {
          params: { space, category: params.category || undefined, q: params.q?.trim() || undefined },
        })
      ).data,
  });
}

export function useWikiCategories(space: WikiSpace) {
  return useQuery({
    queryKey: ['wiki', 'categories', space],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<WikiCategory[]>('/wiki/categories', { params: { space } })).data ?? [],
  });
}

export function useWikiDoc(id: string) {
  return useQuery({
    queryKey: ['wiki', 'doc', id],
    enabled: !!id,
    queryFn: async () => (await api.get<WikiDocDetail>(`/wiki/${id}`)).data,
  });
}

/**
 * Tăng lượt xem — class-be CỐ Ý không tăng trong `getOne`, phải gọi riêng đúng 1 lần khi mở bài
 * (nếu không thì mỗi lần refetch/quay lại màn là lượt xem lại nhảy).
 */
export function useIncrementWikiView() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ luot_xem: number }>(`/wiki/${id}/view`),
  });
}
