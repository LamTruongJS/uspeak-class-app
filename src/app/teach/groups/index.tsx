import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { FilterChips, SearchBox } from '@/components/ui/list-filters';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { fold } from '@/features/chat/mentions';
import { TeachingGroupCard } from '@/features/classes/class-card';
import { STATUS_META, type ClassStatus } from '@/features/classes/staff-api';
import { useMyTeachingGroups, type TeachingGroupItem } from '@/features/classes/teach-api';
import { menuScreenOptions } from '@/features/navigation/app-menu';
import { getErrorMessage } from '@/lib/api/client';
import { useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

type StatusFilter = 'ALL' | ClassStatus;

/** Lớp đang dạy lên đầu, lớp đã kết thúc xuống cuối; cùng trạng thái thì lớp mới khai giảng trước. */
const STATUS_ORDER: Record<ClassStatus, number> = { IN_PROGRESS: 0, OPEN_REGISTRATION: 1, CLOSED_REGISTRATION: 2, ENDED: 3 };

/**
 * Nhóm giảng dạy của tôi — bản mobile của web /teaching-groups.
 * CÙNG giao diện với màn Lớp học / Lớp dạy (ô tìm, chip lọc trạng thái, thẻ có ảnh bìa — anh yêu cầu
 * 16/10/2026 cho thống nhất): mỗi nhóm một thẻ, ảnh bìa theo lớp nên các nhóm cùng lớp cùng màu.
 */
export default function TeachingGroupsScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const { data: token } = useMediaToken();
  const [search, setSearch] = useState('');
  const q = useDeferredValue(fold(search.trim()));
  const [status, setStatus] = useState<StatusFilter>('ALL');

  const query = useMyTeachingGroups();
  const pull = usePullRefresh(() => query.refetch());

  const all = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (a, b) =>
          (STATUS_ORDER[a.status_class] ?? 9) - (STATUS_ORDER[b.status_class] ?? 9) ||
          new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime() ||
          a.group_name.localeCompare(b.group_name, 'vi', { numeric: true }),
      ),
    [query.data],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: all.length };
    for (const g of all) c[g.status_class] = (c[g.status_class] ?? 0) + 1;
    return c;
  }, [all]);
  const list = useMemo(() => {
    const s = status === 'ALL' ? all : all.filter((g) => g.status_class === status);
    return q
      ? s.filter((g) => fold(`${g.group_name} ${g.class_code} ${g.class_name} ${g.assistant?.name ?? ''} ${g.teacher?.name ?? ''}`).includes(q))
      : s;
  }, [all, status, q]);

  // Giống màn Lớp dạy: "Tất cả" đứng đầu (lựa chọn mặc định); trạng thái không có nhóm nào thì ẩn chip
  const statusItems = (
    [
      { value: 'ALL', label: 'Tất cả', count: counts.ALL ?? 0 },
      { value: 'IN_PROGRESS', label: STATUS_META.IN_PROGRESS.label, count: counts.IN_PROGRESS ?? 0 },
      { value: 'OPEN_REGISTRATION', label: STATUS_META.OPEN_REGISTRATION.label, count: counts.OPEN_REGISTRATION ?? 0 },
      { value: 'CLOSED_REGISTRATION', label: STATUS_META.CLOSED_REGISTRATION.label, count: counts.CLOSED_REGISTRATION ?? 0 },
      { value: 'ENDED', label: STATUS_META.ENDED.label, count: counts.ENDED ?? 0 },
    ] as { value: StatusFilter; label: string; count: number }[]
  ).filter((it) => it.value === 'ALL' || it.value === status || it.count > 0);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Nhóm giảng dạy', ...menuScreenOptions }} />
      <View className="gap-3 px-4 pb-1 pt-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm nhóm, lớp, trợ giảng…" />
        <FilterChips<StatusFilter> items={statusItems} value={status} onChange={setStatus} />
      </View>
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được nhóm giảng dạy"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={list}
          keyExtractor={(g: TeachingGroupItem) => g._id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={
            <StateView icon="people-outline" title={search ? 'Không tìm thấy nhóm' : all.length ? 'Không có nhóm nào' : 'Bạn chưa phụ trách nhóm nào'} />
          }
          renderItem={({ item }) => (
            <TeachingGroupCard
              item={item}
              token={token?.media_token}
              muted={muted}
              onPress={() => router.push({ pathname: '/teach/groups/[id]', params: { id: item._id } })}
            />
          )}
        />
      )}
    </View>
  );
}
