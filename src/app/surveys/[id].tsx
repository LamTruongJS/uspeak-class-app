import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { YoutubePlayer } from '@/components/ui/youtube-player';
import { WEB_URL } from '@/config/env';
import {
  SURVEY_STATUS_VIEW,
  surveyPublicUrl,
  surveyShareMessage,
  useDeleteInputSurvey,
  useInputSurvey,
  useReviewInputSurvey,
  type InputSurvey,
} from '@/features/surveys/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { extractYoutubeVideoId } from '@/lib/youtube';
import { useThemeColor } from '@/theme/use-theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Chi tiết phiếu khảo sát đầu vào: người làm (bấm gọi / email), link để chia sẻ, mốc thời gian,
 * video giới thiệu phát NGAY TRONG APP, và nhận xét Phù hợp / Không phù hợp (POST /input-surveys/:id/review).
 */
export default function InputSurveyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const fg = useThemeColor('foreground');
  const survey = useInputSurvey(id);
  const remove = useDeleteInputSurvey();
  const pull = usePullRefresh(() => survey.refetch());
  const data = survey.data;
  const sheet = useActionSheet();

  const confirmDelete = () =>
    sheet.confirm({
      title: 'Xoá phiếu khảo sát?',
      message: 'Link đã gửi sẽ không dùng được nữa. Không hoàn tác được.',
      label: 'Xoá',
      icon: 'trash-outline',
      onConfirm: async () => {
        try {
          await remove.mutateAsync(id);
          router.back();
        } catch (err) {
          showToast('error', 'Không xoá được', getErrorMessage(err));
        }
      },
    });

  return (
    <KeyboardAvoider>
      <Stack.Screen
        options={{
          title: 'Phiếu khảo sát',
          headerRight: data
            ? () => (
                <Pressable onPress={confirmDelete} hitSlop={10} accessibilityLabel="Xoá phiếu" className="px-1 active:opacity-60">
                  <Ionicons name="trash-outline" size={21} color={fg} />
                </Pressable>
              )
            : undefined,
        }}
      />
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
            contentContainerClassName="gap-4 p-4 pb-12"
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
            <Profile s={data} />
            <Timeline s={data} />
            <Videos s={data} />
            <ReviewForm key={`${data._id}-${data.reviewed_at ?? ''}`} s={data} />
          </ScrollView>
        )}
      </View>
      {sheet.sheet}
    </KeyboardAvoider>
  );
}

