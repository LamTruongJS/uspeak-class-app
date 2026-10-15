import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { DateTimeField } from '@/components/ui/date-time-field';
import { getErrorMessage } from '@/lib/api/client';

import { useCreateShadowingAssignment, useShadowingCourse, useShadowingCourses, type Difficulty, type ShadowingUnit } from './api';
import { Choice, Field, Input, Section } from './fields';

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d;
};

const fmtDuration = (sec: number) => (Math.round(sec / 60) > 0 ? `${Math.round(sec / 60)} phút` : `${sec} giây`);

/**
 * Giao bài Shadowing (bản mobile của ShadowingAssignmentForm web): chọn khoá → tick unit / part của thư viện
 * Shadowing → tiêu đề, buổi, hạn nộp (bắt buộc), tỉ lệ đúng tối thiểu, độ khó Dictation. Unit chọn đủ part
 * gửi `unit_ids`, chọn lẻ gửi `part_ids` (y như web). Bài được chấm bên Shadowing, class nhận bản đồng bộ.
 */
export function ShadowingForm({
  classId,
  onCreated,
  header,
  renderBar,
}: {
  classId: string;
  onCreated: () => void;
  /** Phần đầu (chọn loại bài) do form cha vẽ */
  header: React.ReactNode;
  renderBar: (submit: () => void, busy: boolean) => React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const courses = useShadowingCourses(true);
  const [courseId, setCourseId] = useState('');
  const course = useShadowingCourse(courseId);
  const create = useCreateShadowingAssignment();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [session, setSession] = useState('');
  const [due, setDue] = useState<Date | null>(null);
  const [accuracy, setAccuracy] = useState('80');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [now] = useState(() => Date.now());

  const units = useMemo(() => course.data?.units ?? [], [course.data]);
  const sel = useMemo(() => {
    const unitIds: string[] = [];
    const partIds: string[] = [];
    let sec = 0;
    for (const u of units) {
      const chosen = u.parts.filter((p) => picked.has(p.partId));
      chosen.forEach((p) => (sec += p.durationSec || 0));
      if (!chosen.length) continue;
      if (chosen.length === u.parts.length) unitIds.push(u.unitId);
      else partIds.push(...chosen.map((p) => p.partId));
    }
    return { unitIds, partIds, count: picked.size, sec };
  }, [units, picked]);

  const toggleUnit = (u: ShadowingUnit) =>
    setPicked((cur) => {
      const next = new Set(cur);
      const all = u.parts.every((p) => next.has(p.partId));
      u.parts.forEach((p) => (all ? next.delete(p.partId) : next.add(p.partId)));
      return next;
    });
  const togglePart = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const acc = Number(accuracy);
  const submit = () => {
    const errs: string[] = [];
    if (!sel.count) errs.push('Chọn ít nhất 1 bài (part) trong thư viện');
    if (!due) errs.push('Chọn hạn nộp');
    else if (due.getTime() < now) errs.push('Hạn nộp phải ở tương lai');
    if (!Number.isInteger(acc) || acc < 0 || acc > 100) errs.push('Tỉ lệ đúng phải từ 0 đến 100%');
    if (errs.length) return showToast('warning', 'Chưa giao được', errs.join('\n'));
    create.mutate(
      {
        class_id: classId,
        title: title.trim() || undefined,
        description: note.trim() || undefined,
        unit_ids: sel.unitIds.length ? sel.unitIds : undefined,
        part_ids: sel.partIds.length ? sel.partIds : undefined,
        submission_deadline: due!.toISOString(),
        min_accuracy: acc,
        dictation_difficulty: difficulty,
        session_number: session.trim() && !/^buổi$/i.test(session.trim()) ? session.trim() : undefined,
      },
      {
        onSuccess: () => {
          showToast('success', 'Đã giao bài Shadowing', 'Học viên sẽ nhận được thông báo.');
          onCreated();
        },
        onError: (e) => showToast('error', 'Không giao được bài Shadowing', getErrorMessage(e)),
      },
    );
  };

  return (
    <>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4" contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} keyboardShouldPersistTaps="handled">
      {header}
      <Section icon="library" title="Chọn bài từ thư viện Shadowing">
        {courses.isLoading ? (
          <ActivityIndicator />
        ) : courses.isError ? (
          <Text className="text-[13px] text-danger">Không tải được thư viện Shadowing: {getErrorMessage(courses.error)}</Text>
        ) : !courses.data?.length ? (
          <Text className="text-[13px] text-muted">Thư viện Shadowing chưa có khoá nào.</Text>
        ) : (
          <View className="gap-2">
            {(courses.data ?? []).map((c) => {
              const on = c.courseId === courseId;
              return (
                <Pressable
                  key={c.courseId}
                  onPress={() => {
                    setCourseId(c.courseId);
                    setPicked(new Set());
                    setOpen(new Set());
                  }}
                  className={`flex-row items-center gap-3 rounded-2xl border-2 p-3 ${on ? 'border-brand bg-brand-soft' : 'border-transparent bg-surface-muted'}`}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? '#b62025' : '#9ca3af'} />
                  <View className="flex-1">
                    <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                      {c.title}
                    </Text>
                    <Text className="text-[12px] text-muted">{[c.level, `${c.unitCount} unit · ${c.totalParts} part`].filter(Boolean).join(' · ')}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {courseId ? (
          course.isLoading ? (
            <ActivityIndicator />
          ) : (
            <View className="gap-1.5">
              <Text className="text-[13px] font-semibold text-muted">
                Đã chọn {sel.count} part{sel.sec ? ` · khoảng ${fmtDuration(sel.sec)}` : ''}
              </Text>
              {units.map((u) => {
                const n = u.parts.filter((p) => picked.has(p.partId)).length;
                const all = n === u.parts.length && n > 0;
                const expanded = open.has(u.unitId);
                return (
                  <View key={u.unitId} className="overflow-hidden rounded-2xl border border-border">
                    <View className="flex-row items-center gap-2 bg-background px-3 py-2.5">
                      <Pressable onPress={() => toggleUnit(u)} hitSlop={6}>
                        <Ionicons name={all ? 'checkbox' : n ? 'remove-circle' : 'square-outline'} size={22} color={n ? '#b62025' : '#9ca3af'} />
                      </Pressable>
                      <Pressable
                        className="flex-1 flex-row items-center gap-2"
                        onPress={() =>
                          setOpen((cur) => {
                            const next = new Set(cur);
                            if (next.has(u.unitId)) next.delete(u.unitId);
                            else next.add(u.unitId);
                            return next;
                          })
                        }>
                        <Text className="flex-1 text-[14px] font-semibold text-foreground" numberOfLines={2}>
                          {u.name}
                        </Text>
                        <Text className="text-[12px] text-muted">
                          {n}/{u.parts.length}
                        </Text>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
                      </Pressable>
                    </View>
                    {expanded
                      ? u.parts.map((p) => {
                          const on = picked.has(p.partId);
                          return (
                            <Pressable key={p.partId} onPress={() => togglePart(p.partId)} className="flex-row items-center gap-2.5 border-t border-border px-3 py-2.5 pl-10 active:opacity-70">
                              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={19} color={on ? '#b62025' : '#9ca3af'} />
                              <Text className="flex-1 text-[13.5px] text-foreground" numberOfLines={2}>
                                {p.title}
                              </Text>
                              <Text className="text-[11.5px] text-muted">
                                {p.segmentCount} câu · {fmtDuration(p.durationSec || 0)}
                              </Text>
                            </Pressable>
                          );
                        })
                      : null}
                  </View>
                );
              })}
            </View>
          )
        ) : null}
      </Section>

      <Section icon="document-text" title="Thông tin bài">
        <Field label="Tiêu đề" hint="Để trống: tự đặt theo bài đã chọn">
          <Input value={title} onChange={setTitle} placeholder="Vd: Shadowing Unit 3" />
        </Field>
        <Field label="Buổi học">
          <Input value={session} onChange={setSession} placeholder="Buổi 1" />
        </Field>
        <Field label="Ghi chú cho học viên">
          <Input value={note} onChange={setNote} placeholder="Hướng dẫn thêm (tuỳ chọn)" multiline minHeight={70} />
        </Field>
        <Field label="Hạn nộp *">
          <DateTimeField value={due} onChange={setDue} placeholder="Chọn hạn nộp" defaultValue={endOfToday} />
        </Field>
        <Field label="Tỉ lệ đúng tối thiểu (%)" hint="Học viên đạt tỉ lệ này ở phần Dictation mới tính hoàn thành">
          <Input value={accuracy} onChange={(v) => setAccuracy(v.replace(/\D/g, '').slice(0, 3))} numeric />
        </Field>
        <Field label="Độ khó Dictation">
          <Choice
            items={[
              { value: 'easy', label: 'Dễ' },
              { value: 'medium', label: 'Vừa' },
              { value: 'hard', label: 'Khó' },
            ]}
            value={difficulty}
            onChange={setDifficulty}
          />
        </Field>
      </Section>
      </ScrollView>
      {renderBar(submit, create.isPending)}
    </>
  );
}
