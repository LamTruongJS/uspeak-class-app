import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { FilterChips } from '@/components/ui/list-filters';
import { showToast } from '@/components/ui/toast';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useThemeColor } from '@/theme/use-theme-color';

import { FocusPicture } from './focus-picture';
import type { SymFocus, SymUnit } from './types';

// ─────────────────────────────────────────────────────────────
// Chế độ NGHE — bản mobile của ListenPanel (class-fe SymRenderer), vốn chép từ Everyday English:
// mỗi câu phát nghĩa tiếng Việt → chờ vài giây cho học viên tự nói → phát câu tiếng Anh.
// Hàng đợi = câu mẫu theo thứ tự part, từ vựng xếp cuối.
// ─────────────────────────────────────────────────────────────

type PlaybackState = 'idle' | 'first' | 'waiting' | 'second';

interface ListenItem {
  filter: string;
  context: string;
  en: string;
  ipa: string;
  vi: string;
  audioEn?: string;
  audioVi?: string;
  focus?: SymFocus | null;
  focusLabel?: string;
}

const VOCAB = 'vocab';
const RATES = [0.75, 1, 1.25];
/** File TTS vài giây; quá mốc này mà chưa phát xong coi như hỏng, đi tiếp cho khỏi treo vòng phát. */
const AUDIO_TIMEOUT_MS = 30_000;

export function buildListenItems(unit: SymUnit): ListenItem[] {
  const items: ListenItem[] = [];
  const vocab: ListenItem[] = [];
  for (const part of unit.parts ?? []) {
    const context = `Part ${part.order} · ${part.title}`;
    for (const structure of part.structures ?? []) {
      for (const sample of structure.samples ?? []) {
        items.push({
          filter: `p${part.order}`,
          context,
          en: sample.en,
          ipa: sample.ipa,
          vi: sample.vi,
          audioEn: sample.audioEn,
          audioVi: sample.audioVi,
          focus: sample.focus || structure.focus,
          focusLabel: structure.focus ? structure.label : undefined,
        });
      }
    }
    for (const word of part.vocabulary ?? []) {
      vocab.push({
        filter: VOCAB,
        context: part.vocabularyTitle || 'Từ vựng',
        en: word.word,
        ipa: word.ipa,
        vi: word.vi,
        audioEn: word.audio,
        audioVi: word.audioVi,
        focus: word.focus,
      });
    }
  }
  return [...items, ...vocab];
}

