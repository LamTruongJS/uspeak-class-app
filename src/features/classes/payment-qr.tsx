import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatVnd } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

import type { StudentClassItem } from './api';

type QrInfo = NonNullable<StudentClassItem['qr_code']>;

/** Bỏ dấu tiếng Việt cho nội dung chuyển khoản (ngân hàng không nhận dấu). */
const noDiacritics = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

export const transferNote = (qr: QrInfo) => noDiacritics(`${qr.student_name} ${qr.student_phone} ${qr.class_code}`).trim();

/**
 * Ảnh mã VietQR — cùng cách dựng link với web (`img.vietqr.io/image/<bank>-<stk>-<mẫu>.png`),
 * nên app và web ra đúng một mã. `bank_id` CRM trả về có thể là mã ngân hàng hoặc tên ngân hàng;
 * VietQR nhận cả mã lẫn BIN nên chỉ chuẩn hoá hoa/thường, không tự đoán thêm.
 */
export function vietQrUrl(qr: QrInfo, amount: number, template: 'print' | 'compact2' = 'print') {
  const bank = encodeURIComponent(qr.bank_id.trim().toUpperCase());
  const account = encodeURIComponent(qr.account_no.trim());
  const params = new URLSearchParams({ addInfo: transferNote(qr), accountName: noDiacritics(qr.account_name) });
  if (amount > 0) params.set('amount', String(Math.round(amount)));
  return `https://img.vietqr.io/image/${bank}-${account}-${template}.png?${params.toString()}`;
}

/** Bảng thanh toán học phí: mã QR + thông tin chuyển khoản, bấm từng dòng để copy. */
export function PaymentQrSheet({
  visible,
  onClose,
  qr,
  amount,
}: {
  visible: boolean;
  onClose: () => void;
  qr: QrInfo;
  amount: number;
}) {
  const insets = useSafeAreaInsets();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const note = transferNote(qr);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl bg-surface px-4 pt-4"
          style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="mb-3 flex-row items-center gap-2">
            <Ionicons name="qr-code" size={20} color={brand} />
            <View className="flex-1">
              <Text className="text-base font-bold text-foreground">Thanh toán qua mã QR</Text>
              <Text className="text-xs text-muted">Quét bằng app ngân hàng để đóng học phí</Text>
            </View>
            <Pressable hitSlop={8} onPress={onClose} accessibilityLabel="Đóng">
              <Ionicons name="close" size={22} color={muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="gap-3 pb-2" showsVerticalScrollIndicator={false}>
            <View className="items-center rounded-2xl border border-border bg-background p-3">
              <Image
                source={{ uri: vietQrUrl(qr, amount) }}
                style={{ width: 240, height: 320, borderRadius: 12 }}
                contentFit="contain"
                transition={150}
              />
            </View>

            <CopyRow label="Ngân hàng" value={qr.bank_id} />
            <CopyRow label="Số tài khoản" value={qr.account_no} mono />
            <CopyRow label="Chủ tài khoản" value={qr.account_name} />
            <CopyRow label="Số tiền" value={formatVnd(amount)} />
            <CopyRow label="Nội dung chuyển khoản" value={note} highlight />
            <Text className="px-1 text-xs text-muted">
              Giữ nguyên nội dung chuyển khoản để Uspeak ghi nhận học phí đúng lớp của bạn.
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CopyRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  const brand = useThemeColor('brand');
  return (
    <Pressable
      onPress={() => void Clipboard.setStringAsync(value)}
      className={`flex-row items-center gap-3 rounded-xl p-3 active:opacity-70 ${highlight ? 'bg-brand-soft' : 'bg-surface-muted'}`}>
      <View className="flex-1">
        <Text className={`text-[10px] font-bold uppercase tracking-widest ${highlight ? 'text-brand' : 'text-muted'}`}>{label}</Text>
        <Text className={`text-sm font-semibold text-foreground ${mono ? 'tracking-wide' : ''}`}>{value}</Text>
      </View>
      <Ionicons name="copy-outline" size={16} color={brand} />
    </Pressable>
  );
}
