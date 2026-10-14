import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Alert, BackHandler, FlatList, Keyboard, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { useMediaToken, resolveMediaUrl } from '@/lib/media';
import { useKeyboardHeight } from '@/lib/use-keyboard-height';
import { useThemeColor } from '@/theme/use-theme-color';

import type { RoomMember } from './api';
import { plainContent } from './format';
import { EmojiPanel } from './emoji-panel';
import { activeMentionQuery, encodeMentions, EVERYONE_ID, fold, insertMention, type PickedMention } from './mentions';
import type { ChatMessage } from './types';
import { VoiceRecorderBar, type VoiceClip } from './voice-recorder';

export interface PickedAsset {
  uri: string;
  width?: number;
  height?: number;
  kind: 'image' | 'video';
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string;
  duration?: number | null;
}

export interface PickedDoc {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

interface Props {
  disabledReason?: string | null;
  isDirect: boolean;
  members: RoomMember[];
  myId?: string;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  editing: ChatMessage | null;
  onCancelEdit: () => void;
  onSubmitEdit: (message: ChatMessage, content: string) => void;
  onSendText: (content: string) => void;
  onSendMedia: (assets: PickedAsset[]) => void;
  onSendFiles: (docs: PickedDoc[]) => void;
  onSendVoice: (clip: VoiceClip) => void;
  onTyping: () => void;
  onStopTyping: () => void;
  initialText?: string;
  onTextChange?: (text: string) => void;
  /** Có quyền tạo bình chọn (phòng nhóm) → hiện mục Bình chọn trong bảng đính kèm */
  onCreatePoll?: () => void;
}

/** Tối đa 5 ảnh/lượt — đúng giới hạn FilesInterceptor của /chat/upload-images. */
const MAX_IMAGES = 5;

/** Biểu tượng gửi nhanh ở nút bên phải khi ô nhập trống (Messenger mặc định là 👍) */
const QUICK_EMOJI = '👍';

export function Composer(props: Props) {
  const {
    disabledReason,
    isDirect,
    members,
    myId,
    replyTo,
    onCancelReply,
    editing,
    onCancelEdit,
    onSubmitEdit,
    onSendText,
    onTyping,
    onStopTyping,
    initialText = '',
    onTextChange,
  } = props;
  const [text, setTextState] = useState(initialText);
  // Vị trí con trỏ: chỉ THEO DÕI, không điều khiển ô nhập liên tục — Android điều khiển `selection`
  // mọi lúc làm gõ bị giật/nhảy con trỏ. Chỉ ép vị trí 1 lần khi vừa chèn @tên (forcedSelection).
  const [selection, setSelection] = useState({ start: initialText.length, end: initialText.length });
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [picked, setPicked] = useState<PickedMention[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiPanel, setEmojiPanel] = useState(false);
  const [recording, setRecording] = useState(false);
  const [focused, setFocused] = useState(false);
  // Đang gõ thì thu 3 nút trái thành 1 nút "›" cho ô nhập rộng ra (như Messenger); bấm "›" để mở lại
  const [toolsOpen, setToolsOpen] = useState(false);
  const pickers = useMediaPickers(props.onSendMedia, props.onSendFiles);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const onBrand = useThemeColor('on-brand');
  const inputRef = useRef<TextInput>(null);

  const setText = (v: string) => {
    setTextState(v);
    if (!editing) onTextChange?.(v);
  };

  // Vừa chọn trả lời (vuốt / menu) → mở bàn phím luôn. Bỏ qua lần đầu: nháp còn "đang trả lời"
  // từ lần trước thì vào phòng không tự bật bàn phím.
  const prevReplyId = useRef(replyTo?._id);
  useEffect(() => {
    if (replyTo && replyTo._id !== prevReplyId.current) inputRef.current?.focus();
    prevReplyId.current = replyTo?._id;
  }, [replyTo]);

  // Bắt đầu sửa tin → nạp nội dung cũ (token @[Tên](id) hiện thành @Tên) + nhớ lại các mention.
  const prevEditId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (editing && editing._id !== prevEditId.current) {
      setPicked([...editing.content.matchAll(/@\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => ({ name: m[1], id: m[2] })));
      const t = plainContent(editing.content);
      setTextState(t);
      setSelection({ start: t.length, end: t.length });
      setForcedSelection({ start: t.length, end: t.length });
      inputRef.current?.focus();
    }
    if (!editing && prevEditId.current) setTextState('');
    prevEditId.current = editing?._id;
  }, [editing]);

