import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChips } from '@/components/ui/list-filters';
import { showToast } from '@/components/ui/toast';
import { useThemeColor } from '@/theme/use-theme-color';

import { FocusPicture } from './focus-picture';
import { composeLine, isFixedLine, outlineKey, saveSymOutlineDraft, useSymOutlineDraft } from './sym-api';
import type { SymFocus, SymUnit } from './types';

/**
 * Chế độ ĐIỀN TỪ — Speaking Outline, mỗi part một thẻ (bản mobile của FillPanel bên class-fe).
 * Gõ tới đâu lưu tới đó (chờ 1,2 giây sau lần gõ cuối), bản nháp dùng chung với web.
 */
type FillProps = {
  unit: SymUnit;
  classId: string;
  practiceId: string;
  onProgress: (filled: number, total: number, context: string) => void;
};

export function SymFill(props: FillProps) {
  const brand = useThemeColor('brand');
  const draft = useSymOutlineDraft(props.practiceId, props.unit.unit);
  if (draft.isLoading) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator color={brand} />
      </View>
    );
  }
  // Bản nháp về rồi mới dựng phần điền, để state khởi tạo thẳng từ bản nháp.
  return <FillBody {...props} initialAnswers={draft.data?.answers ?? {}} initialSavedAt={draft.data?.updatedAt ?? null} />;
}

