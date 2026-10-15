import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/theme/use-theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface SheetAction {
  label: string;
  icon?: IconName;
  /** Việc xoá / khoá — chữ đỏ */
  danger?: boolean;
  /** Dạng danh sách chọn: mục đang chọn có dấu tích */
  selected?: boolean;
  onPress: () => void;
}

export interface SheetOptions {
  title?: string;
  message?: string;
  actions: SheetAction[];
  /** Mặc định "Huỷ" */
  cancelLabel?: string;
}

/**
 * Bảng chọn trượt từ dưới lên — thay cho `Alert.alert` nhiều nút và `ActionSheetIOS`.
 *
 * Vì sao bỏ hộp thoại hệ thống: trên Android, `Alert.alert` nhiều nút vẽ thành một cột chữ IN HOA
 * màu xanh mặc định, chẳng liên quan gì tới giao diện app và đọc rất khó. Hai nền tảng cũng ra hai
 * kiểu khác nhau. Bảng này dùng chung một kiểu cho cả hai, đúng tông app, và **cuộn được** nên
 * danh sách dài (lọc theo bài tập) không còn phải cắt bớt như bản Alert cũ (trước cắt còn 8 mục).
 *
 * Dùng qua hook cho gọn chỗ gọi:
 * ```tsx
 * const menu = useActionSheet();
 * menu.show({ title: hv.name, actions: [{ label: 'Khoá tài khoản', icon: 'lock-closed', danger: true, onPress: … }] });
 * return <>… {menu.sheet}</>;
 * ```
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Chữ trên nút đồng ý, VD "Xoá", "Gửi" */
  label: string;
  icon?: IconName;
  /** Mặc định true (việc khó lùi → chữ đỏ) */
  danger?: boolean;
  /** Mặc định "Huỷ" — đặt lại khi nút thoái lui có nghĩa riêng, VD "Ở lại", "Xem lại" */
  cancelLabel?: string;
  onConfirm: () => void;
}

export function useActionSheet() {
  const [options, setOptions] = useState<SheetOptions | null>(null);
  const show = (opts: SheetOptions) => setOptions(opts);
  return {
    show,
    /**
     * Hỏi lại trước một việc khó lùi — cùng kiểu bảng với menu, không dùng hộp thoại hệ thống nữa.
     * Chỉ 1 hành động + nút Huỷ, nên vẫn đọc ra ngay là "đồng ý hay thôi".
     */
    confirm: (o: ConfirmOptions) =>
      show({
        title: o.title,
        message: o.message,
        cancelLabel: o.cancelLabel,
        actions: [{ label: o.label, icon: o.icon, danger: o.danger ?? true, onPress: o.onConfirm }],
      }),
    close: () => setOptions(null),
    sheet: <ActionSheet options={options} onClose={() => setOptions(null)} />,
  };
}

export function ActionSheet({ options, onClose }: { options: SheetOptions | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const danger = useThemeColor('danger');
  const foreground = useThemeColor('foreground');

  if (!options) return null;
  const { title, message, actions, cancelLabel = 'Huỷ' } = options;

  const run = (action: SheetAction) => {
    onClose();
    // Đóng bảng trước rồi mới chạy: việc tiếp theo thường mở Alert xác nhận hoặc một bảng khác,
    // hai modal chồng nhau thì iOS không hiện cái thứ hai.
    setTimeout(action.onPress, 220);
  };

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Đóng" />
        <View className="gap-2 px-3" style={{ paddingBottom: insets.bottom + 10 }}>
          <View className="overflow-hidden rounded-2xl bg-surface">
            {title || message ? (
              <View className="gap-0.5 border-b border-border px-4 py-3">
                {title ? (
                  <Text className="text-center text-[15px] font-bold text-foreground" numberOfLines={2}>
                    {title}
                  </Text>
                ) : null}
                {message ? <Text className="text-center text-[12.5px] text-muted">{message}</Text> : null}
              </View>
            ) : null}

            <ScrollView style={{ maxHeight: height * 0.5 }} bounces={false}>
              {actions.map((a, i) => (
                <Pressable
                  key={`${a.label}-${i}`}
                  onPress={() => run(a)}
                  accessibilityRole="button"
                  className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-surface-muted ${i ? 'border-t border-border' : ''}`}>
                  {a.icon ? <Ionicons name={a.icon} size={19} color={a.danger ? danger : foreground} /> : null}
                  <Text className={`flex-1 text-[15.5px] ${a.danger ? 'font-semibold text-danger' : 'text-foreground'}`}>{a.label}</Text>
                  {a.selected ? <Ionicons name="checkmark" size={18} color={brand} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Pressable onPress={onClose} className="items-center rounded-2xl bg-surface py-3.5 active:bg-surface-muted">
            <Text className="text-[15.5px] font-bold" style={{ color: muted }}>
              {cancelLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
