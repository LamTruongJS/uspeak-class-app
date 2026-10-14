import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { WEB_URL } from '@/config/env';
import { SURVEY_STATUS_VIEW, surveyPublicUrl, useInputSurvey, useReviewInputSurvey } from '@/features/surveys/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Chi tiết phiếu khảo sát đầu vào: thông tin người làm, video đã nộp, và ô nhận xét phù hợp/không. */
export default function InputSurveyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');

  const survey = useInputSurvey(id);
  const review = useReviewInputSurvey(id);
  const pull = usePullRefresh(() => survey.refetch());

  const data = survey.data;
  const [feedback, setFeedback] = useState('');
  const view = data ? (SURVEY_STATUS_VIEW[data.status] ?? SURVEY_STATUS_VIEW.not_started) : null;

  async function send(result: 'suitable' | 'unsuitable') {
    const text = feedback.trim() || data?.teacher_feedback?.trim() || '';
    if (!text) {
      Alert.alert('Chưa có nhận xét', 'Viết vài dòng nhận xét cho học viên trước khi chọn kết quả.');
      return;
    }
    try {
      await review.mutateAsync({ teacher_feedback: text, teacher_result: result });
      setFeedback('');
      Alert.alert('Đã lưu nhận xét', result === 'suitable' ? 'Đã đánh dấu học viên phù hợp.' : 'Đã đánh dấu học viên không phù hợp.');
    } catch (err) {
      Alert.alert('Không lưu được', getErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoider>
      <Stack.Screen options={{ title: data?.student_name ?? 'Phiếu khảo sát' }} />
      <View className="flex-1 bg-background">
        {survey.isLoading ? (
          <LoadingView />
        ) : survey.isError || !data ? (
          <StateView
            icon="cloud-offline-outline"
            title="Không mở được phiếu"
            description={getErrorMessage(survey.error)}
            actionLabel="Thử lại"
            onAction={() => survey.refetch()}
          />
        ) : (
          <ScrollView
            contentContainerClassName="gap-4 p-4 pb-10"
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
            <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
              {view ? <Badge label={view.label} tone={view.tone} /> : null}
              <Text className="text-xl font-bold text-foreground">{data.student_name}</Text>
              <Text className="text-[13px] text-muted">{[data.phone, data.email].filter(Boolean).join(' · ') || 'Chưa có liên hệ'}</Text>
              <Text className="text-[11px] text-muted">
                Mã phiếu {data.public_token}
                {data.submitted_at ? ` · Nộp ${formatDateTime(data.submitted_at)}` : ''}
                {data.reviewed_at ? ` · Nhận xét ${formatDateTime(data.reviewed_at)}` : ''}
              </Text>
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(surveyPublicUrl(WEB_URL, data.public_token));
                  Alert.alert('Đã copy link', 'Gửi link này cho người cần làm khảo sát.');
                }}
                className="flex-row items-center gap-1.5 self-start pt-1">
                <Ionicons name="link-outline" size={15} color={brand} />
                <Text className="text-[13px] font-semibold text-brand">Copy link khảo sát</Text>
              </Pressable>
            </View>

            <View className="gap-2">
              <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Video đã nộp · {data.videos?.length ?? 0}</Text>
              {data.videos?.length ? (
                data.videos.map((v, i) => (
                  <Pressable
                    key={`${v.url}-${i}`}
                    onPress={() => void Linking.openURL(v.url)}
                    className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 active:bg-surface-muted">
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-danger-soft">
                      <Ionicons name="logo-youtube" size={20} color="#dc2626" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[14px] font-semibold text-foreground">Video {i + 1}</Text>
                      <Text className="text-[11px] text-muted" numberOfLines={1}>
                        {v.url}
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={16} color={muted} />
                  </Pressable>
                ))
              ) : (
                <Text className="px-1 text-[13px] text-muted">Người này chưa nộp video nào.</Text>
              )}
            </View>

            {data.teacher_feedback ? (
              <View className="gap-1.5 rounded-2xl border border-border bg-surface p-4">
                <Text className="text-sm font-bold text-foreground">Nhận xét đã lưu</Text>
                <Text className="text-[15px] leading-6 text-foreground">{data.teacher_feedback}</Text>
              </View>
            ) : null}

            <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
              <Text className="text-sm font-bold text-foreground">{data.teacher_feedback ? 'Sửa nhận xét' : 'Nhận xét của giáo viên'}</Text>
              <TextInput
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Nhận xét về phát âm, vốn từ, mức độ phù hợp với khoá học…"
                placeholderTextColor={muted}
                multiline
                textAlignVertical="top"
                className="min-h-[120px] rounded-xl border border-border bg-background p-3.5 text-[15px] text-foreground"
              />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button title="Phù hợp" icon="checkmark-circle" loading={review.isPending} onPress={() => send('suitable')} />
                </View>
                <View className="flex-1">
                  <Button
                    title="Không phù hợp"
                    icon="close-circle"
                    variant="danger"
                    loading={review.isPending}
                    onPress={() => send('unsuitable')}
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoider>
  );
}
