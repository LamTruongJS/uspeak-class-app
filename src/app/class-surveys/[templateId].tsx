import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import {
  isAnswered,
  sortedFields,
  toAnswerList,
  useSubmitSurvey,
  useSurveySubmission,
  useSurveyTemplate,
  type SurveyField,
} from '@/features/surveys/class-survey';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Điền phiếu khảo sát của lớp. Hỗ trợ đủ 6 loại câu hỏi của web: TEXT · TEXTAREA · URL ·
 * SELECT · RADIO · CHECKBOX. Phiếu đã gửi vẫn mở được để sửa — gửi lại là CẬP NHẬT câu trả lời cũ.
 */
export default function SurveyFormScreen() {
  const { templateId, classId, title } = useLocalSearchParams<{ templateId: string; classId: string; title?: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');

  const template = useSurveyTemplate(templateId);
  const submission = useSurveySubmission(templateId, classId);
  const submit = useSubmitSurvey();
  const pull = usePullRefresh(() => Promise.all([template.refetch(), submission.refetch()]));

  // Chỉ giữ phần người dùng vừa sửa; câu đã gửi lấy thẳng từ server → không cần nạp bằng useEffect
  // (React Compiler cấm setState trong effect) và luôn đúng sau khi refetch.
  const [draft, setDraft] = useState<Record<string, string | string[]>>({});
  const serverAnswers = useMemo(() => {
    const map: Record<string, string | string[]> = {};
    (submission.data?.answers ?? []).forEach((a) => {
      map[a.field_key] = a.value;
    });
    return map;
  }, [submission.data]);

  const fields = useMemo(() => sortedFields(template.data?.fields), [template.data]);
  const valueOf = (field: SurveyField): string | string[] =>
    draft[field.field_key] ?? serverAnswers[field.field_key] ?? (field.type === 'CHECKBOX' ? [] : '');
  const setValue = (key: string, value: string | string[]) => setDraft((prev) => ({ ...prev, [key]: value }));

  const answered = fields.filter((f) => isAnswered(valueOf(f))).length;
  const alreadySent = submission.data?.submitted === true;

  async function send() {
    const merged: Record<string, string | string[]> = { ...serverAnswers, ...draft };

    const missing = fields.find((f) => f.required && !isAnswered(merged[f.field_key]));
    if (missing) {
      Alert.alert('Còn câu bắt buộc', `Vui lòng trả lời: "${missing.label}"`);
      return;
    }

    try {
      await submit.mutateAsync({ template_id: templateId, class_id: classId, answers: toAnswerList(merged) });
      Alert.alert(alreadySent ? 'Đã cập nhật khảo sát' : 'Đã gửi khảo sát', 'Cảm ơn bạn đã dành thời gian trả lời!', [
        { text: 'Xong', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Gửi không thành công', getErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoider>
      <Stack.Screen options={{ title: title || 'Phiếu khảo sát' }} />
      <View className="flex-1 bg-background">
        {template.isLoading ? (
          <LoadingView />
        ) : template.isError || !template.data ? (
          <StateView
            icon="cloud-offline-outline"
            title="Không mở được phiếu khảo sát"
            description={getErrorMessage(template.error)}
            actionLabel="Thử lại"
            onAction={() => template.refetch()}
          />
        ) : (
          <>
            <ScrollView
              className="flex-1"
              contentContainerClassName="gap-4 p-4 pb-6"
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
              <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
                <View className="flex-row items-center gap-2">
                  <Badge label={alreadySent ? 'Đã gửi' : 'Chưa làm'} tone={alreadySent ? 'success' : 'warning'} />
                  <Text className="text-[11px] text-muted">
                    {answered}/{fields.length} câu đã trả lời
                  </Text>
                </View>
                <Text className="text-[17px] font-bold leading-6 text-foreground">{template.data.title}</Text>
                {template.data.description ? (
                  <Text className="text-[13px] leading-5 text-muted">{template.data.description}</Text>
                ) : null}
                {alreadySent ? (
                  <Text className="text-[12px] text-success">
                    Bạn đã gửi phiếu này. Sửa câu trả lời rồi bấm cập nhật là Uspeak ghi nhận bản mới nhất.
                  </Text>
                ) : null}
                <View className="h-1 overflow-hidden rounded-full bg-surface-muted">
                  <View
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${fields.length ? (answered / fields.length) * 100 : 0}%` }}
                  />
                </View>
              </View>

              {fields.map((field, index) => (
                <FieldBlock
                  key={field.field_key}
                  index={index + 1}
                  field={field}
                  value={valueOf(field)}
                  muted={muted}
                  brand={brand}
                  onChange={(v) => setValue(field.field_key, v)}
                />
              ))}

              {fields.length === 0 ? <StateView icon="clipboard-outline" title="Phiếu này chưa có câu hỏi nào" /> : null}
            </ScrollView>

            {fields.length ? (
              <View className="border-t border-border bg-surface p-3">
                <Button
                  title={alreadySent ? 'Cập nhật câu trả lời' : 'Gửi khảo sát'}
                  icon="send"
                  loading={submit.isPending}
                  onPress={send}
                />
              </View>
            ) : null}
          </>
        )}
      </View>
    </KeyboardAvoider>
  );
}

function FieldBlock({
  field,
  index,
  value,
  muted,
  brand,
  onChange,
}: {
  field: SurveyField;
  index: number;
  value: string | string[];
  muted: string;
  brand: string;
  onChange: (value: string | string[]) => void;
}) {
  const options = field.options ?? [];
  const checked = Array.isArray(value) ? value : [];

  return (
    <View className="gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
      <Text className="text-[14px] font-semibold leading-5 text-foreground">
        {index}. {field.label}
        {field.required ? <Text className="text-danger"> *</Text> : null}
      </Text>

      {field.type === 'TEXT' || field.type === 'URL' ? (
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          placeholder={field.placeholder || (field.type === 'URL' ? 'https://…' : 'Câu trả lời của bạn')}
          placeholderTextColor={muted}
          keyboardType={field.type === 'URL' ? 'url' : 'default'}
          autoCapitalize={field.type === 'URL' ? 'none' : 'sentences'}
          autoCorrect={field.type !== 'URL'}
          className="h-12 rounded-xl border border-border bg-background px-3.5 text-[15px] text-foreground"
        />
      ) : null}

      {field.type === 'TEXTAREA' ? (
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          placeholder={field.placeholder || 'Câu trả lời của bạn'}
          placeholderTextColor={muted}
          multiline
          textAlignVertical="top"
          className="min-h-[110px] rounded-xl border border-border bg-background p-3.5 text-[15px] text-foreground"
        />
      ) : null}

      {field.type === 'RADIO' || field.type === 'SELECT' ? (
        <View className="gap-1.5">
          {options.map((option) => {
            const active = value === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onChange(option.value)}
                className={`flex-row items-center gap-2.5 rounded-xl border p-3 active:opacity-70 ${active ? 'border-brand bg-brand-soft' : 'border-border bg-background'}`}>
                <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? brand : muted} />
                <Text className={`flex-1 text-[14px] ${active ? 'font-semibold text-brand' : 'text-foreground'}`}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {field.type === 'CHECKBOX' ? (
        <View className="gap-1.5">
          {options.map((option) => {
            const active = checked.includes(option.value);
            return (
              <Pressable
                key={option.value}
                onPress={() => onChange(active ? checked.filter((v) => v !== option.value) : [...checked, option.value])}
                className={`flex-row items-center gap-2.5 rounded-xl border p-3 active:opacity-70 ${active ? 'border-brand bg-brand-soft' : 'border-border bg-background'}`}>
                <Ionicons name={active ? 'checkbox' : 'square-outline'} size={18} color={active ? brand : muted} />
                <Text className={`flex-1 text-[14px] ${active ? 'font-semibold text-brand' : 'text-foreground'}`}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