  // ── Gợi ý @nhắc tên ──
  const mention = useMemo(() => (selection.start === selection.end ? activeMentionQuery(text, selection.start) : null), [text, selection]);
  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = fold(mention.query);
    const list: { _id: string; full_name: string; avatar_url: string | null }[] = members
      .filter((m) => m._id !== myId && fold(m.full_name).includes(q))
      .slice(0, 30);
    // @Everyone: phòng nhóm, khi query rỗng hoặc là tiền tố "everyone"/"all" (giống web)
    if (!isDirect && (q === '' || 'everyone'.startsWith(q) || 'all'.startsWith(q))) {
      list.unshift({ _id: EVERYONE_ID, full_name: 'Everyone', avatar_url: null });
    }
    return list;
  }, [mention, members, myId, isDirect]);

  /**
   * Android: giữ con trỏ khi mở bảng biểu tượng. `showSoftInputOnFocus={false}` làm ô nhập vẫn
   * FOCUS (con trỏ nhấp nháy, chèn đúng chỗ) mà không bật bàn phím. iOS không có prop này nên
   * vẫn phải nhả focus — khác biệt duy nhất giữa 2 nền tảng.
   */
  const keepCaret = Platform.OS === 'android' && emojiPanel;
  // Đang trong lúc đổi bàn phím ↔ bảng: bỏ qua sự kiện bàn phím, không thì cú `blur/focus` bên
  // dưới tự đóng mất bảng vừa mở.
  const switching = useRef(false);

  // Bàn phím bật lên (bấm vào ô nhập, chọn trả lời, bắt đầu sửa tin…) thì bảng biểu tượng phải
  // nhường chỗ — không thì hai thứ chồng nhau, ô nhập bị đẩy vọt lên giữa màn hình.
  useEffect(() => {
    const sub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      if (!switching.current) setEmojiPanel(false);
    });
    return () => sub.remove();
  }, []);

  // Android: nút Back khi đang mở bảng = đóng bảng (như đóng bàn phím), chưa thoát phòng.
  useEffect(() => {
    if (!emojiPanel) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEmojiPanel(false);
      return true;
    });
    return () => sub.remove();
  }, [emojiPanel]);

  /**
   * Bật lại bàn phím. Trên Android ô nhập ĐANG focus sẵn (keepCaret) nên gọi `focus()` không ăn
   * thua — RN thấy đã focus rồi là bỏ qua, bàn phím không lên. Phải nhả rồi bắt lại focus,
   * lúc này `showSoftInputOnFocus` đã về true nên bàn phím mới chịu hiện.
   */
  const showKeyboard = () => {
    setEmojiPanel(false);
    switching.current = true;
    requestAnimationFrame(() => {
      inputRef.current?.blur();
      inputRef.current?.focus();
      setTimeout(() => (switching.current = false), 400);
    });
  };

  const toggleEmojiPanel = () => {
    if (emojiPanel) {
      showKeyboard();
      return;
    }
    // Mở bảng TRƯỚC rồi mới hạ bàn phím: lúc bàn phím trượt xuống thì bảng đã nằm sẵn ở đó.
    setEmojiPanel(true);
    if (Platform.OS !== 'android') {
      Keyboard.dismiss();
      return;
    }
    // Android: `showSoftInputOnFocus={false}` chỉ CHẶN bàn phím lúc focus, không ẩn bàn phím đang
    // mở; còn `Keyboard.dismiss()` thì nhả luôn focus (mất con trỏ). Nên nhả rồi bắt lại focus:
    // blur hạ bàn phím, focus lại lấy con trỏ về mà bàn phím không bật nữa. Đợi 1 khung hình cho
    // prop kịp xuống native, không thì focus lại gặp prop cũ và bàn phím bật lên ngay.
    switching.current = true;
    requestAnimationFrame(() => {
      inputRef.current?.blur();
      inputRef.current?.focus();
      setTimeout(() => (switching.current = false), 400);
    });
  };

  /** Chèn biểu tượng tại vị trí con trỏ (không gửi) — cùng cách làm với chèn @nhắc tên. */
  const insertEmoji = (emoji: string) => {
    const start = Math.min(selection.start, text.length);
    const end = Math.min(selection.end, text.length);
    const next = text.slice(0, start) + emoji + text.slice(end);
    const cursor = start + emoji.length;
    setText(next);
    setSelection({ start: cursor, end: cursor });
    setForcedSelection({ start: cursor, end: cursor });
    onTyping();
  };

  /**
   * Xoá lùi 1 ký tự. Phải cắt theo ĐƠN VỊ HIỂN THỊ chứ không theo ký tự JS: emoji là cặp surrogate
   * (2 ô), nhiều emoji còn ghép bằng ZWJ (👨‍👩‍👧 = 8 ô) — cắt 1 ô là ra ký tự rác.
   */
  const backspace = () => {
    const end = Math.min(selection.end, text.length);
    if (!end) return;
    // `[...chu\u1ed7i]` t\u00e1ch theo \u0110I\u1ec2M M\u00c3 (emoji th\u00e0nh 1 ph\u1ea7n t\u1eed), r\u1ed3i gom n\u1ed1t c\u00e1c ph\u1ea7n ph\u1ee5 c\u1ee7a c\u1ee5m:
    // d\u1ea5u n\u1ed1i ZWJ (\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67), m\u00e0u da (\ud83d\udc4d\ud83c\udffd), bi\u1ebfn th\u1ec3 hi\u1ec3n th\u1ecb FE0F (\u2764\ufe0f).
    const head = [...text.slice(0, end)];
    let cut = 1;
    while (cut < head.length) {
      const last = head[head.length - cut];
      const prev = head[head.length - cut - 1];
      if (prev === '\u200d') cut += 2; // ZWJ n\u1ed1i v\u1edbi m\u1ea3nh tr\u01b0\u1edbc n\u00f3
      else if (last === '\ufe0f' || /[\u{1f3fb}-\u{1f3ff}]/u.test(last)) cut += 1; // l\u1ea5y lu\u00f4n k\u00fd t\u1ef1 g\u1ed1c
      else break;
    }
    const removed = head.slice(Math.max(0, head.length - cut)).join('');
    const next = text.slice(0, end - removed.length) + text.slice(end);
    const cursor = end - removed.length;
    setText(next);
    setSelection({ start: cursor, end: cursor });
    setForcedSelection({ start: cursor, end: cursor });
  };

  const pickMention = (m: { _id: string; full_name: string }) => {
    if (!mention) return;
    const next = insertMention(text, mention.start, selection.start, m.full_name);
    setText(next.text);
    setSelection({ start: next.cursor, end: next.cursor });
    setForcedSelection({ start: next.cursor, end: next.cursor });
    setPicked((p) => [...p, { id: m._id, name: m.full_name }]);
  };

  if (disabledReason) {
    return (
      <View className="flex-row items-center justify-center gap-2 border-t border-border bg-surface px-4 py-4">
        <Ionicons name="lock-closed" size={16} color={muted} />
        <Text className="text-sm text-muted">{disabledReason}</Text>
      </View>
    );
  }

  if (recording) {
    return (
      <View className="border-t border-border bg-surface">
        <VoiceRecorderBar
          onCancel={() => setRecording(false)}
          onSend={(clip) => {
            setRecording(false);
            props.onSendVoice(clip);
          }}
        />
      </View>
    );
  }

  const submit = () => {
    const value = encodeMentions(text.trim(), picked);
    if (!value) return;
    if (editing) onSubmitEdit(editing, value);
    else onSendText(value);
    setText('');
    setPicked([]);
    onStopTyping();
  };

  const hasText = text.trim().length > 0;

  return (
    <View className="border-t border-border bg-surface">
      {suggestions.length ? <MentionList items={suggestions} onPick={pickMention} /> : null}

      {editing ? (
        <ContextBar icon="create-outline" title="Đang sửa tin nhắn" body={plainContent(editing.content)} onClose={onCancelEdit} />
      ) : replyTo ? (
        <ContextBar
          icon="arrow-undo-outline"
          title={`Trả lời ${replyTo.sender?.full_name}`}
          body={replyTo.message_type === 'image' ? '[Hình ảnh]' : plainContent(replyTo.content)}
          onClose={onCancelReply}
        />
      ) : null}

      <View className="flex-row items-end gap-1 px-2.5 pb-2 pt-2">
        {!editing ? (
          hasText && !toolsOpen ? (
            <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(80)}>
              <Pressable
                hitSlop={6}
                onPress={() => setToolsOpen(true)}
                className="h-[42px] w-9 items-center justify-center"
                accessibilityLabel="Hiện công cụ">
                <Ionicons name="chevron-forward" size={24} color={brand} />
              </Pressable>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(80)} className="flex-row">
              <ToolButton icon="add-circle" label="Đính kèm" color={brand} size={25} onPress={() => setAttachOpen(true)} />
              <ToolButton icon="camera" label="Chụp ảnh" color={brand} onPress={() => void pickers.camera(false)} />
              <ToolButton icon="image" label="Ảnh / video" color={brand} onPress={() => void pickers.library()} />
              <ToolButton icon="mic" label="Ghi âm tin thoại" color={brand} onPress={() => setRecording(true)} />
            </Animated.View>
          )
        ) : null}
        <View
          className={`flex-1 flex-row items-end rounded-[22px] border bg-surface-muted ${focused ? 'border-border' : 'border-transparent'}`}>
          <TextInput
            ref={inputRef}
            value={text}
            selection={forcedSelection}
            onSelectionChange={(e) => {
              setSelection(e.nativeEvent.selection);
              if (forcedSelection) setForcedSelection(undefined);
            }}
            onChangeText={(v) => {
              setText(v);
              setToolsOpen(false);
              if (v) onTyping();
              else onStopTyping();
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            showSoftInputOnFocus={!keepCaret}
            onPressIn={() => {
              // Đang mở bảng mà bấm vào ô nhập = muốn gõ chữ tiếp (bấm thường thì KHÔNG đụng vào,
              // không thì mỗi lần chạm ô nhập lại nhả/bắt focus, con trỏ nhảy lung tung).
              if (emojiPanel) showKeyboard();
            }}
            placeholder={editing ? 'Sửa tin nhắn…' : 'Nhập tin nhắn…'}
            placeholderTextColor={muted}
            multiline
            textAlignVertical="center"
            className="max-h-32 min-h-[42px] flex-1 py-2.5 pl-4 pr-1 text-[15px] leading-5 text-foreground"
          />
          <Pressable
            onPress={toggleEmojiPanel}
            hitSlop={6}
            accessibilityLabel={emojiPanel ? 'Hiện bàn phím' : 'Chèn biểu tượng'}
            className="h-[42px] w-9 items-center justify-center">
            <Ionicons name={emojiPanel ? 'keypad-outline' : 'happy-outline'} size={22} color={emojiPanel ? brand : muted} />
          </Pressable>
        </View>
        {hasText || editing ? (
          <Animated.View key="send" entering={ZoomIn.duration(140)} exiting={ZoomOut.duration(90)}>
            <Pressable
              onPress={submit}
              disabled={!hasText}
              accessibilityLabel={editing ? 'Lưu' : 'Gửi'}
              className={`h-[42px] w-[42px] items-center justify-center rounded-full active:opacity-80 ${hasText ? 'bg-brand' : 'bg-surface-muted'}`}>
              <Ionicons
                name={editing ? 'checkmark' : 'send'}
                size={18}
                color={hasText ? onBrand : muted}
                style={editing ? undefined : { marginLeft: 3 }}
              />
            </Pressable>
          </Animated.View>
        ) : (
          // Ô trống → 👍 gửi nhanh 1 chạm như Messenger. Chèn biểu tượng vào chữ thì dùng nút mặt
          // cười trong ô nhập (mở bảng emoji ngay chỗ bàn phím).
          <Animated.View key="like" entering={ZoomIn.duration(140)} exiting={ZoomOut.duration(90)}>
            <Pressable
              hitSlop={4}
              onPress={() => {
                void Haptics.selectionAsync();
                onSendText(QUICK_EMOJI);
              }}
              accessibilityLabel="Gửi biểu tượng thích"
              className="h-[42px] w-10 items-center justify-center active:scale-90">
              <Ionicons name="thumbs-up" size={25} color={brand} />
            </Pressable>
          </Animated.View>
        )}
      </View>

      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onMedia={props.onSendMedia}
        onFiles={props.onSendFiles}
        onPoll={props.onCreatePoll}
      />
      {emojiPanel ? (
        // Chiều cao = bàn phím trừ vùng an toàn đáy (màn cha đã chừa `insets.bottom` khi bàn phím
        // đóng) → tổng chỗ chiếm bằng đúng lúc bàn phím mở, ô soạn tin không nhảy.
        <EmojiPanel height={Math.max(220, keyboardHeight - insets.bottom)} onPick={insertEmoji} onBackspace={backspace} />
      ) : null}
    </View>
  );
}

