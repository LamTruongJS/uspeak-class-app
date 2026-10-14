import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { chatApi, useChatRooms } from '@/features/chat/api';
import { fold } from '@/features/chat/mentions';
import { ClassWebButton } from '@/features/classes/open-class-web';
import { useStaffClassDetail, useStaffClasses, type ClassStudentStats } from '@/features/classes/staff-api';
import { StudentRow } from '@/features/classes/student-row';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

type Sort = 'attention' | 'score' | 'name';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'attention', label: 'Cần chú ý' },
  { value: 'score', label: 'Điểm cao' },
  { value: 'name', label: 'Tên A–Z' },
];

/** Học viên của lớp (giáo viên): tìm, sắp xếp, nhắn riêng. */
export default function ClassStudentsScreen() {
  const { id, sort: initialSort } = useLocalSearchParams<{ id: string; sort?: Sort }>();
  const brand = useThemeColor('brand');

  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === id);
  const detail = useStaffClassDetail(id);
  const rooms = useChatRooms();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>(initialSort ?? 'attention');
  const [opening, setOpening] = useState<string | null>(null);
  const q = useDeferredValue(fold(search.trim()));
  const pull = usePullRefresh(() => detail.refetch());

  const students = useMemo(() => {
    const list = (detail.data?.students ?? []).filter((s) => !q || fold(`${s.name} ${s.email ?? ''} ${s.phone ?? ''}`).includes(q));
    const cmp: Record<Sort, (a: ClassStudentStats, b: ClassStudentStats) => number> = {
      // Ít hoàn thành nhất / nhiều bài chưa nộp nhất lên đầu
      attention: (a, b) => a.completion_rate - b.completion_rate || b.not_submitted_count - a.not_submitted_count,
      score: (a, b) => (b.average_score ?? -1) - (a.average_score ?? -1),
      name: (a, b) => a.name.localeCompare(b.name, 'vi'),
    };
    return [...list].sort(cmp[sort]);
  }, [detail.data, q, sort]);

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

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: cls?.class_code ? `Học viên · ${cls.class_code}` : 'Học viên',
          headerShown: true,
          headerRight: () => <ClassWebButton classId={id} tab="students" />,
        }}
      />
      <FlatList
        data={students}
        keyExtractor={(s) => s._id}
        extraData={`${opening}|${sort}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <View className="px-4 pb-2">
            <StudentRow s={item} opening={opening === item._id} onMessage={() => messageStudent(item)} />
          </View>
        )}
        ListHeaderComponent={<Tools search={search} onSearch={setSearch} sort={sort} onSort={setSort} />}
        ListEmptyComponent={
          detail.isLoading ? (
            <LoadingView />
          ) : detail.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được danh sách"
              actionLabel="Thử lại"
              onAction={() => detail.refetch()}
            />
          ) : (
            <StateView icon="people-outline" title={search ? 'Không tìm thấy học viên' : 'Lớp chưa có học viên'} />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />
    </View>
  );
}

/** Ô tìm + chip sắp xếp, nằm ngay đầu danh sách. */
function Tools({
  search,
  onSearch,
  sort,
  onSort,
}: {
  search: string;
  onSearch: (v: string) => void;
  sort: Sort;
  onSort: (v: Sort) => void;
}) {
  const muted = useThemeColor('muted');
  return (
    <View className="gap-2.5 px-4 pb-3">
      <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
        <Ionicons name="search" size={17} color={muted} />
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder="Tìm học viên…"
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {SORTS.map((s) => (
          <Pressable
            key={s.value}
            onPress={() => onSort(s.value)}
            className={`h-8 justify-center rounded-full border px-3.5 ${sort === s.value ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
            <Text className={`text-[13px] font-semibold ${sort === s.value ? 'text-brand' : 'text-muted'}`}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
