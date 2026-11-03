import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';

import { useActionSheet } from '@/components/ui/action-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterChips, SearchBox } from '@/components/ui/list-filters';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { showToast } from '@/components/ui/toast';
import { menuScreenOptions } from '@/features/navigation/app-menu';
import {
  availableProviders,
  formatDuration,
  isRunning,
  PROVIDER_LABEL,
  SOURCE_VIEW,
  useDebouncedValue,
  useRequestTranscriptsBulk,
  useVideoTranscriptFilters,
  useVideoTranscriptList,
  useVideoTranscriptStats,
  type TranscriptProvider,
  type VideoTranscriptRow,
} from '@/features/video-scripts/api';
import { PickerSheet, TranscriptStatusView, type PickerOption } from '@/features/video-scripts/components';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useStableCallback } from '@/lib/use-stable-callback';
import { useThemeColor } from '@/theme/use-theme-color';

type StatusFilter = '' | 'none' | 'done' | 'processing' | 'queued' | 'failed';
type SourceFilter = '' | 'youtube' | 'vimeo' | 'bunny';

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: '', label: 'Mọi nguồn' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'vimeo', label: 'Vimeo' },
  { value: 'bunny', label: 'Bunny' },
];

const canRequest = (r: VideoTranscriptRow) => !!r.source && !isRunning(r.transcript?.status);

/**
 * Script video (admin) — bản mobile của trang /video-scripts.
 *
 * Web: 5 thẻ thống kê + nhóm nút trạng thái + 3 ô chọn (nguồn / khoá / lớp) + bảng có ô tick.
 * Điện thoại: thẻ thống kê và nút trạng thái gộp làm MỘT hàng chip có số đếm; khoá/lớp mở bảng chọn
 * có ô tìm; bảng → thẻ, bấm thẻ mở màn script. Tick nhiều dòng của web → chế độ "Chọn nhiều" với
 * thanh "Tạo script (n)" dưới đáy.
 */
