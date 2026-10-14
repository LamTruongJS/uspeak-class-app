import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { api, type ApiResponse } from '@/lib/api/client';
import { uploadBinary, uploadMultipart, type UploadOptions } from '@/lib/api/upload';
import { queryClient } from '@/lib/query-client';

import type { ChatMessage, ChatMessageImage, ChatMessagesPage, ChatRoomDetail, ChatRoomItem } from './types';

export const chatKeys = {
  rooms: ['chat', 'rooms'] as const,
  messages: (roomId: string) => ['chat', 'messages', roomId] as const,
  detail: (roomId: string) => ['chat', 'detail', roomId] as const,
  permissions: (roomId: string) => ['chat', 'permissions', roomId] as const,
  members: (roomId: string) => ['chat', 'members', roomId] as const,
  pinned: (roomId: string) => ['chat', 'pinned', roomId] as const,
};

const PAGE_SIZE = 40;

const fetchRooms = async () =>
  (await api.get<{ data: ChatRoomItem[] }>('/chat/rooms', { params: { page: 1, limit: 100 } })).data.data ?? [];

export function useChatRooms() {
  return useQuery({ queryKey: chatKeys.rooms, queryFn: fetchRooms });
}

/**
 * 1 phòng trong danh sách — `select` + structural sharing của react-query nên CHỈ re-render khi
 * chính phòng này đổi (patchRoom giữ nguyên object các phòng khác). Đọc thẳng useChatRooms
 * trong màn phòng chat thì tin nhắn ở BẤT KỲ phòng nào cũng vẽ lại cả màn.
 */
export function useChatRoom(roomId: string) {
  return useQuery({
    queryKey: chatKeys.rooms,
    queryFn: fetchRooms,
    select: (rooms: ChatRoomItem[]) => rooms.find((r) => r._id === roomId),
  });
}

/**
 * Tổng tin chưa đọc (bỏ phòng đã tắt thông báo) cho badge tab / icon app. Dùng `select` để chỉ
 * re-render khi CON SỐ đổi — đọc thẳng useChatRooms thì mỗi tin mới ở bất kỳ phòng nào cũng
 * vẽ lại cả thanh tab.
 */
export function useUnreadTotal() {
  return (
    useQuery({
      queryKey: chatKeys.rooms,
      queryFn: fetchRooms,
      select: (rooms: ChatRoomItem[]) => rooms.reduce((sum, r) => sum + (r.notifications_muted ? 0 : (r.unread_count ?? 0)), 0),
    }).data ?? 0
  );
}

export function useRoomDetail(roomId: string) {
  return useQuery({
    queryKey: chatKeys.detail(roomId),
    queryFn: async () => (await api.get<ApiResponse<ChatRoomDetail>>(`/chat/rooms/${roomId}`)).data.data,
    staleTime: 5 * 60_000,
  });
}

/** Quyền của MÌNH trong phòng (theo vai trò, admin phòng chỉnh được bên web). */
export interface ChatPermissions {
  can_send_message: boolean;
  can_recall_own_message: boolean;
  can_recall_others_message: boolean;
  can_pin_message: boolean;
  can_create_poll: boolean;
  can_rename_room: boolean;
  can_change_chat_avatar: boolean;
}

const DEFAULT_PERMISSIONS: ChatPermissions = {
  can_send_message: true,
  can_recall_own_message: true,
  can_recall_others_message: false,
  can_pin_message: false,
  can_create_poll: false,
  can_rename_room: false,
  can_change_chat_avatar: false,
};

/** Quyền hệ thống của mình (GET /permissions/me) — vd CHAT_ROOM_CREATE để được tạo nhóm. */
export function useMyPermissionCodes() {
  return useQuery({
    queryKey: ['permissions', 'me'],
    queryFn: async () => {
      try {
        return (await api.get<{ effective_permissions?: string[] }>('/permissions/me')).data.effective_permissions ?? [];
      } catch {
        // null = CHƯA biết quyền (gọi lỗi) — khác hẳn [] là "không có quyền nào". Màn hình dựa vào
        // đây để khỏi ẩn sạch menu khi mạng chập chờn.
        return null;
      }
    },
    staleTime: 10 * 60_000,
  });
}

/** Tìm người để thêm vào nhóm (GET /chat/users — server lọc người dùng hợp lệ). */
export function useChatUserSearch(search: string) {
  return useQuery({
    queryKey: ['chat', 'users', search],
    queryFn: async () =>
      (await api.get<{ data: DmUser[] }>('/chat/users', { params: { search: search || undefined, page: 1, limit: 50 } })).data.data ?? [],
    staleTime: 60_000,
  });
}