function ContextBar({
  icon,
  title,
  body,
  onClose,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  onClose: () => void;
}) {
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  return (
    <Animated.View entering={FadeIn.duration(150)} className="px-3 pt-2">
      <View className="flex-row items-center gap-2.5 overflow-hidden rounded-xl bg-surface-muted py-2 pl-3 pr-2">
        <View className="absolute bottom-0 left-0 top-0 w-1 bg-brand" />
        <Ionicons name={icon} size={17} color={brand} />
        <View className="flex-1">
          <Text className="text-[12.5px] font-semibold text-brand" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-[12.5px] text-muted" numberOfLines={1}>
            {body}
          </Text>
        </View>
        <Pressable
          hitSlop={8}
          onPress={onClose}
          accessibilityLabel="Huỷ"
          className="h-7 w-7 items-center justify-center rounded-full active:bg-surface">
          <Ionicons name="close" size={18} color={muted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function ToolButton({
  icon,
  label,
  color,
  size = 24,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  size?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      hitSlop={4}
      onPress={onPress}
      accessibilityLabel={label}
      className="h-[42px] w-9 items-center justify-center rounded-full active:opacity-60">
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const toAssets = (res: ImagePicker.ImagePickerResult): PickedAsset[] =>
  res.canceled
    ? []
    : res.assets.map((a) => ({
        uri: a.uri,
        width: a.width,
        height: a.height,
        kind: a.type === 'video' ? 'video' : 'image',
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        duration: a.duration,
      }));

/** Mở thư viện ảnh / camera / chọn tệp — dùng chung cho nút nhanh và bảng đính kèm. */
function useMediaPickers(onMedia: (assets: PickedAsset[]) => void, onFiles: (docs: PickedDoc[]) => void) {
  return {
    library: async () => {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES,
        quality: 1,
      });
      const assets = toAssets(res);
      if (assets.length) onMedia(assets);
    },
    camera: async (video: boolean) => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Chưa có quyền camera', 'Vào Cài đặt → Uspeak Class để bật quyền camera.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: [video ? 'videos' : 'images'], quality: 1, videoMaxDuration: 300 });
      const assets = toAssets(res);
      if (assets.length) onMedia(assets);
    },
    files: async () => {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (!res.canceled && res.assets.length) {
        onFiles(res.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size, mimeType: a.mimeType })));
      }
    },
  };
}

