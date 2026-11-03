import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { BadgeTone } from '@/components/ui/badge';
import { api } from '@/lib/api/client';

/**
 * Script video bài giảng (admin) — copy từ uspeak-class-fe (trang /video-scripts +
 * components/Elearning/VideoTranscriptDialog). class-be tự chép lời bằng Gemini/Whisper chạy nền:
 * - `/video-transcripts` (+ `/stats`, `/filters`, `POST /bulk`) — quyền VIDEO_TRANSCRIPT_MANAGE
 * - `/elearning/videos/:id/transcript` GET = script + nhà cung cấp đang bật, POST = xếp hàng tạo (lại)
 * BE không có API sửa từng đoạn, nên app (như web) chỉ xem / tìm / sao chép / tạo lại.
 */

export type TranscriptProvider = 'gemini' | 'whisper';
export type TranscriptStatus = 'queued' | 'processing' | 'done' | 'failed';
export type VideoSource = 'youtube' | 'vimeo' | 'bunny' | '';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface VideoTranscript {
  _id: string;
  video_id: string;
  status: TranscriptStatus;
  source: VideoSource;
  provider: TranscriptProvider;
  model: string;
  /** download = đang tải audio, transcribe = đang gửi AI chép lời */
  stage: '' | 'download' | 'transcribe';
  chunks_done: number;
  chunks_total: number;
  duration_seconds: number;
  segments: TranscriptSegment[];
  error: string;
  finished_at: string | null;
  updatedAt: string;
}

export interface TranscriptProviders {
  default: TranscriptProvider | null;
  gemini: boolean;
  whisper: boolean;
}

export type TranscriptSummary = Pick<
  VideoTranscript,
  'status' | 'stage' | 'provider' | 'model' | 'chunks_done' | 'chunks_total' | 'duration_seconds' | 'error' | 'finished_at' | 'updatedAt'
> & { segment_count: number };

/** 1 dòng ở màn quản lý script (mọi lớp) — không kèm nội dung script, chỉ số đoạn */
export interface VideoTranscriptRow {
  _id: string;
  title: string;
  class_id: string;
  class_code: string;
  class_name: string;
  class_display_name: string;
  video_url: string;
  vimeo_id?: string;
  bunny_video_id?: string;
  bunny_library_id?: string;
  source: VideoSource;
  duration_seconds?: number;
  createdAt: string;
  transcript: TranscriptSummary | null;
}

export interface VideoTranscriptFilters {
  courses: { _id: string; course_code: string; course_name: string; class_count: number; video_count: number }[];
  classes: {
    _id: string;
    class_code: string;
    class_name: string;
    display_name: string;
    course_id: string;
    start_date: string | null;
    video_count: number;
    done_count: number;
  }[];
}

export interface VideoTranscriptStats {
  total: number;
  none: number;
  queued: number;
  processing: number;
  done: number;
  failed: number;
}

interface ListResponse {
  data: VideoTranscriptRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListParams {
  search: string;
  status: string;
  source: string;
  courseId: string;
  classId: string;
}

export const PROVIDER_LABEL: Record<TranscriptProvider, string> = { gemini: 'Gemini', whisper: 'Whisper' };

export const SOURCE_VIEW: Record<Exclude<VideoSource, ''>, { label: string; tone: BadgeTone }> = {
  youtube: { label: 'YouTube', tone: 'danger' },
  vimeo: { label: 'Vimeo', tone: 'info' },
  bunny: { label: 'Bunny', tone: 'warning' },
};

const PAGE_SIZE = 20;

export const videoScriptKeys = {
  all: ['video-transcripts'] as const,
  list: (p: ListParams) => ['video-transcripts', 'list', p] as const,
  stats: ['video-transcripts', 'stats'] as const,
  filters: ['video-transcripts', 'filters'] as const,
  detail: (id: string) => ['elearning', 'video-transcript', id] as const,
};

export const isRunning = (status?: TranscriptStatus) => status === 'queued' || status === 'processing';

export function useVideoTranscriptList(params: ListParams) {
  return useInfiniteQuery({
    queryKey: videoScriptKeys.list(params),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<ListResponse>('/video-transcripts', {
          params: {
            page: pageParam,
            limit: PAGE_SIZE,
            search: params.search || undefined,
            status: params.status || undefined,
            source: params.source || undefined,
            class_id: params.classId || undefined,
            course_id: params.courseId || undefined,
          },
        })
      ).data,
    getNextPageParam: (last, pages) => (pages.length < (last.pagination?.totalPages ?? 1) ? pages.length + 1 : undefined),
    placeholderData: (prev) => prev,
    // Có video đang chạy thì cập nhật tiến độ định kỳ (như web, 5 giây)
    refetchInterval: (query) => (query.state.data?.pages.some((p) => p.data.some((r) => isRunning(r.transcript?.status))) ? 5000 : false),
  });
}

