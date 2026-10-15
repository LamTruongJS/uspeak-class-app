import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { roomTime } from '@/features/chat/format';
import {
  FEEDBACK_STATUS_VIEW,
  FEEDBACK_TYPE_LABEL,
  FEEDBACK_TYPES,
  useMyFeedback,
  type FeedbackItem,
} from '@/features/feedback/api';
import { getErrorMessage } from '@/lib/api/client';
import { htmlToPlain } from '@/components/ui/rich-text';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

const TYPE_LOOK: Record<string, { color: string }> = {
  BUG: { color: '#dc2626' },
  FEATURE: { color: '#d97706' },
  FEEDBACK: { color: '#2563eb' },
  OTHER: { color: '#7c3aed' },
};

/** Góp ý / Báo lỗi của tôi — danh sách luồng đã gửi, bấm vào để xem admin trả lời và nhắn tiếp. */
export default function FeedbackListScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const query = useMyFeedback();
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);

  const header = (
    <View className="gap-4 pb-3">
      {/* Chọn nhanh loại góp ý — thay nút đỏ to kiểu web */}
      <View className="gap-3 rounded-3xl bg-surface p-4">
        <View className="gap-0.5">
          <Text className="text-[17px] font-extrabold text-foreground">Bạn cần Uspeak hỗ trợ gì?</Text>
          <Text className="text-[13px] leading-5 text-muted">Gửi kèm ảnh chụp màn hình, đội ngũ sẽ trả lời ngay trong luồng.</Text>
        </View>
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {FEEDBACK_TYPES.map((t) => {
            const look = TYPE_LOOK[t.value];
            return (
              <Pressable
                key={t.value}
                onPress={() => router.push({ pathname: '/feedback/new', params: { type: t.value } })}
                className="w-[48.8%] flex-row items-center gap-2.5 rounded-2xl p-3 active:opacity-80"
                style={{ backgroundColor: `${look.color}14` }}>
                <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: look.color }}>
                  <Ionicons name={t.icon} size={18} color="#fff" />
                </View>
                <Text className="flex-1 text-[13.5px] font-bold text-foreground" numberOfLines={2}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {items.length ? <Text className="px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Góp ý của bạn · {items.length}</Text> : null}
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
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
          ListEmptyComponent={<StateView icon="chatbubble-ellipses-outline" title="Bạn chưa gửi góp ý nào" description="Chọn một mục ở trên để gửi góp ý đầu tiên." />}
          renderItem={({ item }) => {
            const status = FEEDBACK_STATUS_VIEW[item.status] ?? FEEDBACK_STATUS_VIEW.NEW;
            const look = TYPE_LOOK[item.type] ?? TYPE_LOOK.OTHER;
            const typeInfo = FEEDBACK_TYPES.find((t) => t.value === item.type);
            const last = item.messages?.[item.messages.length - 1];
            const replied = last?.senderType === 'ADMIN';
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/feedback/[id]', params: { id: item._id } })}
                className="flex-row gap-3 rounded-3xl bg-surface p-3.5 active:opacity-90">
                <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `${look.color}1a` }}>
                  <Ionicons name={typeInfo?.icon ?? 'chatbubble-ellipses'} size={20} color={look.color} />
                </View>
                <View className="flex-1 gap-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                      {FEEDBACK_TYPE_LABEL[item.type] ?? item.type}
                    </Text>
                    <Text className="text-[11.5px] text-muted">{roomTime(item.updatedAt ?? item.createdAt)}</Text>
                  </View>
                  <Text className="text-[13.5px] leading-5 text-muted" numberOfLines={2}>
                    {replied ? <Text className="font-semibold text-success">Uspeak: </Text> : null}
                    {htmlToPlain(last?.message ?? item.message)}
                  </Text>
                  <View className="flex-row items-center gap-2 pt-0.5">
                    <Badge label={status.label} tone={status.tone} />
                    {item.images?.length ? (
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="image-outline" size={13} color={muted} />
                        <Text className="text-[11.5px] text-muted">{item.images.length} ảnh</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