function MentionList({
  items,
  onPick,
}: {
  items: { _id: string; full_name: string; avatar_url: string | null }[];
  onPick: (m: { _id: string; full_name: string }) => void;
}) {
  const { data: token } = useMediaToken();
  const brand = useThemeColor('brand');
  return (
    <View className="mx-2 mt-2 max-h-56 overflow-hidden rounded-2xl border border-border bg-surface">
      <FlatList
        data={items}
        keyboardShouldPersistTaps="always"
        keyExtractor={(m) => m._id}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPick(item)} className="flex-row items-center gap-3 px-4 py-2 active:bg-surface-muted">
            {item._id === EVERYONE_ID ? (
              <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-soft">
                <Ionicons name="people" size={16} color={brand} />
              </View>
            ) : (
              <Avatar name={item.full_name} uri={resolveMediaUrl(item.avatar_url, token?.media_token)} size={32} />
            )}
            <View className="flex-1">
              <Text className="text-base text-foreground">{item.full_name}</Text>
              {item._id === EVERYONE_ID ? <Text className="text-xs text-muted">Nhắc tất cả thành viên phòng</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

/** Bảng chọn đính kèm: ảnh/video từ thư viện, chụp ảnh, quay video, tệp. */
function AttachSheet({
  visible,
  onClose,
  onMedia,
  onFiles,
  onPoll,
}: {
  visible: boolean;
  onClose: () => void;
  onMedia: (assets: PickedAsset[]) => void;
  onFiles: (docs: PickedDoc[]) => void;
  onPoll?: () => void;
}) {
  const insets = useSafeAreaInsets();

  const pickers = useMediaPickers(onMedia, onFiles);
  const run = (fn: () => Promise<void>) => () => {
    onClose();
    // Đợi bảng đóng hẳn rồi mới mở picker hệ thống (iOS không mở được 2 modal chồng nhau)
    setTimeout(() => void fn(), 350);
  };
  const library = run(pickers.library);
  const camera = (video: boolean) => run(() => pickers.camera(video));
  const files = run(pickers.files);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View
        className="flex-row flex-wrap justify-around gap-y-4 rounded-t-3xl bg-surface px-4 pt-5"
        style={{ paddingBottom: insets.bottom + 16 }}>
        <AttachItem icon="images" label="Ảnh / Video" tone="bg-info" onPress={library} />
        <AttachItem icon="camera" label="Chụp ảnh" tone="bg-brand" onPress={camera(false)} />
        <AttachItem icon="videocam" label="Quay video" tone="bg-violet" onPress={camera(true)} />
        <AttachItem icon="document-attach" label="Tệp" tone="bg-success" onPress={files} />
        {onPoll ? <AttachItem icon="stats-chart" label="Bình chọn" tone="bg-warning" onPress={run(async () => onPoll())} /> : null}
      </View>
    </Modal>
  );
}

function AttachItem({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  tone: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="w-20 items-center gap-2 active:opacity-70">
      <View className={`h-14 w-14 items-center justify-center rounded-2xl ${tone}`}>
        <Ionicons name={icon} size={26} color="#fff" />
      </View>
      <Text className="text-xs text-foreground">{label}</Text>
    </Pressable>
  );
}
