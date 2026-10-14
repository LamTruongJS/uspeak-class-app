import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { useProPackages, type ProPackage } from '@/features/classes/teach-api';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Theo dõi học viên PRO — chọn gói (lớp combo) rồi xem tiến độ từng học viên trong gói. */
export default function ProPackagesScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const query = useProPackages();
  const pull = usePullRefresh(() => query.refetch());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Theo dõi học viên PRO' }} />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được danh sách gói"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={query.data ?? []}
          keyExtractor={(p: ProPackage) => p._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListHeaderComponent={<Text className="pb-1 text-[13px] text-muted">Chọn gói PRO để xem học viên và tiến độ dùng suất.</Text>}
          ListEmptyComponent={<StateView icon="trending-up-outline" title="Chưa có gói PRO nào" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/teach/pro/[comboId]', params: { comboId: item._id } })}
              className="gap-2 rounded-2xl border border-border bg-surface p-3.5 active:bg-surface-muted">
              <View className="flex-row items-center gap-2">
                <Badge label={item.class_code} tone="brand" />
                <View className="flex-1" />
                <Ionicons name="chevron-forward" size={16} color={muted} />
              </View>
              <Text className="text-[15px] font-bold text-foreground" numberOfLines={2}>
                {item.class_name}
              </Text>
              <View className="flex-row gap-4">
                <Text className="text-[13px] text-muted">
                  Học viên <Text className="font-bold text-foreground">{item.total_students ?? 0}</Text>
                </Text>
                <Text className="text-[13px] text-muted">
                  Khoá trong gói <Text className="font-bold text-foreground">{item.total_classes ?? 0}</Text>
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
