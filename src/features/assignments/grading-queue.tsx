import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { isAxiosError } from 'axios';
import { memo, useDeferredValue, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { StateView } from '@/components/ui/state-view';
import { roomTime } from '@/features/chat/format';
import { getErrorMessage } from '@/lib/api/client';
import { mediaCacheKey, resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

import { deadlineUrgency, gradingApi, useGradingQueue, type GradingQueueItem, type GradingStatusFilter, type Urgency } from './grading-api';

type IconName = ComponentProps<typeof Ionicons>['name'];

const FILTERS: { value: GradingStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'submitted', label: 'Chờ nhận' },
  { value: 'reassigned', label: 'Chờ nhận lại' },
  { value: 'claimed', label: 'Đang nhận xét' },
];

const TYPE_ICON: Record<string, { icon: IconName; color: string }> = {
  video_speaking: { icon: 'videocam', color: '#7c3aed' },
  youtube_video: { icon: 'logo-youtube', color: '#7c3aed' },
  quiz: { icon: 'help-circle', color: '#0891b2' },
  essay: { icon: 'create', color: '#ea580c' },
  image_upload: { icon: 'image', color: '#db2777' },
};

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

/** Mở trang nhận xét bài trên web (video, rubric, ghi âm nhận xét… cần màn hình lớn). */
/** Màn nhận xét trong app (src/app/grading/[id].tsx) — trước đây mở bản web. */
const openGrading = (submissionId: string) => router.push({ pathname: '/grading/[id]', params: { id: submissionId } });

/**
 * Hàng chờ nhận xét — bản mobile của web /assignments/grading: bài GẤP (hạn nhận xét < 12 giờ
 * hoặc quá hạn) lên đầu và phải nhận trước, như web. Nhận bài ngay trên app; phần nhận xét
 * (xem video, chấm theo rubric, ghi âm) mở trang web vì cần màn hình lớn.
 */
export function GradingQueueScreen() {
  const insets = useSafeAreaInsets();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const { data: token } = useMediaToken();
  const [status, setStatus] = useState<GradingStatusFilter>('all');
  const [input, setInput] = useState('');
  const search = useDeferredValue(input.trim());
  const [debounced, setDebounced] = useState('');
  const [claiming, setClaiming] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const q = useGradingQueue({ status, search: debounced });
  const pull = usePullRefresh(q.refetch);
  const first = q.data?.pages[0];
  const total = first?.total ?? 0;
  const urgentTotal = first?.urgentTotal ?? 0;

  // Gấp lên đầu (hạn sớm nhất trước), còn lại nộp sớm nhất trước — giống web
  const items = useMemo(() => {
    const list = q.data?.pages.flatMap((p) => p.data) ?? [];
    const rank = (u: Urgency) => (u === 'normal' ? 1 : 0);
    return [...list].sort((a, b) => {
      const ua = deadlineUrgency(a.grading_deadline, now);
      const ub = deadlineUrgency(b.grading_deadline, now);
      if (rank(ua) !== rank(ub)) return rank(ua) - rank(ub);
      if (rank(ua) === 0) return new Date(a.grading_deadline!).getTime() - new Date(b.grading_deadline!).getTime();
      return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
    });
  }, [q.data, now]);

  async function claim(item: GradingQueueItem) {
    if (claiming) return;
    if (urgentTotal > 0 && deadlineUrgency(item.grading_deadline, now) === 'normal') {
      Alert.alert('Còn bài gấp', `Vui lòng nhận xét ${urgentTotal} bài gấp (sắp hết hạn nhận xét) trước.`);
      return;
    }
    setClaiming(item._id);
    try {
      await gradingApi.claim(item._id);
      void q.refetch();
      Alert.alert('Đã nhận bài', `Bài của ${item.student_name} đã được giữ cho bạn. Mở trang nhận xét ngay?`, [
        { text: 'Để sau', style: 'cancel' },
        { text: 'Nhận xét ngay', onPress: () => openGrading(item._id) },
      ]);
    } catch (err) {
      const conflict =
        isAxiosError(err) && (err.response?.status === 409 || (err.response?.data as { error?: string })?.error === 'ALREADY_CLAIMED');
      if (conflict) {
        Alert.alert('Bài đã có người nhận', 'Bài này vừa được người khác nhận nhận xét. Danh sách sẽ được cập nhật.');
        void q.refetch();
      } else {
        Alert.alert('Chưa nhận được bài', getErrorMessage(err));
      }
    } finally {
      setClaiming(null);
    }
  }

  const header = (
    <View className="gap-3 pb-3">
      <View className="flex-row gap-2">
        <Counter icon="file-tray-full" color="#2563eb" value={total} label="Bài trong hàng chờ" />
        <Counter icon="flame" color="#dc2626" value={urgentTotal} label="Bài gấp (< 12 giờ)" />
      </View>
      {urgentTotal > 0 ? (
        <View className="flex-row items-start gap-2.5 rounded-xl bg-danger-soft p-3">
          <Ionicons name="alert-circle" size={18} color="#dc2626" />
          <Text className="flex-1 text-[13px] leading-[18px] text-danger">
            Có {urgentTotal} bài sắp hết hạn nhận xét — cần nhận các bài này trước bài thường.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <View className="gap-3 px-4 pb-1" style={{ paddingTop: insets.top + 12 }}>
        <View>
          <Text className="text-[28px] font-bold text-foreground">Nhận xét bài</Text>
          <Text className="text-sm text-muted">Nhận bài trong hàng chờ để bắt đầu nhận xét</Text>
        </View>
        <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
          <Ionicons name="search" size={18} color={muted} />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Tìm học viên, bài tập, mã lớp…"
            placeholderTextColor={muted}
            autoCorrect={false}
            className="flex-1 text-base text-foreground"
          />
          {input ? (
            <Pressable hitSlop={8} onPress={() => setInput('')}>
              <Ionicons name="close-circle" size={18} color={muted} />
            </Pressable>
          ) : q.isFetching && !q.isLoading ? (
            <ActivityIndicator size="small" color={brand} />
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 grow-0" contentContainerClassName="gap-2 px-4">
          {FILTERS.map((f) => {
            const on = f.value === status;
            return (
              <Pressable
                key={f.value}
                onPress={() => setStatus(f.value)}
                className={`rounded-full px-3.5 py-1.5 ${on ? 'bg-brand' : 'bg-surface-muted'}`}>
                <Text className={`text-sm font-semibold ${on ? 'text-on-brand' : 'text-foreground'}`}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {q.isLoading ? (
        <ActivityIndicator className="py-12" color={brand} />
      ) : q.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được hàng chờ"
          description={getErrorMessage(q.error)}
          actionLabel="Thử lại"
          onAction={() => q.refetch()}
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(i) => i._id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
          ListEmptyComponent={
            <StateView
              icon="checkmark-done-circle-outline"
              title={debounced ? 'Không tìm thấy bài phù hợp' : 'Hàng chờ trống 🎉'}
              description={debounced ? undefined : 'Không còn bài nào cần nhận xét.'}
            />
          }
          renderItem={({ item }) => (
            <QueueCard
              item={item}
              now={now}
              token={token?.media_token}
              muted={muted}
              claiming={claiming === item._id}
              blocked={urgentTotal > 0 && deadlineUrgency(item.grading_deadline, now) === 'normal'}
              onClaim={() => claim(item)}
              onOpen={() => openGrading(item._id)}
            />
          )}
        />
      )}
    </View>
  );
}

function Counter({ icon, color, value, label }: { icon: IconName; color: string; value: number; label: string }) {
  return (
    <View className="flex-1 flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}22` }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View className="flex-1">
        <Text className="text-xl font-extrabold text-foreground">{value.toLocaleString('vi-VN')}</Text>
        <Text className="text-[11px] text-muted" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const QueueCard = memo(function QueueCard({
  item,
  now,
  token,
  muted,
  claiming,
  blocked,
  onClaim,
  onOpen,
}: {
  item: GradingQueueItem;
  now: number;
  token?: string;
  muted: string;
  claiming: boolean;
  blocked: boolean;
  onClaim: () => void;
  onOpen: () => void;
}) {
  const urgency = deadlineUrgency(item.grading_deadline, now);
  const t = TYPE_ICON[item.assignment_type?.code ?? ''] ?? { icon: 'document-text' as IconName, color: '#6b7280' };
  const claimed = item.status === 'claimed';
  const stripe = urgency === 'overdue' ? 'bg-danger' : urgency === 'urgent' ? 'bg-warning' : 'bg-border';

  return (
    <View className="flex-row overflow-hidden rounded-2xl border border-border bg-surface">
      <View className={`w-1 ${stripe}`} />
      <View className="flex-1 gap-2.5 p-3.5">
        {/* Bài tập */}
        <View className="flex-row items-start gap-2.5">
          <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${t.color}1f` }}>
            <Ionicons name={t.icon} size={18} color={t.color} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
              {item.assignment_title}
            </Text>
            <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
              {[item.assignment_type?.label, item.class_code, item.group_name, item.session_number ? `Buổi ${item.session_number}` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        {/* Học viên + lúc nộp */}
        <View className="flex-row items-center gap-2">
          <Avatar
            name={item.student_name}
            uri={resolveMediaUrl(item.student_avatar, token)}
            cacheKey={mediaCacheKey(item.student_avatar)}
            size={24}
          />
          <Text className="flex-1 text-[13px] text-foreground" numberOfLines={1}>
            {item.student_name}
          </Text>
          <Text className="text-xs text-muted">Nộp {roomTime(item.submitted_at)}</Text>
        </View>

        {/* Nhãn */}
        <View className="flex-row flex-wrap items-center gap-1.5">
          {item.grading_deadline ? (
            <Tag
              icon="hourglass-outline"
              tone={urgency === 'overdue' ? 'danger' : urgency === 'urgent' ? 'warning' : 'neutral'}
              label={urgency === 'overdue' ? `Quá hạn NX ${fmt(item.grading_deadline)}` : `Hạn NX ${fmt(item.grading_deadline)}`}
            />
          ) : null}
          {item.is_late ? <Tag icon="time-outline" tone="warning" label="Nộp trễ" /> : null}
          {item.status === 'reassigned' ? <Tag icon="refresh" tone="violet" label="Chờ nhận lại" /> : null}
          {claimed ? <Tag icon="person" tone="info" label={item.grader_name ? `Đang NX: ${item.grader_name}` : 'Đang nhận xét'} /> : null}
        </View>

        {/* Hành động */}
        <View className="flex-row gap-2">
          {claimed ? (
            <Pressable
              onPress={onOpen}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-surface-muted py-2.5 active:opacity-70">
              <Ionicons name="open-outline" size={16} color={muted} />
              <Text className="text-sm font-semibold text-foreground">Mở trang nhận xét</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onClaim}
              disabled={claiming}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 active:opacity-80 ${blocked ? 'bg-surface-muted' : 'bg-brand'}`}>
              {claiming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name={blocked ? 'lock-closed' : 'hand-left'} size={15} color={blocked ? muted : '#fff'} />
              )}
              <Text className={`text-sm font-semibold ${blocked ? 'text-muted' : 'text-on-brand'}`}>
                {blocked ? 'Nhận bài gấp trước' : 'Nhận bài'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
});

const TAG_TONE = {
  danger: { box: 'bg-danger-soft', text: 'text-danger', color: '#dc2626' },
  warning: { box: 'bg-warning-soft', text: 'text-warning', color: '#d97706' },
  info: { box: 'bg-info-soft', text: 'text-info', color: '#2563eb' },
  violet: { box: 'bg-violet-soft', text: 'text-violet', color: '#7c3aed' },
  neutral: { box: 'bg-surface-muted', text: 'text-muted', color: '#6b7280' },
};

function Tag({ icon, label, tone }: { icon: IconName; label: string; tone: keyof typeof TAG_TONE }) {
  const t = TAG_TONE[tone];
  const color = useThemeColor(tone === 'neutral' ? 'muted' : tone);
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${t.box}`}>
      <Ionicons name={icon} size={11} color={color} />
      <Text className={`text-[11px] font-semibold ${t.text}`}>{label}</Text>
    </View>
  );
}
