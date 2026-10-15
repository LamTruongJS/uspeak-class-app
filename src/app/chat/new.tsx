import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/avatar';
import { StateView } from '@/components/ui/state-view';
import { chatApi, useChatRooms, useDmEligibleUsers, useMyPermissionCodes, type DmUser } from '@/features/chat/api';
import { getErrorMessage } from '@/lib/api/client';
import { mediaCacheKey, resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Thứ tự + tên nhóm theo vai trò (học viên thường chỉ thấy giáo viên / trợ giảng lớp mình) */
const ROLE_GROUPS: { codes: string[]; label: string }[] = [
  { codes: ['TE'], label: 'Giáo viên' },
  { codes: ['TA'], label: 'Trợ giảng' },
  { codes: ['TG'], label: 'Người nhận xét bài' },
  { codes: ['AD'], label: 'Quản trị' },
  { codes: ['ST'], label: 'Học viên' },
];
const ROLE_LABEL: Record<string, string> = { AD: 'Quản trị', TE: 'Giáo viên', TA: 'Trợ giảng', TG: 'Nhận xét bài', ST: 'Học viên' };
const roleOf = (u: DmUser) => (u.role_code ?? u.role ?? '').toUpperCase();

type Row =
  | { kind: 'section'; key: string; label: string; count: number }
  | { kind: 'user'; key: string; user: DmUser; first: boolean; last: boolean };

/**
 * Nhắn tin mới. Danh sách do server lọc theo vai trò (học viên chỉ thấy giáo viên / trợ giảng lớp
 * mình — GET /chat/users/dm-eligible); server tự gộp nếu đã có phòng 1-1.
 * Đầu trang: "Tạo nhóm chat" (quyền CHAT_ROOM_CREATE) + các cuộc trò chuyện 1-1 gần đây.
 */
export default function NewDirectScreen() {
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const myId = useAuthStore((s) => s.user?._id);
  const canCreateGroup = useMyPermissionCodes().data?.includes('CHAT_ROOM_CREATE') ?? false;
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const users = useDmEligibleUsers(search);
  const rooms = useChatRooms();
  const { data: token } = useMediaToken();

  // Gõ xong 300ms mới tìm — đỡ gọi API mỗi phím
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  // Trò chuyện 1-1 gần đây (từ danh sách phòng đã tải sẵn) — mở lại nhanh không cần tìm
  const recent = useMemo(
    () =>
      (rooms.data ?? [])
        .filter((r) => r.type === 'direct' && r.direct_recipient && !r.direct_recipient.is_multi)
        .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
        .slice(0, 10),
    [rooms.data],
  );

  // Chia nhóm theo vai trò; trong nhóm người đang hoạt động lên trước, rồi theo tên
  const rows = useMemo<Row[]>(() => {
    const list = (users.data ?? []).filter((u) => u._id !== myId);
    const sort = (a: DmUser, b: DmUser) =>
      Number(!!b.is_online) - Number(!!a.is_online) || (a.full_name ?? '').localeCompare(b.full_name ?? '', 'vi');
    const known = new Set(ROLE_GROUPS.flatMap((g) => g.codes));
    const groups = [
      ...ROLE_GROUPS.map((g) => ({ label: g.label, list: list.filter((u) => g.codes.includes(roleOf(u))) })),
      { label: 'Khác', list: list.filter((u) => !known.has(roleOf(u))) },
    ].filter((g) => g.list.length);
    return groups.flatMap((g) => {
      const sorted = [...g.list].sort(sort);
      return [
        { kind: 'section' as const, key: `s-${g.label}`, label: g.label, count: sorted.length },
        ...sorted.map((u, i) => ({ kind: 'user' as const, key: u._id, user: u, first: i === 0, last: i === sorted.length - 1 })),
      ];
    });
  }, [users.data, myId]);

  async function open(userId: string) {
    setOpening(userId);
    try {
      const dm = await chatApi.openDirect(userId);
      void rooms.refetch();
      router.replace({ pathname: '/chat/[roomId]', params: { roomId: dm._id } });
    } catch (err) {
      showToast('error', 'Không mở được cuộc trò chuyện', getErrorMessage(err));
    } finally {
      setOpening(null);
    }
  }

  const header = (
    <View className="gap-4 pb-1">
      {canCreateGroup && !search ? (
        <View className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface">
          <ActionRow
            icon="people"
            color="#2563eb"
            label="Tạo nhóm chat"
            sub="Thêm giáo viên, trợ giảng và học viên"
            onPress={() => router.replace('/chat/new-group')}
          />
        </View>
      ) : null}

      {recent.length && !search ? (
        <View className="gap-2">
          <Text className="px-6 text-xs font-semibold uppercase tracking-wide text-muted">Gần đây</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 px-4"
            keyboardShouldPersistTaps="handled">
            {recent.map((r) => {
              const p = r.direct_recipient!;
              return (
                <Pressable
                  key={r._id}
                  onPress={() => router.replace({ pathname: '/chat/[roomId]', params: { roomId: r._id } })}
                  className="w-16 items-center gap-1.5 active:opacity-70">
                  <View>
                    <Avatar
                      name={p.full_name}
                      uri={resolveMediaUrl(p.avatar_url, token?.media_token)}
                      cacheKey={mediaCacheKey(p.avatar_url)}
                      size={56}
                    />
                    {p.is_online ? (
                      <View className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-success" />
                    ) : null}
                  </View>
                  <Text className="text-center text-xs text-foreground" numberOfLines={1}>
                    {(p.full_name ?? '').split(' ').pop()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Nhắn tin mới' }} />
      <View className="mx-4 mb-3 mt-3 h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
        <Ionicons name="search" size={18} color={muted} />
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Tìm theo tên…"
          placeholderTextColor={muted}
          autoCorrect={false}
          className="flex-1 text-base text-foreground"
        />
        {input ? (
          <Pressable hitSlop={8} onPress={() => setInput('')} accessibilityLabel="Xoá ô tìm">
            <Ionicons name="close-circle" size={18} color={muted} />
          </Pressable>
        ) : users.isFetching ? (
          <ActivityIndicator size="small" color={brand} />
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          users.isLoading ? (
            <ActivityIndicator className="py-8" color={brand} />
          ) : (
            <StateView icon="person-outline" title={search ? 'Không tìm thấy người phù hợp' : 'Chưa có ai để nhắn tin'} />
          )
        }
        renderItem={({ item }) =>
          item.kind === 'section' ? (
            <Text className="px-6 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">
              {item.label} · {item.count}
            </Text>
          ) : (
            <UserRow
              user={item.user}
              first={item.first}
              last={item.last}
              token={token?.media_token}
              opening={opening === item.user._id}
              onPress={() => open(item.user._id)}
            />
          )
        }
      />
    </View>
  );
}

function ActionRow({
  icon,
  color,
  label,
  sub,
  onPress,
}: {
  icon: IconName;
  color: string;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  const muted = useThemeColor('muted');
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted">
      <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: color }}>
        <Ionicons name={icon} size={21} color="#fff" />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-foreground">{label}</Text>
        <Text className="text-xs text-muted">{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={muted} />
    </Pressable>
  );
}

function UserRow({
  user,
  first,
  last,
  token,
  opening,
  onPress,
}: {
  user: DmUser;
  first: boolean;
  last: boolean;
  token?: string;
  opening: boolean;
  onPress: () => void;
}) {
  const brand = useThemeColor('brand');
  const role = roleOf(user);
  return (
    <View className="mx-4">
      <Pressable
        onPress={onPress}
        disabled={opening}
        className={`flex-row items-center gap-3 border-x border-border bg-surface px-3.5 py-2.5 active:bg-surface-muted ${first ? 'rounded-t-2xl border-t' : ''} ${last ? 'rounded-b-2xl border-b' : ''}`}>
        <View>
          <Avatar name={user.full_name} uri={resolveMediaUrl(user.avatar_url, token)} cacheKey={mediaCacheKey(user.avatar_url)} size={44} />
          {user.is_online ? (
            <View className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-surface bg-success" />
          ) : null}
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-medium text-foreground" numberOfLines={1}>
            {user.full_name}
          </Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {[ROLE_LABEL[role], user.is_online ? 'Đang hoạt động' : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {opening ? (
          <ActivityIndicator color={brand} />
        ) : (
          <View className="flex-row items-center gap-1 rounded-full bg-brand-soft px-3 py-1.5">
            <Ionicons name="chatbubble" size={13} color={brand} />
            <Text className="text-xs font-semibold text-brand">Nhắn</Text>
          </View>
        )}
        {!last ? <View className="absolute bottom-0 right-0 h-px bg-border" style={{ left: 70 }} /> : null}
      </Pressable>
    </View>
  );
}