export function SymListen({ unit, onProgress }: { unit: SymUnit; onProgress: (current: number, total: number, context: string) => void }) {
  const onBrand = useThemeColor('on-brand');
  const foreground = useThemeColor('foreground');
  const { data: mediaToken } = useMediaToken();

  const allItems = useMemo(() => buildListenItems(unit), [unit]);
  const filterOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'Tất cả' }, ...(unit.parts ?? []).map((p) => ({ value: `p${p.order}`, label: `Part ${p.order}` }))];
    if (allItems.some((i) => i.filter === VOCAB)) options.push({ value: VOCAB, label: 'Từ vựng' });
    return options;
  }, [unit.parts, allItems]);

  const [filter, setFilter] = useState('all');
  const items = useMemo(() => (filter === 'all' ? allItems : allItems.filter((i) => i.filter === filter)), [allItems, filter]);

  const [index, setIndex] = useState(0);
  const [state, setState] = useState<PlaybackState>('idle');
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [looping, setLooping] = useState(false);
  // Mặc định EN → VN như web (SymRenderer playOrder 'en_then_vi', đổi 27/10/2026)
  const [viFirst, setViFirst] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [delay, setDelay] = useState(3);
  const [rate, setRate] = useState(1);

  // Vòng phát là hàm async chạy nền → các tuỳ chọn đọc qua ref để đổi giữa chừng ăn ngay câu kế.
  const opts = useRef({ looping, viFirst, delay, rate, token: mediaToken?.media_token });
  opts.current = { looping, viFirst, delay, rate, token: mediaToken?.media_token };

  const playerRef = useRef<AudioPlayer | null>(null);
  /** Mỗi lần Start/Prev/Next/Stop tăng số này; vòng phát cũ thấy lệch số là tự thoát. */
  const runRef = useRef(0);
  const cancelPending = useRef<(() => void) | null>(null);
  const queueRef = useRef<number[]>([]);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
    const player = createAudioPlayer(null, { updateInterval: 250 });
    playerRef.current = player;
    return () => {
      runRef.current += 1;
      cancelPending.current?.();
      player.remove();
      playerRef.current = null;
    };
  }, []);

  const current = items[index] ?? null;
  useEffect(() => {
    onProgress(items.length ? Math.min(index + 1, items.length) : 0, items.length, current?.context ?? '');
  }, [index, items.length, current, onProgress]);

  const stopAudio = useCallback(() => {
    cancelPending.current?.();
    cancelPending.current = null;
    playerRef.current?.pause();
    setLoading(false);
  }, []);

  const playUrl = useCallback((url?: string) => {
    const player = playerRef.current;
    const uri = resolveMediaUrl(url, opts.current.token);
    if (!player || !uri) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        sub.remove();
        clearTimeout(timer);
        setLoading(false);
        cancelPending.current = null;
        resolve();
      };
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded && status.playing) setLoading(false);
        if (status.didJustFinish) finish();
      });
      const timer = setTimeout(() => {
        showToast('error', 'Không phát được audio', 'Kiểm tra kết nối mạng rồi thử lại.');
        finish();
      }, AUDIO_TIMEOUT_MS);
      cancelPending.current = finish;

      setLoading(true);
      player.replace({ uri });
      player.setPlaybackRate(opts.current.rate);
      player.play();
    });
  }, []);

  const wait = useCallback((seconds: number) => {
    if (seconds <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, seconds * 1000);
      function done() {
        clearTimeout(timer);
        cancelPending.current = null;
        resolve();
      }
      cancelPending.current = done;
    });
  }, []);

  const runFrom = useCallback(
    async (queue: number[], start: number) => {
      const run = ++runRef.current;
      const alive = () => runRef.current === run;
      setPaused(false);

      for (let qi = start; qi < queue.length; qi++) {
        const item = items[queue[qi]];
        if (!item || !alive()) break;
        setIndex(queue[qi]);

        for (;;) {
          const first = opts.current.viFirst ? item.audioVi : item.audioEn;
          const second = opts.current.viFirst ? item.audioEn : item.audioVi;

          setState('first');
          await playUrl(first);
          if (!alive()) return;

          if (first && second) {
            setState('waiting');
            await wait(opts.current.delay);
            if (!alive()) return;
          }

          setState('second');
          await playUrl(second);
          if (!alive()) return;

          if (!opts.current.looping) break;
          setState('waiting');
          await wait(opts.current.delay);
          if (!alive()) return;
        }
      }

      if (alive()) setState('idle');
    },
    [items, playUrl, wait],
  );

  const buildQueue = useCallback(
    (startIdx: number) => {
      const indices = items.map((_, i) => i);
      if (!shuffle) return [...indices.slice(startIdx), ...indices.slice(0, startIdx)];
      const rest = indices.filter((i) => i !== startIdx);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      return [startIdx, ...rest];
    },
    [items, shuffle],
  );

  const start = useCallback(
    (from: number) => {
      stopAudio();
      const queue = buildQueue(from);
      queueRef.current = queue;
      void runFrom(queue, 0);
    },
    [buildQueue, runFrom, stopAudio],
  );

  const stop = useCallback(() => {
    runRef.current += 1;
    stopAudio();
    setState('idle');
    setPaused(false);
    setIndex(0);
    setLooping(false);
  }, [stopAudio]);

  const togglePlay = useCallback(() => {
    if (state !== 'idle') {
      // Tạm dừng: dừng vòng phát nhưng giữ câu đang học, bấm lại là phát lại đúng câu đó.
      runRef.current += 1;
      stopAudio();
      setState('idle');
      setPaused(true);
      return;
    }
    if (paused) {
      const queue = queueRef.current;
      const qi = queue.indexOf(index);
      if (qi >= 0) void runFrom(queue, qi);
      else start(index);
      return;
    }
    start(index);
  }, [state, paused, index, runFrom, start, stopAudio]);

  const jump = useCallback(
    (dir: -1 | 1) => {
      if (!items.length) return;
      const next = (index + dir + items.length) % items.length;
      const wasActive = state !== 'idle' || paused;
      runRef.current += 1;
      stopAudio();
      setState('idle');
      setPaused(false);
      setIndex(next);
      if (wasActive) start(next);
    },
    [items.length, index, state, paused, start, stopAudio],
  );

  // Đổi bộ lọc → về câu đầu, dừng hẳn. (Đổi unit thì cha đã remount bằng key.)
  const changeFilter = useCallback(
    (next: string) => {
      runRef.current += 1;
      stopAudio();
      setFilter(next);
      setIndex(0);
      setState('idle');
      setPaused(false);
      setLooping(false);
    },
    [stopAudio],
  );

  useEffect(() => {
    playerRef.current?.setPlaybackRate(rate);
  }, [rate]);

  if (!allItems.length) {
    return <Text className="py-8 text-center text-[13px] text-muted">Unit này chưa có câu luyện nghe.</Text>;
  }

  const active = state !== 'idle';
  const hideSecond = state === 'first' || state === 'waiting';
  const showVi = !hideSecond || viFirst;
  const showEn = !hideSecond || !viFirst;

  return (
    <View className="gap-3">
      <FilterChips items={filterOptions} value={filter} onChange={changeFilter} />

      <FocusPicture imageUrl={unit.picture?.imageUrl} focus={current?.focus} label={current?.focusLabel} />

      {/* ═══ Thẻ câu — chỉ hiện câu đang phát, như Everyday English ═══ */}
      <View className="min-h-[190px] items-center justify-center rounded-2xl border border-brand-soft bg-surface px-5 py-6">
        {current ? (
          <>
            {showVi ? <Text className="text-center text-[17px] font-bold italic leading-6 text-brand">{current.vi}</Text> : null}
            {showEn ? (
              <Text className="mt-3 text-center text-[22px] font-black leading-8 text-foreground">{current.en}</Text>
            ) : null}
            {showEn && current.ipa ? (
              <Text className="mt-3 text-center font-mono text-[13px] leading-5 text-muted">{current.ipa}</Text>
            ) : null}

            <View className="mt-3 flex-row flex-wrap items-center justify-center gap-2">
              {state === 'first' || state === 'second' ? (
                <Status icon="volume-high" text={`Đang phát ${(state === 'first') === viFirst ? 'tiếng Việt' : 'tiếng Anh'}…`} />
              ) : null}
              {state === 'waiting' ? <Status icon="hourglass-outline" text="Tới lượt bạn nói…" muted /> : null}
              {looping && (active || paused) ? <Status icon="repeat" text="Đang lặp câu này" /> : null}
              {paused ? <Status icon="pause" text="Đã tạm dừng" /> : null}
            </View>
          </>
        ) : null}
      </View>

      {/* ═══ Nút phát ═══ */}
      <View className="flex-row items-center justify-center gap-3">
        <RoundButton icon="play-skip-back" label="Câu trước" onPress={() => jump(-1)} />
        <RoundButton icon="stop" label="Dừng" onPress={stop} disabled={!active && !paused} />
        <Pressable
          onPress={togglePlay}
          accessibilityLabel={active ? 'Tạm dừng' : 'Phát'}
          className="h-16 w-16 items-center justify-center rounded-full bg-brand active:opacity-80">
          {loading ? (
            <ActivityIndicator color={onBrand} />
          ) : (
            <Ionicons name={active ? 'pause' : 'play'} size={28} color={onBrand} style={{ marginLeft: active ? 0 : 3 }} />
          )}
        </Pressable>
        <RoundButton
          icon="repeat"
          label={looping ? 'Tắt lặp câu' : 'Lặp câu'}
          on={looping}
          onPress={() => {
            setLooping((v) => !v);
            if (!looping && !active && !paused) start(index);
          }}
        />
        <RoundButton icon="play-skip-forward" label="Câu sau" onPress={() => jump(1)} />
      </View>

      {/* ═══ Tuỳ chọn ═══ */}
      <View className="gap-2.5 rounded-2xl border border-border bg-surface p-3">
        <OptionRow label="Thứ tự phát">
          <Toggle items={[{ value: 'seq', label: 'Thứ tự' }, { value: 'rand', label: 'Ngẫu nhiên' }]} value={shuffle ? 'rand' : 'seq'} onChange={(v) => setShuffle(v === 'rand')} />
        </OptionRow>
        <OptionRow label="Chiều nghe">
          <Toggle items={[{ value: 'vi', label: 'VN → EN' }, { value: 'en', label: 'EN → VN' }]} value={viFirst ? 'vi' : 'en'} onChange={(v) => setViFirst(v === 'vi')} />
        </OptionRow>
        <OptionRow label="Tốc độ">
          <Toggle items={RATES.map((r) => ({ value: String(r), label: `${r}x` }))} value={String(rate)} onChange={(v) => setRate(Number(v))} />
        </OptionRow>
        <OptionRow label="Thời gian chờ">
          <View className="flex-row items-center gap-2">
            <Stepper icon="remove" onPress={() => setDelay((d) => Math.max(0, d - 1))} color={foreground} />
            <Text className="w-14 text-center text-[13px] font-bold text-foreground">{delay} giây</Text>
            <Stepper icon="add" onPress={() => setDelay((d) => Math.min(30, d + 1))} color={foreground} />
          </View>
        </OptionRow>
      </View>
    </View>
  );
}

