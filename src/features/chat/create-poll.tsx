import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { useThemeColor } from '@/theme/use-theme-color';

import { emitWithAck } from './socket';

const MAX_OPTIONS = 10;
/** Hạn chốt — chọn nhanh thay cho bộ chọn ngày giờ (đỡ cài thêm thư viện, bấm nhanh trên điện thoại). */
const DEADLINES: { label: string; hours: number | null }[] = [
  { label: 'Không hạn', hours: null },
  { label: '1 giờ', hours: 1 },
  { label: '1 ngày', hours: 24 },
  { label: '3 ngày', hours: 72 },
  { label: '1 tuần', hours: 168 },
];

/** Tạo bình chọn (socket create_poll) — quyền can_create_poll, chỉ phòng nhóm. */
export function CreatePollSheet({ roomId, visible, onClose }: { roomId: string; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [allowAdd, setAllowAdd] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const clean = options.map((o) => o.trim()).filter(Boolean);
  const dupes = new Set(clean.map((o) => o.toLowerCase())).size !== clean.length;
  const valid = question.trim().length > 0 && clean.length >= 2 && !dupes;

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setMultiple(false);
    setAllowAdd(false);
    setDeadline(null);
  };

  async function submit() {
    if (!valid) return;
    setSending(true);
    const res = await emitWithAck('create_poll', {
      room_id: roomId,
      question: question.trim(),
      options: clean,
      allow_multiple: multiple,
      allow_add_option: allowAdd,
      deadline: deadline ? new Date(Date.now() + deadline * 3_600_000).toISOString() : null,
    });
    setSending(false);
    if (!res.success) {
      showToast('error', 'Chưa tạo được bình chọn', res.error);
      return;
    }
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoider className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Pressable onPress={onClose} hitSlop={8}>
            <Text className="text-base text-brand">Huỷ</Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">Tạo bình chọn</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Đặt câu hỏi…"
            placeholderTextColor={muted}
            multiline
            maxLength={300}
            className="min-h-14 rounded-xl bg-surface-muted px-3.5 py-3 text-lg font-medium text-foreground"
          />

          <View className="gap-2">
            {options.map((o, i) => (
              <View key={i} className="flex-row items-center gap-2">
                <TextInput
                  value={o}
                  onChangeText={(v) => setOptions((list) => list.map((x, j) => (j === i ? v : x)))}
                  placeholder={`Lựa chọn ${i + 1}`}
                  placeholderTextColor={muted}
                  maxLength={150}
                  className="h-12 flex-1 rounded-xl border border-border bg-surface px-3.5 text-base text-foreground"
                />
                {options.length > 2 ? (
                  <Pressable hitSlop={8} onPress={() => setOptions((list) => list.filter((_, j) => j !== i))} accessibilityLabel="Xoá lựa chọn">
                    <Ionicons name="remove-circle" size={22} color={muted} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {options.length < MAX_OPTIONS ? (
              <Pressable onPress={() => setOptions((l) => [...l, ''])} className="flex-row items-center gap-2 py-2">
                <Ionicons name="add-circle-outline" size={20} color={brand} />
                <Text className="text-base font-medium text-brand">Thêm lựa chọn</Text>
              </Pressable>
            ) : null}
            {dupes ? <Text className="text-sm text-danger">Có lựa chọn bị trùng nhau.</Text> : null}
          </View>

          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <ToggleRow label="Chọn được nhiều đáp án" value={multiple} onChange={setMultiple} />
            <ToggleRow label="Cho phép mọi người thêm lựa chọn" value={allowAdd} onChange={setAllowAdd} border />
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Hạn kết thúc</Text>
            <View className="flex-row flex-wrap gap-2">
              {DEADLINES.map((d) => {
                const on = deadline === d.hours;
                return (
                  <Pressable
                    key={d.label}
                    onPress={() => setDeadline(d.hours)}
                    className={`rounded-full border px-3.5 py-1.5 ${on ? 'border-brand bg-brand' : 'border-border bg-surface'}`}>
                    <Text className={`text-sm font-medium ${on ? 'text-on-brand' : 'text-foreground'}`}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
        <View className="px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button title="Tạo bình chọn" icon="stats-chart" disabled={!valid} loading={sending} onPress={submit} />
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

function ToggleRow({ label, value, onChange, border }: { label: string; value: boolean; onChange: (v: boolean) => void; border?: boolean }) {
  const brand = useThemeColor('brand');
  return (
    <View className={`flex-row items-center justify-between px-4 py-3 ${border ? 'border-t border-border' : ''}`}>
      <Text className="flex-1 text-base text-foreground">{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: brand }} />
    </View>
  );
}