export interface MessageSearchHit {
  _id: string;
  content: string;
  message_type: string;
  created_at: string;
  sender: { _id: string; full_name: string; avatar_url: string | null };
}

/** Tìm tin trong phòng (không phân biệt dấu) — endpoint class-be /messages/search. */
export function useMessageSearch(roomId: string, q: string) {
  return useQuery({
    queryKey: ['chat', 'search', roomId, q],
    enabled: q.trim().length >= 2,
    queryFn: async () =>
      (await api.get<{ data: MessageSearchHit[] }>(`/chat/rooms/${roomId}/messages/search`, { params: { q } })).data.data ?? [],
    staleTime: 30_000,
  });
}

export type RoomMediaType = 'media' | 'file' | 'link';

export interface RoomMediaItem {
  /** Khoá duy nhất (album nhiều ảnh / tin nhiều link → nhiều mục cùng message_id) */
  key?: string;
  message_id: string;
  created_at: string;
  sender: { _id: string; full_name: string };
  kind: 'image' | 'video' | 'file' | 'link';
  url: string | null;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  file_name?: string;
  file_size?: number | null;
  mime_type?: string | null;
  content?: string;
}

/** Kho ảnh & video / tệp / link của phòng (class-be GET /chat/rooms/:id/media), cuộn tới đâu tải tới đó. */
export function useRoomMedia(roomId: string, type: RoomMediaType, limit = 30) {
  return useInfiniteQuery({
    queryKey: ['chat', 'media', roomId, type, limit],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<{ data: RoomMediaItem[]; next_before: string | null }>(`/chat/rooms/${roomId}/media`, {
          params: { type, before: pageParam, limit },
        })
      ).data,
    getNextPageParam: (last) => last.next_before ?? undefined,
    staleTime: 60_000,
  });
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site: string | null;
}

/** Xem trước link (Open Graph) — class-be đọc trang + cache; lỗi thì không hiện thẻ. */
export function useLinkPreview(url: string | null) {
  return useQuery({
    queryKey: ['chat', 'link-preview', url],
    enabled: !!url,
    queryFn: async () => (await api.get<LinkPreview>('/chat/link-preview', { params: { url } })).data,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: false,
  });
}

