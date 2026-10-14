import { FlashList } from '@shopify/flash-list';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { chatApi, useChatRooms } from '@/features/chat/api';
import { fold } from '@/features/chat/mentions';
import { STATUS_META, type ClassStudentStats } from '@/features/classes/staff-api';
import { StudentRow } from '@/features/classes/student-row';
import { useTeachingGroupDetail } from '@/features/classes/teach-api';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';
import { Ionicons } from '@expo/vector-icons';

/** Chi tiết nhóm giảng dạy: thống kê nhóm + danh sách học viên trong nhóm (dùng chung ô học viên với màn lớp dạy). */
export default function TeachingGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [search, setSearch] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const q = useDeferredValue(fold(search.trim()));

  const detail = useTeachingGroupDetail(id);
  const rooms = useChatRooms();
  const pull = usePullRefresh(() => detail.refetch());
  const data = detail.data;

  const students = useMemo(() => {
    const list = data?.students ?? [];
    if (!q) return list;
    return list.filter((s) => fold(`${s.name} ${s.email ?? ''} ${s.phone ?? ''}`).includes(q));
  }, [data?.students, q]);

  async function messageStudent(s: ClassStudentStats) {
    setOpening(s._id);
    try {
      const dm = await chatApi.openDirect(s._id);
      void rooms.refetch();
      router.push({ pathname: '/chat/[roomId]', params: { roomId: dm._id } });
    } catch (err) {
      Alert.alert('Không nhắn riêng được', getErrorMessage(err));
    } finally {
      setOpening(null);
    }
  }

  const stats = data?.stats;
  const status = data ? STATUS_META[data.status_class] : null;

  const header = (
    <View className="gap-3 pb-2">
      <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
        <View className="flex-row flex-wrap items-center gap-2">
          {status ? <Badge label={status.label} tone={status.tone} /> : null}
          {data?.class_code ? <Badge label={data.class_code} tone="brand" /> : null}
        </View>
        <Text className="text-xl font-bold text-foreground">{data?.group_name ?? 'Nhóm giảng dạy'}</Text>
        <Text className="text-[13px] text-muted">
          {data?.class_name}
          {data?.teacher?.name ? ` · GV ${data.teacher.name}` : ''}
        </Text>
        <Text className="text-[13px] text-muted">
          Trợ giảng {data?.assistant?.name || '—'} · {data?.students.length ?? 0}
          {data?.max_students ? `/${data.max_students}` : ''} học viên
        </Text>
      </View>

      {stats ? (
        <View className="flex-row flex-wrap justify-between gap-y-2.5">
          <Tile label="Bài tập" value={String(stats.total_assignments)} />
          <Tile label="Bài nộp" value={stats.total_submissions.toLocaleString('vi-VN')} />
          <Tile label="Đã nhận xét" value={stats.total_completed.toLocaleString('vi-VN')} />
          <Tile
            label="Điểm TB"
            value={stats.average_score === null ? '—' : stats.average_score.toFixed(1).replace(/\.0$/, '')}
          />
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
      <Stack.Screen options={{ title: data?.group_name ?? 'Nhóm giảng dạy' }} />
      {detail.isLoading ? (
        <LoadingView />
      ) : detail.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được nhóm"
          description={getErrorMessage(detail.error)}
          actionLabel="Thử lại"
          onAction={() => detail.refetch()}
        />
      ) : (
        <FlashList
          data={students}
          keyExtractor={(s: ClassStudentStats) => s._id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={<StateView icon="people-outline" title={search ? 'Không tìm thấy học viên' : 'Nhóm chưa có học viên'} />}
          renderItem={({ item }) => <StudentRow s={item} opening={opening === item._id} onMessage={() => messageStudent(item)} />}
        />
      )}
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-[48.8%] gap-0.5 rounded-2xl border border-border bg-surface p-3">
      <Text className="text-lg font-extrabold text-foreground">{value}</Text>
      <Text className="text-[11px] text-muted">{label}</Text>
    </View>
  );
}
