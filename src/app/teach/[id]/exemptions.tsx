import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { StateView } from '@/components/ui/state-view';
import { fold } from '@/features/chat/mentions';
import { useGradingExemptions } from '@/features/classes/class-admin-api';
import { useStaffClassDetail, useStaffClasses } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Không cần nhận xét (GradingExemptionsTab web): học viên trong danh sách nộp bài là tự hoàn thành, bài
 * không vào hàng đợi chấm. Thêm (chọn nhiều học viên + lý do), bỏ khỏi danh sách, quét lại bài cũ.
 */
export default function GradingExemptionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const fg = useThemeColor('foreground');
  const { data: token } = useMediaToken();
  const cls = useStaffClasses().data?.find((c) => c._id === id);
  const { list, add, remove, sweep } = useGradingExemptions(id);
  const pull = usePullRefresh(() => list.refetch());
  const [adding, setAdding] = useState(false);
  const sheet = useActionSheet();
  const items = list.data ?? [];

  const confirmRemove = (studentId: string, name: string) =>
    sheet.confirm({
      title: `Bỏ ${name} khỏi danh sách?`,
      message: 'Bài nộp từ nay sẽ vào hàng đợi nhận xét như bình thường.',
      label: 'Bỏ khỏi danh sách',
      icon: 'person-remove-outline',
      onConfirm: () => remove.mutate(studentId, { onError: (e) => showToast('error', 'Không thực hiện được', getErrorMessage(e)) }),
    });

  const runSweep = () =>
    sheet.confirm({
      title: 'Quét lại bài cũ?',
      message: 'Bài đang chờ nhận xét của các học viên trong danh sách sẽ chuyển thành hoàn thành (bài đã có điểm giữ nguyên).',
      label: 'Quét lại',
      icon: 'refresh-outline',
      danger: false,
      onConfirm: () =>
        sweep.mutate(undefined, {
          onSuccess: (r) => showToast('success', 'Đã quét xong', `${r.closed} bài chuyển hoàn thành · ${r.kept_graded} bài đã có điểm giữ nguyên.`),
          onError: (e) => showToast('error', 'Không quét được', getErrorMessage(e)),
        }),
    });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: cls?.class_code ? `Không cần nhận xét · ${cls.class_code}` : 'Không cần nhận xét',
          headerShown: true,
          headerRight: () => (
            <Pressable onPress={() => setAdding(true)} hitSlop={10} accessibilityLabel="Thêm học viên" className="active:opacity-60">
              <Ionicons name="person-add-outline" size={22} color={fg} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(e) => e._id}
        contentContainerStyle={{ padding: 16, paddingBottom: 28, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View className="h-2" />}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
        ListHeaderComponent={
          <View className="gap-3 pb-3">
            <View className="flex-row gap-2.5 rounded-2xl bg-info-soft p-3.5">
              <Ionicons name="information-circle" size={18} color="#2563eb" />
              <Text className="flex-1 text-[13px] leading-5 text-foreground">
                Học viên trong danh sách nộp bài là <Text className="font-bold">tự hoàn thành</Text>, không cần người chấm nhận xét.
              </Text>
            </View>
            {items.length ? (
              <Pressable onPress={runSweep} disabled={sweep.isPending} className="flex-row items-center gap-2 self-start rounded-full bg-surface px-3.5 py-2 active:opacity-70">
                {sweep.isPending ? <ActivityIndicator size="small" color={brand} /> : <Ionicons name="refresh" size={15} color={brand} />}
                <Text className="text-[13px] font-semibold text-brand">Quét lại bài đang chờ</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator className="py-10" color={brand} />
          ) : (
            <StateView icon="checkmark-done-circle-outline" title="Chưa có học viên nào" description="Bấm + để thêm học viên không cần nhận xét bài." actionLabel="Thêm học viên" onAction={() => setAdding(true)} />
          )
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 rounded-3xl bg-surface p-3.5">
            <Avatar name={item.student_name} uri={resolveMediaUrl(item.student_avatar, token?.media_token)} size={42} />
            <View className="flex-1 gap-0.5">
              <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                {item.student_name}
              </Text>
              {item.reason ? (
                <Text className="text-[12.5px] text-foreground" numberOfLines={2}>
                  {item.reason}
                </Text>
              ) : null}
              <Text className="text-[11.5px] text-muted">
                {item.created_by_name ? `${item.created_by_name} · ` : ''}
                {formatDate(item.created_at)}
              </Text>
            </View>
            <Pressable onPress={() => confirmRemove(item.student_id, item.student_name)} hitSlop={6} className="h-9 w-9 items-center justify-center rounded-full bg-danger-soft active:opacity-70">
              <Ionicons name="close" size={17} color="#dc2626" />
            </Pressable>
          </View>
        )}
      />
      {sheet.sheet}
      {adding ? (
        <AddSheet
          classId={id}
          exclude={new Set(items.map((e) => e.student_id))}
          saving={add.isPending}
          onClose={() => setAdding(false)}
          onSave={(studentIds, reason) =>
            add.mutate(
              { studentIds, reason },
              {
                onSuccess: (r) => {
                  setAdding(false);
                  showToast('success', `Đã thêm ${r.added} học viên`, r.closed_pending_submissions ? `${r.closed_pending_submissions} bài đang chờ đã chuyển hoàn thành.` : undefined);
                },
                onError: (e) => showToast('error', 'Không thêm được', getErrorMessage(e)),
              },
            )
          }
        />
      ) : null}
    </View>
  );
}

