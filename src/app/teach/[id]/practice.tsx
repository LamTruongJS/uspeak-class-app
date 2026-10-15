import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/avatar';
import { Segmented } from '@/components/ui/segmented';
import { StateView } from '@/components/ui/state-view';
import { useImportSpeechLesson, usePracticeData, type SpeechSessionItem } from '@/features/classes/class-admin-api';
import { useStaffClasses } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate, formatDateTime } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

const JSON_SAMPLE = `[
  {
    "order": 1,
    "topic": "Daily life",
    "question": "Say this in English",
    "prompt_vi": "Tôi đi học mỗi ngày.",
    "prompt_en": "I go to school every day.",
    "expected_answer": "I go to school every day.",
    "alternate_answers": ["I go to school every day"]
  }
]`;
const CSV_SAMPLE = `order,topic,question,original_text,prompt_vi,prompt_en,expected_answer,alternate_answers,time_limit,hints
1,Daily life,Say this in English,,Tôi đi học mỗi ngày.,I go to school every day.,I go to school every day.,"I go to school every day",15,"speak clearly|normal speed"`;

/**
 * Luyện tập nói của lớp (PracticeManagementTab web): bộ câu đã nhập + tiến độ từng học viên (số lượt, điểm TB,
 * câu đạt); nút + nhập bộ câu mới bằng JSON / CSV (dán vào ô — y định dạng web).
 */
export default function ClassPracticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const fg = useThemeColor('foreground');
  const { data: token } = useMediaToken();
  const cls = useStaffClasses().data?.find((c) => c._id === id);
  const data = usePracticeData(id);
  const pull = usePullRefresh(() => data.refetch());
  const [tab, setTab] = useState<'students' | 'lessons'>('students');
  const [open, setOpen] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const students = useMemo(() => {
    const m = new Map<string, { id: string; name: string; avatar?: string | null; sessions: SpeechSessionItem[] }>();
    for (const s of data.data?.sessions ?? []) {
      const cur = m.get(s.user_info.user_id) ?? { id: s.user_info.user_id, name: s.user_info.full_name || 'Học viên', avatar: s.user_info.avatar_url, sessions: [] };
      cur.sessions.push(s);
      m.set(cur.id, cur);
    }
    return [...m.values()]
      .map((st) => {
        const sessions = [...st.sessions].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        const avg = Math.round(sessions.reduce((sum, s) => sum + (s.total_score || 0), 0) / Math.max(1, sessions.length));
        const answered = sessions.reduce((sum, s) => sum + (s.results?.length || 0), 0);
        const passed = sessions.reduce((sum, s) => sum + (s.results ?? []).filter((r) => r.passed).length, 0);
        return { ...st, sessions, avg, answered, passed, latest: sessions[0]?.createdAt };
      })
      .sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''));
  }, [data.data]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: cls?.class_code ? `Luyện nói · ${cls.class_code}` : 'Luyện tập nói',
          headerShown: true,
          headerRight: () => (
            <Pressable onPress={() => setImporting(true)} hitSlop={10} accessibilityLabel="Nhập bộ câu" className="active:opacity-60">
              <Ionicons name="add-circle-outline" size={25} color={fg} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
        <Segmented
          items={[
            { value: 'students', label: 'Học viên', count: students.length },
            { value: 'lessons', label: 'Bộ câu', count: data.data?.lessons.length ?? 0 },
          ]}
          value={tab}
          onChange={setTab}
        />
        {data.isLoading ? (
          <ActivityIndicator className="py-10" color={brand} />
        ) : tab === 'students' ? (
          students.length ? (
            students.map((st) => (
              <View key={st.id} className="overflow-hidden rounded-3xl bg-surface">
                <Pressable onPress={() => setOpen((c) => (c === st.id ? null : st.id))} className="flex-row items-center gap-3 p-3.5 active:opacity-90">
                  <Avatar name={st.name} uri={resolveMediaUrl(st.avatar, token?.media_token)} size={40} />
                  <View className="flex-1">
                    <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                      {st.name}
                    </Text>
                    <Text className="text-[12.5px] text-muted">
                      {st.sessions.length} lượt · đạt {st.passed}/{st.answered} câu · gần nhất {formatDate(st.latest)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className={`text-[18px] font-extrabold ${st.avg >= 80 ? 'text-success' : st.avg >= 50 ? 'text-warning' : 'text-danger'}`}>{st.avg}</Text>
                    <Text className="text-[10.5px] text-muted">điểm TB</Text>
                  </View>
                </Pressable>
                {open === st.id
                  ? st.sessions.slice(0, 20).map((s) => (
                      <View key={s._id} className="flex-row items-center gap-3 border-t border-border px-4 py-2.5">
                        <View className="flex-1">
                          <Text className="text-[13.5px] font-semibold text-foreground" numberOfLines={1}>
                            {s.lesson_title || 'Bài luyện'}
                          </Text>
                          <Text className="text-[11.5px] text-muted">
                            {formatDateTime(s.createdAt)} · đạt {(s.results ?? []).filter((r) => r.passed).length}/{s.results?.length ?? 0}
                          </Text>
                        </View>
                        <Text className="text-[15px] font-bold text-foreground">{Math.round(s.total_score ?? 0)}</Text>
                      </View>
                    ))
                  : null}
              </View>
            ))
          ) : (
            <StateView icon="mic-outline" title="Chưa có học viên luyện nói" />
          )
        ) : data.data?.lessons.length ? (
          data.data.lessons.map((l) => (
            <View key={l._id} className="gap-1 rounded-3xl bg-surface p-4">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-[15px] font-bold text-foreground" numberOfLines={2}>
                  {l.title}
                </Text>
                <View className={`rounded-full px-2 py-0.5 ${l.is_published ? 'bg-success-soft' : 'bg-surface-muted'}`}>
                  <Text className={`text-[11px] font-bold ${l.is_published ? 'text-success' : 'text-muted'}`}>{l.is_published ? 'Đang mở' : 'Ẩn'}</Text>
                </View>
              </View>
              {l.description ? <Text className="text-[13px] text-muted">{l.description}</Text> : null}
              <Text className="text-[12px] text-muted">
                {l.sentences?.length ?? 0} câu · gợi ý {l.input_language === 'vi' ? 'tiếng Việt' : 'tiếng Anh'} → trả lời {l.output_language === 'vi' ? 'tiếng Việt' : 'tiếng Anh'} · {formatDate(l.createdAt)}
              </Text>
            </View>
          ))
        ) : (
          <StateView icon="list-outline" title="Lớp chưa có bộ câu luyện tập" actionLabel="Nhập bộ câu" onAction={() => setImporting(true)} />
        )}
      </ScrollView>
      {importing ? <ImportSheet classId={id} onClose={() => setImporting(false)} /> : null}
    </View>
  );
}

