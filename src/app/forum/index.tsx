import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Segmented } from '@/components/ui/segmented';
import { StateView } from '@/components/ui/state-view';
import { useForumClasses, useForumPosts, useToggleReaction, type ForumPost } from '@/features/forum/api';
import { ForumPostCard } from '@/features/forum/post-card';
import { getErrorMessage } from '@/lib/api/client';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/** Diễn đàn — bảng tin chung hoặc theo lớp, bản mobile của web /forum. */
export default function ForumScreen() {
  const brand = useThemeColor('brand');
  const [classId, setClassId] = useState('all');
  const user = useAuthStore((s) => s.user);
  const { data: media } = useMediaToken();

  const classes = useForumClasses();
  const posts = useForumPosts(classId === 'all' ? undefined : classId);
  const react = useToggleReaction();
  const pull = usePullRefresh(() => posts.refetch());

  const items = useMemo(() => posts.data?.pages.flatMap((p) => p.data) ?? [], [posts.data]);
  const classItems = useMemo(
    () => [
      { value: 'all', label: 'Tất cả' },
      ...(classes.data ?? []).map((c) => ({ value: c._id, label: c.class_code || c.name || 'Lớp' })),
    ],
    [classes.data],
  );

  const header = (
    <View className="gap-3 pb-1">
      {classItems.length > 1 ? <Segmented variant="chip" value={classId} onChange={setClassId} items={classItems} /> : null}
      {/* Ô "đang nghĩ gì" kiểu Facebook thay cho nút đỏ to kiểu web */}
      <Pressable onPress={() => router.push('/forum/new')} className="flex-row items-center gap-3 rounded-3xl bg-surface p-3 active:opacity-90">
        <Avatar name={user?.name} uri={resolveMediaUrl(user?.avatar, media?.media_token)} size={40} />
        <View className="h-10 flex-1 justify-center rounded-full bg-surface-muted px-4">
          <Text className="text-[14.5px] text-muted">Bạn muốn chia sẻ điều gì?</Text>
        </View>
        <Ionicons name="images" size={22} color="#059669" />
      </Pressable>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Diễn đàn' }} />
      <FlashList
        key={classId}
        data={items}
        keyExtractor={(p: ForumPost) => p._id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
        }}
        ListFooterComponent={posts.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
        ListEmptyComponent={
          posts.isLoading ? (
            <ActivityIndicator className="py-8" color={brand} />
          ) : posts.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được bảng tin"
              description={getErrorMessage(posts.error)}
              actionLabel="Thử lại"
              onAction={() => posts.refetch()}
            />
          ) : (
            <StateView icon="people-outline" title="Chưa có bài viết nào" description="Hãy là người mở đầu câu chuyện trong diễn đàn." />
          )
        }
        renderItem={({ item }) => (
          <ForumPostCard
            post={item}
            onOpen={() => router.push({ pathname: '/forum/[id]', params: { id: item._id } })}
            onReact={(emoji) => react.mutate({ targetId: item._id, targetType: 'post', emoji })}
          />
        )}
      />
    </View>
  );
}
