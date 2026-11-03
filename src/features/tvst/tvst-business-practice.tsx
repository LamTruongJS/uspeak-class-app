import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { FilterChips } from '@/components/ui/list-filters';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

import { useTvstAudio, type TvstAudio } from './audio';
import { blankKeysOf, CodeSwitchExam, GapFillExam, normalizeAnswer, TranslateExam } from './exams';
import { FlashcardPanel } from './flashcards';
import { StoryPanel } from './story-panel';
import type { TvstBizContent, TvstBizProgress, TvstBizUnit, TvstParagraph, TvstPracticeSection, TvstSection } from './types';

/**
 * Bài luyện tập E-Learning "Từ Vựng Siêu Tốc đi làm" (`practice_type: tvst_business`) — bản mobile của
 * class-fe my-classes/[classId]/renderers/TvstBusinessRenderer.tsx.
 *   STEP 1 Nghe & nói · STEP 2 Song ngữ · STEP 3 Thẻ cụm từ — tài liệu, không lưu gì.
 *   STEP 4–6 (truyện chêm / dịch câu / điền chỗ trống) — chỉ còn ở bài giao TRƯỚC 02/11/2026; bài mới có
 *   `content.material_only` (STEP 4–6 thành bài tập tự chấm). Bản này tự so đáp án trên máy, lưu từng phần
 *   ở PUT /elearning/tvst-business/progress (gom ~1 giây như web).
 */

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: 'Nghe & nói' },
  { step: 2, label: 'Song ngữ' },
  { step: 3, label: 'Thẻ cụm từ' },
  { step: 4, label: 'Truyện chêm' },
  { step: 5, label: 'Dịch câu' },
  { step: 6, label: 'Điền chỗ trống' },
];

const progressKey = (practiceId: string) => ['elearning', 'tvst-business-progress', practiceId] as const;

