import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { getErrorMessage } from '@/lib/api/client';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';

import { distributeQuizPoints, newQuestion, QUESTION_TYPES, uid, uploadQuizAudio, type QuizQuestion, type QuizQuestionType } from './api';
import { Choice, Field, IconButton, Input, SmallButton } from './fields';

/**
 * Soạn câu hỏi quiz (bản mobile của QuizBuilder web): thêm câu theo loại, đề bài, đáp án + tick đáp án
 * đúng, giải thích; Speaking có câu mẫu + điểm đạt; Listening có audio (dán link hoặc tải file lên).
 * Tổng luôn 10 điểm chia đều cho các câu (tự tính, giống web).
 */
export function QuizEditor({ questions, onChange }: { questions: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void }) {
  const sheet = useActionSheet();
  const set = (next: QuizQuestion[]) => onChange(distributeQuizPoints(next));
  const patch = (key: string, p: Partial<QuizQuestion>) => set(questions.map((q) => (q.key === key ? { ...q, ...p } : q)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= questions.length) return;
    const arr = [...questions];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set(arr);
  };

  return (
    <View className="gap-3">
      {questions.map((q, i) => (
        <QuestionCard
          key={q.key}
          q={q}
          index={i}
          total={questions.length}
          onPatch={(p) => patch(q.key, p)}
          onType={(t) => set(questions.map((x) => (x.key === q.key ? { ...newQuestion(t), key: x.key, prompt: x.prompt } : x)))}
          onMove={(d) => move(i, d)}
          onRemove={() =>
            sheet.confirm({
              title: `Xoá câu ${i + 1}?`,
              label: 'Xoá câu',
              icon: 'trash-outline',
              onConfirm: () => set(questions.filter((x) => x.key !== q.key)),
            })
          }
        />
      ))}
      <View className="flex-row flex-wrap gap-2">
        {QUESTION_TYPES.map((t) => (
          <SmallButton key={t.value} icon="add" label={t.label} onPress={() => set([...questions, newQuestion(t.value)])} />
        ))}
      </View>
    </View>
  );
}

