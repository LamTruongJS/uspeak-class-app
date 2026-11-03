import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { showToast } from '@/components/ui/toast';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';

/** Không có tín hiệu "phát xong" sau ngần này thì coi như lỗi mạng, đi tiếp */
const AUDIO_TIMEOUT_MS = 30_000;

export interface TvstAudio {
  playingKey: string | null;
  /** Resolve true khi phát xong, false khi bị dừng giữa chừng / lỗi */
  play: (url: string | undefined, key: string) => Promise<boolean>;
  stop: () => void;
  /** Nút loa: đang phát chính nó thì dừng, không thì phát */
  toggle: (url: string | undefined, key: string) => void;
  setRate: (rate: number) => void;
}

/**
 * Audio dùng chung cho bài TVST Business — bản mobile của `useAudio` (class-fe TvstBusinessRenderer):
 * mỗi lúc một tiếng, `play` chờ phát xong mới resolve để "Phát toàn bài" đọc nối từng đoạn.
 */
export function useTvstAudio(): TvstAudio {
  const { data: mediaToken } = useMediaToken();
  const tokenRef = useRef(mediaToken?.media_token);
  useEffect(() => {
    tokenRef.current = mediaToken?.media_token;
  }, [mediaToken?.media_token]);
  const playerRef = useRef<AudioPlayer | null>(null);
  const finishRef = useRef<((done: boolean) => void) | null>(null);
  const rateRef = useRef(1);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
    const player = createAudioPlayer(null, { updateInterval: 250 });
    playerRef.current = player;
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finishRef.current?.(true);
    });
    return () => {
      finishRef.current?.(false);
      sub.remove();
      player.remove();
      playerRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    finishRef.current?.(false);
    playerRef.current?.pause();
  }, []);

  const play = useCallback((url: string | undefined, key: string) => {
    finishRef.current?.(false);
    const player = playerRef.current;
    const uri = resolveMediaUrl(url, tokenRef.current);
    if (!player || !uri) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => done(false), AUDIO_TIMEOUT_MS);
      function done(ok: boolean) {
        if (finishRef.current !== done) return;
        finishRef.current = null;
        clearTimeout(timer);
        setPlayingKey(null);
        resolve(ok);
      }
      finishRef.current = done;
      setPlayingKey(key);
      player.replace({ uri });
      player.setPlaybackRate(rateRef.current);
      player.play();
    });
  }, []);

  const toggle = useCallback(
    (url: string | undefined, key: string) => {
      if (playingKey === key) {
        stop();
        return;
      }
      if (!url) {
        showToast('error', 'Câu này chưa có audio');
        return;
      }
      void play(url, key);
    },
    [playingKey, play, stop],
  );

  const setRate = useCallback((rate: number) => {
    rateRef.current = rate;
    playerRef.current?.setPlaybackRate(rate);
  }, []);

  return { playingKey, play, stop, toggle, setRate };
}