export function TvstBusinessPractice({ classId, practiceId, content }: { classId: string; practiceId: string; content: TvstBizContent | undefined }) {
  const units = useMemo(() => content?.units ?? [], [content]);
  const materialOnly = !!content?.material_only;
  const [unitIndex, setUnitIndex] = useState(0);
  const [step, setStep] = useState<Step>(1);
  const audio = useTvstAudio();
  const unit = units[unitIndex];

  const steps = STEPS.filter(
    (s) =>
      (!materialOnly || s.step <= 3) &&
      (s.step !== 4 || !!(unit?.codeswitch?.vi_en.length || unit?.codeswitch?.en_vi.length)) &&
      (s.step !== 5 || !!unit?.translation?.length) &&
      (s.step !== 6 || !!unit?.gapfill?.length),
  );
  const activeStep = steps.some((s) => s.step === step) ? step : 1;

  const change = (next: Step) => {
    audio.stop();
    setStep(next);
  };

  if (!unit) return <Text className="py-8 text-center text-[13px] text-muted">Bài luyện tập này chưa có nội dung.</Text>;

  return (
    <View className="gap-3">
      <View className="gap-1 rounded-2xl bg-brand-soft px-4 py-3">
        <Text className="text-[11px] font-black uppercase tracking-wide text-brand">Từ Vựng Siêu Tốc</Text>
        <Text className="text-[16px] font-bold text-foreground">
          {unit.unit} · {unit.title}
        </Text>
        {unit.title_vi ? <Text className="text-[12.5px] text-muted">{unit.title_vi}</Text> : null}
      </View>

      {units.length > 1 ? (
        <FilterChips
          items={units.map((u, i) => ({ value: String(i), label: u.unit }))}
          value={String(unitIndex)}
          onChange={(v) => {
            audio.stop();
            setUnitIndex(Number(v));
            setStep(1);
          }}
        />
      ) : null}

      {/* Lưới 3 cột, mỗi ô 2 dòng (STEP n / tên) — khỏi vuốt ngang tìm step, như web mobile */}
      <View className="flex-row flex-wrap gap-1.5">
        {steps.map((s) => {
          const active = s.step === activeStep;
          return (
            <Pressable
              key={s.step}
              onPress={() => change(s.step)}
              className={`w-[32.3%] items-center rounded-xl border py-1.5 ${active ? 'border-brand bg-brand' : 'border-border bg-surface'}`}>
              <Text className={`text-[10.5px] font-bold ${active ? 'text-on-brand' : 'text-muted'}`}>STEP {s.step}</Text>
              <Text className={`text-[12.5px] font-bold ${active ? 'text-on-brand' : 'text-foreground'}`} numberOfLines={1}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeStep === 1 ? <StoryPanel key={`${unit.unit}-1`} lines={unit.story ?? []} bilingual={false} audio={audio} /> : null}
      {activeStep === 2 ? <StoryPanel key={`${unit.unit}-2`} lines={unit.story ?? []} bilingual audio={audio} /> : null}
      {activeStep === 3 ? <FlashcardPanel key={`${unit.unit}-3`} items={unit.vocabulary ?? []} audio={audio} /> : null}
      {activeStep === 3 && materialOnly ? (
        <Text className="px-1 text-[12.5px] leading-5 text-muted">
          Phần luyện tập STEP 4–6 (truyện chêm, dịch câu, điền chỗ trống) nằm ở bài tập giáo viên giao riêng — hệ thống tự chấm điểm trên thang 10.
        </Text>
      ) : null}
      {activeStep >= 4 ? (
        <PracticeSteps key={unit.unit} classId={classId} practiceId={practiceId} unit={unit} step={activeStep as 4 | 5 | 6} audio={audio} />
      ) : null}
    </View>
  );
}

// ─── STEP 4–6 (bài cũ, tự so đáp án) ────────────────────────────────────────

function PracticeSteps({
  classId,
  practiceId,
  unit,
  step,
  audio,
}: {
  classId: string;
  practiceId: string;
  unit: TvstBizUnit;
  step: 4 | 5 | 6;
  audio: TvstAudio;
}) {
  const progress = useQuery({
    queryKey: progressKey(practiceId),
    staleTime: 0,
    retry: false,
    queryFn: async () =>
      (await api.get<{ data?: TvstBizProgress[] }>('/elearning/tvst-business/progress', { params: { practice_id: practiceId } })).data?.data ?? [],
  });
  const saved = progress.data?.find((p) => p.unit === unit.unit)?.sections;

  // ── Lưu: gom các lần đổi liên tiếp, ngừng ~1 giây mới gửi; rời màn thì gửi nốt ──
  const [status, setStatus] = useState<SaveStatus>('idle');
  /** Bản vừa sửa trong phiên — để quay lại step cũ vẫn thấy bài đang làm (state, không đọc ref lúc render) */
  const [local, setLocal] = useState<Partial<Record<TvstSection, TvstPracticeSection>>>({});
  const latest = useRef<Partial<Record<TvstSection, TvstPracticeSection>>>({});
  const pending = useRef<Partial<Record<TvstSection, ReturnType<typeof setTimeout>>>>({});
  const inflight = useRef(0);

  const send = useCallback(
    (section: TvstSection) => {
      delete pending.current[section];
      const data = latest.current[section];
      if (!data) return;
      inflight.current++;
      setStatus('saving');
      api
        .put('/elearning/tvst-business/progress', { class_id: classId, practice_id: practiceId, unit: unit.unit, section, data })
        .then(() => {
          inflight.current--;
          if (inflight.current === 0) setStatus('saved');
        })
        .catch(() => {
          inflight.current--;
          setStatus('error');
        });
    },
    [classId, practiceId, unit.unit],
  );

  const save = useCallback(
    (section: TvstSection, data: TvstPracticeSection) => {
      latest.current[section] = data;
      setLocal((prev) => ({ ...prev, [section]: data }));
      clearTimeout(pending.current[section]);
      pending.current[section] = setTimeout(() => send(section), 1000);
      setStatus('saving');
    },
    [send],
  );

  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const section of Object.keys(timers) as TvstSection[]) {
        clearTimeout(timers[section]);
        send(section);
      }
    };
  }, [send]);

  /** Bài làm đã có của phần này — bản vừa lưu trong phiên, không thì bản trên server */
  const seed = (section: TvstSection) => local[section] ?? saved?.[section];

  if (progress.isLoading) return <ActivityIndicator className="py-10" />;

  return (
    <View className="gap-3">
      <Text className={`px-1 text-right text-[12px] ${status === 'error' ? 'text-danger' : 'text-muted'}`}>
        {status === 'saving' ? 'Đang lưu…' : status === 'saved' ? 'Đã lưu bài làm' : status === 'error' ? 'Chưa lưu được — kiểm tra mạng' : ' '}
      </Text>
      {step === 4 ? (
        <View className="gap-6">
          <CodeSwitchPractice
            id="a"
            section="codeswitch_a"
            title="A. Chêm tiếng Anh trong đoạn tiếng Việt"
            hint="Bấm loa nghe nghĩa tiếng Việt — gõ cụm tiếng Anh tương ứng rồi bấm Kiểm tra."
            paragraphs={unit.codeswitch?.vi_en ?? []}
            seed={seed('codeswitch_a')}
            save={save}
            audio={audio}
          />
          <CodeSwitchPractice
            id="b"
            section="codeswitch_b"
            title="B. Chêm tiếng Việt trong đoạn tiếng Anh"
            hint="Đọc bài tiếng Anh, bấm loa nghe nghĩa tiếng Việt — gõ lại cụm tiếng Anh."
            paragraphs={unit.codeswitch?.en_vi ?? []}
            seed={seed('codeswitch_b')}
            save={save}
            audio={audio}
          />
        </View>
      ) : null}
      {step === 5 ? <TranslatePractice items={unit.translation ?? []} seed={seed('translation')} save={save} audio={audio} /> : null}
      {step === 6 ? <GapFillPractice items={unit.gapfill ?? []} seed={seed('gapfill')} save={save} audio={audio} /> : null}
    </View>
  );
}

