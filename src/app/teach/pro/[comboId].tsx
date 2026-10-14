import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { useProStudents, type ProStudentListItem } from '@/features/classes/teach-api';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

const fmtScore = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(1).replace(/\.0$/, '');

/**
 * Học viên trong một gói PRO: đã đăng ký / đang học / đã hoàn thành bao nhiêu khoá trong gói,
 * điểm TB và tỉ lệ đi học. Bản mobile của web /pro-tracking (chỉ xem, không sửa suất).
 */
export default function ProStudentsScreen() {
  const { comboId } = useLocalSearchParams<{ comboId: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useProStudents(comboId, debounced);
  const pull = usePullRefresh(() => query.refetch());
  const data = query.data;

  const header = (
    <View className="gap-3 pb-1">
      {data?.package ? (
        <View className="gap-1 rounded-2xl border border-border bg-surface p-4">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted">{data.package.class_code}</Text>
          <Text className="text-[17px] font-bold text-foreground">{data.package.class_name}</Text>
          <Text className="text-[13px] text-muted">{data.pagination?.total ?? data.students.length} học viên trong gói</Text>
        </View>
      ) : null}
      <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
        <Ionicons name="search" size={18} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm học viên…"
          placeholderTextColor={muted}
          autoCorrect={false}
          className="flex-1 text-base text-foreground"
        />
        {search ? (
          <Pressable hitSlop={8} onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Học viên PRO' }} />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được học viên"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={data?.students ?? []}
          keyExtractor={(s: ProStudentListItem) => s.student_id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={<StateView icon="people-outline" title="Không tìm thấy học viên" />}
          renderItem={({ item }) => {
            const s = item.summary;
            const rate = Math.round(Math.min(100, Math.max(0, s?.progress_rate ?? 0)));
            const bar = rate >= 80 ? 'bg-success' : rate >= 50 ? 'bg-info' : rate >= 20 ? 'bg-warning' : 'bg-danger';
            return (
              <View className="gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
                <View className="flex-row items-center gap-3">
                  <Avatar name={item.student_name} size={38} />
                  <View className="flex-1">
                    <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
                      {item.student_name}
                    </Text>
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {item.phone || item.email || '—'}
                    </Text>
                  </View>
                  <Text className="text-[15px] font-extrabold text-foreground">{rate}%</Text>
                </View>

                <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <View className={`h-full rounded-full ${bar}`} style={{ width: `${rate}%` }} />
                </View>

                <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                  <Text className="text-xs text-muted">
                    Khoá <Text className="font-semibold text-foreground">{s?.completed ?? 0}</Text> xong ·{' '}
                    <Text className="font-semibold text-info">{s?.studying ?? 0}</Text> đang học ·{' '}
                    <Text className="font-semibold text-warning">{s?.registered ?? 0}</Text> đã đăng ký
                  </Text>
                  {s?.not_registered ? <Text className="text-xs text-danger">{s.not_registered} khoá chưa dùng</Text> : null}
                </View>

                <View className="flex-row gap-4">
                  <Text className="text-xs text-muted">
                    Điểm TB <Text className="font-bold text-foreground">{fmtScore(s?.average_score)}</Text>
                  </Text>
                  <Text className="text-xs text-muted">
                    Đi học{' '}
                    <Text className="font-bold text-foreground">
                      {s?.attendance_rate === null || s?.attendance_rate === undefined
                        ? '—'
                        : `${Math.round(s.attendance_rate)}% (${s.attended_sessions ?? 0}/${s.total_sessions ?? 0})`}
                    </Text>
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