/** Lỗi thì dùng quyền mặc định của học viên — server vẫn là nơi chặn thật. */
export function useChatPermissions(roomId: string) {
  return useQuery({
    queryKey: chatKeys.permissions(roomId),
    queryFn: async () => {
      try {
        const res = await api.get<ApiResponse<{ my_permissions?: Partial<ChatPermissions> }>>(`/chat/rooms/${roomId}/settings`);
        return { ...DEFAULT_PERMISSIONS, ...(res.data.data?.my_permissions ?? {}) };
      } catch {
        return DEFAULT_PERMISSIONS;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export interface RoomMember {
  _id: string;
  full_name: string;
  avatar_url: string | null;
  email?: string;
  system_role?: string;
  context_role_code?: string | null;
  chat_role: 'owner' | 'admin' | 'member';
  is_online?: boolean;
}

/** Thành viên phòng (tối đa 200 — đủ cho lớp; dùng cho danh sách + gợi ý @nhắc tên). */
export function useRoomMembers(roomId: string, enabled = true) {
  return useQuery({
    queryKey: chatKeys.members(roomId),
    enabled,
    queryFn: async () =>
      (await api.get<{ data: RoomMember[] }>(`/chat/rooms/${roomId}/members`, { params: { page: 1, limit: 200 } })).data.data ?? [],
    staleTime: 5 * 60_000,
  });
}

/** Tin đã ghim (mới ghim trước, tối đa 50) — endpoint trả thẳng mảng. */
export function usePinnedMessages(roomId: string) {
  return useQuery({
    queryKey: chatKeys.pinned(roomId),
    queryFn: async () => (await api.get<ChatMessage[]>(`/chat/rooms/${roomId}/pinned-messages`)).data ?? [],
    staleTime: 30_000,
  });
}

export interface DmUser {
  _id: string;
  full_name: string;
  avatar_url?: string | null;
  role?: string;
  role_code?: string;
  is_online?: boolean;
}

/**
 * Một số nhánh của class-be (vd vai trò quản trị) trả thẳng user CRM: tên nằm ở `name`, ảnh ở
 * `avatar`, không có `full_name` / `avatar_url` → chuẩn hoá về một dạng.
 */
function normalizeDmUser(u: DmUser & { name?: string; avatar?: string | null; id?: string }): DmUser {
  return {
    ...u,
    _id: u._id ?? u.id ?? '',
    full_name: u.full_name || u.name || 'Người dùng',
    avatar_url: u.avatar_url ?? u.avatar ?? null,
  };
}

export function useDmEligibleUsers(search: string) {
  return useQuery({
    queryKey: ['chat', 'dm-eligible', search],
    queryFn: async () =>
      (
        (await api.get<{ data: DmUser[] }>('/chat/users/dm-eligible', { params: { search: search || undefined, page: 1, limit: 100 } }))
          .data.data ?? []
      ).map(normalizeDmUser),
    staleTime: 60_000,
  });
}

/**
 * Ai được nhắn riêng — để quyết định hiện nút "nhắn tin" ở danh sách thành viên.
 * Luật nằm ở class-be `canDirectMessage` (AD/TE: mọi người · TA: GV + HV nhóm mình phụ trách ·
 * ST: GV lớp mình + TA nhóm mình · vai trò khác: không ai) và phụ thuộc lớp/nhóm → KHÔNG tự suy ở app.
 * `/chat/users/dm-eligible` trả đúng tập đó trong 1 lượt (web hỏi `/dm-permission` từng người — 20 thành
 * viên là 20 lượt tra CRM). AD/TE thì khỏi gọi: danh sách là cả hệ thống.
 * Trả `'all'` | Set id | `null` (đang tải / lỗi → ẩn nút, server vẫn là nơi chặn thật).
 */
export function useDmAllowedIds(roleCode?: string): 'all' | Set<string> | null {
  const role = (roleCode ?? '').toUpperCase();
  const everyone = role === 'AD' || role === 'TE';
  const q = useQuery({
    queryKey: ['chat', 'dm-allowed', role],
    enabled: !!role && !everyone,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const ids = new Set<string>();
      // TA có thể phụ trách nhiều nhóm → đọc hết các trang (chặn 10 trang cho chắc)
      for (let page = 1; page <= 10; page++) {
        const res = (
          await api.get<{ data: DmUser[]; pagination?: { hasMore?: boolean } }>('/chat/users/dm-eligible', {
            params: { page, limit: 200 },
          })
        ).data;
        (res.data ?? []).forEach((u) => u?._id && ids.add(String(u._id)));
        if (!res.pagination?.hasMore) break;
      }
      return ids;
    },
  });
  if (everyone) return 'all';
  return q.data ?? null;
}

/** Mới → cũ (created_at, trùng thì theo _id). */
const newestFirst = (a: ChatMessage, b: ChatMessage) =>
  a.created_at === b.created_at ? (a._id < b._id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1;

/**
 * Lịch sử tin nhắn — trang 1 là 40 tin MỚI NHẤT, nhưng BÊN TRONG mỗi trang class-be trả cũ → mới
 * (chat.service getMessages có `messages.reverse()` cho web). App cần mới → cũ để khớp FlatList
 * `inverted` (phần tử đầu mảng nằm dưới cùng) + server[0] là tin mới nhất (mark_read, vạch chưa đọc,
 * nhảy tới tin). Tự sắp lại thay vì đảo mù để không phụ thuộc thứ tự server trả.
 */
export function useRoomMessages(roomId: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(roomId),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = (await api.get<ChatMessagesPage>(`/chat/rooms/${roomId}/messages`, { params: { page: pageParam, limit: PAGE_SIZE } }))
        .data;
      return { ...page, data: [...(page.data ?? [])].sort(newestFirst) };
    },
    getNextPageParam: (last) =>
      last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    staleTime: 0,
  });
}

// ─── Cập nhật cache khi có sự kiện socket ───────────────────────────────────

type MessagesCache = InfiniteData<ChatMessagesPage, number>;

export interface UploadedFile {
  key: string;
  url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
}

/** Thêm/thay 1 tin vào đầu trang mới nhất (không trùng _id). */
export function upsertMessage(roomId: string, message: ChatMessage) {
  queryClient.setQueryData<MessagesCache>(chatKeys.messages(roomId), (old) => {
    if (!old?.pages.length) return old;
    const exists = old.pages.some((p) => p.data.some((m) => m._id === message._id));
    if (exists) return patchPages(old, message._id, () => message);
    const [first, ...rest] = old.pages;
    return { ...old, pages: [{ ...first, data: [message, ...first.data] }, ...rest] };
  });
}

export function patchMessage(roomId: string, messageId: string, patch: (m: ChatMessage) => ChatMessage) {
  queryClient.setQueryData<MessagesCache>(chatKeys.messages(roomId), (old) => (old ? patchPages(old, messageId, patch) : old));
}

function patchPages(old: MessagesCache, id: string, patch: (m: ChatMessage) => ChatMessage): MessagesCache {
  return { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.map((m) => (m._id === id ? patch(m) : m)) })) };
}

