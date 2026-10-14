import { Ionicons } from '@expo/vector-icons';
import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, SectionList, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { StateView } from '@/components/ui/state-view';
import { getErrorMessage } from '@/lib/api/client';
import { addDays, formatDate, formatTime, isSameDay, startOfDay, WEEKDAY_FULL } from '@/lib/format';
import { resolveMediaUrl } from '@/lib/media';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Bộ khung dùng chung cho các danh sách của người nhận xét (Lịch sử nhận xét · Nhận xét bài lại ·
 * Bài yêu cầu làm lại · Review bài nhận xét): thanh tìm + tab + bộ lọc viên thuốc, thẻ bài có avatar
 * học viên, danh sách nhóm theo NGÀY (Hôm nay / Hôm qua / Thứ… / ngày) như hộp thư trên điện thoại.
 */

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'violet' | 'neutral' | 'brand';

const PILL: Record<Tone, { box: string; text: string }> = {
  success: { box: 'bg-success-soft', text: 'text-success' },
  info: { box: 'bg-info-soft', text: 'text-info' },
  warning: { box: 'bg-warning-soft', text: 'text-warning' },
  danger: { box: 'bg-danger-soft', text: 'text-danger' },
  violet: { box: 'bg-violet-soft', text: 'text-violet' },
  neutral: { box: 'bg-surface-muted', text: 'text-muted' },
  brand: { box: 'bg-brand-soft', text: 'text-brand' },
};

