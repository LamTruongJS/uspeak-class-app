import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ActivityIndicator, AppState, Keyboard, Platform, Pressable, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { activeRoom } from '@/features/chat/active-room';
import { chatApi, patchRoom, trimRoomMessages, upsertMessage, useChatPermissions, useChatRoom, useRoomMembers, useRoomMessages } from '@/features/chat/api';
import { Composer, type PickedAsset, type PickedDoc } from '@/features/chat/composer';
import { getDraft, saveDraft } from '@/features/chat/drafts';
import { roomTitle } from '@/features/chat/format';
import { CreatePollSheet } from '@/features/chat/create-poll';
import { ForwardSheet } from '@/features/chat/forward-sheet';
import { MessageActions } from '@/features/chat/message-actions';
import { MessageItem } from '@/features/chat/message-item';
import { MessageSearchSheet } from '@/features/chat/message-search';
import { RoomAvatar } from '@/features/chat/room-avatar';
import { takeRoomIntent } from '@/features/chat/room-intent';
import { makeVideoPoster } from '@/features/chat/video-poster';
import { PinnedBar } from '@/features/chat/pinned-bar';
import { emitWithAck, getChatSocket } from '@/features/chat/socket';
import type { ChatMessage, ChatMessageImage } from '@/features/chat/types';
import type { VoiceClip } from '@/features/chat/voice-recorder';
import { getErrorMessage } from '@/lib/api/client';
import { UploadAbortedError, type UploadOptions } from '@/lib/api/upload';
import { useMediaToken } from '@/lib/media';
import { useStableCallback } from '@/lib/use-stable-callback';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

const IMAGE_CONTENT = '[Hình ảnh]';
const TYPING_THROTTLE_MS = 2500;
const TYPING_TTL_MS = 5000;
/** Cuộn lên quá ngưỡng này (px) thì coi như đang đọc tin cũ → hiện nút "Tin mới". */
const SCROLLED_UP_PX = 300;
/** Nhảy tới tin cũ: tải thêm tối đa chừng này trang (40 tin/trang) trước khi bỏ cuộc. */
const JUMP_MAX_PAGES = 15;
/** Kết quả tìm kiếm có thể cũ hơn nhiều (người dùng chủ động bấm) → cho tải sâu hơn (~2000 tin). */
const JUMP_SEARCH_MAX_PAGES = 50;
/** Phòng lớn server không gửi read receipt (C3 trong chat.gateway) — khỏi hỏi. */
const RECEIPT_MAX_MEMBERS = 50;

/**
 * Phòng chat — viết theo cách app native (xem lịch sử review trong memory class-mobile-app):
 * đang xem = focus + foreground; gửi lúc rớt mạng thì chờ nối lại; lỗi hiện trên bong bóng.
 * Tính năng: chữ (@nhắc tên), ảnh/album, video, tệp, tin thoại, trả lời (vuốt/menu), sửa, ghim,
 * chuyển tiếp, thu hồi, cảm xúc, nhảy tới tin gốc/tin ghim/kết quả tìm, "đang nhập…", đã xem, nháp theo phòng.
 */