export default function VideoScriptsScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const warning = useThemeColor('warning');
  const menu = useActionSheet();

  const [search, setSearch] = useState('');
  const applied = useDebouncedValue(search.trim());
  const [status, setStatus] = useState<StatusFilter>('');
  const [source, setSource] = useState<SourceFilter>('');
  const [courseId, setCourseId] = useState('');
  const [classId, setClassId] = useState('');
  const [picker, setPicker] = useState<'course' | 'class' | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState<TranscriptProvider | ''>('');

  const query = useVideoTranscriptList({ search: applied, status, source, courseId, classId });
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination?.total;
  const anyRunning = items.some((r) => isRunning(r.transcript?.status));

  const statsQuery = useVideoTranscriptStats(anyRunning);
  const stats = statsQuery.data?.data;
  const providers = statsQuery.data?.providers;
  const usable = availableProviders(providers);
  const chosenProvider = provider || providers?.default || usable[0] || '';

  const filtersQuery = useVideoTranscriptFilters();
  const courseOptions = useMemo<PickerOption[]>(
    () => [
      { value: '', label: 'Mọi khoá' },
      ...(filtersQuery.data?.courses ?? []).map((c) => ({
        value: c._id,
        label: c.course_code ? `${c.course_code} · ${c.course_name}` : c.course_name,
        sublabel: `${c.class_count} lớp · ${c.video_count} video`,
        keywords: `${c.course_code} ${c.course_name}`,
      })),
    ],
    [filtersQuery.data],
  );
  // Đã chọn khoá thì chỉ hiện lớp của khoá đó
  const classOptions = useMemo<PickerOption[]>(
    () => [
      { value: '', label: 'Mọi lớp' },
      ...(filtersQuery.data?.classes ?? [])
        .filter((c) => !courseId || c.course_id === courseId)
        .map((c) => ({
          value: c._id,
          label: c.class_name || c.class_code || c.display_name,
          sublabel: `${c.display_name ? `${c.display_name} · ` : ''}${c.video_count} video · ${c.done_count} có script`,
          keywords: `${c.class_code} ${c.class_name} ${c.display_name}`,
        })),
    ],
    [filtersQuery.data, courseId],
  );
  const courseLabel = courseOptions.find((o) => o.value === courseId)?.label ?? 'Mọi khoá';
  const classLabel = classOptions.find((o) => o.value === classId)?.label ?? 'Mọi lớp';

  const statusItems: { value: StatusFilter; label: string; count?: number }[] = [
    { value: '', label: 'Tất cả', count: stats?.total },
    { value: 'none', label: 'Chưa có', count: stats?.none },
    { value: 'done', label: 'Đã có', count: stats?.done },
    { value: 'processing', label: 'Đang chạy', count: stats?.processing },
    { value: 'queued', label: 'Chờ', count: stats?.queued },
    { value: 'failed', label: 'Lỗi', count: stats?.failed },
  ];

  const hasFilter = !!(status || source || courseId || classId || search);
  const clearFilters = () => {
    setStatus('');
    setSource('');
    setCourseId('');
    setClassId('');
    setSearch('');
  };

  // Chỉ tính các dòng đang hiện mà còn tạo được — đổi bộ lọc thì dòng cũ tự rơi khỏi lựa chọn.
  const selectableIds = useMemo(() => items.filter(canRequest).map((r) => r._id), [items]);
  const chosenIds = selectableIds.filter((id) => selected.has(id));
  const allSelected = selectableIds.length > 0 && chosenIds.length === selectableIds.length;

  const bulk = useRequestTranscriptsBulk();
  const request = async (ids: string[]) => {
    if (!ids.length) return;
    setPendingIds((prev) => new Set([...prev, ...ids]));
    try {
      const result = await bulk.mutateAsync({ ids, provider: chosenProvider || undefined });
      if (result.queued) showToast('success', `Đã xếp hàng ${result.queued} video`, 'Server sẽ chạy lần lượt');
      if (result.skipped.length) showToast('warning', `${result.skipped.length} video bị bỏ qua`, result.skipped[0].reason);
      setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      await query.refetch();
    } catch (err) {
      showToast('error', 'Chưa tạo được script', getErrorMessage(err));
    } finally {
      setPendingIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    }
  };

  const onPressRow = useStableCallback((row: VideoTranscriptRow) => {
    if (selecting) {
      if (!canRequest(row)) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(row._id)) next.delete(row._id);
        else next.add(row._id);
        return next;
      });
      return;
    }
    router.push({ pathname: '/video-scripts/[videoId]', params: { videoId: row._id, title: row.title, url: row.video_url } });
  });
  const onRequestRow = useStableCallback((row: VideoTranscriptRow) => void request([row._id]));

  const pickProvider = () =>
    menu.show({
      title: 'Nhà cung cấp chép lời',
      actions: usable.map((p) => ({ label: PROVIDER_LABEL[p], selected: p === chosenProvider, onPress: () => setProvider(p) })),
    });

  const header = (
    <View className="gap-2.5 pb-2">
      <FilterChips items={statusItems} value={status} onChange={setStatus} />
      <View className="flex-row flex-wrap gap-1.5">
        {SOURCE_FILTERS.map((f) => {
          const on = source === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setSource(f.value)}
              accessibilityState={{ selected: on }}
              className={`h-8 items-center justify-center rounded-full px-3 active:opacity-80 ${on ? 'bg-brand-soft' : 'bg-surface-muted'}`}>
              <Text className={`text-[13px] font-semibold ${on ? 'text-brand' : 'text-muted'}`}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row gap-2">
        <SelectButton label={courseLabel} active={!!courseId} onPress={() => setPicker('course')} />
        <SelectButton label={classLabel} active={!!classId} onPress={() => setPicker('class')} />
      </View>

      {providers && !usable.length ? (
        <View className="flex-row gap-2 rounded-xl bg-warning-soft p-3">
          <Ionicons name="warning-outline" size={16} color={warning} />
          <Text className="shrink text-[13px] text-warning">
            Server chưa cấu hình API chép lời (GEMINI_API_KEY hoặc GROQ_API_KEY) nên chưa tạo script được.
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-center gap-3">
        <Text className="text-[12.5px] font-medium text-muted">{total !== undefined ? `${total.toLocaleString('vi-VN')} video` : ' '}</Text>
        {query.isFetching && !query.isLoading && !query.isFetchingNextPage ? <ActivityIndicator size="small" color={brand} /> : null}
        <View className="flex-1" />
        {hasFilter ? (
          <Pressable onPress={clearFilters} hitSlop={6} className="active:opacity-70">
            <Text className="text-[13px] font-semibold text-muted">Xoá lọc</Text>
          </Pressable>
        ) : null}
        {usable.length ? (
          <Pressable
            onPress={() => {
              setSelecting((v) => !v);
              setSelected(new Set());
            }}
            hitSlop={6}
            className="active:opacity-70">
            <Text className="text-[13px] font-semibold text-brand">{selecting ? 'Xong' : 'Chọn nhiều'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Script video', ...menuScreenOptions }} />

      <View className="px-4 pb-2 pt-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm tên video, mã lớp, tên lớp…" />
      </View>

      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được danh sách"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(i) => i._id}
          extraData={{ selecting, selected, pendingIds }}
          renderItem={({ item }) => (
            <VideoCard
              item={item}
              selecting={selecting}
              checked={selected.has(item._id)}
              pending={pendingIds.has(item._id)}
              canCreate={usable.length > 0}
              onPress={onPressRow}
              onRequest={onRequestRow}
            />
          )}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={() => {
                void statsQuery.refetch();
                return pull.onRefresh();
              }}
              tintColor={brand}
              colors={[brand]}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
          ListEmptyComponent={<StateView icon="videocam-outline" title="Không có video nào khớp bộ lọc" />}
        />
      )}

      {selecting ? (
        <View className="gap-2 border-t border-border bg-surface px-4 pb-3 pt-2.5">
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => setSelected(allSelected ? new Set() : new Set(selectableIds))}
              disabled={!selectableIds.length}
              className="flex-row items-center gap-1.5 active:opacity-70">
              <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={20} color={allSelected ? brand : muted} />
              <Text className="text-[13px] text-muted">Chọn hết ({selectableIds.length})</Text>
            </Pressable>
            <View className="flex-1" />
            {usable.length > 1 ? (
              <Pressable onPress={pickProvider} className="flex-row items-center gap-1 active:opacity-70">
                <Text className="text-[13px] font-semibold text-foreground">
                  {chosenProvider ? PROVIDER_LABEL[chosenProvider] : 'Nhà cung cấp'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={muted} />
              </Pressable>
            ) : usable.length === 1 ? (
              <Text className="text-[12.5px] text-muted">Dùng {PROVIDER_LABEL[usable[0]]}</Text>
            ) : null}
          </View>
          <Button
            title={`Tạo script${chosenIds.length ? ` (${chosenIds.length})` : ''}`}
            icon="sparkles"
            disabled={!chosenIds.length || !usable.length}
            loading={bulk.isPending}
            onPress={() =>
              menu.confirm({
                title: `Tạo script cho ${chosenIds.length} video?`,
                message: 'Mỗi video gọi API chép lời (tính phí). Video đã có script sẽ được chép lại từ đầu.',
                label: 'Tạo script',
                icon: 'sparkles',
                danger: false,
                onConfirm: () => void request(chosenIds),
              })
            }
          />
        </View>
      ) : null}

      <PickerSheet
        visible={picker === 'course'}
        title="Chọn khoá"
        options={courseOptions}
        value={courseId}
        searchPlaceholder="Tìm mã / tên khoá…"
        onSelect={(v) => {
          setCourseId(v);
          setClassId('');
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'class'}
        title="Chọn lớp"
        options={classOptions}
        value={classId}
        searchPlaceholder="Tìm mã / tên lớp…"
        onSelect={(v) => {
          setClassId(v);
          // Chọn lớp trước → tự điền khoá của lớp đó cho khớp (như web)
          const picked = filtersQuery.data?.classes.find((c) => c._id === v);
          if (picked?.course_id) setCourseId(picked.course_id);
        }}
        onClose={() => setPicker(null)}
      />
      {menu.sheet}
    </View>
  );
}

function SelectButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  return (
    <Pressable
      onPress={onPress}
      className={`h-10 flex-1 flex-row items-center gap-1.5 rounded-xl px-3 active:opacity-80 ${active ? 'bg-brand-soft' : 'bg-surface-muted'}`}>
      <Text className={`shrink text-[13px] font-semibold ${active ? 'text-brand' : 'text-foreground'}`} numberOfLines={1}>
        {label}
      </Text>
      <View className="flex-1" />
      <Ionicons name="chevron-down" size={15} color={active ? brand : muted} />
    </Pressable>
  );
}

const VideoCard = memo(function VideoCard({
  item,
  selecting,
  checked,
  pending,
  canCreate,
  onPress,
  onRequest,
}: {
  item: VideoTranscriptRow;
  selecting: boolean;
  checked: boolean;
  pending: boolean;
  canCreate: boolean;
  onPress: (row: VideoTranscriptRow) => void;
  onRequest: (row: VideoTranscriptRow) => void;
}) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const t = item.transcript;
  const source = item.source ? SOURCE_VIEW[item.source] : null;
  // lesson_videos cũ không lưu thời lượng → lấy độ dài đo được lúc tạo script
  const seconds = item.duration_seconds || t?.duration_seconds;
  const selectable = canRequest(item);
  // Nút nhanh chỉ cho video CHƯA có / bị lỗi; tạo lại bản đã có thì vào màn script (có hỏi lại).
  const quick = !selecting && selectable && canCreate && (!t || t.status === 'failed');

  return (
    <Pressable
      onPress={() => onPress(item)}
      className={`mb-2.5 gap-2 rounded-2xl border bg-surface p-3.5 active:opacity-80 ${checked ? 'border-brand' : 'border-border'} ${
        selecting && !selectable ? 'opacity-50' : ''
      }`}>
      <View className="flex-row items-start gap-2.5">
        {selecting ? <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={checked ? brand : muted} /> : null}
        <View className="shrink gap-1">
          <Text className="text-[15px] font-bold text-foreground" numberOfLines={2}>
            {item.title}
          </Text>
          <Text className="text-[12.5px] text-muted" numberOfLines={1}>
            {item.class_name || item.class_code || 'Không rõ lớp'}
            {item.class_display_name ? ` · ${item.class_display_name}` : ''}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap items-center gap-1.5">
        {source ? <Badge label={source.label} tone={source.tone} /> : <Badge label="Không hỗ trợ" tone="neutral" />}
        <Text className="text-[12px] text-muted">
          {formatDuration(seconds)} · đăng {formatDateTime(item.createdAt)}
        </Text>
      </View>

      <View className="flex-row items-end gap-2">
        <View className="shrink gap-1">
          <TranscriptStatusView transcript={t} />
          {t?.status === 'done' ? (
            <Text className="text-[11.5px] text-muted">Cập nhật {formatDateTime(t.finished_at || t.updatedAt)}</Text>
          ) : null}
        </View>
        <View className="flex-1" />
        {quick ? (
          <Pressable
            onPress={() => onRequest(item)}
            disabled={pending}
            className="h-8 flex-row items-center gap-1 rounded-full bg-brand px-3 active:opacity-80">
            {pending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={13} color="#fff" />
                <Text className="text-[13px] font-semibold text-on-brand">{t?.status === 'failed' ? 'Thử lại' : 'Tạo'}</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
});
