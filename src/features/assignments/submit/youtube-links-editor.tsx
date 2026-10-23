import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useActionSheet } from '@/components/ui/action-sheet';
import { isBunnySubmissionUrl } from '@/lib/submission-video';
import { checkYoutubeVideo, extractYoutubeVideoId, youtubeThumbnail } from '@/lib/youtube';
import { useThemeColor } from '@/theme/use-theme-color';

export type LinkState = 'empty' | 'checking' | 'valid' | 'invalid';

export interface YoutubeLink {
  id: string;
  url: string;
  state: LinkState;
  videoId: string | null;
  title?: string;
  /**
   * Video học viên đã tải thẳng lên Bunny (nộp từ web). App chưa tải video lên được nên chỉ GIỮ NGUYÊN
   * link này (không sửa chữ, cho xoá) và gửi lại nguyên văn khi cập nhật bài — xem lib/submission-video.ts.
   */
  uploaded?: boolean;
}

let seq = 0;
export function makeLink(url = ''): YoutubeLink {
  seq += 1;
  if (isBunnySubmissionUrl(url)) return { id: `l${seq}`, url, state: 'valid', videoId: null, uploaded: true };
  return { id: `l${seq}`, url, state: url ? 'checking' : 'empty', videoId: extractYoutubeVideoId(url) };
}

/** Link hợp lệ để nộp (đã qua kiểm tra oEmbed, hoặc video đã tải lên — gửi lại nguyên văn). */
export function validUrls(links: YoutubeLink[]) {
  return links.filter((l) => l.state === 'valid').map((l) => l.url.trim());
}

export function hasInvalid(links: YoutubeLink[]) {
  return links.some((l) => l.state === 'invalid' || l.state === 'checking');
}

interface Props {
  links: YoutubeLink[];
  onChange: (next: YoutubeLink[]) => void;
  max?: number;
  disabled?: boolean;
}

/**
 * Nhập link YouTube bài làm: tự kiểm tra video có xem được không (video "Riêng tư" thì giáo viên
 * không xem được → báo lỗi ngay), hiện ảnh thu nhỏ để học viên chắc là đúng video.
 */
