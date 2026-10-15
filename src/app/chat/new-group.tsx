import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { StateView } from '@/components/ui/state-view';
import { chatApi, chatKeys, useChatUserSearch, type DmUser } from '@/features/chat/api';
import { getErrorMessage } from '@/lib/api/client';
import { queryClient } from '@/lib/query-client';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

const ROLE_LABEL: Record<string, string> = { AD: 'Quản trị', TE: 'Giáo viên', TA: 'Trợ giảng', TG: 'Nhận xét', ST: 'Học viên' };
/** Server (chat.service createRoom) bắt nhóm phải có ≥1 người thuộc các vai trò này trong member_ids. */
const TEACHER_ROLES = ['TE', 'TA', 'TG'];
const STAFF_ROLES = ['AD', ...TEACHER_ROLES];

const roleOf = (u: DmUser) => (u.role_code ?? u.role ?? '').toUpperCase();

/**
 * Tạo nhóm chat (quyền CHAT_ROOM_CREATE — nút chỉ hiện ở màn "Nhắn tin mới" khi có quyền).
 * Đặt tên + ảnh (tuỳ chọn) + chọn thành viên; người tạo tự vào nhóm với vai trò quản trị.
 */
export default function NewGroupScreen() {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const onBrand = useThemeColor('on-brand');
  const me = useAuthStore((s) => s.user);
  const { data: token } = useMediaToken();

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DmUser[]>([]);
  const [creating, setCreating] = useState(false);
  const users = useChatUserSearch(search);

  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const myRole = (me?.role_code ?? '').toUpperCase();
  const list = (users.data ?? []).filter((u) => u._id !== me?._id);
  const hasTeacher = TEACHER_ROLES.includes(myRole) || selected.some((u) => TEACHER_ROLES.includes(roleOf(u)));
  const valid = name.trim().length > 0 && selected.length > 0;

  const toggle = (u: DmUser) =>
    setSelected((s) => (s.some((x) => x._id === u._id) ? s.filter((x) => x._id !== u._id) : [...s, u]));

  async function pickAvatar() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled && res.assets[0]) setAvatar(res.assets[0].uri);
  }

  async function create() {
    if (!valid) return;
    setCreating(true);
    try {
      // Giáo viên/trợ giảng/quản trị tự đưa mình vào member_ids để server tính vào điều kiện "có giáo viên"
      // và gán quyền quản trị phòng; vai trò khác thì để server tự thêm người tạo.
      const ids = selected.map((u) => u._id);
      if (me?._id && STAFF_ROLES.includes(myRole)) ids.push(me._id);
      const room = await chatApi.createGroup(name.trim(), ids);
      if (avatar) {
        // Ảnh lỗi thì thôi — nhóm đã tạo xong, đổi lại được trong Thông tin phòng.
        await chatApi.changeAvatar(room._id, avatar).catch(() => undefined);
      }
      await queryClient.invalidateQueries({ queryKey: chatKeys.rooms });
      router.replace({ pathname: '/chat/[roomId]', params: { roomId: room._id } });
    } catch (err) {
      showToast('error', 'Chưa tạo được nhóm', getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <KeyboardAvoider className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Tạo nhóm chat' }} />
      <View className="flex-row items-center gap-3 px-4 pt-4">
        <Pressable onPress={pickAvatar} accessibilityLabel="Chọn ảnh nhóm" className="active:opacity-70">
          {avatar ? (
            <Image source={{ uri: avatar }} style={{ width: 56, height: 56, borderRadius: 28 }} contentFit="cover" />
          ) : (
            <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
              <Ionicons name="camera-outline" size={24} color={brand} />
            </View>
          )}
        </Pressable>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Đặt tên nhóm"
          placeholderTextColor={muted}
          maxLength={100}
          autoFocus
          className="h-12 flex-1 border-b border-border text-lg text-foreground"
        />
      </View>

      {selected.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pt-4" className="max-h-24 grow-0">
          {selected.map((u) => (
            <Pressable key={u._id} onPress={() => toggle(u)} className="w-14 items-center gap-1 active:opacity-70">
              <View>
                <Avatar name={u.full_name} uri={resolveMediaUrl(u.avatar_url, token?.media_token)} size={48} />
                <View className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-muted">
                  <Ionicons name="close" size={13} color={onBrand} />
                </View>
              </View>
              <Text className="text-xs text-foreground" numberOfLines={1}>
                {u.full_name.split(' ').pop()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View className="mx-4 mt-4 h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
        <Ionicons name="search" size={18} color={muted} />
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Tìm người để thêm…"
          placeholderTextColor={muted}
          autoCorrect={false}
          className="flex-1 text-base text-foreground"
        />
      </View>
      {selected.length && !hasTeacher ? (
        <Text className="px-4 pt-2 text-sm text-warning">Nhóm cần có ít nhất 1 giáo viên hoặc trợ giảng.</Text>
      ) : null}

      <FlatList
        data={list}
        keyExtractor={(u) => u._id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="px-4 pb-4 pt-2"
        ListEmptyComponent={users.isLoading ? <ActivityIndicator className="py-6" /> : <StateView icon="person-outline" title="Không tìm thấy người phù hợp" />}
        renderItem={({ item }) => {
          const on = selected.some((x) => x._id === item._id);
          const role = roleOf(item);
          return (
            <Pressable onPress={() => toggle(item)} className="flex-row items-center gap-3 py-2.5 active:opacity-70">
              <Avatar name={item.full_name} uri={resolveMediaUrl(item.avatar_url, token?.media_token)} size={44} />
              <View className="flex-1">
                <Text className="text-base text-foreground" numberOfLines={1}>
                  {item.full_name}
                </Text>
                {ROLE_LABEL[role] ? <Text className="text-xs text-muted">{ROLE_LABEL[role]}</Text> : null}
              </View>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? brand : muted} />
            </Pressable>
          );
        }}
      />

      <View className="border-t border-border bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <Button
          title={selected.length ? `Tạo nhóm (${selected.length + 1} người)` : 'Tạo nhóm'}
          icon="people"
          disabled={!valid}
          loading={creating}
          onPress={create}
        />
      </View>
    </KeyboardAvoider>
  );
}