function FillBody({
  unit,
  classId,
  practiceId,
  onProgress,
  initialAnswers,
  initialSavedAt,
}: FillProps & { initialAnswers: Record<string, string>; initialSavedAt: string | null }) {
  const muted = useThemeColor('muted');
  const sections = useMemo(() => unit.outline ?? [], [unit.outline]);

  const [sectionIndex, setSectionIndexRaw] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeLine, setActiveLine] = useState<{ group: number; line: number } | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(JSON.stringify(initialAnswers));
  const latest = useRef<Record<string, string>>(initialAnswers);

  const setSectionIndex = (next: number | ((i: number) => number)) => {
    setActiveLine(null);
    setSectionIndexRaw(next);
  };

  const persist = useCallback(
    async (next: Record<string, string>) => {
      const payload = JSON.stringify(next);
      if (payload === lastSaved.current) return;
      setSaving(true);
      try {
        const at = await saveSymOutlineDraft({ class_id: classId, practice_id: practiceId, unit: unit.unit, answers: next });
        lastSaved.current = payload;
        setSavedAt(at);
      } catch {
        showToast('error', 'Chưa lưu được bài viết', 'Thử lại sau nhé.');
      } finally {
        setSaving(false);
      }
    },
    [classId, practiceId, unit.unit],
  );

  // Rời màn khi còn chữ chưa kịp lưu → lưu nốt.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void persist(latest.current);
    },
    [persist],
  );

  const onChange = useCallback(
    (key: string, value: string) => {
      setAnswers((prev) => {
        const next = { ...prev, [key]: value };
        latest.current = next;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void persist(next), 1200);
        return next;
      });
    },
    [persist],
  );

  const { filled, total } = useMemo(() => {
    let f = 0;
    let t = 0;
    for (const s of sections) {
      s.groups.forEach((g, gi) =>
        g.lines.forEach((l, li) => {
          if (isFixedLine(l)) return;
          t++;
          if ((answers[outlineKey(s.part, gi, li)] || '').trim()) f++;
        }),
      );
    }
    return { filled: f, total: t };
  }, [answers, sections]);

  const section = sections[sectionIndex] ?? null;
  useEffect(() => {
    onProgress(filled, total, section ? `Part ${section.part} · ${section.title}` : '');
  }, [filled, total, section, onProgress]);

  const composed = useMemo(() => {
    const blocks: { title: string; lines: string[] }[] = [];
    for (const s of sections) {
      const lines: string[] = [];
      s.groups.forEach((g, gi) =>
        g.lines.forEach((l, li) => {
          if (isFixedLine(l)) return void lines.push(l.prefix.trim());
          const a = answers[outlineKey(s.part, gi, li)] || '';
          if (a.trim()) lines.push(composeLine(l.prefix, a, l.suffix));
        }),
      );
      if (lines.length) blocks.push({ title: `Part ${s.part} · ${s.title}`, lines });
    }
    return blocks;
  }, [answers, sections]);

  /** Part tả người (số nhóm = số cấu trúc, cấu trúc nào cũng có vùng) → mỗi người một ảnh. */
  const groupPictures = useMemo(() => {
    if (!section) return null;
    const part = unit.parts.find((p) => p.order === section.part);
    if (!part || part.structures.length !== section.groups.length) return null;
    if (!part.structures.every((s) => s.focus)) return null;
    return part.structures.map((s) => ({ focus: s.focus, label: s.label }));
  }, [section, unit.parts]);

  const activeFocus = ((): { focus?: SymFocus | null; label?: string } | null => {
    if (!section || !activeLine) return null;
    const group = section.groups[activeLine.group];
    const line = group?.lines[activeLine.line];
    if (line?.focus) return { focus: line.focus, label: group.label };
    const part = unit.parts.find((p) => p.order === section.part);
    if (!part || !line) return null;
    const structures = part.structures.length === section.groups.length ? [part.structures[activeLine.group]] : part.structures;
    const prefix = line.prefix.trim().toLowerCase();
    for (const s of structures) {
      const sample = s.samples.find((x) => x.en.toLowerCase().startsWith(prefix)) || (structures.length === 1 ? s.samples[0] : undefined);
      if (sample) return { focus: sample.focus || s.focus, label: s.focus ? s.label : group.label };
    }
    return null;
  })();

  async function copyAll() {
    await Clipboard.setStringAsync(composed.map((b) => `${b.title}\n${b.lines.join(' ')}`).join('\n\n'));
    showToast('success', 'Đã copy bài nói của bạn');
  }

  if (!sections.length) {
    return <Text className="py-8 text-center text-[13px] text-muted">Unit này chưa có phần điền từ.</Text>;
  }

  return (
    <View className="gap-3">
      <FilterChips
        items={sections.map((s, i) => ({ value: String(i), label: `Part ${s.part}` }))}
        value={String(sectionIndex)}
        onChange={(v) => setSectionIndex(Number(v))}
      />

      {!groupPictures ? <FocusPicture imageUrl={unit.picture?.imageUrl} focus={activeFocus?.focus} label={activeFocus?.label} /> : null}

      {section ? (
        <View className="gap-4 rounded-2xl border border-brand-soft bg-surface px-4 py-5">
          <View className="items-center">
            <Text className="text-[12px] font-black uppercase tracking-wide text-brand">Part {section.part}</Text>
            <Text className="mt-1 text-center text-[21px] font-black text-foreground">{section.title}</Text>
          </View>

          {section.groups.map((group, gi) => (
            <View key={`${section.part}-${gi}`} className="gap-3">
              {groupPictures?.[gi] ? (
                <FocusPicture imageUrl={unit.picture?.imageUrl} focus={groupPictures[gi].focus} label={groupPictures[gi].label} maxHeight={180} />
              ) : null}
              {group.label ? <Text className="text-center text-[13px] font-bold italic text-brand">{group.label}</Text> : null}

              {group.lines.map((line, li) => {
                if (isFixedLine(line)) {
                  return (
                    <Text key={li} className="text-center text-[16px] font-bold leading-6 text-foreground">
                      {line.prefix}
                    </Text>
                  );
                }
                const key = outlineKey(section.part, gi, li);
                return (
                  <View key={key} className="gap-1">
                    <Text className="text-[16px] font-bold text-foreground">
                      {line.prefix}
                      <Text className="text-muted">
                        {' ___'}
                        {line.suffix ? (/^[.,!?;:]/.test(line.suffix) ? line.suffix : ` ${line.suffix}`) : ''}
                      </Text>
                    </Text>
                    <TextInput
                      value={answers[key] || ''}
                      onChangeText={(v) => onChange(key, v)}
                      onFocus={() => setActiveLine({ group: gi, line: li })}
                      placeholder={line.hint || '…'}
                      placeholderTextColor={muted}
                      multiline
                      className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-[16px] font-semibold text-brand"
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => setSectionIndex((i) => Math.max(0, i - 1))}
          disabled={sectionIndex === 0}
          className={`h-11 w-11 items-center justify-center rounded-xl bg-surface-muted active:opacity-70 ${sectionIndex === 0 ? 'opacity-40' : ''}`}>
          <Ionicons name="chevron-back" size={18} color={muted} />
        </Pressable>
        <Pressable
          onPress={() => setPreviewOpen(true)}
          disabled={filled === 0}
          className={`h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-brand active:opacity-80 ${filled === 0 ? 'opacity-50' : ''}`}>
          <Ionicons name="sparkles" size={16} color="#fff" />
          <Text className="text-[14px] font-bold text-on-brand">Bài nói của tôi</Text>
        </Pressable>
        <Pressable
          onPress={() => setSectionIndex((i) => Math.min(sections.length - 1, i + 1))}
          disabled={sectionIndex >= sections.length - 1}
          className={`h-11 w-11 items-center justify-center rounded-xl bg-surface-muted active:opacity-70 ${sectionIndex >= sections.length - 1 ? 'opacity-40' : ''}`}>
          <Ionicons name="chevron-forward" size={18} color={muted} />
        </Pressable>
      </View>

      <Text className="text-center text-[12px] text-muted">
        {saving ? 'Đang lưu…' : savedAt ? '✓ Đã lưu — bài viết dùng chung với bản web' : 'Bài viết tự lưu khi bạn gõ'}
      </Text>

      <ComposedSheet open={previewOpen} onClose={() => setPreviewOpen(false)} blocks={composed} onCopy={copyAll} />
    </View>
  );
}

function ComposedSheet({
  open,
  onClose,
  blocks,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  blocks: { title: string; lines: string[] }[];
  onCopy: () => void;
}) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  return (
    <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="max-h-[80%] rounded-t-3xl bg-surface px-4 pt-4" style={{ paddingBottom: insets.bottom + 12 }}>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[17px] font-bold text-foreground">Bài nói của bạn</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Đóng">
            <Ionicons name="close" size={22} color={muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerClassName="gap-3 pb-3">
          {blocks.map((b) => (
            <View key={b.title} className="gap-1">
              <Text className="text-[11px] font-black uppercase tracking-wide text-brand">{b.title}</Text>
              <Text className="text-[15px] leading-6 text-foreground">{b.lines.join(' ')}</Text>
            </View>
          ))}
        </ScrollView>
        <Pressable onPress={onCopy} className="mt-2 h-11 flex-row items-center justify-center gap-2 rounded-xl border border-border active:bg-surface-muted">
          <Ionicons name="copy-outline" size={16} color={muted} />
          <Text className="text-[14px] font-semibold text-foreground">Copy bài nói</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