export function Pill({ text, tone }: { text: string; tone: Tone }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${PILL[tone].box}`}>
      <Text className={`text-[11.5px] font-bold ${PILL[tone].text}`}>{text}</Text>
    </View>
  );
}

/** "Hôm nay" / "Hôm qua" / "Thứ hai" (trong tuần) / "13/10/2026" */
export function dayLabel(iso: string | null | undefined, now: number) {
  if (!iso) return 'Không rõ ngày';
  const d = new Date(iso);
  const today = startOfDay(new Date(now));
  if (isSameDay(d, today)) return 'Hôm nay';
  if (isSameDay(d, addDays(today, -1))) return 'Hôm qua';
  if (d > addDays(today, -6)) return WEEKDAY_FULL[d.getDay()];
  return formatDate(d);
}

/** Gom danh sách thành các nhóm theo ngày (giữ nguyên thứ tự server trả). */
export function groupByDay<T>(items: T[], dateOf: (t: T) => string | null | undefined, now: number) {
  const out: { title: string; data: T[] }[] = [];
  for (const it of items) {
    const title = dayLabel(dateOf(it), now);
    const last = out[out.length - 1];
    if (last && last.title === title) last.data.push(it);
    else out.push({ title, data: [it] });
  }
  return out;
}

/** "14:20" nếu cùng ngày nhóm, đủ ngày giờ nếu không — dùng cho dòng thời gian trong thẻ. */
export const timeOf = (iso?: string | null) => (iso ? formatTime(iso) : '');

export const SubmissionRow = memo(function SubmissionRow({
  studentName,
  studentAvatar,
  token,
  title,
  meta,
  pills,
  note,
  footer,
  onPress,
}: {
  studentName: string;
  studentAvatar?: string;
  token?: string;
  title: string;
  /** "EET22 · Buổi 11" */
  meta?: string;
  pills?: { text: string; tone: Tone }[];
  /** Lý do / ghi chú — hiện trong khung nhạt, tối đa 3 dòng */
  note?: { label: string; text: string } | null;
  /** Dòng nhỏ cuối thẻ (thời gian, người yêu cầu…) */
  footer?: string;
  onPress?: () => void;
}) {
  const muted = useThemeColor('muted');
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="gap-2.5 rounded-3xl bg-surface p-3.5 active:opacity-85">
      <View className="flex-row items-center gap-3">
        <Avatar name={studentName} uri={resolveMediaUrl(studentAvatar, token)} size={40} />
        <View className="flex-1">
          <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
            {studentName}
          </Text>
          {meta ? (
            <Text className="text-[12.5px] text-muted" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={16} color={muted} /> : null}
      </View>
      <Text className="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
        {title}
      </Text>
      {note?.text ? (
        <View className="rounded-2xl bg-surface-muted px-3 py-2">
          <Text className="text-[13px] leading-[18px] text-foreground" numberOfLines={3}>
            <Text className="font-semibold">{note.label}: </Text>
            {note.text}
          </Text>
        </View>
      ) : null}
      {pills?.length || footer ? (
        <View className="flex-row flex-wrap items-center gap-1.5">
          {pills?.map((p) => (
            <Pill key={p.text} text={p.text} tone={p.tone} />
          ))}
          {footer ? (
            <Text className="ml-auto text-[12px] text-muted" numberOfLines={1}>
              {footer}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});

/** Thanh trên: ô tìm (tuỳ chọn) + tab 2 phía (tuỳ chọn) + bộ lọc viên thuốc. */
export function ListToolbar<T extends string, F extends string>({
  summary,
  search,
  onSearch,
  searchPlaceholder,
  tabs,
  tab,
  onTab,
  filters,
  filter,
  onFilter,
}: {
  summary?: ReactNode;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  tabs?: { value: T; label: string }[];
  tab?: T;
  onTab?: (v: T) => void;
  filters?: { value: F; label: string }[];
  filter?: F;
  onFilter?: (v: F) => void;
}) {
  const muted = useThemeColor('muted');
  return (
    <View className="gap-3 pb-1">
      {tabs && onTab ? (
        <View className="flex-row rounded-full bg-surface-muted p-1">
          {tabs.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => onTab(t.value)}
              className={`h-9 flex-1 items-center justify-center rounded-full ${tab === t.value ? 'bg-surface' : ''}`}>
              <Text className={`text-[13.5px] font-semibold ${tab === t.value ? 'text-foreground' : 'text-muted'}`}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {onSearch ? (
        <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
          <Ionicons name="search" size={17} color={muted} />
          <TextInput
            value={search}
            onChangeText={onSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={muted}
            autoCorrect={false}
            className="flex-1 text-[15px] text-foreground"
          />
          {search ? (
            <Pressable hitSlop={8} onPress={() => onSearch('')}>
              <Ionicons name="close-circle" size={18} color={muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {filters && onFilter ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {filters.map((f) => {
            const on = filter === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => onFilter(f.value)}
                className={`h-8 justify-center rounded-full px-3.5 active:opacity-80 ${on ? 'bg-foreground' : 'bg-surface-muted'}`}>
                <Text className={`text-[13px] font-semibold ${on ? 'text-background' : 'text-muted'}`}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {summary ? <Text className="text-[13px] text-muted">{summary}</Text> : null}
    </View>
  );
}

/** Danh sách nhóm theo ngày + kéo để làm mới + cuộn tải thêm + trạng thái tải/lỗi/trống. */
export function GroupedList<T>({
  sections,
  keyOf,
  renderItem,
  header,
  query,
  refreshing,
  onRefresh,
  empty,
}: {
  sections: { title: string; data: T[] }[];
  keyOf: (t: T) => string;
  renderItem: (t: T) => React.ReactElement;
  header: React.ReactElement;
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => unknown;
  };
  refreshing: boolean;
  onRefresh: () => void;
  empty: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; description?: string };
}) {
  const brand = useThemeColor('brand');
  return (
    <SectionList
      sections={sections}
      keyExtractor={keyOf}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ItemSeparatorComponent={() => <View className="h-2.5" />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand} colors={[brand]} />}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage?.();
      }}
      renderSectionHeader={({ section }) => (
        <Text className="pb-2.5 pt-4 text-[13px] font-bold uppercase tracking-wide text-muted">
          {section.title} <Text className="font-semibold normal-case">· {section.data.length}</Text>
        </Text>
      )}
      renderItem={({ item }) => renderItem(item)}
      ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
      ListEmptyComponent={
        query.isLoading ? (
          <ActivityIndicator className="py-10" color={brand} />
        ) : query.isError ? (
          <StateView
            icon="cloud-offline-outline"
            title="Không tải được danh sách"
            description={getErrorMessage(query.error)}
            actionLabel="Thử lại"
            onAction={() => query.refetch()}
          />
        ) : (
          <StateView icon={empty.icon} title={empty.title} description={empty.description} />
        )
      }
    />
  );
}
