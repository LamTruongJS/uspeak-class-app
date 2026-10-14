import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import {
  FEEDBACK_STATUS_VIEW,
  FEEDBACK_TYPE_LABEL,
  useMyFeedback,
  type FeedbackItem,
} from '@/features/feedback/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { htmlToPlain } from '@/components/ui/rich-text';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Góp ý / Báo lỗi của tôi — danh sách luồng đã gửi, bấm vào để xem admin trả lời và nhắn tiếp. */
export default function FeedbackListScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const query = useMyFeedback();
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);

  const header = (
    <View className="gap-3 pb-1">
      <Text className="text-[13px] text-muted">
        Gặp lỗi, muốn đề xuất tính năng hay góp ý cho Uspeak? Gửi tại đây, đội ngũ sẽ trả lời ngay trong luồng này.
      </Text>
      <Pressable
        onPress={() => router.push('/feedback/new')}
        className="h-12 flex-row items-center justify-center gap-2 rounded-xl bg-brand active:opacity-80">
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text className="text-base font-semibold text-on-brand">Gửi góp ý mới</Text>
      </Pressable>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Góp ý / Báo lỗi' }} />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được góp ý"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(f: FeedbackItem) => f._id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
          ListEmptyComponent={<StateView icon="chatbubble-ellipses-outline" title="Bạn chưa gửi góp ý nào" />}
          renderItem={({ item }) => {
            const status = FEEDBACK_STATUS_VIEW[item.status] ?? FEEDBACK_STATUS_VIEW.NEW;
            const replies = item.messages?.filter((m) => m.senderType === 'ADMIN').length ?? 0;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/feedback/[id]', params: { id: item._id } })}
                className="gap-2 rounded-2xl border border-border bg-surface p-3.5 active:bg-surface-muted">
                <View className="flex-row items-center gap-2">
                  <Badge label={FEEDBACK_TYPE_LABEL[item.type] ?? item.type} tone="info" />
                  <Badge label={status.label} tone={status.tone} />
                  <View className="flex-1" />
                  {item.images?.length ? (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="image-outline" size={13} color={muted} />
                      <Text className="text-[11px] text-muted">{item.images.length}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-[14px] leading-5 text-foreground" numberOfLines={3}>
                  {htmlToPlain(item.message)}
                </Text>
                <View className="flex-row items-center gap-3">
                  <Text className="text-[11px] text-muted">{formatDateTime(item.createdAt)}</Text>
                  {replies ? <Text className="text-[11px] font-semibold text-success">{replies} phản hồi</Text> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
