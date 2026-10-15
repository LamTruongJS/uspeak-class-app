import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/avatar';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { chatApi } from '@/features/chat/api';
import { useStaffClassDetail, useStaffClasses, type ClassGroup } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Danh sách nhóm thảo luận của lớp (tab "Danh sách nhóm" web — nhóm phân từ CRM, chỉ xem): trợ giảng,
 * sĩ số, thành viên. Bấm nhóm để mở danh sách thành viên; bấm số điện thoại để gọi, nút chat để nhắn riêng.
 */
export default function ClassGroupsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const cls = useStaffClasses().data?.find((c) => c._id === id);
  const detail = useStaffClassDetail(id);
  const pull = usePullRefresh(() => detail.refetch());
  const [open, setOpen] = useState<string | null>(null);
  const groups = detail.data?.groups ?? [];

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: cls?.class_code ? `Nhóm · ${cls.class_code}` : 'Danh sách nhóm', headerShown: true }} />
      {detail.isLoading ? (
        <LoadingView />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g._id}
          extraData={open}
          contentContainerStyle={{ padding: 16, paddingBottom: 28, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListHeaderComponent={groups.length ? <Text className="pb-3 text-[13px] text-muted">{groups.length} nhóm · phân nhóm từ CRM</Text> : null}
          ListEmptyComponent={<StateView icon="people-circle-outline" title="Lớp chưa được phân nhóm" description="Nhóm thảo luận được phân từ CRM." />}
          renderItem={({ item, index }) => <GroupCard g={item} index={index} open={open === item._id} onToggle={() => setOpen((c) => (c === item._id ? null : item._id))} />}
        />
      )}
    </View>
  );
}

function GroupCard({ g, index, open, onToggle }: { g: ClassGroup; index: number; open: boolean; onToggle: () => void }) {
  const { data: token } = useMediaToken();
  const brand = useThemeColor('brand');
  const message = async (userId: string) => {
    try {
      const dm = await chatApi.openDirect(userId);
      router.push({ pathname: '/chat/[roomId]', params: { roomId: dm._id } });
    } catch (e) {
      showToast('error', 'Không nhắn riêng được', getErrorMessage(e));
    }
  };
  return (
    <View className="overflow-hidden rounded-3xl bg-surface">
      <Pressable onPress={onToggle} className="gap-3 p-4 active:opacity-90">
        <View className="flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center rounded-xl bg-brand-soft">
            <Text className="text-[13px] font-extrabold text-brand">{index + 1}</Text>
          </View>
          <Text className="flex-1 text-[16px] font-bold text-foreground" numberOfLines={1}>
            {g.group_name}
          </Text>
          <Text className="text-[13px] font-semibold text-muted">
            {g.student_ids.length}/{g.max_students || '∞'}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
        </View>
        {g.assistant ? (
          <View className="flex-row items-center gap-2.5 rounded-2xl bg-surface-muted p-2.5">
            <Avatar name={g.assistant.name} uri={resolveMediaUrl(g.assistant.avatar, token?.media_token)} size={32} />
            <View className="flex-1">
              <Text className="text-[13.5px] font-semibold text-foreground" numberOfLines={1}>
                {g.assistant.name}
              </Text>
              <Text className="text-[11.5px] text-muted">Trợ giảng</Text>
            </View>
            <Pressable onPress={() => void message(g.assistant!._id)} hitSlop={6} className="h-9 w-9 items-center justify-center rounded-full bg-brand-soft">
              <Ionicons name="chatbubble" size={15} color={brand} />
            </Pressable>
          </View>
        ) : (
          <Text className="text-[13px] text-muted">Chưa có trợ giảng</Text>
        )}
        {!open && g.student_ids.length ? (
          <View className="flex-row items-center">
            {g.student_ids.slice(0, 6).map((s, i) => (
              <View key={s._id} style={{ marginLeft: i ? -8 : 0 }} className="rounded-full border-2 border-surface">
                <Avatar name={s.name} uri={resolveMediaUrl(s.avatar, token?.media_token)} size={28} />
              </View>
            ))}
            {g.student_ids.length > 6 ? <Text className="pl-2 text-[12.5px] font-semibold text-muted">+{g.student_ids.length - 6}</Text> : null}
          </View>
        ) : null}
      </Pressable>
      {open
        ? g.student_ids.map((s) => (
            <View key={s._id} className="flex-row items-center gap-3 border-t border-border px-4 py-2.5">
              <Avatar name={s.name} uri={resolveMediaUrl(s.avatar, token?.media_token)} size={32} />
              <View className="flex-1">
                <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                  {s.name}
                </Text>
                {s.phone || s.email ? (
                  <Text
                    className={`text-[12px] ${s.phone ? 'text-brand' : 'text-muted'}`}
                    onPress={s.phone ? () => void Linking.openURL(`tel:${s.phone}`) : undefined}
                    numberOfLines={1}>
                    {s.phone || s.email}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => void message(s._id)} hitSlop={6} className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted">
                <Ionicons name="chatbubble-outline" size={14} color={brand} />
              </Pressable>
            </View>
          ))
        : null}
    </View>
  );
}
