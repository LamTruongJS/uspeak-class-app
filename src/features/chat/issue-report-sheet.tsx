import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { showToast } from '@/components/ui/toast';
import { formatDate, formatTime } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

import { chatApi } from './api';
import { plainContent } from './format';
import type { ChatMessage } from './types';

type IssueType = 'BUG' | 'FEEDBACK' | 'FEATURE' | 'OTHER';

/** Thứ tự + nhãn y như TYPE_OPTIONS của web (ChatIssueReportModal.tsx). */
const TYPES: { value: IssueType; label: string }[] = [
  { value: 'BUG', label: 'Báo lỗi' },
  { value: 'FEEDBACK', label: 'Góp ý' },
  { value: 'FEATURE', label: 'Đề xuất tính năng' },
  { value: 'OTHER', label: 'Khác' },
];

const MAX_IMAGES = 10;

interface PickedImage {
  uri: string;
  width?: number;
  height?: number;
}

function describeMessage(m: ChatMessage): string {
  const text = (m.content || '').trim();
  switch (m.message_type) {
    case 'image':
      return text && !/^https?:\/\//.test(text) ? `[Hình ảnh] ${plainContent(text)}` : '[Hình ảnh]';
    case 'video':
      return '[Video]';
    case 'file':
      return `[Tệp đính kèm] ${m.file_name || ''}`.trim();
    case 'voice':
      return '[Tin nhắn thoại]';
    case 'sticker':
      return '[Nhãn dán]';
    default:
      return plainContent(text);
  }
}

/** Nội dung mặc định giống web: "[dd/MM/yyyy HH:mm] Tên: nội dung" — người báo cáo sửa tiếp được. */
function defaultContent(m: ChatMessage): string {
  const sender = m.sender?.full_name || 'Học viên';
  const time = m.created_at ? `[${formatDate(m.created_at)} ${formatTime(m.created_at)}] ` : '';
  return `${time}${sender}: ${describeMessage(m)}`;
}

/**
 * Báo cáo vấn đề từ 1 tin nhắn — bản mobile của ChatIssueReportModal (web). Gửi
 * `POST /chat/rooms/:roomId/issue-reports` (multipart). Web cũng chỉ báo cáo đúng tin đang chọn.
 * Gắn `key={message._id}` ở chỗ dùng để mỗi tin mở ra là state mới (nội dung mặc định theo tin đó).
 */
export function IssueReportSheet({ roomId, message, onClose }: { roomId: string; message: ChatMessage | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const [type, setType] = useState<IssueType>('BUG');
  const [content, setContent] = useState(() => (message ? defaultContent(message) : ''));
  const [images, setImages] = useState<PickedImage[]>([]);
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (!saving) onClose();
  };

  async function pickImages() {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 1, // nén lại thành JPEG lúc gửi (chatApi.reportIssue)
    });
    if (res.canceled || !res.assets?.length) return;
    if (res.assets.length > room) showToast('warning', `Tối đa ${MAX_IMAGES} ảnh`);
    setImages((list) => [...list, ...res.assets.slice(0, room).map((a) => ({ uri: a.uri, width: a.width, height: a.height }))]);
  }

  async function submit() {
    const text = content.trim();
    if (!message || !text || saving) return;
    setSaving(true);
    try {
      await chatApi.reportIssue({
        roomId,
        messageIds: [message._id],
        message: text,
        type,
        images,
        browser: `Uspeak Class App · ${Platform.OS} ${Platform.Version}`,
      });
      showToast('success', 'Đã lưu báo cáo', 'Quản trị viên sẽ xem và xử lý vấn đề này.');
      onClose();
    } catch (err) {
      // Giữ sheet mở để sửa rồi gửi lại.
      showToast('error', 'Chưa gửi được báo cáo', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={!!message} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoider modal className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Pressable onPress={close} hitSlop={8} disabled={saving}>
            <Text className="text-base text-brand">Huỷ</Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">Báo cáo vấn đề</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerClassName="gap-5 p-4" keyboardShouldPersistTaps="handled">
          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Người gửi tin</Text>
            <View className="rounded-xl bg-surface-muted px-3.5 py-3">
              <Text className="text-base text-muted">{message?.sender?.full_name || '—'}</Text>
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Phân loại</Text>
            <View className="flex-row flex-wrap gap-2">
              {TYPES.map((t) => {
                const on = t.value === type;
                return (
                  <Pressable
                    key={t.value}
                    onPress={() => setType(t.value)}
                    disabled={saving}
                    className={`rounded-full border px-3.5 py-2 ${on ? 'border-brand bg-brand' : 'border-border bg-surface'}`}>
                    <Text className={`text-[13px] font-semibold ${on ? 'text-on-brand' : 'text-foreground'}`}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Nội dung</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              editable={!saving}
              placeholder="Mô tả vấn đề học viên gặp phải..."
              placeholderTextColor={muted}
              multiline
              maxLength={5000}
              textAlignVertical="top"
              className="min-h-[120px] rounded-xl border border-border bg-surface p-3.5 text-base text-foreground"
            />
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">
              Ảnh đính kèm <Text className="font-normal text-muted">(tuỳ chọn, tối đa {MAX_IMAGES})</Text>
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {images.map((img, i) => (
                <View key={`${img.uri}-${i}`} className="h-20 w-20 overflow-hidden rounded-xl bg-surface-muted">
                  <Image source={{ uri: img.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  {!saving ? (
                    <Pressable
                      onPress={() => setImages((list) => list.filter((_, j) => j !== i))}
                      hitSlop={6}
                      accessibilityLabel="Bỏ ảnh"
                      className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60">
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {images.length < MAX_IMAGES ? (
                <Pressable
                  onPress={() => void pickImages()}
                  disabled={saving}
                  accessibilityLabel="Thêm ảnh"
                  className="h-20 w-20 items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface active:opacity-70">
                  <Ionicons name="image-outline" size={20} color={muted} />
                  <Text className="text-xs text-muted">Thêm ảnh</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>

        <View className="px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button title="Lưu báo cáo" icon="flag" disabled={!content.trim()} loading={saving} onPress={() => void submit()} />
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}