export default function ChatRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const insets = useSafeAreaInsets();
  const brand = useThemeColor('brand');
  const onBrand = useThemeColor('on-brand');
  const foreground = useThemeColor('foreground');
  const user = useAuthStore((s) => s.user);
  const myId = user?._id;

  const { data: room } = useChatRoom(roomId);
  const permissions = useChatPermissions(roomId);
  const members = useRoomMembers(roomId);
  const messages = useRoomMessages(roomId);

  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyToState] = useState<ChatMessage | null>(() => getDraft(roomId).replyTo);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [actionFor, setActionFor] = useState<ChatMessage | null>(null);
  const [forwardFor, setForwardFor] = useState<ChatMessage | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const sheet = useActionSheet();
  const [searchOpen, setSearchOpen] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [readCursors, setReadCursors] = useState<Record<string, string>>({});
  // Số tin chưa đọc LÚC MỞ phòng (chụp trước khi markRead đưa về 0) → kẻ vạch "Tin chưa đọc".
  const [openUnread] = useState(() => room?.unread_count ?? 0);
  const [divider, setDivider] = useState<string | null>(null);
  const lastTypingEmit = useRef(0);
  const viewing = useRef(false);
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  const setReplyTo = (m: ChatMessage | null) => {
    setReplyToState(m);
    saveDraft(roomId, { replyTo: m });
    if (m) setEditing(null);
  };

  // ── Danh sách hiển thị: tin tạm (đang gửi) + tin server, mới nhất trước (FlatList inverted) ──
  const server = useMemo(() => messages.data?.pages.flatMap((p) => p.data) ?? [], [messages.data]);
  const data = useMemo(() => {
    // Mỗi tin server chỉ "khớp" được 1 tin tạm, và phải mới hơn mốc lúc tạo tin tạm (ObjectId tăng
    // theo thời gian) → tin tạm bị server dội lại qua new_message trước ack sẽ ẩn, gõ "ok" 2 lần không bị ẩn nhầm.
    const used = new Set<string>();
    const echoed = (p: ChatMessage) => {
      const hit = server.find(
        (s) =>
          !used.has(s._id) &&
          s._id > (p.echo_after ?? '') &&
          s.sender?._id === p.sender._id &&
          s.message_type === p.message_type &&
          (p.message_type !== 'text' || s.content === p.content),
      );
      if (hit) used.add(hit._id);
      return !!hit;
    };
    const keep = new Set(
      [...pending]
        .reverse()
        .filter((p) => p.failed || !echoed(p))
        .map((p) => p._id),
    );
    return [...pending.filter((p) => keep.has(p._id)), ...server];
  }, [server, pending]);
  const newestServerId = server[0]?._id;
  /**
   * FlashList v2 không có `inverted` → danh sách hiển thị theo thời gian (CŨ → MỚI, tin mới nhất ở cuối),
   * bắt đầu vẽ từ đáy (`startRenderingFromBottom`), cuộn lên đầu thì tải trang cũ hơn (`onStartReached`).
   * `data` (mới → cũ) vẫn giữ cho các chỗ tìm tin / đếm chưa đọc.
   */
  const listData = useMemo(() => [...data].reverse(), [data]);
  // Bản mới nhất của danh sách cho các lần cuộn chạy sau setTimeout (closure cũ giữ danh sách cũ → sai index)
  const listDataRef = useRef(listData);
  useEffect(() => {
    listDataRef.current = listData;
  }, [listData]);

  /**
   * Cuộn tới 1 tin cho TRÚNG (tin ghim, trích dẫn, vạch chưa đọc, kết quả tìm).
   *
   * `scrollToIndex` của FlashList v2 tự đi nhiều chặng tới tin chưa đo (vẽ + đo dần rồi chỉnh), nên chỉ cần
   * gọi 1 lần rồi chỉnh thêm 2 lần sau đó vì ảnh tải xong làm đổi chiều cao. Người dùng tự cuộn trong lúc
   * đó thì thôi chỉnh (`jumpToken` bị xoá ở onScrollBeginDrag) — không giật màn hình khỏi tay họ.
   */
  const jumpToken = useRef<string | null>(null);
  const [seeking, setSeeking] = useState(false);
  const indexOf = (id: string) => listDataRef.current.findIndex((m) => m._id === id);
  const scrollToMessage = async (messageId: string, highlight = false) => {
    const token = messageId + ':' + Date.now();
    jumpToken.current = token;
    setSeeking(true);
    // Đợi 1 nhịp để FlashList nhận danh sách mới (trường hợp vừa tải thêm trang cũ)
    await new Promise((r) => setTimeout(r, 30));
    const index = indexOf(messageId);
    if (index >= 0) await listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
    setSeeking(false);
    if (index < 0 || jumpToken.current !== token) return;
    // Tô sáng lúc ĐÃ tới nơi
    if (highlight) {
      setHighlightId(messageId);
      setTimeout(() => setHighlightId((h) => (h === messageId ? null : h)), 2600);
    }
    [250, 700].forEach((delay) =>
      setTimeout(() => {
        if (jumpToken.current !== token) return;
        const i = indexOf(messageId);
        if (i >= 0) void listRef.current?.scrollToIndex({ index: i, viewPosition: 0.5, animated: false });
      }, delay),
    );
    setTimeout(() => {
      if (jumpToken.current === token) jumpToken.current = null;
    }, 800);
  };

  // ── Vạch "N tin chưa đọc": tin chưa đọc cũ nhất (đếm như server: tin người khác, bỏ tin hệ thống) ──
  const dividerDone = useRef(false);
  useEffect(() => {
    if (dividerDone.current || !openUnread || !messages.data) return;
    dividerDone.current = true;
    let counted = 0;
    let index = -1;
    for (let i = 0; i < server.length && counted < openUnread; i++) {
      if (server[i].sender?._id !== myId && server[i].message_type !== 'system') {
        counted += 1;
        index = i;
      }
    }
    if (index < 0) return;
    setDivider(server[index]._id);
    if (index > 6) void scrollToMessage(server[index]._id);
    // chỉ chạy 1 lần lúc mở phòng (dividerDone) — scrollToMessage đọc ref nên không cần là dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.data, server, openUnread, myId]);

  // ── Đang xem phòng = focus + foreground ──
  const markRead = useCallback(() => {
    if (!newestServerId || !viewing.current) return;
    getChatSocket()?.emit('mark_read', { room_id: roomId, message_id: newestServerId });
    patchRoom(roomId, (r) => ({ ...r, unread_count: 0, has_unread_mention: false }));
  }, [newestServerId, roomId]);

  const setViewing = useCallback(
    (on: boolean) => {
      viewing.current = on;
      if (on) {
        activeRoom.id = roomId;
        markRead();
      } else if (activeRoom.id === roomId) {
        activeRoom.id = null;
      }
    },
    [roomId, markRead],
  );

  useFocusEffect(
    useCallback(() => {
      setViewing(AppState.currentState === 'active');
      const sub = AppState.addEventListener('change', (s) => setViewing(s === 'active'));
      return () => {
        sub.remove();
        setViewing(false);
        getChatSocket()?.emit('stop_typing', { room_id: roomId });
      };
    }, [setViewing, roomId]),
  );

  const prevNewest = useRef(newestServerId);
  useEffect(() => {
    if (newestServerId === prevNewest.current) return;
    const first = server[0];
    if (prevNewest.current && scrolledUp && first && first.sender?._id !== myId) setUnseen((n) => n + 1);
    prevNewest.current = newestServerId;
    if (!scrolledUp) markRead();
  }, [newestServerId, scrolledUp, markRead, server, myId]);

  // Rời phòng (đóng màn) → cache chỉ giữ trang mới nhất, vào lại không phải tải lại mọi trang cũ
  useEffect(() => () => trimRoomMessages(roomId), [roomId]);

  // ── Đã xem: con trỏ đã đọc của người khác (chỉ phòng nhỏ) ──
  const memberCount = room?.member_count ?? members.data?.length ?? 0;
  const isDirect = room?.type === 'direct';
  const receiptsEnabled = isDirect || (memberCount > 0 && memberCount <= RECEIPT_MAX_MEMBERS);
  useEffect(() => {
    const s = getChatSocket();
    if (!s || !receiptsEnabled) return;
    void emitWithAck<{ enabled: boolean; cursors: { user_id: string; message_id: string }[] }>('get_room_read_cursors', {
      room_id: roomId,
    }).then((res) => {
      if (res.success && res.data?.enabled) {
        setReadCursors(Object.fromEntries(res.data.cursors.map((c) => [c.user_id, c.message_id])));
      }
    });
    const onReceipt = (p: { room_id: string; user_id: string; message_id: string }) => {
      if (p.room_id !== roomId || p.user_id === myId) return;
      setReadCursors((c) => (c[p.user_id] && c[p.user_id] >= p.message_id ? c : { ...c, [p.user_id]: p.message_id }));
    };
    s.on('read_receipt_update', onReceipt);
    return () => {
      s.off('read_receipt_update', onReceipt);
    };
  }, [roomId, myId, receiptsEnabled]);

  const myLatest = server.find((m) => m.sender?._id === myId && m.message_type !== 'system');
  const seenCount = myLatest ? Object.entries(readCursors).filter(([uid, mid]) => uid !== myId && mid >= myLatest._id).length : 0;
  const seenLabel = seenCount ? (isDirect ? 'Đã xem' : `Đã xem ${seenCount}`) : undefined;

  // ── Bàn phím: mở thì bỏ khoảng chừa thanh home để ô nhập dính sát bàn phím ──
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const emitTyping = () => {
    const now = Date.now();
    if (now - lastTypingEmit.current < TYPING_THROTTLE_MS) return;
    lastTypingEmit.current = now;
    getChatSocket()?.emit('typing', { room_id: roomId });
  };
  const emitStopTyping = () => {
    lastTypingEmit.current = 0;
    getChatSocket()?.emit('stop_typing', { room_id: roomId });
  };

  // ── Nhảy tới 1 tin (trích dẫn trả lời, tin ghim): chưa tải tới thì tải thêm trang cũ hơn ──
  const jumpTo = async (messageId: string, maxPages = JUMP_MAX_PAGES) => {
    let index = data.findIndex((m) => m._id === messageId);
    let pages = 0;
    if (index < 0) setJumping(true);
    while (index < 0 && pages < maxPages) {
      const res = await messages.fetchNextPage();
      if (!res.hasNextPage && !res.data?.pages.flatMap((p) => p.data).some((m) => m._id === messageId)) break;
      const all = res.data?.pages.flatMap((p) => p.data) ?? [];
      index = all.findIndex((m) => m._id === messageId);
      pages += 1;
    }
    setJumping(false);
    if (index < 0) {
      showToast('error', 'Không tìm thấy tin', 'Tin nhắn này đã quá cũ hoặc đã bị xoá.');
      return;
    }
    void scrollToMessage(messageId, true);
  };

  // ── Gửi tin ──
  const makeOptimistic = (extra: Partial<ChatMessage>): ChatMessage => ({
    _id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    room_id: roomId,
    content: '',
    message_type: 'text',
    created_at: new Date().toISOString(),
    sender: { _id: myId ?? '', full_name: user?.name ?? 'Bạn', avatar_url: user?.avatar ?? null, role: user?.role_code ?? '' },
    pending: true,
    echo_after: newestServerId,
    reply_to_message: replyTo
      ? {
          _id: replyTo._id,
          content: replyTo.content,
          message_type: replyTo.message_type,
          sender: { _id: replyTo.sender._id, full_name: replyTo.sender.full_name },
        }
      : null,
    ...extra,
  });

  const markFailed = (id: string) => setPending((p) => p.map((x) => (x._id === id ? { ...x, pending: false, failed: true } : x)));
  const retryers = useRef(new Map<string, () => void>());

  /** Gửi qua socket. Lỗi KHÔNG bật hộp thoại — bong bóng tự hiện "Gửi lỗi · Bấm để gửi lại". */
  const deliver = async (temp: ChatMessage, payload: Record<string, unknown>) => {
    // Giữ lại phần đã cập nhật trong lúc upload (% tiến trình, ảnh bìa video vừa cắt) — dựng lại
    // từ `temp` gốc là bong bóng nhảy về "0%" và mất ảnh bìa trong lúc chờ socket trả lời.
    setPending((p) => {
      const prev = p.find((x) => x._id === temp._id);
      return [{ ...temp, ...(prev ?? {}), pending: true, failed: false }, ...p.filter((x) => x._id !== temp._id)];
    });
    emitStopTyping();
    const res = await emitWithAck<ChatMessage>('send_message', { room_id: roomId, ...payload });
    if (res.success && res.data) {
      upsertMessage(roomId, res.data);
      setPending((p) => p.filter((x) => x._id !== temp._id));
      retryers.current.delete(temp._id);
    } else {
      markFailed(temp._id);
    }
  };

  /** Nút Huỷ ở bong bóng đang tải lên → cắt request và gỡ tin khỏi danh sách. */
  const uploads = useRef(new Map<string, AbortController>());
  const cancelled = useRef(new Set<string>());
  const cancelUpload = (m: ChatMessage) => {
    cancelled.current.add(m._id);
    uploads.current.get(m._id)?.abort();
    uploads.current.delete(m._id);
    retryers.current.delete(m._id);
    setPending((p) => p.filter((x) => x._id !== m._id));
  };

  /** Tin có upload (ảnh/video/tệp/thoại): upload 1 lần rồi giữ kết quả — gửi lại không upload lại. */
  const sendWithUpload = <T,>(
    temp: ChatMessage,
    upload: (opts: UploadOptions) => Promise<T>,
    toPayload: (u: T) => Record<string, unknown>,
  ) => {
    let uploaded: T | undefined;
    const run = async () => {
      const controller = new AbortController();
      cancelled.current.delete(temp._id);
      uploads.current.set(temp._id, controller);
      setPending((p) => [{ ...temp, pending: true, failed: false, upload_progress: 0 }, ...p.filter((x) => x._id !== temp._id)]);
      try {
        // Nhảy 5% một lần: mỗi lần đổi là vẽ lại danh sách tin, báo từng % thì cuộn giật ở máy yếu.
        let last = 0;
        uploaded ??= await upload({
          signal: controller.signal,
          onProgress: (percent) => {
            if (percent < 100 && percent - last < 5) return;
            last = percent;
            setPending((p) => p.map((x) => (x._id === temp._id ? { ...x, upload_progress: percent } : x)));
          },
        });
      } catch (err) {
        // Người dùng bấm Huỷ: tin đã bị gỡ khỏi danh sách rồi, đừng gắn cờ "gửi lỗi".
        if (!(err instanceof UploadAbortedError)) markFailed(temp._id);
        return;
      } finally {
        uploads.current.delete(temp._id);
      }
      // Huỷ ngay lúc upload vừa xong thì không còn request để cắt — chặn ở đây, không thì tin
      // vừa biến mất lại hiện ra rồi gửi đi thật.
      if (cancelled.current.has(temp._id)) {
        cancelled.current.delete(temp._id);
        return;
      }
      await deliver(temp, toPayload(uploaded));
    };
    retryers.current.set(temp._id, () => void run());
    void run();
  };

  // Nối lại mạng → tự gửi lại các tin lỗi (như Messenger).
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  });
  useEffect(() => {
    const s = getChatSocket();
    if (!s) return;
    const onConnect = () => {
      for (const x of pendingRef.current) if (x.failed) retryers.current.get(x._id)?.();
    };
    s.on('connect', onConnect);
    return () => {
      s.off('connect', onConnect);
    };
  }, []);

  const afterSend = () => {
    setReplyTo(null);
    jumpToken.current = null;
    void listRef.current?.scrollToEnd({ animated: true });
  };

  const sendText = (content: string) => {
    const temp = makeOptimistic({ content });
    const payload = { content, message_type: 'text', reply_to_message_id: replyTo?._id };
    retryers.current.set(temp._id, () => void deliver(temp, payload));
    saveDraft(roomId, { text: '' });
    afterSend();
    void deliver(temp, payload);
  };

  const sendMedia = (assets: PickedAsset[]) => {
    const replyId = replyTo?._id;
    const images = assets.filter((a) => a.kind === 'image');
    const videos = assets.filter((a) => a.kind === 'video');
    if (images.length) {
      const temp = makeOptimistic({ content: IMAGE_CONTENT, message_type: 'image', local_images: images.map((a) => a.uri) });
      sendWithUpload<ChatMessageImage[]>(
        temp,
        (opts) => chatApi.uploadImages(images, opts),
        (up) => ({
          content: IMAGE_CONTENT,
          message_type: 'image',
          file_url: up[0].file_url,
          file_key: up[0].file_key,
          width: up[0].width,
          height: up[0].height,
          images: up,
          reply_to_message_id: replyId,
        }),
      );
    }
    // Mỗi video là 1 tin riêng (giống web) — upload thẳng S3 nếu nặng
    for (const v of videos) {
      const durationSec = v.duration ? Math.round(v.duration / 1000) : undefined;
      const name = v.fileName || `video-${Date.now()}.mp4`;
      const temp = makeOptimistic({
        content: '[Video]',
        message_type: 'video',
        file_url: v.uri,
        file_name: name,
        width: v.width,
        height: v.height,
        duration: durationSec,
      });
      sendWithUpload(
        temp,
        async (opts) => {
          // Ảnh bìa: cắt ở máy người gửi (class-be không có ffmpeg). Hiện ngay trên bong bóng đang
          // gửi, rồi upload kèm — hỏng thì bỏ qua, video vẫn gửi bình thường.
          const poster = await makeVideoPoster(v.uri);
          if (poster) setPending((p) => p.map((x) => (x._id === temp._id ? { ...x, thumbnail_url: poster.uri } : x)));
          // Chỉ truyền `signal` (bấm Huỷ là dừng luôn), KHÔNG truyền onProgress: ảnh bìa vài chục KB
          // mà báo % thì thanh tiến trình chạy vọt lên 100% rồi tụt về 0 khi video bắt đầu lên.
          const posterUp = poster
            ? await chatApi
                .uploadFile(
                  { uri: poster.uri, name: `poster-${name.replace(/\.[^.]+$/, '')}.jpg`, type: 'image/jpeg' },
                  { signal: opts.signal },
                )
                .catch(() => null)
            : null;
          const up = await chatApi.uploadFile({ uri: v.uri, name, type: v.mimeType || 'video/mp4', size: v.fileSize }, opts);
          return { up, posterKey: posterUp?.key };
        },
        ({ up, posterKey }) => ({
          content: '[Video]',
          message_type: 'video',
          file_url: up.url,
          file_key: up.key,
          file_name: up.file_name,
          file_size: up.file_size,
          mime_type: up.mime_type,
          width: v.width,
          height: v.height,
          duration: durationSec,
          ...(posterKey ? { thumbnail_key: posterKey } : {}),
          reply_to_message_id: replyId,
        }),
      );
    }
    afterSend();
  };

  const sendFiles = (docs: PickedDoc[]) => {
    const replyId = replyTo?._id;
    for (const d of docs) {
      const temp = makeOptimistic({ content: `[Tệp] ${d.name}`, message_type: 'file', file_name: d.name, file_size: d.size });
      sendWithUpload(
        temp,
        (opts) => chatApi.uploadFile({ uri: d.uri, name: d.name, type: d.mimeType || 'application/octet-stream', size: d.size }, opts),
        (up) => ({
          content: `[Tệp] ${up.file_name}`,
          message_type: 'file',
          file_url: up.url,
          file_key: up.key,
          file_name: up.file_name,
          file_size: up.file_size,
          mime_type: up.mime_type,
          reply_to_message_id: replyId,
        }),
      );
    }
    afterSend();
  };

  const sendVoice = (clip: VoiceClip) => {
    const replyId = replyTo?._id;
    const temp = makeOptimistic({
      content: '[Tin nhắn thoại]',
      message_type: 'voice',
      file_url: clip.uri,
      duration: clip.duration,
      waveform: clip.waveform,
    });
    sendWithUpload(
      temp,
      (opts) => chatApi.uploadFile({ uri: clip.uri, name: `voice-${Date.now()}.m4a`, type: 'audio/mp4' }, opts),
      (up) => ({
        content: '[Tin nhắn thoại]',
        message_type: 'voice',
        file_url: up.url,
        file_key: up.key,
        file_name: up.file_name,
        file_size: up.file_size,
        mime_type: up.mime_type,
        duration: clip.duration,
        waveform: clip.waveform,
        reply_to_message_id: replyId,
      }),
    );
    afterSend();
  };

  const submitEdit = async (m: ChatMessage, content: string) => {
    setEditing(null);
    if (content === m.content) return;
    const res = await emitWithAck('edit_message', { message_id: m._id, room_id: roomId, content });
    if (!res.success) showToast('error', 'Chưa sửa được', res.error);
  };

  const retry = (m: ChatMessage) => {
    sheet.show({
      title: 'Tin chưa gửi được',
      actions: [
        { label: 'Gửi lại', icon: 'refresh-outline', onPress: () => retryers.current.get(m._id)?.() },
        { label: 'Xoá tin', icon: 'trash-outline', danger: true, onPress: () => setPending((p) => p.filter((x) => x._id !== m._id)) },
      ],
    });
  };

  // Thả cảm xúc: lỗi thì thôi (không đáng một hộp thoại); server dội message_reacted về để cập nhật.
  const react = (m: ChatMessage, emoji: string) => {
    void emitWithAck('react_message', { message_id: m._id, room_id: roomId, emoji });
  };

  const pin = async (m: ChatMessage, pinned: boolean) => {
    const res = await emitWithAck('pin_message', { message_id: m._id, room_id: roomId, pinned });
    if (!res.success) showToast('error', pinned ? 'Chưa ghim được' : 'Chưa bỏ ghim được', res.error);
  };

  const recall = (m: ChatMessage) => {
    sheet.confirm({
      title: 'Thu hồi tin nhắn?',
      message: 'Mọi người trong phòng sẽ không còn thấy nội dung tin này.',
      label: 'Thu hồi',
      icon: 'arrow-undo-outline',
      onConfirm: async () => {
        const res = await emitWithAck('recall_message', { message_id: m._id, room_id: roomId });
        if (!res.success) showToast('error', 'Chưa thu hồi được', res.error);
      },
    });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Tin mới nhất ở cuối danh sách → "đang đọc tin cũ" = cách đáy quá ngưỡng
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const up = contentSize.height - layoutMeasurement.height - contentOffset.y > SCROLLED_UP_PX;
    if (up !== scrolledUp) {
      setScrolledUp(up);
      if (!up) {
        setUnseen(0);
        markRead();
      }
    }
  };

  // Callback ổn định cho MessageItem (memo): bản gốc đổi theo danh sách tin → mỗi tin mới vẽ lại MỌI bong bóng
  const stableRetry = useStableCallback(retry);
  const stableCancelUpload = useStableCallback(cancelUpload);
  const stableReact = useStableCallback(react);
  const stableReply = useStableCallback((m: ChatMessage) => setReplyTo(m));
  const stableJumpTo = useStableCallback((id: string) => void jumpTo(id));

  // Quay về từ màn Thông tin phòng với việc cần làm: mở ô tìm / nhảy tới tin ghim
  const runIntent = useStableCallback(() => {
    const intent = takeRoomIntent(roomId);
    if (!intent) return;
    if (intent.type === 'search') setSearchOpen(true);
    else setTimeout(() => void jumpTo(intent.messageId, JUMP_SEARCH_MAX_PAGES), 250);
  });
  useFocusEffect(
    useCallback(() => {
      runIntent();
    }, [runIntent]),
  );
  const { data: mediaToken } = useMediaToken();
  const mutedColor = useThemeColor('muted');
  const successColor = useThemeColor('success');
  // Chừa chỗ cho nút quay lại + 2 nút bên phải
  const headerTitleMax = useWindowDimensions().width - 150;
  const dangerColor = useThemeColor('danger');
  const palette = useMemo(() => ({ muted: mutedColor, danger: dangerColor, brand }), [mutedColor, dangerColor, brand]);

  // ── Quyền gửi ──
  const isAdmin = room?.my_role === 'owner' || room?.my_role === 'admin';
  const disabledReason = room?.my_is_muted
    ? 'Bạn đang bị tắt chat trong phòng này'
    : room?.is_muted && !isAdmin
      ? 'Phòng đang tắt chat — chỉ quản trị viên được gửi'
      : permissions.data?.can_send_message === false
        ? 'Bạn không có quyền gửi tin trong phòng này'
        : null;

  const title = room ? roomTitle(room) : 'Chat';

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          // Kiểu Messenger: ảnh phòng + tên canh trái, bấm vào mở Thông tin phòng
          headerTitleAlign: 'left',
          // Màn này tự vẽ ô tiêu đề (không qua HeaderRow) nên cần nút back của hệ thống
          headerBackVisible: true,
          headerTitle: () => (
            <Pressable
              className="flex-row items-center gap-2.5 active:opacity-70"
              style={{ maxWidth: headerTitleMax }}
              onPress={() => router.push({ pathname: '/chat/info/[roomId]', params: { roomId } })}>
              {room ? <RoomAvatar room={room} token={mediaToken?.media_token} size={36} brand={brand} success={successColor} /> : null}
              <View className="flex-1">
                <Text className="text-[16px] font-bold text-foreground" numberOfLines={1}>
                  {title}
                </Text>
                <RoomSubtitle
                  roomId={roomId}
                  myId={myId}
                  members={members.data}
                  fallback={
                    isDirect ? (
                      room?.direct_recipient?.is_online ? (
                        <Text className="text-xs text-success">Đang hoạt động</Text>
                      ) : null
                    ) : memberCount ? (
                      <Text className="text-xs text-muted">{memberCount} thành viên</Text>
                    ) : null
                  }
                />
              </View>
            </Pressable>
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-4">
              <Pressable hitSlop={10} accessibilityLabel="Tìm tin nhắn" onPress={() => setSearchOpen(true)}>
                <Ionicons name="search-outline" size={22} color={foreground} />
              </Pressable>
              <Pressable
                hitSlop={10}
                accessibilityLabel="Thông tin phòng"
                onPress={() => router.push({ pathname: '/chat/info/[roomId]', params: { roomId } })}>
                <Ionicons name="information-circle-outline" size={24} color={foreground} />
              </Pressable>
            </View>
          ),
        }}
      />
      <PinnedBar roomId={roomId} onJump={jumpTo} />
      {/* iOS: đẩy theo bàn phím, bù chiều cao header (44pt). Android: hệ thống tự co cửa sổ (adjustResize). */}
      <KeyboardAvoider>
        {messages.isLoading ? (
          <View className="flex-1">
            <LoadingView />
          </View>
        ) : messages.isError ? (
          <View className="flex-1">
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được tin nhắn"
              description={getErrorMessage(messages.error)}
              actionLabel="Thử lại"
              onAction={() => messages.refetch()}
            />
          </View>
        ) : (
          <View className="flex-1">
            <FlashList
              ref={listRef}
              data={listData}
              keyExtractor={(m) => m._id}
              // Mỗi loại bong bóng 1 nhóm tái sử dụng — ô tin chữ không bị đem đi vẽ ảnh/thẻ (đổi cả cây view)
              getItemType={messageKind}
              extraData={[highlightId, divider, seenLabel, myLatest?._id].join('|')}
              // Đang chờ cuộn tới tin xa thì ẩn danh sách (kèm "Đang tìm tin…") — khỏi chớp qua các đoạn dọc đường
              style={seeking ? { opacity: 0 } : undefined}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
              // Android: 'interactive' giành quyền điều khiển hiệu ứng bàn phím (WindowInsetsAnimation) và
              // kẹt giữa chừng → bàn phím mở nhưng bị vẽ ra ngoài màn hình. Chỉ iOS dùng kéo-để-ẩn.
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              onScroll={onScroll}
              onScrollBeginDrag={() => {
                jumpToken.current = null;
              }}
              scrollEventThrottle={64}
              maintainVisibleContentPosition={{
                // Vẽ từ đáy: phòng ít tin thì tin nằm sát ô nhập như mọi app chat
                startRenderingFromBottom: true,
                // Đang ở gần đáy (trong 1/4 màn) mà có tin mới → tự trôi xuống; đang đọc tin cũ thì giữ nguyên chỗ
                autoscrollToBottomThreshold: 0.25,
              }}
              onStartReachedThreshold={0.5}
              onStartReached={() => {
                if (messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
              }}
              ListHeaderComponent={messages.isFetchingNextPage ? <ActivityIndicator color={brand} className="py-3" /> : null}
              renderItem={({ item, index }) => (
                <MessageItem
                  message={item}
                  older={listData[index - 1]}
                  newer={listData[index + 1]}
                  myId={myId}
                  isDirect={isDirect}
                  onLongPress={setActionFor}
                  onRetry={stableRetry}
                  onCancelUpload={stableCancelUpload}
                  onToggleReaction={stableReact}
                  onReply={stableReply}
                  onJumpTo={stableJumpTo}
                  palette={palette}
                  mediaToken={mediaToken?.media_token}
                  highlighted={highlightId === item._id}
                  seenLabel={myLatest && item._id === myLatest._id ? seenLabel : undefined}
                  unreadDivider={divider === item._id ? openUnread : undefined}
                />
              )}
            />
            {/* Phòng trống: vẽ ngoài danh sách, giữa màn */}
            {data.length === 0 && !messages.isFetching ? (
              <View pointerEvents="none" className="absolute inset-0 justify-center">
                <StateView icon="chatbubble-ellipses-outline" title="Chưa có tin nhắn" description="Hãy gửi lời chào đầu tiên 👋" />
              </View>
            ) : null}
            {jumping || seeking ? (
              <View className="absolute left-0 right-0 top-3 items-center" pointerEvents="none">
                <View className="flex-row items-center gap-2 rounded-full bg-surface px-3.5 py-2 shadow-sm">
                  <ActivityIndicator size="small" color={brand} />
                  <Text className="text-sm text-foreground">Đang tìm tin…</Text>
                </View>
              </View>
            ) : null}
            {scrolledUp ? (
              <Pressable
                onPress={() => void listRef.current?.scrollToEnd({ animated: true })}
                accessibilityLabel="Xuống tin mới nhất"
                className="absolute bottom-3 right-4 flex-row items-center gap-1 rounded-full bg-brand px-3 py-2 active:opacity-80">
                <Ionicons name="arrow-down" size={16} color={onBrand} />
                {unseen ? <Text className="text-sm font-semibold text-on-brand">{unseen} tin mới</Text> : null}
              </Pressable>
            ) : null}
          </View>
        )}
        <View style={{ paddingBottom: keyboardOpen ? 0 : insets.bottom }} className="bg-surface">
          <Composer
            disabledReason={disabledReason}
            isDirect={isDirect}
            members={members.data ?? []}
            myId={myId}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onSubmitEdit={submitEdit}
            onSendText={sendText}
            onSendMedia={sendMedia}
            onSendFiles={sendFiles}
            onSendVoice={sendVoice}
            onTyping={emitTyping}
            onStopTyping={emitStopTyping}
            initialText={getDraft(roomId).text}
            onTextChange={(text) => saveDraft(roomId, { text })}
            onCreatePoll={permissions.data?.can_create_poll && !isDirect ? () => setPollOpen(true) : undefined}
          />
        </View>
      </KeyboardAvoider>

      {sheet.sheet}
      <MessageActions
        message={actionFor}
        myId={myId}
        permissions={permissions.data}
        onClose={() => setActionFor(null)}
        onReact={react}
        onReply={setReplyTo}
        onEdit={(m) => {
          setReplyToState(null);
          setEditing(m);
        }}
        onPin={pin}
        onForward={setForwardFor}
        onRecall={recall}
      />
      <ForwardSheet message={forwardFor} onClose={() => setForwardFor(null)} />
      <CreatePollSheet roomId={roomId} visible={pollOpen} onClose={() => setPollOpen(false)} />
      <MessageSearchSheet
        roomId={roomId}
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={(id) => void jumpTo(id, JUMP_SEARCH_MAX_PAGES)}
      />
    </View>
  );
}

