import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { showToast } from '@/components/ui/toast';
import { menuScreenOptions } from '@/features/navigation/app-menu';
import {
  formatMoney,
  useGraderRates,
  useSetDefaultGraderRate,
  useSetGraderRate,
  type GraderRateItem,
} from '@/features/payment/api';
import { getErrorMessage } from '@/lib/api/client';
import { mediaCacheKey, useMediaUrl } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Cài đặt thanh toán (admin) — đơn giá nhận xét mỗi bài.
 *
 * Web là bảng tick nhiều dòng rồi gán hàng loạt; trên điện thoại bỏ phần gán hàng loạt (ít khi phải
 * làm trên điện thoại, lại dễ bấm nhầm hàng chục người) — đổi thành: thẻ đơn giá mặc định ở trên,
 * danh sách người nhận xét ở dưới, chạm một người là sửa đơn giá riêng của người đó.
 */
export default function PaymentSettingsScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [editing, setEditing] = useState<GraderRateItem | null>(null);
  const [editingDefault, setEditingDefault] = useState(false);

  const query = useGraderRates(applied || undefined);
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.data ?? [], [query.data]);
  const defaultRate = query.data?.default_rate ?? 0;
  const customCount = items.filter((i) => i.is_custom).length;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Cài đặt thanh toán', ...menuScreenOptions }} />

      <View className="gap-2.5 px-4 pb-1 pt-2">
        <Pressable
          onPress={() => setEditingDefault(true)}
          className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 active:opacity-80">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
            <Ionicons name="pricetag" size={19} color={brand} />
          </View>
          <View className="flex-1">
            <Text className="text-[12.5px] text-muted">Đơn giá mặc định mỗi bài</Text>
            <Text className="text-[19px] font-extrabold text-foreground">{formatMoney(defaultRate)}</Text>
          </View>
          <Ionicons name="create-outline" size={19} color={muted} />
        </Pressable>

        <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
          <Ionicons name="search" size={18} color={muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setApplied(search.trim())}
            onBlur={() => setApplied(search.trim())}
            placeholder="Tìm tên, email người nhận xét…"
            placeholderTextColor={muted}
            autoCorrect={false}
            returnKeyType="search"
            className="flex-1 text-[15px] text-foreground"
          />
          {search ? (
            <Pressable
              hitSlop={8}
              onPress={() => {
                setSearch('');
                setApplied('');
              }}
              accessibilityLabel="Xoá ô tìm">
              <Ionicons name="close-circle" size={18} color={muted} />
            </Pressable>
          ) : query.isFetching && !query.isLoading ? (
            <ActivityIndicator size="small" color={brand} />
          ) : null}
        </View>

        {items.length ? (
          <Text className="text-[12.5px] font-medium text-muted">
            {items.length} người nhận xét · {customCount} người có đơn giá riêng
          </Text>
        ) : null}
      </View>

      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được đơn giá"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(i) => i.grader_id}
          renderItem={({ item }) => <GraderRow item={item} onPress={() => setEditing(item)} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={<StateView icon="people-outline" title="Không tìm thấy người nhận xét nào" />}
        />
      )}

      <RateSheet
        grader={editing}
        defaultRate={defaultRate}
        onClose={() => setEditing(null)}
      />
      <DefaultRateSheet open={editingDefault} rate={defaultRate} onClose={() => setEditingDefault(false)} />
    </View>
  );
}

function GraderRow({ item, onPress }: { item: GraderRateItem; onPress: () => void }) {
  const avatarUri = useMediaUrl(item.avatar);
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3 active:opacity-80">
      <Avatar name={item.name} uri={avatarUri} cacheKey={mediaCacheKey(item.avatar)} size={40} />
      <View className="flex-1">
        <Text className="text-[14.5px] font-semibold text-foreground" numberOfLines={1}>
          {item.name || item.email}
        </Text>
        <Text className="text-[12px] text-muted" numberOfLines={1}>
          {item.role_label || item.role_code || '—'}
          {item.is_secondary_grader ? ' · vai trò phụ' : ''}
        </Text>
      </View>
      <View className="items-end gap-0.5">
        <Text className={`text-[14.5px] font-bold ${item.is_custom ? 'text-brand' : 'text-foreground'}`}>{formatMoney(item.rate)}</Text>
        <Text className="text-[10.5px] text-muted">{item.is_custom ? 'Giá riêng' : 'Mặc định'}</Text>
      </View>
    </Pressable>
  );
}

