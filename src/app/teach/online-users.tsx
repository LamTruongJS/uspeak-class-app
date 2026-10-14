import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Segmented } from '@/components/ui/segmented';
import { StateView } from '@/components/ui/state-view';
import { ROLE_NAME, usePresence, type PresenceUser } from '@/features/classes/teach-api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Đang trực tuyến — bản mobile của web /online-users: ai đang online, ai offline từ lúc nào.
 * Hai tab giống web: nhân sự (BE trả mặc định) và học viên (role=ST).
 */
export default function OnlineUsersScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [tab, setTab] = useState<'staff' | 'students'>('staff');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const { data: media } = useMediaToken();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = usePresence({ search: debounced, role: tab === 'students' ? 'ST' : undefined });
  const pull = usePullRefresh(() => query.refetch());
  const summary = query.data?.summary;

  const header = (
    <View className="gap-3 pb-1">
      <Segmented
        value={tab}
        onChange={setTab}
        items={[
          { value: 'staff', label: 'Nhân sự' },
          { value: 'students', label: 'Học viên' },
        ]}
      />
      <View className="flex-row gap-2">
        <Tile color="#059669" label="Đang online" value={summary?.online ?? 0} />
        <Tile color="#6b7280" label="Offline" value={summary?.offline ?? 0} />
        <Tile color="#2563eb" label="Tổng" value={summary?.total ?? 0} />
      </View>
      <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
        <Ionicons name="search" size={18} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm theo tên / email…"
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
      <Text className="text-[11px] text-muted">Tự làm mới mỗi 30 giây.</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Đang trực tuyến' }} />
      <FlashList
        key={tab}
        data={query.data?.data ?? []}
        keyExtractor={(u: PresenceUser) => u._id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View className="h-2" />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
        ListEmptyComponent={
          query.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được danh sách"
              description={getErrorMessage(query.error)}
              actionLabel="Thử lại"
              onAction={() => query.refetch()}
            />
          ) : query.isLoading ? null : (
            <StateView icon="people-outline" title="Không có người dùng nào" />
          )
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
            <View>
              <Avatar name={item.full_name} uri={resolveMediaUrl(item.avatar_url, media?.media_token)} size={40} />
              <View
                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${item.is_online ? 'bg-success' : 'bg-muted'}`}
              />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
                {item.full_name}
              </Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {ROLE_NAME[item.role] ?? item.role} · {item.email}
              </Text>
            </View>
            <Text className={`text-[11px] font-semibold ${item.is_online ? 'text-success' : 'text-muted'}`}>
              {item.is_online ? 'Online' : item.last_seen_at ? formatDateTime(item.last_seen_at) : 'Offline'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

function Tile({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View className="flex-1 gap-0.5 rounded-2xl border border-border bg-surface p-3">
      <Text className="text-lg font-extrabold" style={{ color }}>
        {value.toLocaleString('vi-VN')}
      </Text>
      <Text className="text-[11px] text-muted">{label}</Text>
    </View>
  );
}