function Profile({ s }: { s: InputSurvey }) {
  const brand = useThemeColor('brand');
  const view = SURVEY_STATUS_VIEW[s.status] ?? SURVEY_STATUS_VIEW.not_started;
  const tone = { neutral: 'bg-surface-muted text-muted', warning: 'bg-warning-soft text-warning', success: 'bg-success-soft text-success', danger: 'bg-danger-soft text-danger' }[
    view.tone as string
  ] ?? 'bg-surface-muted text-muted';
  const [bg, text] = tone.split(' ');
  return (
    <View className="gap-4 rounded-3xl bg-surface p-4">
      <View className="flex-row items-center gap-3.5">
        <Avatar name={s.student_name} size={60} />
        <View className="flex-1 gap-1">
          <Text className="text-[20px] font-extrabold text-foreground" numberOfLines={2}>
            {s.student_name}
          </Text>
          <View className={`self-start rounded-full px-2.5 py-1 ${bg}`}>
            <Text className={`text-[12px] font-bold ${text}`}>{view.label}</Text>
          </View>
        </View>
      </View>

      {s.phone || s.email ? (
        <View className="flex-row gap-2">
          {s.phone ? <Contact icon="call" label={s.phone} onPress={() => void Linking.openURL(`tel:${s.phone}`)} /> : null}
          {s.email ? <Contact icon="mail" label={s.email} onPress={() => void Linking.openURL(`mailto:${s.email}`)} /> : null}
        </View>
      ) : (
        <Text className="text-[13px] text-muted">Người làm chưa điền SĐT / email.</Text>
      )}

      <View className="gap-2 rounded-2xl bg-surface-muted p-3">
        <Text className="text-[12px] font-semibold text-muted">Link khảo sát</Text>
        <Text className="text-[13px] text-foreground" numberOfLines={1}>
          {surveyPublicUrl(WEB_URL, s.public_token)}
        </Text>
        <View className="flex-row gap-2 pt-1">
          <Pressable
            onPress={() => void Share.share({ message: surveyShareMessage(WEB_URL, s) })}
            className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-brand active:opacity-85">
            <Ionicons name="share-social" size={16} color="#fff" />
            <Text className="text-[14px] font-bold text-white">Chia sẻ</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(surveyPublicUrl(WEB_URL, s.public_token));
              showToast('success', 'Đã copy link');
            }}
            className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-surface active:opacity-85">
            <Ionicons name="copy-outline" size={16} color={brand} />
            <Text className="text-[14px] font-bold text-brand">Copy link</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Contact({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const brand = useThemeColor('brand');
  return (
    <Pressable onPress={onPress} className="flex-1 flex-row items-center gap-2 rounded-2xl bg-brand-soft px-3 py-2.5 active:opacity-80">
      <Ionicons name={icon} size={15} color={brand} />
      <Text className="flex-1 text-[13px] font-semibold text-brand" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Tạo phiếu → Nộp video → Giáo viên nhận xét. */
function Timeline({ s }: { s: InputSurvey }) {
  const steps: { label: string; at?: string; done: boolean }[] = [
    { label: 'Tạo phiếu', at: s.createdAt, done: true },
    { label: 'Nộp video', at: s.submitted_at, done: !!s.submitted_at },
    { label: 'Giáo viên nhận xét', at: s.reviewed_at, done: !!s.reviewed_at },
  ];
  return (
    <View className="flex-row rounded-3xl bg-surface px-3 py-4">
      {steps.map((st, i) => (
        <View key={st.label} className="flex-1 items-center gap-1.5">
          <View className="w-full flex-row items-center">
            <View className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : st.done ? 'bg-success' : 'bg-border'}`} />
            <View className={`h-7 w-7 items-center justify-center rounded-full ${st.done ? 'bg-success' : 'bg-surface-muted'}`}>
              <Ionicons name={st.done ? 'checkmark' : 'ellipse-outline'} size={14} color={st.done ? '#fff' : '#9ca3af'} />
            </View>
            <View className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : steps[i + 1].done ? 'bg-success' : 'bg-border'}`} />
          </View>
          <Text className={`text-center text-[12px] font-semibold ${st.done ? 'text-foreground' : 'text-muted'}`}>{st.label}</Text>
          <Text className="text-center text-[11px] text-muted">{st.at ? formatDateTime(st.at) : '—'}</Text>
        </View>
      ))}
    </View>
  );
}

function Videos({ s }: { s: InputSurvey }) {
  const videos = s.videos ?? [];
  return (
    <View className="gap-2.5">
      <Text className="px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Video giới thiệu · {videos.length}</Text>
      {videos.length === 0 ? (
        <View className="items-center gap-1.5 rounded-3xl bg-surface p-6">
          <Ionicons name="videocam-off-outline" size={30} color="#9ca3af" />
          <Text className="text-[13.5px] text-muted">Người này chưa nộp video nào.</Text>
        </View>
      ) : (
        videos.map((v, i) => {
          const yt = v.video_id || extractYoutubeVideoId(v.url);
          return (
            <View key={`${v.url}-${i}`} className="overflow-hidden rounded-3xl bg-surface">
              {yt ? (
                <YoutubePlayer videoId={yt} />
              ) : (
                <Pressable onPress={() => void Linking.openURL(v.url)} className="flex-row items-center gap-3 p-4 active:opacity-80">
                  <Ionicons name="play-circle" size={28} color="#dc2626" />
                  <Text className="flex-1 text-[13px] text-foreground" numberOfLines={1}>
                    {v.url}
                  </Text>
                  <Ionicons name="open-outline" size={16} color="#9ca3af" />
                </Pressable>
              )}
              {videos.length > 1 ? <Text className="px-4 py-2.5 text-[13px] font-semibold text-foreground">Video {i + 1}</Text> : null}
            </View>
          );
        })
      )}
    </View>
  );
}

/** Kết quả + nhận xét. Nạp sẵn nhận xét cũ (remount theo reviewed_at nên lưu xong form tự cập nhật). */
function ReviewForm({ s }: { s: InputSurvey }) {
  const muted = useThemeColor('muted');
  const review = useReviewInputSurvey(s._id);
  const [result, setResult] = useState<'suitable' | 'unsuitable' | null>(s.teacher_result ?? null);
  const [text, setText] = useState(s.teacher_feedback ?? '');
  const changed = result !== (s.teacher_result ?? null) || text.trim() !== (s.teacher_feedback ?? '').trim();
  const reviewed = !!s.reviewed_at;

  const save = async () => {
    if (!result) return showToast('warning', 'Chọn kết quả', 'Học viên phù hợp hay không phù hợp với khoá học?');
    if (!text.trim()) return showToast('warning', 'Chưa có nhận xét', 'Viết vài dòng nhận xét trước khi lưu.');
    try {
      await review.mutateAsync({ teacher_feedback: text.trim(), teacher_result: result });
      showToast('success', 'Đã lưu nhận xét');
    } catch (err) {
      showToast('error', 'Không lưu được', getErrorMessage(err));
    }
  };

  return (
    <View className="gap-3.5 rounded-3xl bg-surface p-4">
      <Text className="text-[16px] font-extrabold text-foreground">{reviewed ? 'Nhận xét của giáo viên' : 'Nhận xét & kết quả'}</Text>
      <View className="flex-row gap-2">
        <ResultOption label="Phù hợp" icon="checkmark-circle" active={result === 'suitable'} color="#059669" onPress={() => setResult('suitable')} />
        <ResultOption label="Không phù hợp" icon="close-circle" active={result === 'unsuitable'} color="#dc2626" onPress={() => setResult('unsuitable')} />
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Nhận xét về phát âm, vốn từ, mức độ phù hợp với khoá học…"
        placeholderTextColor={muted}
        multiline
        textAlignVertical="top"
        className="min-h-[120px] rounded-2xl border border-border bg-background p-3.5 text-[15px] leading-6 text-foreground"
      />
      <Pressable
        onPress={save}
        disabled={!changed || review.isPending}
        className={`h-12 flex-row items-center justify-center gap-2 rounded-2xl ${changed ? 'bg-brand active:opacity-85' : 'bg-surface-muted'}`}>
        <Ionicons name="save-outline" size={18} color={changed ? '#fff' : '#9ca3af'} />
        <Text className={`text-[15px] font-bold ${changed ? 'text-white' : 'text-muted'}`}>
          {review.isPending ? 'Đang lưu…' : reviewed && !changed ? 'Đã lưu' : 'Lưu nhận xét'}
        </Text>
      </Pressable>
    </View>
  );
}

function ResultOption({ label, icon, active, color, onPress }: { label: string; icon: IconName; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl border-2 active:opacity-85"
      style={{ borderColor: active ? color : 'transparent', backgroundColor: active ? `${color}14` : 'rgba(127,127,127,0.08)' }}>
      <Ionicons name={icon} size={20} color={active ? color : '#9ca3af'} />
      <Text className="text-[14.5px] font-bold" style={{ color: active ? color : '#6b7280' }}>
        {label}
      </Text>
    </Pressable>
  );
}
