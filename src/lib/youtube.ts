/** Port từ uspeak-class-fe/src/utils/youtube.ts — nhận link watch / youtu.be / shorts / embed / live. */
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function extractYoutubeVideoId(value: string | null | undefined): string | null {
  const url = (value || '').trim();
  if (!url) return null;
  if (YOUTUBE_ID_PATTERN.test(url)) return url;

  const match = url.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match?.[1] ?? null;
}

export function youtubeThumbnail(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/** Link mở đúng giây (app YouTube trên máy tự nhận link này). */
export function youtubeWatchUrl(videoId: string, atSeconds?: number) {
  return `https://www.youtube.com/watch?v=${videoId}${atSeconds ? `&t=${Math.floor(atSeconds)}s` : ''}`;
}

/** Video có thật & đang công khai/không công khai (oEmbed trả 4xx khi video riêng tư hoặc đã xoá). */
export async function checkYoutubeVideo(videoId: string): Promise<{ ok: boolean; title?: string }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatchUrl(videoId))}&format=json`,
    );
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { title?: string };
    return { ok: true, title: data.title };
  } catch {
    return { ok: false };
  }
}