function ImportSheet({ classId, onClose }: { classId: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const run = useImportSpeechLesson(classId);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [payload, setPayload] = useState(JSON_SAMPLE);
  const [inputLang, setInputLang] = useState<'vi' | 'en'>('vi');
  const [published, setPublished] = useState(true);

  const submit = () => {
    if (!title.trim()) return showToast('warning', 'Thiếu tên bộ câu');
    if (!payload.trim()) return showToast('warning', 'Chưa có dữ liệu');
    let sentences: unknown[] | undefined;
    if (format === 'json') {
      try {
        const parsed = JSON.parse(payload);
        sentences = Array.isArray(parsed) ? parsed : parsed?.sentences;
      } catch {
        return showToast('error', 'JSON không hợp lệ', 'Kiểm tra lại dấu ngoặc, dấu phẩy.');
      }
      if (!Array.isArray(sentences) || !sentences.length) return showToast('warning', 'JSON phải là mảng câu hoặc object có field sentences');
    }
    run.mutate(
      {
        title: title.trim(),
        description: desc.trim() || undefined,
        input_language: inputLang,
        output_language: 'en',
        format,
        ...(format === 'json' ? { sentences } : { csv_text: payload }),
        is_published: published,
      },
      {
        onSuccess: () => {
          onClose();
          showToast('success', 'Đã nhập bộ câu');
        },
        onError: (e) => showToast('error', 'Nhập thất bại', getErrorMessage(e)),
      },
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="max-h-[92%] rounded-t-3xl bg-surface pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <ScrollView contentContainerClassName="gap-3 px-5 pt-3" keyboardShouldPersistTaps="handled">
            <Text className="text-[18px] font-extrabold text-foreground">Nhập bộ câu luyện tập</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="Tên bộ câu *" placeholderTextColor={muted} className="h-12 rounded-2xl border border-border bg-background px-4 text-[15px] text-foreground" />
            <TextInput value={desc} onChangeText={setDesc} placeholder="Mô tả (tuỳ chọn)" placeholderTextColor={muted} className="h-12 rounded-2xl border border-border bg-background px-4 text-[15px] text-foreground" />
            <Text className="text-[13px] font-semibold text-muted">Ngôn ngữ gợi ý (học viên trả lời bằng tiếng Anh)</Text>
            <Segmented
              items={[
                { value: 'vi', label: 'Tiếng Việt' },
                { value: 'en', label: 'Tiếng Anh' },
              ]}
              value={inputLang}
              onChange={setInputLang}
            />
            <Text className="text-[13px] font-semibold text-muted">Định dạng dữ liệu</Text>
            <Segmented
              items={[
                { value: 'json', label: 'JSON' },
                { value: 'csv', label: 'CSV' },
              ]}
              value={format}
              onChange={(v) => {
                setFormat(v);
                setPayload(v === 'json' ? JSON_SAMPLE : CSV_SAMPLE);
              }}
            />
            <TextInput
              value={payload}
              onChangeText={setPayload}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
              className="min-h-[180px] rounded-2xl border border-border bg-background p-3.5 font-mono text-[12.5px] text-foreground"
            />
            <View className="flex-row items-center">
              <Text className="flex-1 text-[14.5px] font-semibold text-foreground">Mở cho học viên ngay</Text>
              <Switch value={published} onValueChange={setPublished} trackColor={{ true: brand }} />
            </View>
            <Pressable onPress={submit} disabled={run.isPending} className="h-12 items-center justify-center rounded-2xl bg-brand active:opacity-85">
              <Text className="text-[15px] font-bold text-white">{run.isPending ? 'Đang nhập…' : 'Nhập bộ câu'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
