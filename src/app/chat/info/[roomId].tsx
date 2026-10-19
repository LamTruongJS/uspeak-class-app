import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/avatar';
import {
  chatApi,
  patchRoom,
  useChatPermissions,
  useChatRoom,
  useChatRooms,
  useDmAllowedIds,
  usePinnedMessages,
  useRoomMedia,
  useRoomMembers,
  type RoomMember,
} from '@/features/chat/api';
import { plainContent, roomTime, roomTitle } from '@/features/chat/format';
import { fold } from '@/features/chat/mentions';
import { RoomAvatar } from '@/features/chat/room-avatar';
import { MediaTile } from '@/features/chat/room-media';
import { setRoomIntent } from '@/features/chat/room-intent';
import type { ChatMessage, ChatRoomType } from '@/features/chat/types';
import { getErrorMessage } from '@/lib/api/client';
import { mediaCacheKey, resolveMediaUrl, useMediaToken } from '@/lib/media';
import { isStaffRole } from '@/navigation/features';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';

type IconName = AppIconName;

const ROLE_LABEL: Record<string, string> = { AD: 'Quản trị', TE: 'Giáo viên', TA: 'Trợ giảng', TG: 'Nhận xét', ST: 'Học viên' };
const STAFF_ROLES = new Set(['AD', 'TE', 'TA', 'TG']);
const TYPE_LABEL: Partial<Record<ChatRoomType, string>> = {
  class: 'Phòng lớp',
  sub_room: 'Nhóm trong lớp',
  activity: 'Nhóm hoạt động',
  group: 'Nhóm',
  group_support: 'Nhóm hỗ trợ',
  custom: 'Nhóm chat',
  direct: 'Tin nhắn riêng',
};
/** Hiện tối đa chừng này tin ghim, còn lại bấm "Xem tất cả" */
const PINNED_PREVIEW = 3;

const roleOf = (m: RoomMember) => (m.context_role_code ?? m.system_role ?? '').toUpperCase();

type Row =
  | { kind: 'section'; key: string; label: string; count: number }
  | { kind: 'member'; key: string; member: RoomMember; first: boolean; last: boolean }
  | { kind: 'more'; key: string; group: string; hidden: number };

/** Mỗi nhóm thành viên hiện trước chừng này người, còn lại bấm "Xem thêm" (đang tìm thì hiện hết) */
const MEMBER_PREVIEW = 6;

/**
 * Thông tin phòng (kiểu Zalo/Messenger): đầu trang avatar + tên (đổi tên/ảnh theo quyền
 * can_rename_room / can_change_chat_avatar), hàng nút nhanh (tìm tin, tắt thông báo, tin ghim),
 * tin đã ghim (bấm → quay về phòng và nhảy tới tin), thành viên chia nhóm giáo viên / học viên.
 */