function AddSheet({
  classId,
  exclude,
  saving,
  onClose,
  onSave,
}: {
  classId: string;
  exclude: Set<string>;
  saving: boolean;
  onClose: () => void;
  onSave: (ids: string[], reason: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const detail = useStaffClassDetail(classId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(fold(search.trim()));
  const students = useMemo(
    () => (detail.data?.students ?? []).filter((s) => !exclude.has(s._id) && (!q || fold(`${s.name} ${s.email ?? ''} ${s.phone ?? ''}`).includes(q))),
    [detail.data, exclude, q],
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="h-[85%] rounded-t-3xl bg-surface pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <View className="gap-2.5 px-5 pb-2 pt-3">
            <Text className="text-[18px] font-extrabold text-foreground">Thêm học viên không cần nhận xét</Text>
            <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
              <Ionicons name="search" size={17} color={muted} />
              <TextInput value={search} onChangeText={setSearch} placeholder="Tìm học viên…" placeholderTextColor={muted} className="flex-1 text-[15px] text-foreground" />
            </View>
          </View>
          <FlatList
            data={students}
            keyExtractor={(s) => s._id}
            extraData={picked.size}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-5"
            ListEmptyComponent={detail.isLoading ? <ActivityIndicator className="py-8" color={brand} /> : <Text className="py-8 text-center text-muted">Không còn học viên nào</Text>}
            renderItem={({ item: s }) => {
              const on = picked.has(s._id);
              return (
                <Pressable
                  onPress={() =>
                    setPicked((cur) => {
                      const next = new Set(cur);
                      if (next.has(s._id)) next.delete(s._id);
                      else next.add(s._id);
                      return next;
                    })
                  }
                  className="flex-row items-center gap-3 border-b border-border py-2.5 active:opacity-70">
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? brand : '#9ca3af'} />
                  <Avatar name={s.name} size={34} />
                  <View className="flex-1">
                    <Text className="text-[14.5px] font-semibold text-foreground" numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text className="text-[12px] text-muted" numberOfLines={1}>
                      {s.phone || s.email || ''}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
          <View className="gap-2.5 px-5 pt-3">
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Lý do (tuỳ chọn)"
              placeholderTextColor={muted}
              className="h-12 rounded-2xl border border-border bg-background px-4 text-[15px] text-foreground"
            />
            <Pressable
              onPress={() => onSave([...picked], reason.trim())}
              disabled={!picked.size || saving}
              className={`h-12 items-center justify-center rounded-2xl ${picked.size ? 'bg-brand active:opacity-85' : 'bg-surface-muted'}`}>
              <Text className={`text-[15px] font-bold ${picked.size ? 'text-white' : 'text-muted'}`}>{saving ? 'Đang thêm…' : `Thêm ${picked.size || ''} học viên`}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