export function YoutubeLinksEditor({ links, onChange, max = 10, disabled }: Props) {
  const brand = useThemeColor('brand');
  // Bộ kiểm tra chạy sau 700ms → đọc bản links mới nhất qua ref, không bắt closure cũ.
  const linksRef = useRef(links);
  useEffect(() => {
    linksRef.current = links;
  });

  // Kiểm tra từng link sau khi ngừng gõ 700ms
  const pending = links.filter((l) => l.state === 'checking').map((l) => `${l.id}:${l.url}`).join('|');
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(async () => {
      const targets = linksRef.current.filter((l) => l.state === 'checking');
      const results = await Promise.all(
        targets.map(async (l) => {
          const videoId = extractYoutubeVideoId(l.url);
          if (!videoId) return { id: l.id, url: l.url, state: 'invalid' as const, videoId: null };
          const r = await checkYoutubeVideo(videoId);
          return { id: l.id, url: l.url, state: r.ok ? ('valid' as const) : ('invalid' as const), videoId, title: r.title };
        }),
      );
      onChange(
        linksRef.current.map((l) => {
          const r = results.find((x) => x.id === l.id && x.url === l.url);
          return r ? { ...l, state: r.state, videoId: r.videoId, title: r.title } : l;
        }),
      );
    }, 700);
    return () => clearTimeout(timer);
  }, [pending, onChange]);

  const update = (id: string, url: string) =>
    onChange(links.map((l) => (l.id === id ? { ...l, url, state: url.trim() ? 'checking' : 'empty', title: undefined } : l)));

  return (
    <View className="gap-3">
      {links.map((link, index) => (
        <LinkRow
          key={link.id}
          index={index}
          link={link}
          disabled={disabled}
          canRemove={links.length > 1}
          onChangeText={(url) => update(link.id, url)}
          onRemove={() => {
            const next = links.filter((l) => l.id !== link.id);
            onChange(next.length ? next : [makeLink()]);
          }}
        />
      ))}
      {links.length < max && !disabled ? (
        <Pressable
          onPress={() => onChange([...links, makeLink()])}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 active:opacity-70">
          <Ionicons name="add" size={18} color={brand} />
          <Text className="text-sm font-semibold text-brand">Thêm video</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function LinkRow({
  link,
  index,
  disabled,
  canRemove,
  onChangeText,
  onRemove,
}: {
  link: YoutubeLink;
  index: number;
  disabled?: boolean;
  canRemove: boolean;
  onChangeText: (v: string) => void;
  onRemove: () => void;
}) {
  const muted = useThemeColor('muted');
  const success = useThemeColor('success');
  const danger = useThemeColor('danger');
  const [focused, setFocused] = useState(false);

  if (link.uploaded) return <UploadedRow disabled={disabled} onRemove={onRemove} />;

  const border =
    link.state === 'invalid' ? 'border-danger' : link.state === 'valid' ? 'border-success' : focused ? 'border-brand' : 'border-border';

  return (
    <View className="gap-2">
      <View className={`flex-row items-center gap-2 rounded-xl border bg-surface px-3 ${border}`}>
        <Ionicons name="logo-youtube" size={20} color={link.state === 'valid' ? danger : muted} />
        <TextInput
          value={link.url}
          editable={!disabled}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={`Link video ${index + 1}: https://youtu.be/...`}
          placeholderTextColor={muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          className="h-12 flex-1 text-base text-foreground"
        />
        {link.state === 'checking' ? <ActivityIndicator size="small" /> : null}
        {link.state === 'valid' ? <Ionicons name="checkmark-circle" size={20} color={success} /> : null}
        {canRemove && !disabled ? (
          <Pressable hitSlop={8} onPress={onRemove} accessibilityLabel="Xoá link">
            <Ionicons name="close-circle" size={20} color={muted} />
          </Pressable>
        ) : null}
      </View>
      {link.state === 'invalid' ? (
        <Text className="text-sm text-danger">
          Link không hợp lệ hoặc video đang để Riêng tư. Hãy để chế độ Công khai hoặc Không công khai.
        </Text>
      ) : null}
      {link.state === 'valid' && link.videoId ? (
        <View className="flex-row items-center gap-3 rounded-xl bg-surface-muted p-2">
          <Image source={{ uri: youtubeThumbnail(link.videoId) }} style={{ width: 96, height: 54, borderRadius: 8 }} />
          <Text className="flex-1 text-sm text-foreground" numberOfLines={2}>
            {link.title || 'Video YouTube'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Video đã tải lên (Bunny): không có chữ để sửa — chỉ hiện thẻ + nút xoá (hỏi lại vì app chưa tải lại được). */
function UploadedRow({ disabled, onRemove }: { disabled?: boolean; onRemove: () => void }) {
  const muted = useThemeColor('muted');
  const success = useThemeColor('success');
  const menu = useActionSheet();
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-success bg-surface p-2">
      <View className="h-[54px] w-24 items-center justify-center rounded-lg" style={{ backgroundColor: '#1e293b' }}>
        <Ionicons name="play-circle" size={28} color="#fff" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-1">
          <Ionicons name="checkmark-circle" size={15} color={success} />
          <Text className="text-sm font-semibold text-foreground">Video đã tải lên</Text>
        </View>
        <Text className="text-xs text-muted" numberOfLines={2}>
          Giữ nguyên khi cập nhật bài. Muốn đổi video tải lên, hãy dùng bản web.
        </Text>
      </View>
      {!disabled ? (
        <Pressable
          hitSlop={8}
          accessibilityLabel="Xoá video đã tải lên"
          onPress={() =>
            menu.confirm({
              title: 'Xoá video đã tải lên?',
              message: 'App chưa tải video lên được — xoá rồi muốn nộp lại video này phải dùng bản web.',
              label: 'Xoá video',
              icon: 'trash-outline',
              onConfirm: onRemove,
            })
          }>
          <Ionicons name="close-circle" size={20} color={muted} />
        </Pressable>
      ) : null}
      {menu.sheet}
    </View>
  );
}
