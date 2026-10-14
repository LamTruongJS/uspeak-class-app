import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { fold } from '@/features/chat/mentions';
import { STATUS_META } from '@/features/classes/staff-api';
import { useMyTeachingGroups, type TeachingGroupItem } from '@/features/classes/teach-api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Nhóm giảng dạy của tôi — bản mobile của web /teaching-groups (nhóm trợ giảng phụ trách). */
export default function TeachingGroupsScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(fold(search.trim()));

  const query = useMyTeachingGroups();
  const pull = usePullRefresh(() => query.refetch());

  const groups = useMemo(() => {
    const list = query.data ?? [];
    if (!q) return list;
    return list.filter((g) => fold(`${g.group_name} ${g.class_code} ${g.class_name} ${g.assistant?.name ?? ''}`).includes(q));
  }, [query.data, q]);

  const header = (
    <View className="gap-3 pb-1">
      <Text className="text-[13px] text-muted">{(query.data ?? []).length} nhóm bạn đang phụ trách.</Text>
      <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
        <Ionicons name="search" size={18} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm nhóm / lớp…"
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
      <Stack.Screen options={{ title: 'Nhóm giảng dạy' }} />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được nhóm giảng dạy"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={groups}
          keyExtractor={(g: TeachingGroupItem) => g._id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={<StateView icon="git-network-outline" title={q ? 'Không tìm thấy nhóm' : 'Bạn chưa phụ trách nhóm nào'} />}
          renderItem={({ item }) => {
            const status = STATUS_META[item.status_class] ?? STATUS_META.ENDED;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/teach/groups/[id]', params: { id: item._id } })}
                className="gap-2.5 rounded-2xl border border-border bg-surface p-3.5 active:bg-surface-muted">
                <View className="flex-row items-center gap-2">
                  <Badge label={status.label} tone={status.tone === 'neutral' ? 'neutral' : status.tone} />
                  <Badge label={item.class_code} tone="brand" />
                  <View className="flex-1" />
                  <Ionicons name="chevron-forward" size={16} color={muted} />
                </View>
                <Text className="text-[15px] font-bold text-foreground" numberOfLines={2}>
                  {item.group_name}
                </Text>
                <Text className="text-[13px] text-muted" numberOfLines={1}>
                  {item.class_name}
                  {item.teacher?.name ? ` · GV ${item.teacher.name}` : ''}
                </Text>
                <View className="flex-row items-center gap-2">
                  {item.assistant?.name ? <Avatar name={item.assistant.name} size={22} /> : null}
                  <Text className="flex-1 text-[13px] text-muted" numberOfLines={1}>
                    Trợ giảng {item.assistant?.name || '—'}
                  </Text>
                  <Text className="text-[13px] font-semibold text-foreground">
                    {item.student_ids?.length ?? 0}
                    {item.max_students ? `/${item.max_students}` : ''} HV
                  </Text>
                </View>
                {item.start_date ? (
                  <Text className="text-[11px] text-muted">
                    {[formatDate(item.start_date), item.end_date ? formatDate(item.end_date) : ''].filter(Boolean).join(' → ')}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
