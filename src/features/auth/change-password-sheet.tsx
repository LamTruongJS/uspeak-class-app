import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { TextField } from '@/components/ui/text-field';
import { getErrorMessage } from '@/lib/api/client';
import { useThemeColor } from '@/theme/use-theme-color';

import { authApi } from './api';

/** Mật khẩu tối thiểu — khớp ChangePasswordDto của class-be (MinLength 6). */
const MIN_LENGTH = 6;

/** Đổi mật khẩu (POST /auth/change-password) — tấm trượt từ dưới lên ở màn Tài khoản. */
export function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const danger = useThemeColor('danger');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const close = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    onClose();
  };

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = current.length > 0 && next.length >= MIN_LENGTH && confirm === next;

  async function submit() {
    if (!valid) return;
    if (next === current) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next });
      close();
      showToast('success', 'Đã đổi mật khẩu', 'Lần đăng nhập sau hãy dùng mật khẩu mới nhé.');
    } catch (err) {
      setError(getErrorMessage(err, 'Mật khẩu hiện tại không đúng.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <KeyboardAvoider className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={close} />
        <View className="rounded-t-3xl bg-surface" style={{ paddingBottom: insets.bottom + 12, maxHeight: '90%' }}>
          <View className="items-center pb-1 pt-2">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
            <Text className="text-lg font-bold text-foreground">Đổi mật khẩu</Text>
            <Pressable hitSlop={10} onPress={close} accessibilityLabel="Đóng">
              <Ionicons name="close" size={24} color={muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3.5 px-5 pb-2 pt-1">
            <TextField
              label="Mật khẩu hiện tại"
              icon="lock-closed-outline"
              password
              value={current}
              onChangeText={setCurrent}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="next"
              onSubmitEditing={() => nextRef.current?.focus()}
            />
            <TextField
              ref={nextRef}
              label="Mật khẩu mới"
              icon="key-outline"
              password
              value={next}
              onChangeText={setNext}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              error={tooShort ? `Tối thiểu ${MIN_LENGTH} ký tự` : undefined}
            />
            <TextField
              ref={confirmRef}
              label="Nhập lại mật khẩu mới"
              icon="checkmark-done-outline"
              password
              value={confirm}
              onChangeText={setConfirm}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={submit}
              error={mismatch ? 'Mật khẩu nhập lại chưa khớp' : undefined}
            />
            {error ? (
              <View className="flex-row items-start gap-2 rounded-xl bg-danger-soft p-3">
                <Ionicons name="alert-circle" size={18} color={danger} />
                <Text className="flex-1 text-sm text-danger">{error}</Text>
              </View>
            ) : null}
            <Button title="Lưu mật khẩu mới" icon="checkmark" loading={saving} disabled={!valid} onPress={submit} className="mt-1" />
          </ScrollView>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}
