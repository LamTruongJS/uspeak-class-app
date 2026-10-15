import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { htmlToPlain } from '@/components/ui/rich-text';
import { getErrorMessage } from '@/lib/api/client';
import { uploadMultipart } from '@/lib/api/upload';
import { formatDate, formatTime } from '@/lib/format';
import { plainToHtml } from '@/lib/html';
import { useThemeColor } from '@/theme/use-theme-color';

import {
  useManageClassNotification,
  type ClassNotification,
  type ClassNotificationAttachment,
  type ClassNotificationPayload,
} from './api';

type Uploaded = { key: string; url: string; name: string; type: string; size: number };

/**
 * Tạo / sửa thông báo lớp NGAY TRONG APP (thay hộp thoại "Tạo thông báo" của web):
 * tiêu đề, nội dung, ảnh / tệp đính kèm, link video, hẹn giờ hiện và hạn hiển thị.
 *
 * Nội dung web soạn bằng Tiptap (HTML). App soạn chữ thường rồi đổi sang đoạn văn HTML; khi SỬA một
 * thông báo cũ mà không đụng vào ô nội dung thì giữ nguyên HTML gốc (không làm mất định dạng của web).
 */
export function NotificationFormSheet({
  classId,
  item,
  onClose,
}: {
  classId: string;
  item?: ClassNotification;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const manage = useManageClassNotification(classId);
  const initialText = item ? htmlToPlain(item.content) : '';
  const [title, setTitle] = useState(item?.title ?? '');
  const [text, setText] = useState(initialText);
  const [video, setVideo] = useState(item?.video_url ?? '');
  const [kept, setKept] = useState<ClassNotificationAttachment[]>(item?.attachments ?? []);
  const [picked, setPicked] = useState<string[]>([]);
  const [from, setFrom] = useState<Date | null>(() => (item?.visible_from && new Date(item.visible_from).getTime() > Date.now() ? new Date(item.visible_from) : null));
  const [until, setUntil] = useState<Date | null>(() => (item?.visible_until ? new Date(item.visible_until) : null));
  const [iosPick, setIosPick] = useState<'from' | 'until' | null>(null);
  const [busy, setBusy] = useState(false);

  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, quality: 1 });
    if (!res.canceled) setPicked((p) => [...p, ...res.assets.map((a) => a.uri)].slice(0, 10));
  };

  const pickDate = (which: 'from' | 'until') => {
    const set = which === 'from' ? setFrom : setUntil;
    const base = (which === 'from' ? from : until) ?? new Date(Date.now() + (which === 'until' ? 7 * 86_400_000 : 3_600_000));
    if (Platform.OS === 'ios') {
      set(base);
      setIosPick((c) => (c === which ? null : which));
      return;
    }
    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        DateTimePickerAndroid.open({ value: d, mode: 'time', is24Hour: true, onChange: (e2, t) => e2.type === 'set' && t && set(t) });
      },
    });
  };

  const save = async () => {
    if (!title.trim()) return showToast('warning', 'Thiếu tiêu đề', 'Nhập tiêu đề thông báo.');
    if (!text.trim() && !kept.length && !picked.length && !video.trim())
      return showToast('warning', 'Thông báo trống', 'Nhập nội dung, thêm ảnh hoặc link video.');
    if (from && until && until <= from) return showToast('error', 'Hạn hiển thị không hợp lệ', 'Thời điểm kết thúc phải sau thời điểm bắt đầu.');
    setBusy(true);
    try {
      let uploaded: Uploaded[] = [];
      if (picked.length) {
        const files = await Promise.all(
          picked.map(async (uri, i) => {
            const out = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: SaveFormat.JPEG });
            return { uri: out.uri, name: `thong-bao-${Date.now()}-${i}.jpg`, type: 'image/jpeg' };
          }),
        );
        uploaded = (await uploadMultipart<{ data: Uploaded[] }>('/class-notifications/upload/files', { files })).data ?? [];
      }
      const data: ClassNotificationPayload = {
        title: title.trim(),
        // Sửa mà không đổi chữ → giữ HTML gốc của web
        content: item && text.trim() === initialText.trim() ? item.content : text.trim() ? plainToHtml(text) : '',
        attachments: [...kept, ...uploaded].map(({ key, name, type, size }) => ({ key, name, type, size })),
        video_url: video.trim() || undefined,
        visible_from: (from ?? (item ? new Date(item.visible_from) : new Date())).toISOString(),
        visible_until: until ? until.toISOString() : null,
      };
      await manage.save.mutateAsync({ id: item?._id, data });
      onClose();
    } catch (err) {
      showToast('error', item ? 'Chưa lưu được thông báo' : 'Chưa đăng được thông báo', getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="max-h-[92%] rounded-t-3xl bg-surface pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="px-5 pb-1 pt-3 text-[18px] font-extrabold text-foreground">{item ? 'Sửa thông báo' : 'Thông báo mới'}</Text>
          <ScrollView contentContainerClassName="gap-3.5 px-5 pb-2 pt-2" keyboardShouldPersistTaps="handled">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Tiêu đề thông báo"
              placeholderTextColor={muted}
              className="h-12 rounded-2xl border border-border bg-background px-4 text-[16px] font-semibold text-foreground"
            />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Nội dung gửi tới học viên…"
              placeholderTextColor={muted}
              multiline
              textAlignVertical="top"
              className="min-h-[130px] rounded-2xl border border-border bg-background p-4 text-[15px] leading-6 text-foreground"
            />

            {/* Ảnh / tệp */}
            <View className="flex-row flex-wrap gap-2">
              {kept.map((a) => (
                <Thumb key={a.key} uri={a.type?.startsWith('image') ? a.url : undefined} label={a.name} onRemove={() => setKept((k) => k.filter((x) => x.key !== a.key))} />
              ))}
              {picked.map((uri) => (
                <Thumb key={uri} uri={uri} onRemove={() => setPicked((p) => p.filter((x) => x !== uri))} />
              ))}
              <Pressable onPress={pickImages} className="h-20 w-20 items-center justify-center gap-1 rounded-2xl border border-dashed border-border active:opacity-70">
                <Ionicons name="image-outline" size={22} color={brand} />
                <Text className="text-[11px] font-semibold text-brand">Thêm ảnh</Text>
              </Pressable>
            </View>

            <View className="h-12 flex-row items-center gap-2 rounded-2xl border border-border bg-background px-4">
              <Ionicons name="logo-youtube" size={18} color="#ef4444" />
              <TextInput
                value={video}
                onChangeText={setVideo}
                placeholder="Link video YouTube (tuỳ chọn)"
                placeholderTextColor={muted}
                autoCapitalize="none"
                keyboardType="url"
                className="flex-1 text-[15px] text-foreground"
              />
            </View>

            {/* Thời gian hiển thị */}
            <View className="overflow-hidden rounded-2xl bg-surface-muted">
              <TimeRow
                icon="time-outline"
                label="Hẹn giờ đăng"
                hint={from ? `${formatDate(from)} · ${formatTime(from)}` : 'Đăng ngay'}
                on={!!from}
                onSwitch={(v) => (v ? pickDate('from') : setFrom(null))}
                onPress={() => from && pickDate('from')}
              />
              {Platform.OS === 'ios' && iosPick === 'from' && from ? (
                <DateTimePicker value={from} mode="datetime" display="inline" onChange={(_e, d) => d && setFrom(d)} />
              ) : null}
              <View className="h-px bg-border" />
              <TimeRow
                icon="hourglass-outline"
                label="Hạn hiển thị"
                hint={until ? `Đến ${formatDate(until)} · ${formatTime(until)}` : 'Không giới hạn'}
                on={!!until}
                onSwitch={(v) => (v ? pickDate('until') : setUntil(null))}
                onPress={() => until && pickDate('until')}
              />
              {Platform.OS === 'ios' && iosPick === 'until' && until ? (
                <DateTimePicker value={until} mode="datetime" display="inline" onChange={(_e, d) => d && setUntil(d)} />
              ) : null}
            </View>

            <Pressable
              onPress={save}
              disabled={busy}
              className={`h-12 flex-row items-center justify-center gap-2 rounded-2xl ${busy ? 'bg-surface-muted' : 'bg-brand active:opacity-85'}`}>
              <Ionicons name={item ? 'checkmark' : 'megaphone'} size={18} color={busy ? '#9ca3af' : '#fff'} />
              <Text className={`text-[15px] font-bold ${busy ? 'text-muted' : 'text-white'}`}>
                {busy ? 'Đang lưu…' : item ? 'Lưu thay đổi' : from ? 'Hẹn đăng thông báo' : 'Đăng thông báo'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Thumb({ uri, label, onRemove }: { uri?: string; label?: string; onRemove: () => void }) {
  return (
    <View className="h-20 w-20 overflow-hidden rounded-2xl bg-surface-muted">
      {uri ? (
        <Image source={{ uri }} style={{ width: 80, height: 80 }} contentFit="cover" />
      ) : (
        <View className="flex-1 items-center justify-center p-1.5">
          <Ionicons name="document-attach-outline" size={20} color="#6b7280" />
          <Text className="text-center text-[10px] text-muted" numberOfLines={2}>
            {label}
          </Text>
        </View>
      )}
      <Pressable onPress={onRemove} hitSlop={6} className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60">
        <Ionicons name="close" size={14} color="#fff" />
      </Pressable>
    </View>
  );
}

function TimeRow({
  icon,
  label,
  hint,
  on,
  onSwitch,
  onPress,
}: {
  icon: 'time-outline' | 'hourglass-outline';
  label: string;
  hint: string;
  on: boolean;
  onSwitch: (v: boolean) => void;
  onPress: () => void;
}) {
  const brand = useThemeColor('brand');
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 px-4 py-3 active:opacity-80">
      <Ionicons name={icon} size={18} color="#6b7280" />
      <View className="flex-1">
        <Text className="text-[14.5px] font-semibold text-foreground">{label}</Text>
        <Text className={`text-[12.5px] ${on ? 'text-brand' : 'text-muted'}`}>{hint}</Text>
      </View>
      <Switch value={on} onValueChange={onSwitch} trackColor={{ true: brand }} />
    </Pressable>
  );
}
