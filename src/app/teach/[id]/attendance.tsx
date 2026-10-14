import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { ClassWebButton } from '@/features/classes/open-class-web';
import { SessionCard } from '@/features/classes/session-card';
import { useClassSessions } from '@/features/classes/sessions-api';
import { useStaffClasses } from '@/features/classes/staff-api';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Điểm danh của lớp (giáo viên) — buổi đã diễn ra, mở ra xem ai có mặt / vắng. */
export default function ClassAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === id);
  const sessions = useClassSessions(id, true);
  const items = sessions.data ?? [];
  const pull = usePullRefresh(() => sessions.refetch());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: cls?.class_code ? `Điểm danh · ${cls.class_code}` : 'Điểm danh',
          headerShown: true,
          headerRight: () => <ClassWebButton classId={id} tab="attendance" />,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(s) => s._id}
        extraData={expandedId}
        renderItem={({ item, index }) => (
          <View className="px-4 pb-2.5">
            <SessionCard
              session={item}
              fallbackNumber={items.length - index}
              expanded={expandedId === item._id}
              onToggle={() => setExpandedId((c) => (c === item._id ? null : item._id))}
            />
          </View>
        )}
        ListEmptyComponent={
          sessions.isLoading ? (
            <LoadingView />
          ) : sessions.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được buổi học"
              actionLabel="Thử lại"
              onAction={() => sessions.refetch()}
            />
          ) : (
            <StateView icon="calendar-outline" title="Chưa có buổi học nào đã diễn ra" />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />
    </View>
  );
}
