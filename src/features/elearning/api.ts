import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * E-Learning của học viên — copy kiểu + luật từ uspeak-class-fe src/stores/elearning và
 * my-classes/[classId]/ElearningTab.tsx.
 *
 * Nguồn dữ liệu chính là CÂY NODE: GET `/elearning/student-tree?class_id=` trả danh sách phẳng
 * (section + nội dung), kèm sẵn `ref_data` (nội dung thật) và `is_completed` của chính học viên.
 * App dựng cây bằng `buildNodeTree` y như web rồi hiện mục lục.
 */
export type ElearningNodeType = 'section' | 'video' | 'practice' | 'assignment' | 'lesson_content';

export interface ElearningAttachment {
  s3_key: string;
  original_name: string;
  file_size?: number;
  mime_type?: string;
  allow_download?: boolean;
}

export interface LessonVideo {
  _id: string;
  title: string;
  description?: string;
  video_type?: 'lesson' | 'record';
  video_url: string;
  vimeo_id?: string;
  youtube_id?: string;
  bunny_video_id?: string;
  bunny_library_id?: string;
  duration_seconds?: number;
  thumbnail_url?: string;
  attachments?: ElearningAttachment[];
}

export interface LessonContent {
  _id: string;
  title: string;
  content_html?: string;
  attachments?: ElearningAttachment[];
  source_wiki_id?: string | null;
}

export interface PracticeLesson {
  _id: string;
  class_id: string;
  practice_type: string;
  title: string;
  description?: string;
  content: Record<string, unknown>;
}

export interface ElearningNode {
  _id: string;
  class_id: string;
  type: ElearningNodeType;
  parent_id: string | null;
  level: number;
  sort_order: number;
  ref_id: string | null;
  section_name: string;
  ref_data?: LessonVideo | LessonContent | PracticeLesson | Record<string, unknown> | null;
  is_completed?: boolean;
  children?: ElearningNode[];
}

export const elearningKeys = {
  tree: (classId: string) => ['elearning', 'student-tree', classId] as const,
};

export function useStudentTree(classId: string) {
  return useQuery({
    queryKey: elearningKeys.tree(classId),
    enabled: !!classId,
    staleTime: 60_000,
    queryFn: async () => (await api.get<{ data: ElearningNode[] }>('/elearning/student-tree', { params: { class_id: classId } })).data.data ?? [],
  });
}

/** Dựng cây từ danh sách phẳng — port nguyên `node-tree-utils.buildNodeTree` của web (có chống lặp vòng). */
export function buildNodeTree(flat: ElearningNode[]): ElearningNode[] {
  if (!Array.isArray(flat)) return [];

  const byId = new Map<string, ElearningNode>();
  const childrenOf = new Map<string, ElearningNode[]>();
  const roots: ElearningNode[] = [];
  const rendered = new Set<string>();

  flat.forEach((node) => byId.set(node._id, { ...node, children: [] }));
  flat.forEach((node) => {
    if (!node.parent_id || node.parent_id === node._id || !byId.has(node.parent_id)) return;
    childrenOf.set(node.parent_id, [...(childrenOf.get(node.parent_id) ?? []), node]);
  });

  const build = (id: string, path: Set<string>): ElearningNode => {
    const node = byId.get(id)!;
    const nextPath = new Set(path);
    nextPath.add(id);
    rendered.add(id);
    node.children = (childrenOf.get(id) ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((child) => !nextPath.has(child._id))
      .map((child) => build(child._id, nextPath));
    return node;
  };

  flat.forEach((node) => {
    if (!node.parent_id || node.parent_id === node._id || !byId.has(node.parent_id)) roots.push(build(node._id, new Set()));
  });
  // Node mồ côi (cha đã bị ẩn/xoá) vẫn phải hiện, nếu không học viên mất bài
  flat.forEach((node) => {
    if (!rendered.has(node._id)) roots.push(build(node._id, new Set()));
  });

  return roots.sort((a, b) => a.sort_order - b.sort_order);
}

/** Tất cả node nội dung (bỏ section) theo đúng thứ tự hiển thị — để đếm tiến độ và nút "bài tiếp theo". */
export function flattenContentNodes(nodes: ElearningNode[]): ElearningNode[] {
  const out: ElearningNode[] = [];
  const walk = (list: ElearningNode[]) => {
    list.forEach((node) => {
      if (node.type !== 'section' && node.ref_data) out.push(node);
      if (node.children?.length) walk(node.children);
    });
  };
  walk(nodes);
  return out;
}

export function useMarkProgress(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { content_type: 'video' | 'lesson_content' | 'practice'; content_id: string; is_completed: boolean }) =>
      api.post('/elearning/progress/mark', { class_id: classId, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: elearningKeys.tree(classId) }),
  });
}

