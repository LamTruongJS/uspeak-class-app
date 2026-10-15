import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { TextField } from '@/components/ui/text-field';
import { getErrorMessage } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

import { authApi } from './api';

/**
 * Sửa hồ sơ (PATCH /auth/profile) — tên + số điện thoại, đúng 2 ô mà bản web cho sửa.
 * Email không sửa được: đó là tài khoản đăng nhập do CRM cấp.
 */
export function EditProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const danger = useThemeColor('danger');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneRef = useRef<TextInput>(null);

  // Mở lại tấm trượt → nạp lại giá trị hiện tại (so với lần mở trước, không setState trong effect)
  const [openedFor, setOpenedFor] = useState(visible);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) {
      setName(user?.name ?? '');
      setPhone(user?.phone ?? '');
      setError(null);
    }
  }

  // SĐT Việt Nam: 10 số bắt đầu bằng 0 (BE còn chuẩn hoá +84 → 0, nhưng chặn sớm cho dễ hiểu)
  const phoneOk = !phone.trim() || /^0\d{9}$/.test(phone.trim().replace(/[\s.]/g, ''));
  const valid = name.trim().length >= 2 && phoneOk && (name.trim() !== user?.name || phone.trim() !== (user?.phone ?? ''));

  async function submit() {
    if (!valid || !user) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await authApi.updateProfile({ name: name.trim(), phone: phone.trim().replace(/[\s.]/g, '') });
      setUser({ ...user, ...updated, name: updated?.name ?? name.trim(), phone: updated?.phone ?? phone.trim() });
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
        <View className="rounded-t-3xl bg-surface" style={{ paddingBottom: insets.bottom + 12, maxHeight: '90%' }}>
          <View className="items-center pb-1 pt-2">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
            <Text className="text-lg font-bold text-foreground">Sửa hồ sơ</Text>
            <Pressable hitSlop={10} onPress={onClose} accessibilityLabel="Đóng">
              <Ionicons name="close" size={24} color={muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3.5 px-5 pb-2 pt-1">
            <TextField
              label="Họ tên"
              icon="person-outline"
              value={name}
              onChangeText={setName}
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
            <TextField
              ref={phoneRef}
              label="Số điện thoại"
              icon="call-outline"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={submit}
              error={!phoneOk ? 'Số điện thoại gồm 10 số, bắt đầu bằng 0' : undefined}
            />
            <View className="flex-row items-center gap-2 rounded-xl bg-surface-muted p-3">
              <Ionicons name="mail-outline" size={16} color={muted} />
              <Text className="flex-1 text-[13px] text-muted">Email đăng nhập ({user?.email}) do trung tâm cấp, không tự đổi được.</Text>
            </View>
            {error ? (
              <View className="flex-row items-start gap-2 rounded-xl bg-danger-soft p-3">
                <Ionicons name="alert-circle" size={18} color={danger} />
                <Text className="flex-1 text-sm text-danger">{error}</Text>
              </View>
            ) : null}
            <Button title="Lưu" icon="checkmark" loading={saving} disabled={!valid} onPress={submit} className="mt-1" />
          </ScrollView>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}
