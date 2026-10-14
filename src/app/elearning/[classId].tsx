import { Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';

import { ElearningOutline } from '@/features/elearning/outline';
import { useStudentTree } from '@/features/elearning/api';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** E-Learning của lớp mở ở màn riêng (khi vào từ ngoài chi tiết lớp). */
export default function ElearningScreen() {
  const { classId, className } = useLocalSearchParams<{ classId: string; className?: string }>();
  const brand = useThemeColor('brand');
  const tree = useStudentTree(classId);
  const pull = usePullRefresh(() => tree.refetch());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: className || 'E-Learning' }} />
      <ScrollView
        contentContainerClassName="p-4 pb-10"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
        <ElearningOutline classId={classId} />
      </ScrollView>
    </View>
  );
}
