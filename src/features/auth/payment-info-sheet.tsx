import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { TextField } from '@/components/ui/text-field';
import { getErrorMessage } from '@/lib/api/client';
import { fold } from '@/features/chat/mentions';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

import { authApi, type PaymentInfo } from './api';
import { bankLabel, findBank, VIETQR_BANKS } from './vietqr-banks';

/**
 * Thông tin nhận tiền chấm bài (PATCH /auth/profile → `payment_info`) — chỉ nhân sự mới thấy,
 * giống bản web (khối "Thông tin thanh toán" ẩn với học viên).
 *
 * Ngân hàng phải CHỌN từ danh sách VietQR chứ không gõ tay: CRM dựng ảnh QR chuyển khoản theo
 * `bank_code`, gõ tay sai mã là QR không quét được.
 */
export function PaymentInfoSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const danger = useThemeColor('danger');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const info = user?.payment_info;

  const [bankCode, setBankCode] = useState(info?.bank_code ?? '');
  const [accountName, setAccountName] = useState(info?.bank_account_name ?? '');
  const [accountNumber, setAccountNumber] = useState(info?.bank_account_number ?? '');
  const [cccd, setCccd] = useState(info?.cccd_number ?? '');
  const [cccdDate, setCccdDate] = useState(info?.cccd_issued_date ?? '');
  const [cccdPlace, setCccdPlace] = useState(info?.cccd_issued_place ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openedFor, setOpenedFor] = useState(visible);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) {
      setBankCode(info?.bank_code ?? '');
      setAccountName(info?.bank_account_name ?? '');
      setAccountNumber(info?.bank_account_number ?? '');
      setCccd(info?.cccd_number ?? '');
      setCccdDate(info?.cccd_issued_date ?? '');
      setCccdPlace(info?.cccd_issued_place ?? '');
      setError(null);
    }
  }

  const bank = findBank(bankCode);
  const valid = !!bank && accountName.trim().length >= 2 && /^\d{6,20}$/.test(accountNumber.trim());

  async function submit() {
    if (!valid || !user) return;
    setSaving(true);
    setError(null);
    try {
      const payment_info: PaymentInfo = {
        bank_code: bank!.code,
        bank_name: bankLabel(bank!),
        bank_account_name: accountName.trim(),
        bank_account_number: accountNumber.trim(),
        cccd_number: cccd.trim(),
        cccd_issued_date: cccdDate.trim(),
        cccd_issued_place: cccdPlace.trim(),
      };
      const updated = await authApi.updateProfile({ payment_info });
      setUser({ ...user, ...updated, payment_info: updated?.payment_info ?? payment_info });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Chưa lưu được, thử lại nhé.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoider className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="rounded-t-3xl bg-surface" style={{ paddingBottom: insets.bottom + 12, maxHeight: '92%' }}>
          <View className="items-center pb-1 pt-2">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
            <Text className="text-lg font-bold text-foreground">Thông tin nhận tiền</Text>
            <Pressable hitSlop={10} onPress={onClose} accessibilityLabel="Đóng">
              <Ionicons name="close" size={24} color={muted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3.5 px-5 pb-2 pt-1">
            <Text className="text-[13px] text-muted">Dùng để trung tâm chuyển tiền công nhận xét bài.</Text>

            <Pressable onPress={() => setPickerOpen(true)} className="gap-1.5 active:opacity-70">
              <Text className="text-[13px] font-medium text-muted">Ngân hàng</Text>
              <View className="h-12 flex-row items-center gap-2.5 rounded-xl border border-border bg-surface-muted px-3.5">
                <Ionicons name="business-outline" size={18} color={muted} />
                <Text className={`flex-1 text-[15px] ${bank ? 'text-foreground' : 'text-muted'}`} numberOfLines={1}>
                  {bank ? bankLabel(bank) : 'Chọn ngân hàng'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={muted} />
              </View>
            </Pressable>

            <TextField
              label="Tên chủ tài khoản"
              icon="person-outline"
              value={accountName}
              onChangeText={setAccountName}
              autoCapitalize="characters"
            />
            <TextField
              label="Số tài khoản"
              icon="card-outline"
              value={accountNumber}
              onChangeText={(v) => setAccountNumber(v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              error={accountNumber && !/^\d{6,20}$/.test(accountNumber) ? 'Số tài khoản gồm 6–20 chữ số' : undefined}
            />

            <Text className="pt-1 text-[13px] font-semibold text-foreground">Căn cước công dân</Text>
            <TextField
              label="Số CCCD"
              icon="id-card-outline"
              value={cccd}
              onChangeText={(v) => setCccd(v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
            />
            <TextField label="Ngày cấp" icon="calendar-outline" value={cccdDate} onChangeText={setCccdDate} placeholder="VD: 20/05/2021" />
            <TextField label="Nơi cấp" icon="location-outline" value={cccdPlace} onChangeText={setCccdPlace} />

            {error ? (
              <View className="flex-row items-start gap-2 rounded-xl bg-danger-soft p-3">
                <Ionicons name="alert-circle" size={18} color={danger} />
                <Text className="flex-1 text-sm text-danger">{error}</Text>
              </View>
            ) : null}
            <Button title="Lưu thông tin" icon="checkmark" loading={saving} disabled={!valid} onPress={submit} className="mt-1" />
          </ScrollView>
        </View>
      </KeyboardAvoider>

      <BankPicker visible={pickerOpen} value={bankCode} onClose={() => setPickerOpen(false)} onPick={setBankCode} />
    </Modal>
  );
}

/** Danh sách ngân hàng có ô tìm (không dấu) — 43 ngân hàng, cuộn tay thì lâu. */
function BankPicker({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onPick: (code: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = fold(query.trim());
    return q ? VIETQR_BANKS.filter((b) => fold(`${b.shortName} ${b.name} ${b.code}`).includes(q)) : VIETQR_BANKS;
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoider className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="rounded-t-3xl bg-surface" style={{ paddingBottom: insets.bottom, height: '75%' }}>
          <View className="items-center pb-1 pt-2">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
            <Text className="text-lg font-bold text-foreground">Chọn ngân hàng</Text>
            <Pressable hitSlop={10} onPress={onClose} accessibilityLabel="Đóng">
              <Ionicons name="close" size={24} color={muted} />
            </Pressable>
          </View>
          <View className="mx-5 h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
            <Ionicons name="search" size={17} color={muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Tìm ngân hàng…"
              placeholderTextColor={muted}
              autoCorrect={false}
              className="flex-1 text-[15px] text-foreground"
            />
          </View>
          <FlatList
            data={items}
            keyExtractor={(b) => b.code}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }) => {
              const on = item.code === value;
              return (
                <Pressable
                  onPress={() => {
                    onPick(item.code);
                    onClose();
                  }}
                  className="flex-row items-center gap-3 px-5 py-3 active:bg-surface-muted">
                  <View className="flex-1">
                    <Text className="text-[15px] font-semibold text-foreground">{item.shortName}</Text>
                    <Text className="text-[12.5px] text-muted" numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  {on ? <Ionicons name="checkmark-circle" size={20} color={brand} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text className="px-5 py-6 text-center text-[14px] text-muted">Không tìm thấy ngân hàng</Text>}
          />
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}