/** Nhóm tái sử dụng ô của FlashList — gần với cấu trúc view của bong bóng (xem MessageItem). */
function messageKind(m: ChatMessage): string {
  if (m.recalled_by || m.deleted_by || m.is_deleted) return 'removed';
  switch (m.message_type) {
    case 'system':
    case 'image':
    case 'video':
    case 'sticker':
    case 'voice':
    case 'file':
      return m.message_type;
    case 'poll':
    case 'announcement':
    case 'assignment':
    case 'class_reminder':
    case 'activity':
      return 'card';
    default:
      return 'text';
  }
}

/**
 * Dòng phụ dưới tên phòng: "Lan, Minh đang nhập…" (theo socket) hoặc fallback (đang hoạt động /
 * số thành viên). Tách thành component riêng giữ state gõ phím → mỗi sự kiện typing chỉ vẽ lại
 * dòng chữ này, không vẽ lại cả màn phòng chat + danh sách tin.
 */
function RoomSubtitle({
  roomId,
  myId,
  members,
  fallback,
}: {
  roomId: string;
  myId?: string;
  members?: { _id: string; full_name: string }[];
  fallback: ReactNode;
}) {
  const [typingIds, setTypingIds] = useState<Record<string, number>>({});

  useEffect(() => {
    const s = getChatSocket();
    if (!s) return;
    const onTyping = (p: { room_id: string; user_id: string }) => {
      if (p.room_id !== roomId || p.user_id === myId) return;
      setTypingIds((t) => ({ ...t, [p.user_id]: Date.now() }));
    };
    const onStop = (p: { room_id: string; user_id: string }) => {
      if (p.room_id !== roomId) return;
      setTypingIds((t) => {
        if (!(p.user_id in t)) return t;
        const { [p.user_id]: _removed, ...rest } = t;
        return rest;
      });
    };
    s.on('user_typing', onTyping);
    s.on('user_stop_typing', onStop);
    const sweep = setInterval(() => {
      const now = Date.now();
      setTypingIds((t) => {
        const alive = Object.entries(t).filter(([, at]) => now - at < TYPING_TTL_MS);
        return alive.length === Object.keys(t).length ? t : Object.fromEntries(alive);
      });
    }, 1500);
    return () => {
      s.off('user_typing', onTyping);
      s.off('user_stop_typing', onStop);
      clearInterval(sweep);
    };
  }, [roomId, myId]);

  const names = Object.keys(typingIds)
    .map((id) =>
      members
        ?.find((m) => m._id === id)
        ?.full_name?.split(' ')
        .pop(),
    )
    .filter(Boolean);
  if (!names.length) return <>{fallback}</>;
  return <Text className="text-xs text-brand">{names.slice(0, 2).join(', ')} đang nhập…</Text>;
}
