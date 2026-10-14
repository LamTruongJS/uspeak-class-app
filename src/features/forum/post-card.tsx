import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ImageViewer } from '@/features/chat/message-content';
import { roomTime } from '@/features/chat/format';
import { mediaCacheKey, resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useThemeColor } from '@/theme/use-theme-color';

import { reactionTotal, REACTIONS, topReactions, type ForumAttachment, type ForumPost } from './api';

const ROLE_LABEL: Record<string, string> = {
  AD: 'Quản trị',
  TE: 'Giáo viên',
  TA: 'Trợ giảng',
  TG: 'Người nhận xét',
  ST: 'Học viên',
};

const isImage = (a: ForumAttachment) => a.type?.startsWith('image') || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.name || '');

/** Hàng chọn cảm xúc (hiện khi nhấn giữ / bấm nút cảm xúc). */
function ReactionBar({ current, onPick }: { current: string | null; onPick: (emoji: string) => void }) {
  return (
    <View className="flex-row gap-1 rounded-full border border-border bg-surface p-1">
      {REACTIONS.map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => onPick(emoji)}
          className={`h-9 w-9 items-center justify-center rounded-full ${current === emoji ? 'bg-brand-soft' : ''} active:opacity-70`}>
          <Text className="text-[20px]">{emoji}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Một bài viết trên bảng tin diễn đàn: tác giả, nội dung, ảnh, cảm xúc, số bình luận. */
export const ForumPostCard = memo(function ForumPostCard({
  post,
  onOpen,
  onReact,
}: {
  post: ForumPost;
  onOpen: () => void;
  onReact: (emoji: string) => void;
}) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const { data: media } = useMediaToken();
  const [picking, setPicking] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  const images = (post.attachments ?? []).filter(isImage);
  const files = (post.attachments ?? []).filter((a) => !isImage(a));
  const total = reactionTotal(post.reaction_summary);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-3.5">
      <View className="flex-row items-center gap-2.5">
        <Avatar
          name={post.author?.full_name}
          uri={resolveMediaUrl(post.author?.avatar_url, media?.media_token)}
          cacheKey={mediaCacheKey(post.author?.avatar_url)}
          size={38}
        />
        <View className="flex-1">
          <Text className="text-[14px] font-bold text-foreground" numberOfLines={1}>
            {post.author?.full_name || 'Người dùng Uspeak'}
          </Text>
          <Text className="text-[11px] text-muted">
            {ROLE_LABEL[post.author?.role ?? ''] ?? post.author?.role ?? ''} · {roomTime(post.createdAt)}
            {post.is_edited ? ' · đã sửa' : ''}
          </Text>
        </View>
        {post.is_pinned ? <Ionicons name="pin" size={15} color={brand} /> : null}
        {post.class_code ? <Badge label={post.class_code} tone="brand" /> : null}
      </View>

      <Pressable onPress={onOpen}>
        <Text className="text-[15px] leading-6 text-foreground" selectable>
          {post.content}
        </Text>
      </Pressable>

      {images.length ? (
        <View className="flex-row flex-wrap gap-2">
          {images.map((a) => {
            const uri = resolveMediaUrl(a.url, media?.media_token);
            const wide = images.length === 1;
            return (
              <Pressable key={a.key} onPress={() => uri && setViewer(uri)} className={wide ? 'w-full' : ''}>
                <Image
                  source={{ uri, cacheKey: a.key }}
                  style={wide ? { width: '100%', aspectRatio: a.width && a.height ? a.width / a.height : 4 / 3, borderRadius: 12 } : { width: 104, height: 104, borderRadius: 12 }}
                  contentFit="cover"
                  transition={120}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {files.map((a) => (
        <Pressable
          key={a.key}
          onPress={() => a.url && Linking.openURL(a.url)}
          className="flex-row items-center gap-2.5 rounded-xl bg-surface-muted p-2.5 active:opacity-70">
          <Ionicons name="document-attach-outline" size={18} color={brand} />
          <Text className="flex-1 text-[13px] font-semibold text-foreground" numberOfLines={1}>
            {a.name}
          </Text>
        </Pressable>
      ))}

      {picking ? <ReactionBar current={post.my_reaction} onPick={(emoji) => { setPicking(false); onReact(emoji); }} /> : null}

      <View className="flex-row items-center gap-3 border-t border-border pt-2.5">
        <Pressable
          onPress={() => (post.my_reaction ? onReact(post.my_reaction) : setPicking((v) => !v))}
          onLongPress={() => setPicking(true)}
          className="flex-row items-center gap-1.5 active:opacity-70">
          {post.my_reaction ? (
            <Text className="text-[16px]">{post.my_reaction}</Text>
          ) : (
            <Ionicons name="heart-outline" size={18} color={muted} />
          )}
          <Text className={`text-[13px] font-semibold ${post.my_reaction ? 'text-brand' : 'text-muted'}`}>
            {total > 0 ? `${topReactions(post.reaction_summary).join('')} ${total}` : 'Cảm xúc'}
          </Text>
        </Pressable>

        <Pressable onPress={onOpen} className="flex-row items-center gap-1.5 active:opacity-70">
          <Ionicons name="chatbubble-outline" size={17} color={muted} />
          <Text className="text-[13px] font-semibold text-muted">
            {post.comment_count > 0 ? `${post.comment_count} bình luận` : 'Bình luận'}
          </Text>
        </Pressable>
      </View>

      <ImageViewer uri={viewer} onClose={() => setViewer(null)} />
    </View>
  );
});
