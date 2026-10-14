import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Segmented } from '@/components/ui/segmented';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { useWikiCategories, useWikiList, WIKI_SPACE_META, type WikiDocListItem, type WikiSpace } from '@/features/wiki/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Danh sách bài Wiki / Hướng dẫn sử dụng. Cùng một màn, khác nhau ở `?space=wiki|guide`
 * (giống web dùng chung `WikiListView` với 2 cấu hình space).
 */
export default function WikiListScreen() {
  const params = useLocalSearchParams<{ space?: string }>();
  const space: WikiSpace = params.space === 'guide' ? 'guide' : 'wiki';
  const meta = WIKI_SPACE_META[space];

  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());

  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const categories = useWikiCategories(space);
  const list = useWikiList(space, { category: category === 'all' ? undefined : category, q });
  const pull = usePullRefresh(() => Promise.all([list.refetch(), categories.refetch()]));

  const categoryItems = useMemo(
    () => [{ value: 'all', label: 'Tất cả' }, ...(categories.data ?? []).map((c) => ({ value: c._id, label: c.ten }))],
    [categories.data],
  );

  const header = (
    <View className="gap-3 pb-1">
      <Text className="text-[13px] text-muted">{meta.subtitle}</Text>
      <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
        <Ionicons name="search" size={18} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm bài viết…"
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
      {categoryItems.length > 1 ? <Segmented variant="chip" value={category} onChange={setCategory} items={categoryItems} /> : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: meta.title }} />
      {list.isLoading ? (
        <LoadingView />
      ) : list.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được danh sách"
          description={getErrorMessage(list.error)}
          actionLabel="Thử lại"
          onAction={() => list.refetch()}
        />
      ) : (
        <FlashList
          data={list.data?.items ?? []}
          keyExtractor={(d: WikiDocListItem) => d._id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={<StateView icon="library-outline" title={q ? 'Không tìm thấy bài viết' : 'Chưa có bài viết nào'} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/wiki/[id]', params: { id: item._id } })}
              className="gap-1.5 rounded-2xl border border-border bg-surface p-3.5 active:bg-surface-muted">
              <Text className="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
                {item.tieu_de}
              </Text>
              {item.tom_tat ? (
                <Text className="text-[13px] leading-5 text-muted" numberOfLines={2}>
                  {item.tom_tat}
                </Text>
              ) : null}
              <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                {item.category_id?.ten ? (
                  <View className="rounded-full bg-brand-soft px-2 py-0.5">
                    <Text className="text-[11px] font-semibold text-brand">{item.category_id.ten}</Text>
                  </View>
                ) : null}
                <View className="flex-row items-center gap-1">
                  <Ionicons name="eye-outline" size={12} color={muted} />
                  <Text className="text-[11px] text-muted">{item.luot_xem ?? 0}</Text>
                </View>
                <Text className="text-[11px] text-muted">{formatDate(item.updated_at || item.created_at)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
