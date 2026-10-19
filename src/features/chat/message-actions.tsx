import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/theme/use-theme-color';

import type { ChatPermissions } from './api';
import { plainContent } from './format';
import type { ChatMessage } from './types';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/** Loại tin chuyển tiếp được — khớp FORWARDABLE_TYPES của class-be chat.service.ts */
const FORWARDABLE = new Set(['text', 'image', 'video', 'file', 'sticker', 'voice']);

interface Props {
  message: ChatMessage | null;
  myId?: string;
  permissions?: ChatPermissions;
  onClose: () => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onPin: (m: ChatMessage, pinned: boolean) => void;
  onForward: (m: ChatMessage) => void;
  onRecall: (m: ChatMessage) => void;
}

/**
 * Menu nhấn giữ: hàng cảm xúc nhanh + các thao tác. Thao tác nào hiện là theo quyền của phòng
 * (settings.my_permissions) — server vẫn kiểm lại, ẩn ở đây chỉ để khỏi bấm vào rồi báo lỗi.
 */
export function MessageActions({ message, myId, permissions, onClose, onReact, onReply, onEdit, onPin, onForward, onRecall }: Props) {
  const insets = useSafeAreaInsets();
  if (!message) return null;
  const mine = message.sender?._id === myId;
  const hasText = !!message.content && ['text', 'announcement', 'class_reminder'].includes(message.message_type);
  const mineReacted = message.reactions?.find((r) => r.user_id === myId)?.emoji;
  const canRecall = mine ? permissions?.can_recall_own_message !== false : !!permissions?.can_recall_others_message;

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const actions: ActionDef[] = [
    { key: 'reply', icon: 'arrow-undo', label: 'Trả lời', onPress: () => onReply(message) },
    ...(hasText
      ? [
          {
            key: 'copy',
            icon: 'copy',
            label: 'Sao chép',
            onPress: () => void Clipboard.setStringAsync(plainContent(message.content)),
          } as ActionDef,
        ]
      : []),
    ...(FORWARDABLE.has(message.message_type)
      ? [{ key: 'forward', icon: 'arrow-redo', label: 'Chuyển tiếp', onPress: () => onForward(message) } as ActionDef]
      : []),
    ...(mine && message.message_type === 'text'
      ? [{ key: 'edit', icon: 'create', label: 'Sửa', onPress: () => onEdit(message) } as ActionDef]
      : []),
    ...(permissions?.can_pin_message
      ? [
          {
            key: 'pin',
            icon: 'pushpin',
            label: message.is_pinned ? 'Bỏ ghim' : 'Ghim',
            onPress: () => onPin(message, !message.is_pinned),
          } as ActionDef,
        ]
      : []),
    ...(canRecall ? [{ key: 'recall', icon: 'trash', label: 'Thu hồi', danger: true, onPress: () => onRecall(message) } as ActionDef] : []),
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Nền tối phủ CẢ màn (kể cả dải sau hàng cảm xúc), bấm ra ngoài là đóng */}
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Đóng" />
        {/* Hàng cảm xúc nổi phía trên tấm thao tác — kiểu Messenger */}
        <View className="items-center px-4 pb-3" pointerEvents="box-none">
          <View className="flex-row gap-0.5 rounded-full bg-surface px-2 py-1.5" style={SHADOW}>
            {QUICK_REACTIONS.map((e) => (
              <Pressable
                key={e}
                accessibilityLabel={`Bày tỏ ${e}`}
                onPress={run(() => {
                  void Haptics.selectionAsync();
                  onReact(message, e);
                })}
                className={`h-12 w-12 items-center justify-center rounded-full active:scale-110 ${mineReacted === e ? 'bg-brand-soft' : ''}`}>
                <Text className="text-[28px]">{e}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="gap-4 rounded-t-3xl bg-surface px-4 pt-2.5" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <View className="flex-row items-center gap-2.5 rounded-2xl bg-surface-muted px-3.5 py-2.5">
            <View className="h-8 w-1 rounded-full bg-brand" />
            <View className="flex-1">
              <Text className="text-[12px] font-bold text-foreground">{message.sender?.full_name}</Text>
              <Text className="text-[13px] text-muted" numberOfLines={2}>
                {preview(message)}
              </Text>
            </View>
          </View>

          <View className={`flex-row flex-wrap ${actions.length < 4 ? 'justify-center' : ''}`}>
            {actions.map((a) => (
              <ActionTile key={a.key} action={a} onPress={run(a.onPress)} />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

type ActionDef = {
  key: string;
  icon: AppIconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
};

const SHADOW = { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 };

function preview(m: ChatMessage) {
  switch (m.message_type) {
    case 'image':
      return '[Hình ảnh]';
    case 'video':
      return '[Video]';
    case 'voice':
      return '[Tin nhắn thoại]';
    case 'sticker':
      return '[Nhãn dán]';
    case 'file':
      return `[Tệp] ${m.file_name ?? ''}`;
    default:
      return plainContent(m.content);
  }
}

/** Ô thao tác: icon trong vòng tròn + nhãn — 4 ô một hàng, gọn hơn danh sách dọc. */
function ActionTile({ action, onPress }: { action: ActionDef; onPress: () => void }) {
  const color = useThemeColor(action.danger ? 'danger' : 'foreground');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="w-1/4 items-center gap-1.5 py-2 active:opacity-60">
      <View
        className={`h-[52px] w-[52px] items-center justify-center rounded-full ${action.danger ? 'bg-danger-soft' : 'bg-surface-muted'}`}>
        <AppIcon name={action.icon} size={22} color={color} />
      </View>
      <Text className={`text-[12.5px] font-medium ${action.danger ? 'text-danger' : 'text-foreground'}`} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
}
