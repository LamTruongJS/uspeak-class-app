import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { SearchBox } from '@/components/ui/list-filters';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { menuScreenOptions } from '@/features/navigation/app-menu';
import { useDebouncedValue, useStudentInfoList, type StudentInfoRow } from '@/features/student-info/api';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useStableCallback } from '@/lib/use-stable-callback';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Thông tin học viên (admin) — bản mobile của trang /student-info.
 * Web là bảng STT / tên / email / lớp / nút "Xem khảo sát"; điện thoại đổi thành thẻ, bấm thẻ mở màn
 * chi tiết (lớp đang học + toàn bộ phiếu khảo sát). Phân trang số → cuộn tải thêm.
 */
export default function StudentInfoScreen() {
  const brand = useThemeColor('brand');
  const [search, setSearch] = useState('');
  const applied = useDebouncedValue(search.trim());

  const query = useStudentInfoList(applied);
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination?.total;

  const open = useStableCallback((row: StudentInfoRow) =>
    router.push({ pathname: '/student-info/[userId]', params: { userId: row._id, name: row.name, email: row.email } }),
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Thông tin học viên', ...menuScreenOptions }} />

      <View className="gap-2 px-4 pb-1 pt-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm theo tên, email…" />
        <View className="flex-row items-center gap-2">
          <Text className="text-[12.5px] font-medium text-muted">
            {total !== undefined ? `${total.toLocaleString('vi-VN')} học viên` : ' '}
          </Text>
          <View className="flex-1" />
          {query.isFetching && !query.isLoading && !query.isFetchingNextPage ? <ActivityIndicator size="small" color={brand} /> : null}
        </View>
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
          renderItem={({ item }) => <StudentCard item={item} onPress={open} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
          ListEmptyComponent={
            <StateView icon="people-outline" title={applied ? 'Không có học viên nào khớp từ khoá' : 'Không có học viên nào'} />
          }
        />
      )}
    </View>
  );
}

const StudentCard = memo(function StudentCard({ item, onPress }: { item: StudentInfoRow; onPress: (row: StudentInfoRow) => void }) {
  return (
    <Pressable onPress={() => onPress(item)} className="mb-2.5 gap-2.5 rounded-2xl border border-border bg-surface p-3.5 active:opacity-80">
      <View className="flex-row items-center gap-3">
        <Avatar name={item.name} size={40} />
        <View className="shrink gap-0.5">
          <Text className="text-[15px] font-bold text-foreground" numberOfLines={1}>
            {item.name || 'Học viên'}
          </Text>
          <Text className="text-[12.5px] text-muted" numberOfLines={1}>
            {item.email}
          </Text>
        </View>
        <View className="flex-1" />
        <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
      </View>
      <View className="flex-row flex-wrap items-center gap-1.5">
        {item.classes.length ? (
          item.classes.map((c) => <Badge key={c._id} label={c.class_code || c.class_name} tone="info" />)
        ) : (
          <Text className="text-[12px] text-muted">Không có lớp đang học</Text>
        )}
        <View className="flex-1" />
        <Badge
          label={item.survey_count ? `${item.survey_count} khảo sát` : 'Chưa khảo sát'}
          tone={item.survey_count ? 'brand' : 'neutral'}
        />
      </View>
    </Pressable>
  );
});
