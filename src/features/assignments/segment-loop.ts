import { useEffect, useRef, useState, type RefObject } from 'react';

import type { YoutubePlayerHandle } from '@/components/ui/youtube-player';

/** "0:07" / "12:05" — mốc thời gian trong video. */
export const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export interface Segment {
  id: string;
  time: number;
  endTime?: number;
}

/**
 * Mốc kết thúc THẬT của một nhận xét, hoặc `null` nếu người chấm chỉ bấm "Bắt đầu".
 *
 * Màn chấm bài lưu `endTime = max(end ?? time + 1, time + 1)` — nghĩa là không chọn mốc kết thúc
 * thì vẫn có `endTime` nhưng chỉ hơn 1 giây. Đoạn 1 giây đó là giá trị kỹ thuật, không phải ý của
 * người chấm: hiện ra thành "0:16–0:17" là sai lệch, mà phát lặp 1 giây thì chóng mặt.
 */
export function segmentEnd(c: Segment): number | null {
  return c.endTime && c.endTime > c.time + 1.2 ? c.endTime : null;
}

/** Nhãn mốc: "0:16" hoặc "0:16 – 0:23" khi nhận xét có cả đoạn. */
export function rangeLabel(c: Segment): string {
  const end = segmentEnd(c);
  return end ? `${mmss(c.time)} – ${mmss(end)}` : mmss(c.time);
}

/**
 * Phát đúng ĐOẠN của một nhận xét (start → end) trên trình phát YouTube trong app.
 *
 * `repeat` = true (màn kết quả của học viên): tới mốc kết thúc thì dừng ~1 giây rồi quay lại đầu
 * đoạn và phát tiếp — lặp A–B như bản web, để nghe đi nghe lại chỗ bị góp ý. Bấm lại mốc đang lặp
 * thì thôi lặp.
 * `repeat` = false (màn chấm bài): phát hết đoạn rồi dừng, không lặp — người chấm đang nghe lần lượt.
 *
 * Nhận xét không có mốc kết thúc thật (xem `segmentEnd`) thì chỉ tua tới đó như trước.
 */
export function useSegmentPlayback(player: RefObject<YoutubePlayerHandle | null>, { repeat = false } = {}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const target = useRef<{ id: string; time: number; end: number } | null>(null);
  const pausing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const stop = () => {
    target.current = null;
    pausing.current = false;
    setActiveId(null);
  };

  /** Bấm vào một mốc nhận xét. Bấm lại đúng mốc đang phát lặp = dừng lặp. */
  const play = (c: Segment) => {
    if (repeat && target.current?.id === c.id) {
      stop();
      return;
    }
    const end = segmentEnd(c);
    target.current = end ? { id: c.id, time: c.time, end } : null;
    pausing.current = false;
    setActiveId(end ? c.id : null);
    player.current?.seekTo(c.time);
  };

  /** Gọi trong `onTime` của trình phát — chỗ duy nhất biết video đang chạy tới đâu. */
  const check = (t: number) => {
    const seg = target.current;
    if (!seg || pausing.current || t < seg.end) return;
    pausing.current = true;
    player.current?.pause();
    if (!repeat) {
      stop();
      return;
    }
    timer.current = setTimeout(() => {
      if (target.current?.id === seg.id) player.current?.seekTo(seg.time);
      pausing.current = false;
    }, 900);
  };

  return { activeId, play, check, stop };
}