export function useVideoTranscriptStats(anyRunning: boolean) {
  return useQuery({
    queryKey: videoScriptKeys.stats,
    queryFn: async () => (await api.get<{ data: VideoTranscriptStats; providers: TranscriptProviders }>('/video-transcripts/stats')).data,
    refetchInterval: anyRunning ? 10000 : false,
  });
}

export function useVideoTranscriptFilters() {
  return useQuery({
    queryKey: videoScriptKeys.filters,
    queryFn: async () => (await api.get<{ data: VideoTranscriptFilters }>('/video-transcripts/filters')).data.data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVideoTranscript(videoId: string) {
  return useQuery({
    queryKey: videoScriptKeys.detail(videoId),
    enabled: !!videoId,
    queryFn: async () =>
      (await api.get<{ data: VideoTranscript | null; providers: TranscriptProviders }>(`/elearning/videos/${videoId}/transcript`)).data,
    // Đang chạy nền thì hỏi lại định kỳ để cập nhật tiến độ
    refetchInterval: (query) => (isRunning(query.state.data?.data?.status) ? 4000 : false),
  });
}

/** Tạo / tạo lại script 1 video (tốn tiền API — chỗ gọi hỏi lại trước). */
export function useRequestTranscript(videoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider?: TranscriptProvider) =>
      (await api.post<{ data: VideoTranscript }>(`/elearning/videos/${videoId}/transcript`, provider ? { provider } : {})).data.data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoScriptKeys.detail(videoId) });
      void queryClient.invalidateQueries({ queryKey: videoScriptKeys.all });
    },
  });
}

/** Xếp hàng nhiều video một lượt — server chạy lần lượt. */
export function useRequestTranscriptsBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; provider?: TranscriptProvider }) =>
      (
        await api.post<{ data: { queued: number; skipped: { id: string; reason: string }[] } }>('/video-transcripts/bulk', {
          video_ids: input.ids,
          ...(input.provider ? { provider: input.provider } : {}),
        })
      ).data.data,
    onSettled: () => queryClient.invalidateQueries({ queryKey: videoScriptKeys.all }),
  });
}

export function availableProviders(providers?: TranscriptProviders | null): TranscriptProvider[] {
  return (['gemini', 'whisper'] as const).filter((p) => providers?.[p]);
}

export function useDebouncedValue(value: string, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Định dạng ────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** 05:12 hoặc 1:05:12 */
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(total % 60)}` : `${pad(m)}:${pad(total % 60)}`;
}

/** Thời lượng cột "Thời lượng" của web: 5:12 / 1:05:12, không có thì "—". */
export function formatDuration(sec?: number): string {
  if (!sec) return '—';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(total % 60)}` : `${m}:${pad(total % 60)}`;
}

function formatSrtClock(sec: number): string {
  const ms = Math.round((sec % 1) * 1000);
  const total = Math.floor(sec);
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)},${String(ms).padStart(3, '0')}`;
}

export function transcriptPlainText(segments: TranscriptSegment[]) {
  return segments.map((s) => `[${formatClock(s.start)}] ${s.text}`).join('\n');
}

export function transcriptSrt(segments: TranscriptSegment[]) {
  return segments.map((s, i) => `${i + 1}\n${formatSrtClock(s.start)} --> ${formatSrtClock(s.end)}\n${s.text}\n`).join('\n');
}

/** Link mở video đúng giây đó trên nền tảng gốc — Bunny không có link công khai nên bỏ (như web). */
export function buildSeekUrl(videoUrl: string, sec: number): string | null {
  const t = Math.floor(sec);
  const yt = videoUrl.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|live\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://youtu.be/${yt[1]}?t=${t}`;
  const vimeo = videoUrl.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-z0-9]+))?/i);
  if (vimeo) return `https://vimeo.com/${vimeo[1]}${vimeo[2] ? `/${vimeo[2]}` : ''}#t=${t}s`;
  return null;
}

/** Phần trăm tiến độ (chỉ có ở bước chép lời). */
export function transcriptPercent(t: Pick<VideoTranscript, 'stage' | 'chunks_done' | 'chunks_total'>) {
  return t.stage === 'transcribe' && t.chunks_total ? Math.round((t.chunks_done / t.chunks_total) * 100) : 0;
}
