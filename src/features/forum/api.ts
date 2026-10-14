import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { api } from '@/lib/api/client';
import { uploadMultipart, type LocalFile } from '@/lib/api/upload';

/**
 * Diễn đàn — copy từ uspeak-class-fe src/stores/forum.
 * App làm: xem bảng tin (chung + theo lớp), đăng bài kèm ảnh, cảm xúc, bình luận và trả lời.
 * Chưa làm trên app (vẫn trên web): @nhắc tên, ghim bài, tắt bình luận, sửa/xoá bài của người khác.
 */
export interface ForumAuthor {
  _id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

export interface ForumAttachment {
  key: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  width?: number;
  height?: number;
}

export interface ForumPost {
  _id: string;
  class_id: string | null;
  class_code: string | null;
  author_id: string;
  content: string;
  attachments: ForumAttachment[];
  is_pinned: boolean;
  is_edited?: boolean;
  allow_comments: boolean;
  comment_count: number;
  reaction_summary: Record<string, number>;
  author: ForumAuthor | null;
  my_reaction: string | null;
  createdAt: string;
}

export interface ForumComment {
  _id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  attachment: ForumAttachment | null;
  reply_count: number;
  reaction_summary: Record<string, number>;
  author: ForumAuthor | null;
  my_reaction: string | null;
  createdAt: string;
}

interface CursorPage<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'] as const;

export const forumKeys = {
  posts: (classId?: string) => ['forum', 'posts', classId ?? 'all'] as const,
  comments: (postId: string) => ['forum', 'comments', postId] as const,
  replies: (commentId: string) => ['forum', 'replies', commentId] as const,
  classes: ['forum', 'user-classes'] as const,
};

export function useForumClasses() {
  return useQuery({
    queryKey: forumKeys.classes,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await api.get<{ data: { _id: string; name?: string; class_code?: string }[] }>('/forum/user-classes')).data.data ?? [],
  });
}

export function useForumPosts(classId?: string) {
  return useInfiniteQuery({
    queryKey: forumKeys.posts(classId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<CursorPage<ForumPost>>('/forum/posts', {
          params: { limit: 10, class_id: classId || undefined, cursor: pageParam },
        })
      ).data,
    getNextPageParam: (last) => (last.has_more && last.next_cursor ? last.next_cursor : undefined),
  });
}

/**
 * class-be KHÔNG có `GET /forum/posts/:id` (chỉ có bảng tin phân trang cursor), nên màn chi tiết
 * lấy bài từ cache của bảng tin — người dùng luôn mở từ bảng tin. Giữ ở queryKey riêng để lượt
 * bấm cảm xúc (patch cache) làm màn chi tiết vẽ lại.
 */
export function useForumPostFromCache(postId: string) {
  const queryClient = useQueryClient();
  return useQuery<ForumPost | undefined>({
    queryKey: ['forum', 'post', postId],
    enabled: !!postId,
    staleTime: Infinity,
    queryFn: () => {
      const lists = queryClient.getQueriesData<{ pages: { data: ForumPost[] }[] }>({ queryKey: ['forum', 'posts'] });
      for (const [, value] of lists) {
        const found = value?.pages.flatMap((page) => page.data).find((post) => post._id === postId);
        if (found) return found;
      }
      return undefined;
    },
  });
}

export function useForumComments(postId: string) {
  return useInfiniteQuery({
    queryKey: forumKeys.comments(postId),
    enabled: !!postId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.get<CursorPage<ForumComment>>(`/forum/posts/${postId}/comments`, { params: { limit: 20, cursor: pageParam } })).data,
    getNextPageParam: (last) => (last.has_more && last.next_cursor ? last.next_cursor : undefined),
  });
}

export function useForumReplies(commentId: string, enabled: boolean) {
  return useQuery({
    queryKey: forumKeys.replies(commentId),
    enabled: enabled && !!commentId,
    queryFn: async () =>
      (await api.get<CursorPage<ForumComment>>(`/forum/comments/${commentId}/replies`, { params: { limit: 50 } })).data.data ?? [],
  });
}

/** Nén ảnh rồi upload lên /forum/upload, trả về đính kèm để gắn vào bài viết. */
export async function uploadForumImages(uris: string[]): Promise<ForumAttachment[]> {
  if (!uris.length) return [];
  const files: LocalFile[] = [];
  for (const [i, uri] of uris.entries()) {
    const out = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: SaveFormat.JPEG });
    files.push({ uri: out.uri, name: `forum-${Date.now()}-${i}.jpg`, type: 'image/jpeg' });
  }
  const res = await uploadMultipart<{ data: ForumAttachment[] }>('/forum/upload', { files });
  return res.data ?? [];
}

export function useCreateForumPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { content: string; classId?: string; images: string[] }) => {
      const attachments = await uploadForumImages(input.images);
      return (
        await api.post<ForumPost>('/forum/posts', {
          content: input.content,
          class_id: input.classId || undefined,
          attachments,
        })
      ).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forum', 'posts'] }),
  });
}

export function useCreateForumComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { content: string; parentId?: string }) =>
      (await api.post<ForumComment>(`/forum/posts/${postId}/comments`, { content: input.content, parent_id: input.parentId })).data,
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: forumKeys.comments(postId) });
      void queryClient.invalidateQueries({ queryKey: ['forum', 'posts'] });
      if (input.parentId) void queryClient.invalidateQueries({ queryKey: forumKeys.replies(input.parentId) });
    },
  });
}

/**
 * Bật/tắt cảm xúc. BE trả lại `reaction_summary` mới nên cập nhật thẳng vào cache thay vì
 * invalidate — bấm tim không làm cả bảng tin tải lại và nhảy vị trí cuộn.
 */
export function useToggleReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { targetId: string; targetType: 'post' | 'comment'; emoji: string }) =>
      (
        await api.post<{ emoji: string | null; target_id: string; reaction_summary: Record<string, number> }>('/forum/reactions', {
          target_id: input.targetId,
          target_type: input.targetType,
          emoji: input.emoji,
        })
      ).data,
    onSuccess: (result, input) => {
      const patch = <T extends { _id: string; reaction_summary: Record<string, number>; my_reaction: string | null }>(item: T): T =>
        item._id === input.targetId ? { ...item, reaction_summary: result.reaction_summary, my_reaction: result.emoji } : item;

      queryClient.setQueriesData<{ pages: { data: ForumPost[] }[] }>({ queryKey: ['forum', 'posts'] }, (current) =>
        current ? { ...current, pages: current.pages.map((p) => ({ ...p, data: p.data.map(patch) })) } : current,
      );
      queryClient.setQueriesData<{ pages: { data: ForumComment[] }[] }>({ queryKey: ['forum', 'comments'] }, (current) =>
        current ? { ...current, pages: current.pages.map((p) => ({ ...p, data: p.data.map(patch) })) } : current,
      );
      queryClient.setQueriesData<ForumComment[]>({ queryKey: ['forum', 'replies'] }, (current) => current?.map(patch));
      queryClient.setQueriesData<ForumPost>({ queryKey: ['forum', 'post', input.targetId] }, (current) => (current ? patch(current) : current));
    },
  });
}

export function reactionTotal(summary?: Record<string, number>) {
  return Object.values(summary ?? {}).reduce((sum, v) => sum + (v || 0), 0);
}

export function topReactions(summary?: Record<string, number>, max = 3) {
  return Object.entries(summary ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([emoji]) => emoji);
}
