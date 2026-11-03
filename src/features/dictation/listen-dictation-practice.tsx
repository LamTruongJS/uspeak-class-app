import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { api } from '@/lib/api/client';
import { useThemeColor } from '@/theme/use-theme-color';

import { DictationLessonView } from './dictation-lesson';
import type { DictationLesson, DictationProgress, DictationSavePayload } from './types';

/**
 * Bài luyện tập E-Learning "Nghe chép chính tả" (`practice_type: listen_dictation`) — bản mobile của
 * DictationRenderer (class-fe). Bài làm lưu ở GET/PUT /elearning/dictation/progress theo practice_id + unit.
 */
const progressKey = (practiceId: string) => ['elearning', 'dictation-progress', practiceId] as const;

export function ListenDictationPractice({
  classId,
  practiceId,
  content,
}: {
  classId: string;
  practiceId: string;
  content: { units?: DictationLesson[] } | undefined;
}) {
  const qc = useQueryClient();
  const brand = useThemeColor('brand');
  const lessons = useMemo(() => content?.units ?? [], [content]);
  const [openIndex, setOpenIndex] = useState<number | null>(lessons.length === 1 ? 0 : null);

  const progressQuery = useQuery({
    queryKey: progressKey(practiceId),
    staleTime: 0,
    queryFn: async () => {
      const res = await api.get<{ data?: DictationProgress[] }>('/elearning/dictation/progress', { params: { practice_id: practiceId } });
      return res.data?.data ?? [];
    },
  });
  const byUnit = useMemo(() => new Map((progressQuery.data ?? []).map((p) => [p.unit, p])), [progressQuery.data]);

  if (!lessons.length) return <Text className="py-8 text-center text-[13px] text-muted">Bài luyện tập này chưa có nội dung.</Text>;
  if (progressQuery.isLoading) return <ActivityIndicator className="py-10" />;

  if (openIndex === null) return <LessonList lessons={lessons} byUnit={byUnit} onOpen={setOpenIndex} />;

  const lesson = lessons[openIndex];
  const save = async (payload: DictationSavePayload) => {
    const res = await api.put<{ data?: DictationProgress }>('/elearning/dictation/progress', {
      ...payload,
      class_id: classId,
      practice_id: practiceId,
      unit: lesson.unit,
    });
    if (payload.finish || payload.reset) void qc.invalidateQueries({ queryKey: progressKey(practiceId) });
    return res.data?.data ?? null;
  };

  return (
    <View className="gap-3">
      {lessons.length > 1 ? (
        <Pressable onPress={() => setOpenIndex(null)} className="flex-row items-center gap-1 self-start py-1">
          <Ionicons name="chevron-back" size={16} color={brand} />
          <Text className="text-[13.5px] font-semibold text-brand">Danh sách bài</Text>
        </Pressable>
      ) : null}
      <DictationLessonView
        key={lesson.unit}
        lesson={lesson}
        progress={byUnit.get(lesson.unit) ?? null}
        onSave={save}
        onNextLesson={openIndex < lessons.length - 1 ? () => setOpenIndex(openIndex + 1) : undefined}
      />
    </View>
  );
}

function LessonList({
  lessons,
  byUnit,
  onOpen,
}: {
  lessons: DictationLesson[];
  byUnit: Map<string, DictationProgress>;
  onOpen: (index: number) => void;
}) {
  const success = useThemeColor('success');
  const muted = useThemeColor('muted');
  const weeks = useMemo(() => {
    const map = new Map<number, { lesson: DictationLesson; index: number }[]>();
    lessons.forEach((lesson, index) => map.set(lesson.week, [...(map.get(lesson.week) ?? []), { lesson, index }]));
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [lessons]);
  const done = lessons.filter((l) => byUnit.get(l.unit)?.completed_at).length;

  return (
    <View className="gap-4">
      <View className="gap-1 rounded-2xl bg-brand-soft px-4 py-3">
        <Text className="text-[11px] font-black uppercase tracking-wide text-brand">Nghe chép chính tả</Text>
        <Text className="text-[14px] font-semibold text-foreground">
          Đã hoàn thành {done}/{lessons.length} bài
        </Text>
      </View>
      {weeks.map(([week, items]) => (
        <View key={week} className="gap-2">
          <Text className="text-[12px] font-bold uppercase tracking-wide text-muted">Tuần {week}</Text>
          {items.map(({ lesson, index }) => {
            const p = byUnit.get(lesson.unit);
            const inProgress = !p?.completed_at && (p?.checked?.length ?? 0) > 0;
            return (
              <Pressable key={lesson.unit} onPress={() => onOpen(index)} className="flex-row items-center gap-3 rounded-2xl bg-surface p-3 active:opacity-80">
                <View className={`h-10 w-10 items-center justify-center rounded-xl ${p?.completed_at ? 'bg-success-soft' : 'bg-brand-soft'}`}>
                  {p?.completed_at ? (
                    <Ionicons name="checkmark" size={18} color={success} />
                  ) : (
                    <Text className="text-[14px] font-bold text-brand">{lesson.unit.replace(/\D/g, '')}</Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-bold text-foreground" numberOfLines={1}>
                    {lesson.unit} · {lesson.title}
                  </Text>
                  <Text className="text-[12px] text-muted" numberOfLines={1}>
                    {p?.completed_at
                      ? `Cao nhất ${p.best_score}% · ${p.attempts} lần`
                      : inProgress
                        ? `Đang làm ${p!.checked.length}/${lesson.sentences.length} câu`
                        : `${lesson.sentences.length} câu`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={muted} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