/** Bảng nhập đơn giá riêng cho một người (hoặc bỏ để quay về mặc định). */
function RateSheet({ grader, defaultRate, onClose }: { grader: GraderRateItem | null; defaultRate: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const setRate = useSetGraderRate();
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [key, setKey] = useState<string | null>(null);

  // Mở người khác → nạp lại số của người đó. Làm lúc render (không phải trong effect) để tránh
  // nháy số cũ một khung hình; React Compiler cấm setState trong thân effect.
  if (grader && key !== grader.grader_id) {
    setKey(grader.grader_id);
    setValue(String(grader.rate ?? ''));
    setNote(grader.note ?? '');
  }

  const save = async (reset?: boolean) => {
    if (!grader) return;
    const rate = reset ? null : Number(value.replace(/[^\d]/g, ''));
    if (!reset && (!Number.isFinite(rate) || (rate ?? 0) <= 0)) {
      showToast('warning', 'Đơn giá chưa hợp lệ', 'Nhập số tiền lớn hơn 0.');
      return;
    }
    try {
      await setRate.mutateAsync({ grader_ids: [grader.grader_id], rate, note: note.trim() || undefined });
      showToast('success', reset ? 'Đã về đơn giá mặc định' : 'Đã lưu đơn giá', grader.name);
      onClose();
    } catch (err) {
      showToast('error', 'Chưa lưu được', getErrorMessage(err));
    }
  };

  return (
    <Modal visible={!!grader} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoider className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Đóng" />
        <View className="gap-3 rounded-t-3xl bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 14 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="text-[17px] font-bold text-foreground" numberOfLines={1}>
            {grader?.name || 'Đơn giá riêng'}
          </Text>
          <Text className="text-[13px] text-muted">Đơn giá mặc định đang là {formatMoney(defaultRate)}. Để trống thì dùng mặc định.</Text>

          <View className="gap-1">
            <Text className="text-[12.5px] font-semibold text-muted">Đơn giá mỗi bài (đ)</Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              placeholder={String(defaultRate)}
              placeholderTextColor={muted}
              className="rounded-xl bg-surface-muted px-3.5 py-3 text-[17px] font-bold text-foreground"
            />
          </View>
          <View className="gap-1">
            <Text className="text-[12.5px] font-semibold text-muted">Ghi chú (không bắt buộc)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Lý do đặt giá riêng…"
              placeholderTextColor={muted}
              className="rounded-xl bg-surface-muted px-3.5 py-2.5 text-[14.5px] text-foreground"
            />
          </View>

          <Pressable
            onPress={() => void save()}
            disabled={setRate.isPending}
            className={`items-center rounded-2xl bg-brand py-3.5 ${setRate.isPending ? 'opacity-50' : 'active:opacity-80'}`}>
            {setRate.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-[15.5px] font-bold text-on-brand">Lưu đơn giá</Text>}
          </Pressable>
          {grader?.is_custom ? (
            <Pressable onPress={() => void save(true)} className="items-center py-2 active:opacity-70">
              <Text className="text-[14px] font-semibold text-danger">Bỏ giá riêng, dùng mặc định</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

function DefaultRateSheet({ open, rate, onClose }: { open: boolean; rate: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const setDefault = useSetDefaultGraderRate();
  const [value, setValue] = useState('');
  const [wasOpen, setWasOpen] = useState(false);

  if (open && !wasOpen) {
    setWasOpen(true);
    setValue(String(rate ?? ''));
  }
  if (!open && wasOpen) setWasOpen(false);

  const save = async () => {
    const next = Number(value.replace(/[^\d]/g, ''));
    if (!Number.isFinite(next) || next <= 0) {
      showToast('warning', 'Đơn giá chưa hợp lệ', 'Nhập số tiền lớn hơn 0.');
      return;
    }
    try {
      await setDefault.mutateAsync(next);
      showToast('success', 'Đã đổi đơn giá mặc định', formatMoney(next));
      onClose();
    } catch (err) {
      showToast('error', 'Chưa lưu được', getErrorMessage(err));
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoider className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Đóng" />
        <View className="gap-3 rounded-t-3xl bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 14 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="text-[17px] font-bold text-foreground">Đơn giá mặc định</Text>
          <Text className="text-[13px] text-muted">Áp cho mọi người nhận xét chưa đặt giá riêng.</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            keyboardType="number-pad"
            placeholderTextColor={muted}
            className="rounded-xl bg-surface-muted px-3.5 py-3 text-[17px] font-bold text-foreground"
          />
          <Pressable
            onPress={() => void save()}
            disabled={setDefault.isPending}
            className={`items-center rounded-2xl bg-brand py-3.5 ${setDefault.isPending ? 'opacity-50' : 'active:opacity-80'}`}>
            {setDefault.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-[15.5px] font-bold text-on-brand">Lưu</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}