function Status({ icon, text, muted }: { icon: keyof typeof Ionicons.glyphMap; text: string; muted?: boolean }) {
  const brand = useThemeColor('brand');
  const mutedColor = useThemeColor('muted');
  return (
    <View className={`flex-row items-center gap-1.5 rounded-full px-3 py-1 ${muted ? 'bg-surface-muted' : 'bg-brand-soft'}`}>
      <Ionicons name={icon} size={12} color={muted ? mutedColor : brand} />
      <Text className={`text-[12px] font-semibold ${muted ? 'text-muted' : 'text-brand'}`}>{text}</Text>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  disabled,
  on,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  on?: boolean;
}) {
  const foreground = useThemeColor('foreground');
  const onBrand = useThemeColor('on-brand');
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className={`h-12 w-12 items-center justify-center rounded-full active:opacity-70 ${on ? 'bg-brand' : 'bg-surface-muted'} ${disabled ? 'opacity-40' : ''}`}>
      <Ionicons name={icon} size={20} color={on ? onBrand : foreground} />
    </Pressable>
  );
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-[13px] font-semibold text-muted">{label}</Text>
      {children}
    </View>
  );
}

function Toggle<T extends string>({ items, value, onChange }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row rounded-xl bg-surface-muted p-1">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable
            key={it.value}
            onPress={() => onChange(it.value)}
            accessibilityState={{ selected: on }}
            className={`h-7 items-center justify-center rounded-lg px-3 ${on ? 'bg-brand' : ''}`}>
            <Text className={`text-[12px] font-bold ${on ? 'text-on-brand' : 'text-muted'}`}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stepper({ icon, onPress, color }: { icon: 'add' | 'remove'; onPress: () => void; color: string }) {
  return (
    <Pressable onPress={onPress} className="h-8 w-8 items-center justify-center rounded-lg bg-surface-muted active:opacity-70">
      <Ionicons name={icon} size={16} color={color} />
    </Pressable>
  );
}