/**
 * Link phát video Bunny — BE kiểm tra quyền lớp rồi ký link nhúng có hạn
 * (`/elearning/bunny/sign`). Không tự ghép link ở app: link nhúng chưa ký sẽ bị Bunny chặn.
 */
export function useBunnyEmbed(classId: string, videoId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['elearning', 'bunny', classId, videoId],
    enabled: enabled && !!classId && !!videoId,
    staleTime: 10 * 60_000,
    queryFn: async () =>
      (await api.get<{ data: { url: string; expires: number | null } }>('/elearning/bunny/sign', { params: { class_id: classId, video_id: videoId } }))
        .data.data,
  });
}

/** Link tải file đính kèm (presigned 1 giờ). */
export async function fetchAttachmentUrl(s3Key: string) {
  const res = await api.get<{ data: { url: string } }>('/elearning/attachments/presigned', { params: { key: s3Key } });
  return res.data.data.url;
}

export type VideoSource =
  | { kind: 'file'; uri: string }
  | { kind: 'embed'; uri: string }
  | { kind: 'bunny'; videoId: string }
  | { kind: 'none' };

/**
 * Chọn cách phát: file mp4/m3u8 phát bằng trình phát native; YouTube/Vimeo/Bunny là khung nhúng
 * (iframe) nên phải mở trong WebView — giống hệt bản web.
 */
export function videoSource(video: LessonVideo): VideoSource {
  if (video.bunny_video_id || /iframe\.mediadelivery\.net/.test(video.video_url || '')) {
    return { kind: 'bunny', videoId: video._id };
  }
  if (video.youtube_id) return { kind: 'embed', uri: `https://www.youtube.com/embed/${video.youtube_id}?playsinline=1&rel=0` };
  if (video.vimeo_id) return { kind: 'embed', uri: `https://player.vimeo.com/video/${video.vimeo_id}` };

  const url = (video.video_url || '').trim();
  if (!url) return { kind: 'none' };
  if (/\.(mp4|m3u8|mov|webm)(\?|$)/i.test(url)) return { kind: 'file', uri: url };
  if (/youtube\.com|youtu\.be/.test(url)) {
    const id = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/)?.[1];
    return id ? { kind: 'embed', uri: `https://www.youtube.com/embed/${id}?playsinline=1&rel=0` } : { kind: 'embed', uri: url };
  }
  if (/vimeo\.com/.test(url)) {
    const id = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    return id ? { kind: 'embed', uri: `https://player.vimeo.com/video/${id}` } : { kind: 'embed', uri: url };
  }
  return { kind: 'embed', uri: url };
}

/**
 * Gửi thời gian học thật cho báo cáo của giáo viên (`/study-time/...`).
 * Video nhúng (Bunny/YouTube/Vimeo) không báo được trạng thái đang phát về app, nên app đếm
 * thời gian MỞ MÀN HÌNH khi app đang chạy — xem ghi chú ở `docs/HANDOFF.md`.
 */
export const studyTime = {
  video: (classId: string, videoId: string, seconds: number) =>
    api.post('/study-time/video/heartbeat', { class_id: classId, video_id: videoId, seconds }).catch(() => undefined),
  activity: (classId: string, contentType: 'practice' | 'lesson_content' | 'assignment', contentId: string, seconds: number) =>
    api
      .post('/study-time/activity/heartbeat', { class_id: classId, content_type: contentType, content_id: contentId, seconds })
      .catch(() => undefined),
};

export const NODE_ICON: Record<ElearningNodeType, 'folder' | 'videocam' | 'document-text' | 'mic' | 'create'> = {
  section: 'folder',
  video: 'videocam',
  lesson_content: 'document-text',
  practice: 'mic',
  assignment: 'create',
};

export const NODE_LABEL: Record<ElearningNodeType, string> = {
  section: 'Phần',
  video: 'Video',
  lesson_content: 'Bài đọc',
  practice: 'Luyện tập',
  assignment: 'Bài tập',
};

export const nodeTitle = (node: ElearningNode) => {
  if (node.type === 'section') return node.section_name || 'Phần học';
  const data = node.ref_data as { title?: string } | null;
  return data?.title || node.section_name || 'Nội dung';
};