type SaveFn = (section: TvstSection, data: TvstPracticeSection) => void;

function CodeSwitchPractice({
  id,
  section,
  title,
  hint,
  paragraphs,
  seed,
  save,
  audio,
}: {
  id: string;
  section: TvstSection;
  title: string;
  hint: string;
  paragraphs: TvstParagraph[];
  seed?: TvstPracticeSection;
  save: SaveFn;
  audio: TvstAudio;
}) {
  const keys = useMemo(() => blankKeysOf(paragraphs), [paragraphs]);
  const [answers, setAnswers] = useState<Record<string, string>>(() => seed?.answers ?? {});
  const [checked, setChecked] = useState(!!seed?.checked);
  if (!paragraphs.length) return null;

  const blankOf = (key: string) => {
    const [p, i] = key.split('-').map(Number);
    return paragraphs[p]?.blanks[i];
  };
  // Chỉ chấm ô đã điền — ô trống vẫn để trống như web
  const results: Record<string, boolean> = {};
  for (const key of keys) {
    if (answers[key]?.trim()) results[key] = normalizeAnswer(answers[key]) === normalizeAnswer(blankOf(key)?.en ?? '');
  }
  const correct = Object.values(results).filter(Boolean).length;

  const commit = (nextAnswers: Record<string, string>, nextChecked: boolean) => {
    const nextCorrect = keys.filter((k) => nextAnswers[k]?.trim() && normalizeAnswer(nextAnswers[k]) === normalizeAnswer(blankOf(k)?.en ?? '')).length;
    save(section, { answers: nextAnswers, checked: nextChecked, correct: nextCorrect, total: keys.length });
  };

  return (
    <View className="gap-2">
      <CodeSwitchExam
        id={id}
        title={title}
        hint={hint}
        paragraphs={paragraphs}
        answers={answers}
        results={checked ? results : undefined}
        readOnly={false}
        audio={audio}
        onChange={(key, value) => {
          const next = { ...answers, [key]: value };
          setAnswers(next);
          // Sửa sau khi đã kiểm tra → bỏ kết quả cũ, kiểm tra lại (như web)
          if (checked) setChecked(false);
          commit(next, false);
        }}
      />
      <View className="flex-row items-center gap-2 px-1">
        <Text className={`flex-1 text-[12.5px] ${checked && correct === keys.length ? 'font-bold text-success' : 'text-muted'}`}>
          {checked ? `Đúng ${correct}/${keys.length} chỗ` : `Đã điền ${keys.filter((k) => answers[k]?.trim()).length}/${keys.length} chỗ`}
        </Text>
        {checked ? (
          <Button
            title="Làm lại"
            icon="refresh"
            variant="ghost"
            onPress={() => {
              setAnswers({});
              setChecked(false);
              commit({}, false);
            }}
            className="h-10 px-3"
          />
        ) : null}
        <Button
          title="Kiểm tra"
          icon="checkmark"
          variant="secondary"
          onPress={() => {
            setChecked(true);
            commit(answers, true);
          }}
          className="h-10 px-4"
        />
      </View>
    </View>
  );
}

