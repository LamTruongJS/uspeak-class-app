import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Segmented } from '@/components/ui/segmented';
import { useThemeColor } from '@/theme/use-theme-color';

import type { TvstAudio } from './audio';
import { KwText } from './exams';
import type { TvstBizChunk, TvstBizLine } from './types';

/**
 * STEP 1 (Nghe & nói) và STEP 2 (Song ngữ) — bản mobile của StoryPanel (class-fe TvstBusinessRenderer).
 * Vòng chạy: nghe câu gợi ý → chờ học viên tự nói / tự dịch (đếm ngược, "Hiện ngay") → hiện đáp án
 * (song ngữ đọc luôn câu đáp án) → tự sang câu sau / lặp câu. STEP 1 mặc định không chờ (nói đuổi theo),
 * STEP 2 chờ 3 giây và mặc định Việt → Anh.
 */

type Direction = 'en-vi' | 'vi-en';
type Phase = 'idle' | 'prompt' | 'wait' | 'answer';
const SPEEDS = [0.75, 1, 1.25];
const WAITS = [0, 3, 5, 8];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stripKw = (text: string) => text.replace(/<\/?kw>/g, '');

export function StoryPanel({ lines, bilingual, audio }: { lines: TvstBizLine[]; bilingual: boolean; audio: TvstAudio }) {
  const onBrand = useThemeColor('on-brand');
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const { play, stop, toggle, setRate, playingKey } = audio;

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [autoNext, setAutoNext] = useState(true);
  const [looping, setLooping] = useState(false);
  const [rate, setRateState] = useState(1);
  const [waitSeconds, setWaitSeconds] = useState(bilingual ? 3 : 0);
  const [direction, setDirection] = useState<Direction>('vi-en');

  const run = useRef(0);
  const skip = useRef(false);
  const settings = useRef({ autoNext, looping, waitSeconds });
  useEffect(() => {
    settings.current = { autoNext, looping, waitSeconds };
  }, [autoNext, looping, waitSeconds]);
  useEffect(() => setRate(rate), [rate, setRate]);

  const running = phase !== 'idle';
  const line = lines[index];

  const stopRun = useCallback(() => {
    run.current++;
    stop();
    setPhase('idle');
    setCountdown(0);
  }, [stop]);

  const runFrom = useCallback(
    async (start: number) => {
      const token = ++run.current;
      const alive = () => run.current === token;
      for (let i = start; i < lines.length; i++) {
        const current = lines[i];
        setIndex(i);
        setRevealed((prev) => {
          const next = new Set(prev);
          next.delete(i);
          return next;
        });
        // 1. Nghe câu gợi ý
        setPhase('prompt');
        await play(bilingual && direction === 'vi-en' ? current.audioVi : current.audioEn, `prompt-${i}`);
        if (!alive()) return;
        // 2. Chờ học viên tự nói / tự dịch
        const seconds = settings.current.waitSeconds;
        if (seconds > 0) {
          setPhase('wait');
          skip.current = false;
          const deadline = Date.now() + seconds * 1000;
          while (Date.now() < deadline && !skip.current) {
            setCountdown(Math.ceil((deadline - Date.now()) / 1000));
            await sleep(100);
            if (!alive()) return;
          }
          setCountdown(0);
        }
        // 3. Hiện đáp án (song ngữ đọc luôn câu đáp án)
        setRevealed((prev) => new Set(prev).add(i));
        setPhase('answer');
        if (bilingual) {
          await play(direction === 'vi-en' ? current.audioEn : current.audioVi, `answer-${i}`);
          if (!alive()) return;
        }
        const { looping: loop, autoNext: next } = settings.current;
        if (!loop && !next) break;
        await sleep(settings.current.waitSeconds > 0 || bilingual ? 2000 : 400);
        if (!alive()) return;
        if (settings.current.looping) i--;
        else if (!settings.current.autoNext) break;
      }
      if (alive()) setPhase('idle');
    },
    [bilingual, direction, lines, play],
  );

  // Đổi chiều dịch → làm lại từ đầu
  const changeDirection = (d: Direction) => {
    stopRun();
    setRevealed(new Set());
    setIndex(0);
    setDirection(d);
  };
  useEffect(
    () => () => {
      run.current++;
    },
    [],
  );

  const goTo = (next: number) => {
    const target = Math.max(0, Math.min(lines.length - 1, next));
    if (running) void runFrom(target);
    else setIndex(target);
  };

  /** Bấm loa ở cụm từ thì dừng vòng chạy tự động để khỏi chồng tiếng */
  const speak = (url: string | undefined, key: string) => {
    if (running) stopRun();
    toggle(url, key);
  };

  if (!line) return <Text className="py-8 text-center text-[13px] text-muted">Unit này chưa có câu chuyện.</Text>;

  const viFirst = bilingual && direction === 'vi-en';
  // STEP 1 luôn hiện câu + IPA. Song ngữ: chưa chạy thì để sẵn cả hai vế; đang nghe/chờ thì giấu vế đáp án.
  const isShown = !running || revealed.has(index) || phase === 'answer';
  const showEn = !bilingual || isShown || !viFirst;
  const showVi = bilingual && (isShown || viFirst);

  return (
    <View className="gap-3">
      {bilingual ? (
        <Segmented
          items={[
            { value: 'vi-en', label: 'Việt → Anh' },
            { value: 'en-vi', label: 'Anh → Việt' },
          ]}
          value={direction}
          onChange={changeDirection}
        />
      ) : null}

      {/* Cài đặt: tốc độ · chờ nói · lặp câu · tự chuyển câu */}
      <View className="flex-row flex-wrap items-center gap-2">
        <Pills items={SPEEDS.map((v) => ({ value: v, label: `${v}x` }))} value={rate} onChange={setRateState} />
        <Pills items={WAITS.map((v) => ({ value: v, label: v ? `Chờ ${v}s` : 'Không chờ' }))} value={waitSeconds} onChange={setWaitSeconds} />
        <Toggle icon="repeat" label="Lặp câu" on={looping} onPress={() => setLooping((v) => !v)} />
        <Toggle icon="list" label="Tự chuyển" on={autoNext} onPress={() => setAutoNext((v) => !v)} />
      </View>

      {/* Thẻ câu */}
      <View className="gap-3 rounded-3xl bg-surface p-4">
        <View className="min-h-[24px] flex-row items-center justify-between gap-2">
          <Text className="text-[12px] font-bold text-muted">
            Câu {index + 1}/{lines.length}
          </Text>
          {phase === 'prompt' ? (
            <Badge icon="headset" text={`Đang phát ${viFirst ? 'tiếng Việt' : 'tiếng Anh'}...`} />
          ) : phase === 'wait' ? (
            <View className="flex-row items-center gap-2">
              <Badge icon="mic" text={`Đến lượt bạn nói · ${countdown}s`} />
              <Pressable hitSlop={6} onPress={() => (skip.current = true)}>
                <Text className="text-[12px] font-bold text-brand">Hiện ngay</Text>
              </Pressable>
            </View>
          ) : phase === 'answer' && bilingual && playingKey === `answer-${index}` ? (
            <Badge icon="headset" text={`Đang phát ${viFirst ? 'tiếng Anh' : 'tiếng Việt'}...`} />
          ) : null}
        </View>

        {bilingual && viFirst ? (
          <Text className={`text-[17px] font-semibold leading-7 text-foreground ${showVi ? '' : 'opacity-0'}`}>{stripKw(line.vi)}</Text>
        ) : null}
        {showEn ? (
          <View className="gap-1">
            <KwText text={line.en} className="text-[19px] font-semibold leading-8 text-foreground" />
            {line.ipa ? <Text className="text-[13.5px] text-muted">{line.ipa}</Text> : null}
          </View>
        ) : (
          <Text className="text-[13px] italic text-muted">Nói câu tiếng Anh của bạn…</Text>
        )}
        {bilingual && !viFirst ? (
          showVi ? (
            <Text className="text-[16px] leading-6 text-foreground">{stripKw(line.vi)}</Text>
          ) : (
            <Text className="text-[13px] italic text-muted">Dịch sang tiếng Việt…</Text>
          )
        ) : null}

        <View className="h-1 overflow-hidden rounded-full bg-surface-muted">
          <View className="h-full rounded-full bg-brand" style={{ width: `${((index + 1) / lines.length) * 100}%` }} />
        </View>

        {/* Điều khiển */}
        <View className="flex-row gap-2">
          <Ctrl icon="play" primary disabled={running} onPress={() => void runFrom(index)} color={running ? muted : onBrand} />
          <Ctrl icon="stop" disabled={!running} onPress={stopRun} color={running ? brand : muted} />
          <Ctrl icon="chevron-back" disabled={index === 0} onPress={() => goTo(index - 1)} color={index === 0 ? muted : brand} />
          <Ctrl icon="chevron-forward" disabled={index >= lines.length - 1} onPress={() => goTo(index + 1)} color={index >= lines.length - 1 ? muted : brand} />
        </View>
      </View>

      {/* Cụm từ của câu đang học */}
      {line.chunks.length ? (
        <View className="gap-2">
          {line.chunks.map((chunk, c) => (
            <ChunkRow
              key={`${index}-${c}`}
              chunk={chunk}
              bilingual={bilingual}
              viFirst={viFirst}
              showAnswer={isShown}
              playingKey={playingKey}
              keyPrefix={`chunk-${index}-${c}`}
              onSpeak={speak}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Cụm từ của câu đang học — bám chiều đang luyện: STEP 1 tiếng Anh + IPA; STEP 2 Anh→Việt: tiếng Anh là đề,
 * nghĩa là đáp án; Việt→Anh: nghĩa là đề. Đang nghe/chờ thì giấu vế đáp án.
 */
function ChunkRow({
  chunk,
  bilingual,
  viFirst,
  showAnswer,
  playingKey,
  keyPrefix,
  onSpeak,
}: {
  chunk: TvstBizChunk;
  bilingual: boolean;
  viFirst: boolean;
  showAnswer: boolean;
  playingKey: string | null;
  keyPrefix: string;
  onSpeak: (url: string | undefined, key: string) => void;
}) {
  const brand = useThemeColor('brand');
  const showEn = !bilingual || !viFirst || showAnswer;
  const showVi = bilingual && (viFirst || showAnswer);
  const en = showEn ? (
    <View className="flex-row items-center gap-2">
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-brand">{chunk.en}</Text>
        {chunk.ipa ? <Text className="text-[12px] text-muted">{chunk.ipa}</Text> : null}
      </View>
      {chunk.audioEn ? (
        <Pressable hitSlop={8} onPress={() => onSpeak(chunk.audioEn, `${keyPrefix}-en`)}>
          <Ionicons name={playingKey === `${keyPrefix}-en` ? 'pause-circle' : 'volume-high'} size={20} color={brand} />
        </Pressable>
      ) : null}
    </View>
  ) : (
    <Text className="text-[12.5px] italic text-muted">Đáp án hiện sau khi bạn nói</Text>
  );
  const vi = showVi ? (
    <View className="flex-row items-center gap-2">
      <Text className="flex-1 text-[14px] text-foreground">{chunk.vi}</Text>
      {chunk.audioVi ? (
        <Pressable hitSlop={8} onPress={() => onSpeak(chunk.audioVi, `${keyPrefix}-vi`)}>
          <Ionicons name={playingKey === `${keyPrefix}-vi` ? 'pause-circle' : 'volume-medium-outline'} size={19} color={brand} />
        </Pressable>
      ) : null}
    </View>
  ) : bilingual ? (
    <Text className="text-[12.5px] italic text-muted">Nghĩa hiện sau khi bạn dịch</Text>
  ) : null;
  return <View className="gap-1 rounded-2xl bg-surface p-3">{viFirst ? [vi, en] : [en, vi]}</View>;
}

function Pills<T extends number>({ items, value, onChange }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row rounded-full bg-surface-muted p-0.5">
      {items.map((it) => (
        <Pressable key={it.value} onPress={() => onChange(it.value)} className={`rounded-full px-2.5 py-1 ${value === it.value ? 'bg-surface' : ''}`}>
          <Text className={`text-[12px] font-bold ${value === it.value ? 'text-brand' : 'text-muted'}`}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Toggle({ icon, label, on, onPress }: { icon: 'repeat' | 'list'; label: string; on: boolean; onPress: () => void }) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  return (
    <Pressable onPress={onPress} className={`flex-row items-center gap-1 rounded-full px-2.5 py-1.5 ${on ? 'bg-brand-soft' : 'bg-surface-muted'}`}>
      <Ionicons name={icon} size={13} color={on ? brand : muted} />
      <Text className={`text-[12px] font-bold ${on ? 'text-brand' : 'text-muted'}`}>{label}</Text>
    </Pressable>
  );
}

function Badge({ icon, text }: { icon: 'headset' | 'mic'; text: string }) {
  const brand = useThemeColor('brand');
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1">
      <Ionicons name={icon} size={12} color={brand} />
      <Text className="text-[11.5px] font-bold text-brand">{text}</Text>
    </View>
  );
}

function Ctrl({
  icon,
  onPress,
  disabled,
  primary,
  color,
}: {
  icon: 'play' | 'stop' | 'chevron-back' | 'chevron-forward';
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`h-11 flex-1 items-center justify-center rounded-xl ${primary ? (disabled ? 'bg-brand-soft' : 'bg-brand') : 'bg-surface-muted'} active:opacity-80`}>
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}
