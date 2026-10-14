import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Kho tài liệu kiểu Google Drive của class-be (`/drive`) — copy kiểu từ uspeak-class-fe
 * src/features/documents/document.types.ts (tên field tiếng Việt là của BE, giữ nguyên).
 *
 * App chỉ XEM: duyệt thư mục, tìm, mở tệp/liên kết, gắn sao. Tạo thư mục / tải tệp lên /
 * chia sẻ / thùng rác vẫn làm trên web (cần kéo-thả, chọn người, quản lý phiên bản).
 * Cần quyền `DOCUMENT_VIEW` — không có thì BE trả 403 và màn hiện đúng câu báo đó.
 */
export type DocumentKind = 'folder' | 'file' | 'link';
export type DocumentView = 'kho' | 'chia_se' | 'sao' | 'gan_day' | 'thung_rac';

export interface DocumentNode {
  _id: string;
  ten: string;
  loai: DocumentKind;
  parent_id: string | null;
  mo_ta?: string;
  mau?: string;
  file?: { key: string; url?: string; mime?: string; kich_thuoc?: number } | null;
  link?: { url: string; domain?: string; tieu_de?: string; anh?: string; favicon?: string } | null;
  sao?: string[];
  created_at?: string;
  updated_at?: string;
  co_the_sua?: boolean;
}

export interface DocumentListResult {
  view: DocumentView;
  folder: DocumentNode | null;
  breadcrumb: { _id: string; ten: string }[];
  items: DocumentNode[];
}

export const DOCUMENT_VIEWS: { value: DocumentView; label: string }[] = [
  { value: 'kho', label: 'Kho tài liệu' },
  { value: 'chia_se', label: 'Chia sẻ với tôi' },
  { value: 'sao', label: 'Gắn sao' },
  { value: 'gan_day', label: 'Gần đây' },
];

export function useDriveList(params: { view: DocumentView; parent?: string | null; q?: string }) {
  return useQuery({
    queryKey: ['drive', params.view, params.parent ?? null, params.q ?? ''],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () =>
      (
        await api.get<DocumentListResult>('/drive', {
          params: { view: params.view, parent: params.parent || undefined, q: params.q?.trim() || undefined },
        })
      ).data,
  });
}

export function useDriveNode(id?: string | null) {
  return useQuery({
    queryKey: ['drive', 'node', id],
    enabled: !!id,
    queryFn: async () => (await api.get<DocumentNode>(`/drive/${id}`)).data,
  });
}

/** Link tải tệp của class-be — vẫn cần media token như mọi file khác (xem `lib/media.ts`). */
export function documentFileUrl(node: DocumentNode) {
  if (node.file?.key) return `/uploads/file?key=${encodeURIComponent(node.file.key)}`;
  return node.file?.url ?? '';
}

export function isImageFile(node: DocumentNode) {
  return !!node.file?.mime?.startsWith('image/');
}

export function formatBytes(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Icon + màu theo loại tệp (giống cách web chọn icon). */
export function fileIcon(node: DocumentNode): { icon: 'folder' | 'link' | 'image' | 'document-text' | 'film' | 'musical-notes' | 'archive' | 'document'; color: string } {
  if (node.loai === 'folder') return { icon: 'folder', color: node.mau || '#f59e0b' };
  if (node.loai === 'link') return { icon: 'link', color: '#2563eb' };
  const mime = node.file?.mime ?? '';
  const name = node.ten.toLowerCase();
  if (mime.startsWith('image/')) return { icon: 'image', color: '#7c3aed' };
  if (mime.startsWith('video/')) return { icon: 'film', color: '#db2777' };
  if (mime.startsWith('audio/')) return { icon: 'musical-notes', color: '#0891b2' };
  if (mime.includes('pdf') || name.endsWith('.pdf')) return { icon: 'document-text', color: '#dc2626' };
  if (/\.(zip|rar|7z|tar|gz)$/.test(name)) return { icon: 'archive', color: '#64748b' };
  return { icon: 'document', color: '#475569' };
}