export default function RoomInfoScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const myId = useAuthStore((s) => s.user?._id);
  const roleCode = useAuthStore((s) => s.user?.role_code);
  const staff = isStaffRole(roleCode);
  const dmAllowed = useDmAllowedIds(roleCode);
  const background = useThemeColor('background');
  const foreground = useThemeColor('foreground');
  const { data: room } = useChatRoom(roomId);
  const rooms = useChatRooms();
  const members = useRoomMembers(roomId);
  const pinned = usePinnedMessages(roomId);
  const perms = useChatPermissions(roomId);
  const { data: token } = useMediaToken();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const onBrand = useThemeColor('on-brand');
  const success = useThemeColor('success');

  const [search, setSearch] = useState('');
  const [savingMute, setSavingMute] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  /** null = đang xem tên; chuỗi = đang sửa tên */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [showAllPinned, setShowAllPinned] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const isDirect = room?.type === 'direct';
  const canAvatar = !isDirect && !!perms.data?.can_change_chat_avatar;
  const canRename = !isDirect && !!perms.data?.can_rename_room;
  const mutedOn = !!room?.notifications_muted;
  const memberCount = members.data?.length ?? room?.member_count ?? 0;

  // Thành viên: nhóm "Giáo viên & trợ giảng" rồi "Học viên", trong nhóm xếp theo tên
  const rows = useMemo<Row[]>(() => {
    const q = fold(search.trim());
    const all = (members.data ?? []).filter((m) => !q || fold(m.full_name).includes(q));
    const byName = (a: RoomMember, b: RoomMember) => a.full_name.localeCompare(b.full_name, 'vi');
    const groups = [
      { key: 'staff', label: 'Giáo viên & trợ giảng', list: all.filter((m) => STAFF_ROLES.has(roleOf(m))).sort(byName) },
      { key: 'students', label: 'Học viên', list: all.filter((m) => !STAFF_ROLES.has(roleOf(m))).sort(byName) },
    ].filter((g) => g.list.length);
    return groups.flatMap((g): Row[] => {
      const open = !!q || expanded[g.key] || g.list.length <= MEMBER_PREVIEW + 1;
      const shown = open ? g.list : g.list.slice(0, MEMBER_PREVIEW);
      const hidden = g.list.length - shown.length;
      return [
        { kind: 'section', key: `s-${g.key}`, label: g.label, count: g.list.length },
        ...shown.map((m, i) => ({
          kind: 'member' as const,
          key: m._id,
          member: m,
          first: i === 0,
          last: i === shown.length - 1 && !hidden,
        })),
        ...(hidden ? [{ kind: 'more' as const, key: `more-${g.key}`, group: g.key, hidden }] : []),
      ];
    });
  }, [members.data, search, expanded]);

  async function toggleMute() {
    const on = !mutedOn;
    setSavingMute(true);
    patchRoom(roomId, (r) => ({ ...r, notifications_muted: on }));
    try {
      await chatApi.setNotificationsMuted(roomId, on);
    } catch (err) {
      patchRoom(roomId, (r) => ({ ...r, notifications_muted: !on }));
      showToast('error', 'Chưa lưu được', getErrorMessage(err));
    } finally {
      setSavingMute(false);
    }
  }

  async function openDm(m: RoomMember) {
    if (m._id === myId || isDirect) return;
    setOpening(m._id);
    try {
      const dm = await chatApi.openDirect(m._id);
      void rooms.refetch();
      router.push({ pathname: '/chat/[roomId]', params: { roomId: dm._id } });
    } catch (err) {
      showToast('error', 'Không nhắn riêng được', getErrorMessage(err));
    } finally {
      setOpening(null);
    }
  }

  async function changeAvatar() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    setSavingAvatar(true);
    try {
      const out = await chatApi.changeAvatar(roomId, res.assets[0].uri);
      // Lỗi xử lý ảnh server trả 200 + success:false → coi như lỗi
      if (!out.success || !out.data) throw new Error((out as { message?: string }).message || 'Ảnh không hợp lệ');
      const url = out.data.avatar_url;
      patchRoom(roomId, (r) => ({ ...r, avatar_url: url }));
    } catch (err) {
      showToast('error', 'Chưa đổi được ảnh', getErrorMessage(err));
    } finally {
      setSavingAvatar(false);
    }
  }

  async function saveName() {
    const name = nameDraft?.trim();
    if (!name || !room || name === room.name) {
      setNameDraft(null);
      return;
    }
    setSavingName(true);
    try {
      await chatApi.renameRoom(roomId, name);
      patchRoom(roomId, (r) => ({ ...r, name }));
      setNameDraft(null);
    } catch (err) {
      showToast('error', 'Chưa đổi được tên', getErrorMessage(err));
    } finally {
      setSavingName(false);
    }
  }

  /** Quay về phòng rồi làm việc (mở ô tìm / nhảy tới tin) — xem room-intent.ts */
  const backToRoom = (intent: { type: 'search' } | { type: 'jump'; messageId: string }) => {
    setRoomIntent({ roomId, ...intent });
    router.back();
  };

  const pinnedList = pinned.data ?? [];
  const shownPinned = showAllPinned ? pinnedList : pinnedList.slice(0, PINNED_PREVIEW);

  const header = (
    <View className="pb-2">
      {/* ── Avatar + tên ── */}
      <View className="items-center gap-2.5 px-4 pb-5 pt-1">
        <Pressable
          disabled={!canAvatar || savingAvatar}
          onPress={changeAvatar}
          accessibilityLabel="Đổi ảnh phòng"
          className="active:opacity-80">
          {room ? (
            <RoomAvatar room={room} token={token?.media_token} size={96} brand={brand} success={success} />
          ) : (
            <View className="h-24 w-24 rounded-full bg-surface-muted" />
          )}
          {canAvatar ? (
            <View className="absolute bottom-0.5 right-0.5 h-8 w-8 items-center justify-center rounded-full border-[3px] border-background bg-brand">
              {savingAvatar ? <ActivityIndicator size="small" color={onBrand} /> : <Ionicons name="camera" size={15} color={onBrand} />}
            </View>
          ) : null}
        </Pressable>

        {nameDraft !== null ? (
          <View className="w-full flex-row items-center gap-2">
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
              maxLength={100}
              returnKeyType="done"
              onSubmitEditing={saveName}
              className="h-12 flex-1 rounded-xl border border-brand bg-surface px-3.5 text-center text-lg font-semibold text-foreground"
            />
            {savingName ? (
              <ActivityIndicator color={brand} />
            ) : (
              <>
                <Pressable hitSlop={8} onPress={() => setNameDraft(null)} accessibilityLabel="Huỷ đổi tên">
                  <Ionicons name="close-circle-outline" size={30} color={muted} />
                </Pressable>
                <Pressable hitSlop={8} onPress={saveName} accessibilityLabel="Lưu tên">
                  <Ionicons name="checkmark-circle" size={30} color={brand} />
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <Pressable
            disabled={!canRename}
            onPress={() => setNameDraft(room?.name ?? '')}
            className="flex-row items-center gap-1.5 px-8 active:opacity-70">
            <Text className="text-center text-[22px] font-bold leading-7 text-foreground">{room ? roomTitle(room) : ''}</Text>
            {canRename ? <Ionicons name="create-outline" size={18} color={muted} /> : null}
          </Pressable>
        )}

        <View className="flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {room?.class_code ? (
            <View className="rounded-full bg-brand-soft px-2.5 py-0.5">
              <Text className="text-xs font-bold text-brand">{room.class_code}</Text>
            </View>
          ) : null}
          <Text className="text-sm text-muted">
            {[room ? TYPE_LABEL[room.type] : null, !isDirect && memberCount ? `${memberCount} thành viên` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>

      {/* ── Nút nhanh ── */}
      <View className="mx-4 flex-row rounded-3xl border border-border bg-surface px-1 py-3.5">
        {room?.class_id ? (
          <QuickAction
            icon="school-outline"
            label="Xem lớp"
            onPress={() =>
              staff
                ? router.push({ pathname: '/teach/[id]', params: { id: room.class_id! } })
                : router.push({ pathname: '/class/[id]', params: { id: room.class_id! } })
            }
          />
        ) : null}
        <QuickAction icon="search" label="Tìm tin nhắn" onPress={() => backToRoom({ type: 'search' })} />
        <QuickAction
          icon={mutedOn ? 'notifications-off' : 'notifications-outline'}
          label={mutedOn ? 'Bật thông báo' : 'Tắt thông báo'}
          active={mutedOn}
          loading={savingMute}
          onPress={toggleMute}
        />
        <QuickAction
          icon="pushpin"
          label="Tin ghim"
          badge={pinnedList.length || undefined}
          onPress={() => pinnedList[0] && backToRoom({ type: 'jump', messageId: pinnedList[0]._id })}
          disabled={!pinnedList.length}
        />
      </View>
      {mutedOn ? (
        <Text className="px-6 pt-2 text-center text-xs text-muted">Vẫn nhận thông báo khi có người @nhắc đích danh bạn.</Text>
      ) : null}

      {/* ── Ảnh, tệp, link đã gửi ── */}
      <MediaPreview roomId={roomId} token={token?.media_token} />

      {/* ── Tin đã ghim ── */}
      {pinnedList.length ? (
        <View className="mt-5">
          <SectionTitle label="Tin đã ghim" count={pinnedList.length} />
          <View className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface">
            {shownPinned.map((m, i) => (
              <PinnedRow key={m._id} message={m} divider={i > 0} onPress={() => backToRoom({ type: 'jump', messageId: m._id })} />
            ))}
            {pinnedList.length > PINNED_PREVIEW ? (
              <Pressable
                onPress={() => setShowAllPinned((v) => !v)}
                className="items-center border-t border-border py-3 active:bg-surface-muted">
                <Text className="text-sm font-semibold text-brand">
                  {showAllPinned ? 'Thu gọn' : `Xem tất cả ${pinnedList.length} tin ghim`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* ── Thành viên ── */}
      {!isDirect ? (
        <View className="mt-5 gap-3">
          <SectionTitle label="Thành viên" count={memberCount} />
          <View className="mx-4 h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
            <Ionicons name="search" size={18} color={muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm thành viên…"
              placeholderTextColor={muted}
              autoCorrect={false}
              className="flex-1 text-base text-foreground"
            />
            {search ? (
              <Pressable hitSlop={8} onPress={() => setSearch('')} accessibilityLabel="Xoá ô tìm">
                <Ionicons name="close-circle" size={18} color={muted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
        }}
      />
      <FlatList
        data={isDirect ? [] : rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          isDirect ? null : members.isLoading ? (
            <ActivityIndicator className="py-6" />
          ) : (
            <Text className="py-6 text-center text-sm text-muted">Không tìm thấy thành viên</Text>
          )
        }
        renderItem={({ item }) =>
          item.kind === 'more' ? (
            <View className="mx-4">
              <Pressable
                onPress={() => setExpanded((e) => ({ ...e, [item.group]: true }))}
                className="flex-row items-center justify-center gap-1 rounded-b-2xl border-x border-b border-border bg-surface py-3 active:bg-surface-muted">
                <Text className="text-[14px] font-semibold text-brand">Xem thêm {item.hidden} người</Text>
                <Ionicons name="chevron-down" size={15} color={brand} />
              </Pressable>
            </View>
          ) : item.kind === 'section' ? (
            <Text className="px-6 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">
              {item.label} · {item.count}
            </Text>
          ) : (
            <MemberRow
              member={item.member}
              first={item.first}
              last={item.last}
              me={item.member._id === myId}
              // Quyền nhắn riêng theo đúng danh sách server cho phép (useDmAllowedIds)
              canDm={!isDirect && item.member._id !== myId && (dmAllowed === 'all' || !!dmAllowed?.has(item.member._id))}
              opening={opening === item.member._id}
              token={token?.media_token}
              onPress={() => openDm(item.member)}
            />
          )
        }
      />
    </View>
  );
}

function SectionTitle({ label, count }: { label: string; count?: number }) {
  return (
    <Text className="px-6 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
      {label}
      {count ? ` · ${count}` : ''}
    </Text>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  active,
  loading,
  disabled,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  badge?: number;
}) {
  const brand = useThemeColor('brand');
  const onBrand = useThemeColor('on-brand');
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`flex-1 items-center gap-1.5 active:opacity-70 ${disabled ? 'opacity-40' : ''}`}>
      <View className={`h-12 w-12 items-center justify-center rounded-full ${active ? 'bg-brand' : 'bg-brand-soft'}`}>
        {loading ? (
          <ActivityIndicator size="small" color={active ? onBrand : brand} />
        ) : (
          <AppIcon name={icon} size={21} color={active ? onBrand : brand} />
        )}
        {badge ? (
          <View className="absolute -right-1 -top-1 min-w-[18px] items-center rounded-full border-2 border-surface bg-brand px-1">
            <Text className="text-[10px] font-bold text-on-brand">{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text className="text-center text-xs font-medium text-foreground" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function PinnedRow({ message: m, divider, onPress }: { message: ChatMessage; divider: boolean; onPress: () => void }) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const preview =
    m.message_type === 'image'
      ? '🖼 Hình ảnh'
      : m.message_type === 'video'
        ? '🎬 Video'
        : m.message_type === 'file'
          ? `📎 ${m.file_name ?? 'Tệp'}`
          : m.message_type === 'voice'
            ? '🎤 Tin nhắn thoại'
            : m.assignment_card
              ? `📝 ${m.assignment_card.title}`
              : m.poll
                ? `📊 ${m.poll.question}`
                : plainContent(m.content);
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted ${divider ? 'border-t border-border' : ''}`}>
      <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-soft">
        <AppIcon name="pushpin" size={15} color={brand} />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] text-foreground" numberOfLines={2}>
          {preview}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {m.sender?.full_name ?? 'Hệ thống'} · {roomTime(m.created_at)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={muted} />
    </Pressable>
  );
}

function MemberRow({
  member,
  first,
  last,
  me,
  canDm,
  opening,
  token,
  onPress,
}: {
  member: RoomMember;
  first: boolean;
  last: boolean;
  me: boolean;
  canDm: boolean;
  opening: boolean;
  token?: string;
  onPress: () => void;
}) {
  const muted = useThemeColor('muted');
  const success = useThemeColor('success');
  const role = roleOf(member);
  const isRoomAdmin = member.chat_role !== 'member';
  return (
    <View className="mx-4">
      <Pressable
        disabled={!canDm}
        onPress={onPress}
        className={`flex-row items-center gap-3 border-x border-border bg-surface px-3.5 py-2 active:bg-surface-muted ${first ? 'rounded-t-2xl border-t' : ''} ${last ? 'rounded-b-2xl border-b' : ''}`}>
        <View>
          <Avatar
            name={member.full_name}
            uri={resolveMediaUrl(member.avatar_url, token)}
            cacheKey={mediaCacheKey(member.avatar_url)}
            size={40}
          />
          {member.is_online ? (
            <View
              className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-surface"
              style={{ backgroundColor: success }}
            />
          ) : null}
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-medium text-foreground" numberOfLines={1}>
            {member.full_name}
            {me ? <Text className="font-normal text-muted"> (bạn)</Text> : null}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            {ROLE_LABEL[role] && role !== 'ST' ? <Text className="text-xs font-semibold text-info">{ROLE_LABEL[role]}</Text> : null}
            {isRoomAdmin ? (
              <View className="flex-row items-center gap-0.5">
                <Ionicons name="shield-checkmark" size={11} color={muted} />
                <Text className="text-xs text-muted">{member.chat_role === 'owner' ? 'Chủ phòng' : 'Quản trị phòng'}</Text>
              </View>
            ) : null}
            {member.is_online ? <Text className="text-xs text-success">Đang hoạt động</Text> : null}
          </View>
        </View>
        {opening ? <ActivityIndicator /> : canDm ? <Ionicons name="chatbubble-ellipses-outline" size={20} color={muted} /> : null}
        {/* Đường kẻ giữa các thành viên — thụt vào sau avatar như danh sách iOS */}
        {!last ? <View className="absolute bottom-0 right-0 h-px bg-border" style={{ left: 66 }} /> : null}
      </Pressable>
    </View>
  );
}

/** Số ô ảnh xem trước trên màn Thông tin */
const MEDIA_PREVIEW = 4;

/**
 * Mục "Ảnh, tệp, link": 1 hàng ảnh/video mới nhất + lối vào kho đầy đủ (3 tab). Phòng chưa gửi
 * ảnh nào thì vẫn hiện dòng lối vào (tệp/link có thể có).
 */
function MediaPreview({ roomId, token }: { roomId: string; token?: string }) {
  const { width } = useWindowDimensions();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const media = useRoomMedia(roomId, 'media', MEDIA_PREVIEW);
  const items = (media.data?.pages[0]?.data ?? []).slice(0, MEDIA_PREVIEW);
  const gap = 6;
  // Thẻ cách mép 16, đệm trong 12 mỗi bên
  const size = (width - 32 - 24 - gap * (MEDIA_PREVIEW - 1)) / MEDIA_PREVIEW;
  const open = (tab: 'media' | 'file' | 'link') => router.push({ pathname: '/chat/media/[roomId]', params: { roomId, tab } });

  return (
    <View className="mx-4 mt-4 overflow-hidden rounded-3xl border border-border bg-surface">
      <Pressable onPress={() => open('media')} className="flex-row items-center px-4 pb-1 pt-3.5 active:opacity-70">
        <Text className="flex-1 text-[15px] font-bold text-foreground">Ảnh, tệp, link</Text>
        <Text className="text-[13px] font-semibold text-brand">Xem tất cả</Text>
        <Ionicons name="chevron-forward" size={14} color={brand} />
      </Pressable>
      {media.isLoading ? (
        <ActivityIndicator className="py-6" color={brand} />
      ) : items.length ? (
        <View className="flex-row px-3 pt-2" style={{ gap }}>
          {items.map((it) => (
            <View key={it.key ?? it.message_id} className="overflow-hidden rounded-xl">
              <MediaTile item={it} size={size} token={token} onPress={() => open('media')} />
            </View>
          ))}
        </View>
      ) : (
        <Text className="px-4 pt-1 text-[13px] text-muted">Chưa có ảnh hay video nào trong phòng.</Text>
      )}
      <View className="flex-row gap-2 p-3">
        {(
          [
            { tab: 'media', icon: 'images-outline', label: 'Ảnh/video' },
            { tab: 'file', icon: 'document-attach-outline', label: 'Tệp' },
            { tab: 'link', icon: 'link-outline', label: 'Link' },
          ] as const
        ).map((r) => (
          <Pressable
            key={r.tab}
            onPress={() => open(r.tab)}
            className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-surface-muted active:opacity-70">
            <Ionicons name={r.icon} size={17} color={muted} />
            <Text className="text-[13px] font-semibold text-foreground">{r.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