export function patchRoom(roomId: string, patch: (r: ChatRoomItem) => ChatRoomItem, moveToFront = false) {
  queryClient.setQueryData<ChatRoomItem[]>(chatKeys.rooms, (old) => {
    if (!old) return old;
    const idx = old.findIndex((r) => r._id === roomId);
    if (idx < 0) return old;
    const updated = patch(old[idx]);
    if (!moveToFront) return old.map((r, i) => (i === idx ? updated : r));
    return [updated, ...old.filter((_, i) => i !== idx)];
  });
}

// ─── REST khác ──────────────────────────────────────────────────────────────

export const chatApi = {
  ackAnnouncement: (messageId: string) => api.post(`/chat/announcements/${messageId}/ack`),

  /** Tắt / bật thông báo của riêng mình cho phòng này (BE bỏ qua push + popup khi tắt). */
  setNotificationsMuted: (roomId: string, muted: boolean) =>
    api.patch(`/chat/rooms/${roomId}/preferences`, { notifications_muted: muted, notifications_muted_until: null }),

  /** Tạo nhóm chat — server bắt phải có ≥1 giáo viên/trợ giảng trong nhóm. */
  createGroup: async (name: string, memberIds: string[]) =>
    (await api.post<{ data: { _id: string } }>('/chat/rooms', { name, member_ids: memberIds })).data.data,

  renameRoom: (roomId: string, name: string) => api.patch(`/chat/rooms/${roomId}`, { name }),

  /** Đổi ảnh phòng — server cắt vuông 200px webp. */
  changeAvatar: (roomId: string, uri: string) =>
    uploadMultipart<{ success: boolean; data?: { avatar_url: string } }>(
      `/chat/rooms/${roomId}/avatar`,
      { avatar: { uri, name: 'avatar.jpg', type: 'image/jpeg' } },
      'PATCH',
    ),

  /** Mở (hoặc tạo) phòng chat 1-1 — server tự gộp nếu đã có. */
  openDirect: async (targetUserId: string) =>
    (await api.post<{ data: { _id: string } }>('/chat/rooms/direct', { target_user_id: targetUserId })).data.data,

  /**
   * Upload tệp/video/tin thoại qua class-be (/uploads, ≤25MB). Tệp lớn hơn thì xin link
   * presign rồi PUT thẳng lên S3 — server khỏi ôm cả tệp trong RAM (giống web upload.api.ts).
   */
  uploadFile: async (file: { uri: string; name: string; type: string; size?: number }, opts?: UploadOptions): Promise<UploadedFile> => {
    const DIRECT_THRESHOLD = 8 * 1024 * 1024;
    if (file.size && file.size > DIRECT_THRESHOLD) {
      const signed = (
        await api.post<{ put_url: string; key: string; url: string; file_name: string; file_size: number; mime_type: string }>(
          '/uploads/presign-put',
          { file_name: file.name, mime_type: file.type, file_size: file.size },
        )
      ).data;
      await uploadBinary(signed.put_url, file.uri, file.type, opts);
      return { key: signed.key, url: signed.url, file_name: signed.file_name, file_size: signed.file_size, mime_type: signed.mime_type };
    }
    return uploadMultipart<UploadedFile>('/uploads', { file: { uri: file.uri, name: file.name, type: file.type } }, 'POST', opts);
  },

  /** Nén (≤1600px) rồi upload tối đa 5 ảnh/lượt — server tự resize + tạo thumbnail. */
  uploadImages: async (assets: { uri: string; width?: number; height?: number }[], opts?: UploadOptions): Promise<ChatMessageImage[]> => {
    const files = [];
    for (const [i, a] of assets.entries()) {
      // Chỉ thu nhỏ ảnh lớn (resize theo cạnh dài) — không phóng to ảnh nhỏ.
      const w = a.width ?? 0;
      const h = a.height ?? 0;
      const resize = Math.max(w, h) > 1600 ? [{ resize: w >= h ? { width: 1600 } : { height: 1600 } }] : [];
      const out = await manipulateAsync(a.uri, resize, { compress: 0.82, format: SaveFormat.JPEG });
      files.push({ uri: out.uri, name: `chat-${Date.now()}-${i}.jpg`, type: 'image/jpeg' });
    }
    const res = await uploadMultipart<
      ApiResponse<{ key: string; url: string; thumbnailKey: string; thumbnailUrl: string; width: number; height: number }[]>
    >('/chat/upload-images', { images: files }, 'POST', opts);
    return res.data.map((img) => ({
      file_url: img.url,
      file_key: img.key,
      thumbnail_url: img.thumbnailUrl,
      thumbnail_key: img.thumbnailKey,
      width: img.width,
      height: img.height,
    }));
  },
};