function QuestionCard({
  q,
  index,
  total,
  onPatch,
  onType,
  onMove,
  onRemove,
}: {
  q: QuizQuestion;
  index: number;
  total: number;
  onPatch: (p: Partial<QuizQuestion>) => void;
  onType: (t: QuizQuestionType) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const options = q.options ?? [];
  const correct = new Set(q.correctKeys ?? []);
  const single = q.type !== 'multiple_choice';

  const toggleCorrect = (key: string) => {
    if (single) onPatch({ correctKeys: [key] });
    else onPatch({ correctKeys: correct.has(key) ? [...correct].filter((k) => k !== key) : [...correct, key] });
  };

  const pickAudio = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setUploading(true);
    try {
      const up = await uploadQuizAudio({ uri: a.uri, name: a.name, type: a.mimeType || 'audio/mpeg' });
      onPatch({ audioKey: up.key, audioUrl: up.url, audioSource: 'storage' });
    } catch (e) {
      showToast('error', 'Chưa tải được audio', getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="gap-3 rounded-2xl border border-border bg-background p-3.5">
      <View className="flex-row items-center gap-2">
        <View className="h-7 min-w-7 items-center justify-center rounded-full bg-brand px-2">
          <Text className="text-[12.5px] font-extrabold text-white">{index + 1}</Text>
        </View>
        <Text className="flex-1 text-[12.5px] font-semibold text-muted">{q.points} điểm</Text>
        <IconButton icon="arrow-up" label="Lên" disabled={index === 0} onPress={() => onMove(-1)} />
        <IconButton icon="arrow-down" label="Xuống" disabled={index === total - 1} onPress={() => onMove(1)} />
        <IconButton icon="trash-outline" label="Xoá câu" onPress={onRemove} />
      </View>
      <Choice items={QUESTION_TYPES} value={q.type} onChange={onType} />
      <Input value={q.prompt} onChange={(v) => onPatch({ prompt: v })} placeholder="Đề bài / câu hỏi" multiline minHeight={64} />

      {q.type === 'speaking' ? (
        <>
          <Field label="Câu mẫu học viên cần đọc">
            <Input value={q.referenceText ?? ''} onChange={(v) => onPatch({ referenceText: v })} placeholder="Vd: I usually go to work by bus." multiline minHeight={56} />
          </Field>
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Field label="Điểm đạt (%)">
                <Input value={String(q.passScore ?? 80)} onChange={(v) => onPatch({ passScore: Math.min(100, Number(v.replace(/\D/g, '')) || 0) })} numeric />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Giọng">
                <Choice
                  items={[
                    { value: 'en-US', label: 'Mỹ' },
                    { value: 'en-GB', label: 'Anh' },
                  ]}
                  value={(q.locale === 'en-GB' ? 'en-GB' : 'en-US') as 'en-US' | 'en-GB'}
                  onChange={(v) => onPatch({ locale: v })}
                />
              </Field>
            </View>
          </View>
        </>
      ) : (
        <>
          {q.type === 'listening' ? (
            <Field label="Audio" hint={q.audioKey ? 'Đã tải file audio lên' : 'Dán link audio hoặc tải file (≤20MB)'}>
              <View className="gap-2">
                {q.audioKey ? null : (
                  <Input value={q.audioUrl ?? ''} onChange={(v) => onPatch({ audioUrl: v, audioSource: 'url' })} placeholder="https://…/audio.mp3" />
                )}
                <View className="flex-row gap-2">
                  <Pressable onPress={pickAudio} disabled={uploading} className="flex-row items-center gap-1.5 rounded-full bg-info-soft px-3 py-2 active:opacity-70">
                    {uploading ? <ActivityIndicator size="small" color="#2563eb" /> : <Ionicons name="cloud-upload-outline" size={15} color="#2563eb" />}
                    <Text className="text-[13px] font-bold text-info">{q.audioKey ? 'Đổi file audio' : 'Tải file audio'}</Text>
                  </Pressable>
                  {q.audioKey ? (
                    <SmallButton icon="close" label="Bỏ file" tone="muted" onPress={() => onPatch({ audioKey: '', audioUrl: '', audioSource: 'url' })} />
                  ) : null}
                </View>
              </View>
            </Field>
          ) : null}

          <Field label={single ? 'Đáp án (bấm vòng tròn để chọn đáp án đúng)' : 'Đáp án (tick các đáp án đúng)'}>
            <View className="gap-2">
              {options.map((o, oi) => {
                const on = correct.has(o.key);
                return (
                  <View key={o.key} className="flex-row items-center gap-2">
                    <Pressable onPress={() => toggleCorrect(o.key)} hitSlop={6} accessibilityLabel="Đáp án đúng">
                      <Ionicons
                        name={single ? (on ? 'radio-button-on' : 'radio-button-off') : on ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={on ? '#059669' : '#9ca3af'}
                      />
                    </Pressable>
                    <View className="flex-1">
                      <Input
                        value={o.text}
                        onChange={(v) => onPatch({ options: options.map((x) => (x.key === o.key ? { ...x, text: v } : x)) })}
                        placeholder={`Đáp án ${String.fromCharCode(65 + oi)}`}
                      />
                    </View>
                    {options.length > 2 ? (
                      <IconButton
                        icon="close"
                        label="Xoá đáp án"
                        onPress={() => onPatch({ options: options.filter((x) => x.key !== o.key), correctKeys: [...correct].filter((k) => k !== o.key) })}
                      />
                    ) : null}
                  </View>
                );
              })}
              {options.length < 6 ? (
                <SmallButton icon="add" label="Thêm đáp án" tone="muted" onPress={() => onPatch({ options: [...options, { key: uid('opt'), text: '' }] })} />
              ) : null}
            </View>
          </Field>
        </>
      )}

      <Input value={q.explanation ?? ''} onChange={(v) => onPatch({ explanation: v })} placeholder="Giải thích đáp án (tuỳ chọn)" />
    </View>
  );
}
