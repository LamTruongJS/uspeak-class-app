import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

import type { TvstAudio } from './audio';
import type { TvstBizAssignmentUnit, TvstParagraph } from './types';

/**
 * Các khối làm bài STEP 4–6 của "Từ Vựng Siêu Tốc đi làm" — dùng chung cho bài tập tự chấm
 * (tvst-business-assignment.tsx, kết quả do BE chấm) và bài luyện tập E-Learning cũ
 * (tvst-business-practice.tsx, tự so đáp án trên máy). `results` không truyền = chưa chấm.
 */

export type BlankState = 'idle' | 'ok' | 'near' | 'bad';
export const RATES = [0.75, 1, 1.25];

export const blankKeysOf = (paragraphs: TvstParagraph[]) => paragraphs.flatMap((p, pi) => p.blanks.map((_, i) => `${pi}-${i}`));

/** So đáp án ở bản luyện tập: bỏ hoa/thường, dấu câu, gạch nối ("to-do" = "to do") và khoảng trắng thừa — như web */
export function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[-–]/g, ' ')
    .replace(/[.,!?;:"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function blankState(key: string, results?: Record<string, boolean>, near?: Record<string, true>): BlankState {
  // Bản luyện tập chỉ chấm ô đã điền → ô không có trong `results` vẫn để trống như chưa chấm (như web)
  if (!results || !(key in results)) return 'idle';
  if (!results[key]) return 'bad';
  return near?.[key] ? 'near' : 'ok';
}
const STATE_INPUT: Record<BlankState, string> = {
  idle: 'border-muted text-brand',
  ok: 'border-success text-success',
  near: 'border-warning text-warning',
  bad: 'border-danger text-danger line-through',
};

/** Chữ có cụm <kw>…</kw> → cụm in đậm màu thương hiệu (như renderKw của web) */
export function KwText({ text, className }: { text: string; className?: string }) {
  return (
    <Text className={className}>
      {text.split(/(<kw>.*?<\/kw>)/g).map((part, i) => {
        const m = part.match(/^<kw>(.*?)<\/kw>$/);
        return m ? (
          <Text key={i} className="font-bold text-brand">
            {m[1]}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        );
      })}
    </Text>
  );
}

// ─── STEP 4: truyện chêm ────────────────────────────────────────────────────

export function CodeSwitchExam({
  id,
  title,
  hint,
  paragraphs,
  answers,
  results,
  near,
  readOnly,
  audio,
  onChange,
}: {
  id: string;
  title: string;
  hint: string;
  paragraphs: TvstParagraph[];
  answers: Record<string, string>;
  results?: Record<string, boolean>;
  near?: Record<string, true>;
  readOnly: boolean;
  audio: TvstAudio;
  onChange: (key: string, value: string) => void;
}) {
  const navy = useThemeColor('navy');
  const onBrand = useThemeColor('on-brand');
  const success = useThemeColor('success');
  const [reading, setReading] = useState<{ p: number; part: number; kind: 'text' | 'blank' } | null>(null);
  const [rate, setRate] = useState(1);
  const run = useRef(0);
  const inputs = useRef<Record<string, TextInput | null>>({});
  const blankKeys = useMemo(() => blankKeysOf(paragraphs), [paragraphs]);
  const hasAudio = paragraphs.some((p) => p.audioParts?.some(Boolean));
  const playing = reading !== null;

  useEffect(
    () => () => {
      run.current++;
    },
    [],
  );

  const stopAll = () => {
    run.current++;
    audio.stop();
    setReading(null);
  };

  /** Đọc cả bài: chữ → nghĩa tiếng Việt ở chỗ chêm → chữ…, sáng chỗ đang đọc */
  const playAll = async () => {
    const token = ++run.current;
    const alive = () => run.current === token;
    audio.setRate(rate);
    for (let p = 0; p < paragraphs.length; p++) {
      const parts = paragraphs[p].text.split(/<kw>.*?<\/kw>/);
      for (let part = 0; part < parts.length; part++) {
        const textUrl = paragraphs[p].audioParts?.[part];
        if (textUrl) {
          setReading({ p, part, kind: 'text' });
          if (!(await audio.play(textUrl, `${id}-t-${p}-${part}`)) || !alive()) return void (alive() && setReading(null));
        }
        const blank = paragraphs[p].blanks[part];
        if (blank?.audioVi) {
          setReading({ p, part, kind: 'blank' });
          if (!(await audio.play(blank.audioVi, `${id}-vi-${p}-${part}`)) || !alive()) return void (alive() && setReading(null));
        }
      }
      await new Promise((r) => setTimeout(r, 400));
      if (!alive()) return;
    }
    setReading(null);
  };

  return (
    <View className="gap-2">
      <View className="gap-0.5 px-1">
        <Text className="text-[15px] font-black text-brand">{title}</Text>
        <Text className="text-[12px] text-muted">{hint}</Text>
      </View>
      {hasAudio ? (
        <View className="flex-row items-center gap-2 px-1">
          <View className="flex-row rounded-full bg-surface-muted p-0.5">
            {RATES.map((r) => (
              <Pressable
                key={r}
                onPress={() => {
                  setRate(r);
                  audio.setRate(r);
                }}
                className={`rounded-full px-2.5 py-1 ${rate === r ? 'bg-surface' : ''}`}>
                <Text className={`text-[12px] font-bold ${rate === r ? 'text-brand' : 'text-muted'}`}>{r}x</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => (playing ? stopAll() : void playAll())} className="flex-row items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 active:opacity-80">
            <Ionicons name={playing ? 'stop' : 'headset'} size={14} color={onBrand} />
            <Text className="text-[12.5px] font-bold text-on-brand">{playing ? 'Dừng' : 'Phát toàn bài'}</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="gap-3 rounded-2xl bg-surface p-4">
        {paragraphs.map((paragraph, p) => {
          let textIndex = 0;
          let blankIndex = -1;
          return (
            <View key={p} className="flex-row flex-wrap items-center">
              {paragraph.text.split(/(<kw>.*?<\/kw>)/g).map((piece, k) => {
                if (!/^<kw>.*<\/kw>$/.test(piece)) {
                  const part = textIndex++;
                  const lit = reading?.p === p && reading.kind === 'text' && reading.part === part;
                  // Tách từng chữ để xuống dòng tự nhiên quanh ô nhập (TextInput không nằm trong <Text> được)
                  return piece
                    .split(/(\s+)/)
                    .filter((w) => w && !/^\s+$/.test(w))
                    .map((word, wi) => (
                      <Text key={`${k}-${wi}`} className={`mr-1 text-[15.5px] leading-8 ${lit ? 'text-brand' : 'text-foreground'}`}>
                        {word}
                      </Text>
                    ));
                }
                blankIndex++;
                const i = blankIndex;
                const blank = paragraph.blanks[i];
                if (!blank) return null;
                const key = `${p}-${i}`;
                const speakKey = `${id}-vi-${p}-${i}`;
                const lit = reading?.p === p && reading.kind === 'blank' && reading.part === i;
                const state = blankState(key, results, near);
                const width = blank.length || blank.en.length || 12;
                const active = audio.playingKey === speakKey || lit;
                return (
                  <View key={k} className="mr-1 flex-row items-center">
                    <Pressable
                      hitSlop={6}
                      onPress={() => {
                        if (playing) stopAll();
                        audio.toggle(blank.audioVi, speakKey);
                      }}
                      className={`h-6 w-6 items-center justify-center rounded-full ${active ? 'bg-navy' : ''}`}>
                      <Ionicons name={audio.playingKey === speakKey ? 'pause' : 'volume-high'} size={13} color={active ? onBrand : navy} />
                    </Pressable>
                    <TextInput
                      ref={(el) => {
                        inputs.current[key] = el;
                      }}
                      value={answers[key] || ''}
                      editable={!readOnly}
                      placeholder={readOnly && !answers[key] ? '(bỏ trống)' : undefined}
                      onChangeText={(v) => onChange(key, v)}
                      onSubmitEditing={() => inputs.current[blankKeys[blankKeys.indexOf(key) + 1]]?.focus()}
                      returnKeyType="next"
                      submitBehavior="submit"
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      accessibilityLabel={`Chỗ trống ${blankKeys.indexOf(key) + 1}`}
                      className={`h-8 border-b-2 px-1 text-center text-[15px] font-semibold ${STATE_INPUT[state]} ${lit ? 'bg-brand-soft' : ''}`}
                      style={{ minWidth: Math.max(8, width + 1) * 8.5 }}
                    />
                    {state === 'ok' ? <Ionicons name="checkmark" size={15} color={success} /> : null}
                    {(state === 'bad' || state === 'near') && blank.en ? (
                      <Text className={`ml-1 text-[13.5px] font-bold ${state === 'near' ? 'text-warning' : 'text-success'}`}>
                        {state === 'near' ? `≈ ${blank.en}` : blank.en}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── STEP 5: dịch câu ───────────────────────────────────────────────────────

export function TranslateExam({
  items,
  answers,
  results,
  notes,
  readOnly,
  audio,
  onChange,
  revealed,
  onReveal,
}: {
  items: TvstBizAssignmentUnit['translation'];
  answers: Record<string, string>;
  results?: Record<string, boolean>;
  notes?: Record<string, string>;
  readOnly: boolean;
  audio: TvstAudio;
  onChange: (key: string, value: string) => void;
  /** Bản luyện tập (không chấm): câu đã bấm "Xem đáp án gợi ý" */
  revealed?: Set<number>;
  /** Có = bản luyện tập: hiện nút "Xem đáp án gợi ý" thay cho kết quả chấm */
  onReveal?: (index: number) => void;
}) {
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  return (
    <View className="gap-3">
      <Requirement>
        Dịch các câu sau sang tiếng Việt. Câu được tính đúng khi bạn dịch đúng nghĩa cụm tô đậm — phần còn lại dịch theo cách của bạn.
      </Requirement>
      {items.map((item, i) => {
        const result = results?.[i];
        return (
          <View key={i} className="gap-2 rounded-2xl bg-surface p-4">
            <View className="flex-row items-start gap-2">
              <Text className="h-6 w-6 rounded-full bg-brand-soft text-center text-[12px] font-bold leading-6 text-brand">{i + 1}</Text>
              <KwText text={item.en} className="flex-1 text-[15px] leading-6 text-foreground" />
              {item.audioEn ? <SpeakButton active={audio.playingKey === `tr-en-${i}`} onPress={() => audio.toggle(item.audioEn, `tr-en-${i}`)} /> : null}
            </View>
            <TextInput
              value={answers[i] || ''}
              editable={!readOnly}
              onChangeText={(v) => onChange(String(i), v)}
              multiline
              placeholder={readOnly ? '(bỏ trống)' : 'Bản dịch của bạn...'}
              placeholderTextColor={muted}
              className={`min-h-[64px] rounded-xl border bg-background px-3 py-2 text-[14.5px] text-foreground ${
                result === undefined ? 'border-border' : result ? 'border-success' : 'border-danger'
              }`}
              style={{ textAlignVertical: 'top' }}
            />
            {result !== undefined ? (
              <View className="gap-1 rounded-xl bg-surface-muted p-3">
                <Text className={`text-[11.5px] font-bold ${result ? 'text-success' : 'text-danger'}`}>
                  {result ? 'Đạt — đã dịch đúng cụm tô đậm' : 'Chưa đạt — so với đáp án gợi ý'}
                </Text>
                {!result && notes?.[i] ? <Text className="text-[12.5px] text-foreground">{notes[i]}</Text> : null}
                <View className="flex-row items-start gap-2">
                  <KwText text={item.vi} className="flex-1 text-[13.5px] leading-5 text-foreground" />
                  {item.audioVi ? <SpeakButton active={audio.playingKey === `tr-vi-${i}`} onPress={() => audio.toggle(item.audioVi, `tr-vi-${i}`)} /> : null}
                </View>
              </View>
            ) : onReveal && revealed?.has(i) ? (
              <View className="flex-row items-start gap-2 rounded-xl bg-surface-muted p-3">
                <KwText text={item.vi} className="flex-1 text-[13.5px] leading-5 text-foreground" />
                {item.audioVi ? <SpeakButton active={audio.playingKey === `tr-vi-${i}`} onPress={() => audio.toggle(item.audioVi, `tr-vi-${i}`)} /> : null}
              </View>
            ) : onReveal ? (
              <Pressable onPress={() => onReveal(i)} className="flex-row items-center gap-1.5 self-start py-1">
                <Ionicons name="eye-outline" size={15} color={brand} />
                <Text className="text-[13px] font-semibold text-brand">Xem đáp án gợi ý</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ─── STEP 6: điền chỗ trống ─────────────────────────────────────────────────

const normalizeChip = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();

export function GapFillExam({
  items,
  bank,
  answers,
  results,
  near,
  readOnly,
  audio,
  onChange,
}: {
  items: TvstBizAssignmentUnit['gapfill'];
  bank: string[];
  answers: Record<string, string>;
  results?: Record<string, boolean>;
  near?: Record<string, true>;
  readOnly: boolean;
  audio: TvstAudio;
  onChange: (key: string, value: string) => void;
}) {
  const [focused, setFocused] = useState<number | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);
  const used = new Set(Object.values(answers).map(normalizeChip));

  /** Bấm cụm từ: điền vào ô đang chọn (hoặc ô trống đầu tiên) rồi nhảy tới ô trống kế tiếp */
  const pickChip = (chip: string) => {
    let target = focused;
    if (target === null || answers[target]?.trim()) target = items.findIndex((_, i) => !answers[i]?.trim());
    if (target === null || target < 0) return;
    onChange(String(target), chip);
    const next = items.findIndex((_, i) => i > target! && !answers[i]?.trim());
    if (next >= 0) setFocused(next);
  };

  return (
    <View className="gap-3">
      <Requirement>Điền cụm từ phù hợp vào chỗ trống. Gõ trực tiếp, hoặc chọn một ô rồi bấm cụm từ trong khung bên dưới. Mỗi cụm dùng một lần.</Requirement>
      {!readOnly && bank.length ? (
        <View className="flex-row flex-wrap gap-1.5 rounded-2xl bg-surface p-3">
          {bank.map((chip, i) => {
            const isUsed = used.has(normalizeChip(chip));
            return (
              <Pressable key={i} onPress={() => pickChip(chip)} className={`rounded-full border px-3 py-1 ${isUsed ? 'border-border bg-surface-muted opacity-50' : 'border-brand bg-brand-soft'}`}>
                <Text className={`text-[13px] font-semibold ${isUsed ? 'text-muted line-through' : 'text-brand'}`}>{chip}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {items.map((item, i) => {
        const [before, after] = item.text.split('___');
        const state = blankState(String(i), results, near);
        const isFocused = focused === i && !readOnly;
        return (
          <View key={i} className={`gap-2 rounded-2xl bg-surface p-4 ${isFocused ? 'border border-brand' : ''}`}>
            <View className="flex-row items-start gap-2">
              <Text className="h-6 w-6 rounded-full bg-brand-soft text-center text-[12px] font-bold leading-6 text-brand">{i + 1}</Text>
              <View className="flex-1 flex-row flex-wrap items-center">
                {(before || '')
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((w, wi) => (
                    <Text key={`b${wi}`} className="mr-1 text-[15px] leading-8 text-foreground">
                      {w}
                    </Text>
                  ))}
                <TextInput
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  value={answers[i] || ''}
                  editable={!readOnly}
                  placeholder={readOnly && !answers[i] ? '(bỏ trống)' : undefined}
                  onChangeText={(v) => onChange(String(i), v)}
                  onFocus={() => setFocused(i)}
                  onSubmitEditing={() => inputs.current[i + 1]?.focus()}
                  returnKeyType="next"
                  submitBehavior="submit"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  accessibilityLabel={`Chỗ trống câu ${i + 1}`}
                  className={`mr-1 h-8 border-b-2 px-1 text-center text-[15px] font-semibold ${STATE_INPUT[state]}`}
                  style={{ minWidth: Math.max(12, (item.length || item.answer.length) + 2) * 8 }}
                />
                {(after || '')
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((w, wi) => (
                    <Text key={`a${wi}`} className="mr-1 text-[15px] leading-8 text-foreground">
                      {w}
                    </Text>
                  ))}
              </View>
              {item.audio ? <SpeakButton active={audio.playingKey === `gap-${i}`} onPress={() => audio.toggle(item.audio, `gap-${i}`)} /> : null}
            </View>
            {state !== 'idle' ? (
              <Text className={`pl-8 text-[13.5px] ${state === 'ok' ? 'text-success' : state === 'near' ? 'text-warning' : 'text-danger'}`}>
                {state === 'ok' ? 'Đúng rồi!' : state === 'near' ? 'Gần đúng, vẫn tính điểm — đáp án chuẩn:' : 'Đáp án:'}{' '}
                {state !== 'ok' ? <Text className="font-bold">{item.answer}</Text> : null}
              </Text>
            ) : null}
            {item.vi && state !== 'idle' ? <Text className="pl-8 text-[12.5px] text-muted">{item.vi}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

export function Requirement({ children }: { children: ReactNode }) {
  return <Text className="px-1 text-[13px] leading-5 text-muted">{children}</Text>;
}

export function SpeakButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const brand = useThemeColor('brand');
  return (
    <Pressable hitSlop={8} onPress={onPress} className="pt-0.5">
      <Ionicons name={active ? 'pause-circle' : 'volume-high'} size={20} color={brand} />
    </Pressable>
  );
}