function TranslatePractice({
  items,
  seed,
  save,
  audio,
}: {
  items: NonNullable<TvstBizUnit['translation']>;
  seed?: TvstPracticeSection;
  save: SaveFn;
  audio: TvstAudio;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => seed?.drafts ?? {});
  const [seen, setSeen] = useState<Set<number>>(() => new Set(seed?.seen ?? []));
  const commit = (d: Record<string, string>, s: Set<number>) => save('translation', { drafts: d, seen: [...s].sort((a, b) => a - b) });
  return (
    <TranslateExam
      items={items}
      answers={drafts}
      readOnly={false}
      audio={audio}
      onChange={(key, value) => {
        const next = { ...drafts, [key]: value };
        setDrafts(next);
        commit(next, seen);
      }}
      revealed={seen}
      onReveal={(i) => {
        const next = new Set(seen).add(i);
        setSeen(next);
        commit(drafts, next);
      }}
    />
  );
}

function GapFillPractice({
  items,
  seed,
  save,
  audio,
}: {
  items: NonNullable<TvstBizUnit['gapfill']>;
  seed?: TvstPracticeSection;
  save: SaveFn;
  audio: TvstAudio;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => seed?.answers ?? {});
  const [mode, setMode] = useState<'check' | 'reveal' | null>(seed?.mode ?? null);
  // Khung cụm từ theo ABC — không lộ thứ tự câu (bài tập lấy từ BE `gapfill_bank`, bản này tự dựng)
  const bank = useMemo(() => [...new Set(items.map((g) => g.answer))].sort((a, b) => a.localeCompare(b)), [items]);
  const isRight = (i: number, map = answers) => normalizeAnswer(map[i] || '') === normalizeAnswer(items[i].answer);

  const results: Record<string, boolean> = {};
  items.forEach((_, i) => {
    // Kiểm tra: chỉ chấm ô đã điền; Xem đáp án: chấm mọi ô để hiện đáp án cả ô bỏ trống
    if (mode === 'reveal' || (mode === 'check' && answers[i]?.trim())) results[String(i)] = isRight(i);
  });
  const correct = items.filter((_, i) => isRight(i)).length;

  const commit = (map: Record<string, string>, m: 'check' | 'reveal' | null) =>
    save('gapfill', { answers: map, mode: m, correct: items.filter((_, i) => isRight(i, map)).length, total: items.length });

  return (
    <View className="gap-2">
      <GapFillExam
        items={items}
        bank={bank}
        answers={answers}
        results={mode ? results : undefined}
        readOnly={false}
        audio={audio}
        onChange={(key, value) => {
          const next = { ...answers, [key]: value };
          setAnswers(next);
          if (mode) setMode(null);
          commit(next, null);
        }}
      />
      <View className="flex-row items-center gap-2 px-1">
        <Text className={`flex-1 text-[12.5px] ${mode && correct === items.length ? 'font-bold text-success' : 'text-muted'}`}>
          {mode ? `Đúng ${correct}/${items.length} câu` : `Đã điền ${items.filter((_, i) => answers[i]?.trim()).length}/${items.length} câu`}
        </Text>
        <Button
          title="Xem đáp án"
          variant="ghost"
          onPress={() => {
            setMode('reveal');
            commit(answers, 'reveal');
          }}
          className="h-10 px-3"
        />
        <Button
          title="Kiểm tra"
          icon="checkmark"
          variant="secondary"
          onPress={() => {
            setMode('check');
            commit(answers, 'check');
          }}
          className="h-10 px-4"
        />
      </View>
    </View>
  );
}
