import { api } from '@/lib/api/client';
import { extractYoutubeVideoId } from '@/lib/youtube';

/**
 * Port từ uspeak-class-fe/src/utils/submission-video.ts — sửa luật thì sửa cả hai bên.
 *
 * Video bài nộp có 2 nguồn:
 * - Link YouTube học viên dán vào.
 * - Video học viên tải thẳng lên Bunny Stream (hiện chỉ web làm được). Trong `video_urls` lưu dạng
 *   embed URL CHƯA ký `https://iframe.mediadelivery.net/embed/{libraryId}/{guid}` — muốn xem phải xin
 *   link có token qua `GET /submission-videos/:guid/play`.
 *
 * Màn chấm/xem bài dùng 1 "khoá video" chung: YouTube ID (11 ký tự) hoặc `bunny:<guid>`. Khoá này cũng
 * là `videoId` của nhận xét theo mốc thời gian → phải khớp web, không thì nhận xét lạc video.
 */

const BUNNY_EMBED_RE = /^https?:\/\/iframe\.mediadelivery\.net\/embed\/(\d+)\/([0-9a-f-]{36})/i;
export const BUNNY_KEY_PREFIX = 'bunny:';

export function parseBunnySubmissionUrl(url: string | null | undefined): { libraryId: string; videoId: string } | null {
  const m = (url || '').trim().match(BUNNY_EMBED_RE);
  return m ? { libraryId: m[1], videoId: m[2].toLowerCase() } : null;
}

export function isBunnySubmissionUrl(url: string | null | undefined): boolean {
  return !!parseBunnySubmissionUrl(url);
}

export function isBunnyVideoKey(key: string | null | undefined): boolean {
  return !!key && key.startsWith(BUNNY_KEY_PREFIX);
}

export function bunnyVideoIdFromKey(key: string): string {
  return key.slice(BUNNY_KEY_PREFIX.length);
}

/** Khoá video dùng chung: YouTube ID hoặc `bunny:<guid>`. null = link không nhận ra. */
export function extractSubmissionVideoKey(url: string | null | undefined): string | null {
  const bunny = parseBunnySubmissionUrl(url);
  if (bunny) return `${BUNNY_KEY_PREFIX}${bunny.videoId}`;
  return extractYoutubeVideoId(url);
}

/** created/uploaded/processing = Bunny đang nhận/nén; ready = xem được. */
export type SubmissionVideoStatus = 'created' | 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleted';

export interface SubmissionVideoPlayback {
  video_id: string;
  status: SubmissionVideoStatus;
  duration: number;
  /** Link embed có token; null khi chưa nén xong */
  play_url: string | null;
}

/** Chỉ chủ bài + nhân sự (AD/TE/TA/TG) được xem — người khác nhận 404. */
export async function getSubmissionVideoPlayback(guid: string): Promise<SubmissionVideoPlayback> {
  const res = (await api.get<{ data?: SubmissionVideoPlayback } & SubmissionVideoPlayback>(`/submission-videos/${guid}/play`)).data;
  return (res.data ?? res) as SubmissionVideoPlayback;
}
