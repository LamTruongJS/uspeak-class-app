import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/avatar';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { StateView } from '@/components/ui/state-view';
import { roomTime } from '@/features/chat/format';
import {
  reactionTotal,
  topReactions,
  useCreateForumComment,
  useForumComments,
  useForumPostFromCache,
  useForumReplies,
  useToggleReaction,
  type ForumComment,
} from '@/features/forum/api';
import { ForumPostCard } from '@/features/forum/post-card';
import { getErrorMessage } from '@/lib/api/client';
import { mediaCacheKey, resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Một bài diễn đàn + bình luận và trả lời. Bài lấy từ cache bảng tin (BE không có API 1 bài). */
export default function ForumPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');

  const post = useForumPostFromCache(id);
  const comments = useForumComments(id);
  const react = useToggleReaction();
  const createComment = useCreateForumComment(id);
  const pull = usePullRefresh(() => comments.refetch());

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ForumComment | null>(null);
  const items = useMemo(() => comments.data?.pages.flatMap((p) => p.data) ?? [], [comments.data]);

  async function send() {
    const content = text.trim();
    if (!content) return;
    try {
      await createComment.mutateAsync({ content, parentId: replyTo?._id });
      setText('');
      setReplyTo(null);
    } catch (err) {
      showToast('error', 'Không gửi được bình luận', getErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoider>
      <Stack.Screen options={{ title: 'Bài viết' }} />
      <View className="flex-1 bg-background">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-3 p-4 pb-6"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
          {post.data ? (
            <ForumPostCard
              post={post.data}
              onOpen={() => {}}
              onReact={(emoji) => react.mutate({ targetId: post.data!._id, targetType: 'post', emoji })}
            />
          ) : (
            <StateView
              icon="document-outline"
              title="Mở lại bài viết từ bảng tin"
              description="App chỉ giữ nội dung bài khi bạn mở từ bảng tin diễn đàn. Phần bình luận bên dưới vẫn tải bình thường."
            />
          )}

          <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Bình luận {items.length ? `· ${items.length}` : ''}
          </Text>

          {comments.isLoading ? (
            <ActivityIndicator className="py-6" color={brand} />
          ) : comments.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được bình luận"
              description={getErrorMessage(comments.error)}
              actionLabel="Thử lại"
              onAction={() => comments.refetch()}
            />
          ) : items.length === 0 ? (
            <Text className="px-1 text-[13px] text-muted">Chưa có bình luận nào.</Text>
          ) : (
            items.map((comment) => (
              <CommentRow
                key={comment._id}
                comment={comment}
                onReply={() => setReplyTo(comment)}
                onReact={(emoji) => react.mutate({ targetId: comment._id, targetType: 'comment', emoji })}
              />
            ))
          )}

          {comments.hasNextPage ? (
            <Pressable onPress={() => void comments.fetchNextPage()} className="items-center py-2 active:opacity-70">
              <Text className="text-[13px] font-semibold text-brand">
                {comments.isFetchingNextPage ? 'Đang tải…' : 'Xem thêm bình luận'}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View className="gap-2 border-t border-border bg-surface p-3">
          {replyTo ? (
            <View className="flex-row items-center gap-2">
              <Ionicons name="return-down-forward-outline" size={15} color={muted} />
              <Text className="flex-1 text-[12px] text-muted" numberOfLines={1}>
                Trả lời {replyTo.author?.full_name || 'bình luận'}
              </Text>
              <Pressable hitSlop={8} onPress={() => setReplyTo(null)}>
                <Ionicons name="close" size={16} color={muted} />
              </Pressable>
            </View>
          ) : null}
          <View className="flex-row items-end gap-2">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={replyTo ? 'Viết câu trả lời…' : 'Viết bình luận…'}
              placeholderTextColor={muted}
              multiline
              className="max-h-28 flex-1 rounded-2xl bg-surface-muted px-3.5 py-2.5 text-base text-foreground"
            />
            <Pressable
              onPress={send}
              disabled={createComment.isPending || !text.trim()}
              accessibilityLabel="Gửi bình luận"
              className={`h-10 w-10 items-center justify-center rounded-full bg-brand ${createComment.isPending || !text.trim() ? 'opacity-40' : 'active:opacity-80'}`}>
              {createComment.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={17} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoider>
  );
}

function CommentRow({
  comment,
  onReply,
  onReact,
}: {
  comment: ForumComment;
  onReply: () => void;
  onReact: (emoji: string) => void;
}) {
  const muted = useThemeColor('muted');
  const { data: media } = useMediaToken();
  const [showReplies, setShowReplies] = useState(false);
  const replies = useForumReplies(comment._id, showReplies);
  const total = reactionTotal(comment.reaction_summary);

  return (
    <View className="gap-2">
      <View className="flex-row gap-2.5">
        <Avatar
          name={comment.author?.full_name}
          uri={resolveMediaUrl(comment.author?.avatar_url, media?.media_token)}
          cacheKey={mediaCacheKey(comment.author?.avatar_url)}
          size={32}
        />
        <View className="flex-1 gap-1">
          <View className="gap-0.5 rounded-2xl bg-surface-muted px-3 py-2">
            <Text className="text-[13px] font-bold text-foreground">{comment.author?.full_name || 'Người dùng'}</Text>
            <Text className="text-[14px] leading-5 text-foreground">{comment.content}</Text>
          </View>
          <View className="flex-row items-center gap-3 px-1">
            <Text className="text-[11px] text-muted">{roomTime(comment.createdAt)}</Text>
            <Pressable onPress={() => onReact(comment.my_reaction || '👍')} className="active:opacity-70">
              <Text className={`text-[11px] font-semibold ${comment.my_reaction ? 'text-brand' : 'text-muted'}`}>
                {total > 0 ? `${topReactions(comment.reaction_summary, 2).join('')} ${total}` : 'Thích'}
              </Text>
            </Pressable>
            <Pressable onPress={onReply} className="active:opacity-70">
              <Text className="text-[11px] font-semibold text-muted">Trả lời</Text>
            </Pressable>
            {comment.reply_count > 0 ? (
              <Pressable onPress={() => setShowReplies((v) => !v)} className="flex-row items-center gap-1 active:opacity-70">
                <Ionicons name={showReplies ? 'chevron-up' : 'chevron-down'} size={12} color={muted} />
                <Text className="text-[11px] font-semibold text-muted">{comment.reply_count} trả lời</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {showReplies ? (
        <View className="gap-2 pl-10">
          {replies.isLoading ? <ActivityIndicator size="small" /> : null}
          {(replies.data ?? []).map((reply) => (
            <View key={reply._id} className="flex-row gap-2.5">
              <Avatar
                name={reply.author?.full_name}
                uri={resolveMediaUrl(reply.author?.avatar_url, media?.media_token)}
                cacheKey={mediaCacheKey(reply.author?.avatar_url)}
                size={26}
              />
              <View className="flex-1 gap-0.5 rounded-2xl bg-surface-muted px-3 py-2">
                <Text className="text-[12px] font-bold text-foreground">{reply.author?.full_name || 'Người dùng'}</Text>
                <Text className="text-[13px] leading-5 text-foreground">{reply.content}</Text>
                <Text className="text-[10px] text-muted">{roomTime(reply.createdAt)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
