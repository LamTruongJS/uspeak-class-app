import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { ImageViewer } from '@/features/chat/message-content';
import {
  FEEDBACK_STATUS_VIEW,
  FEEDBACK_TYPE_LABEL,
  useAddFeedbackMessage,
  useDeleteFeedback,
  useFeedbackDetail,
  useSetFeedbackStatus,
  type FeedbackImage,
} from '@/features/feedback/api';
import { useActionSheet } from '@/components/ui/action-sheet';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Một luồng góp ý — DÙNG CHUNG cho hai phía, phân biệt bằng tham số `admin=1`:
 * - học viên / nhân sự: tin của mình bên phải, Uspeak bên trái;
 * - admin (mở từ màn Quản lý góp ý): ngược lại, kèm nút đổi trạng thái và xoá.
 */
export default function FeedbackDetailScreen() {
  const { id, admin } = useLocalSearchParams<{ id: string; admin?: string }>();
  const isAdmin = admin === '1';
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const sheet = useActionSheet();

  const detail = useFeedbackDetail(id);
  const addMessage = useAddFeedbackMessage(id);
  const setStatus = useSetFeedbackStatus(id);
  const removeFeedback = useDeleteFeedback();
  const pull = usePullRefresh(() => detail.refetch());

  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);

  const data = detail.data;
  const status = data ? (FEEDBACK_STATUS_VIEW[data.status] ?? FEEDBACK_STATUS_VIEW.NEW) : null;
  const closed = data?.status === 'CLOSED';
  // Admin vẫn nhắn được trong luồng đã đóng? Không — đóng rồi thì phải mở lại trước, tránh nhắn vào
  // luồng người ta tưởng đã xong.
  const canWrite = !closed;
  const thread = data?.messages ?? [];
  const threadMessages =
    thread.length && thread[0].senderType === 'USER' && thread[0].message === data?.message ? thread.slice(1) : thread;

  async function changeStatus(next: 'REPLIED' | 'CLOSED') {
    try {
      await setStatus.mutateAsync(next);
      showToast('success', next === 'CLOSED' ? 'Đã đóng góp ý' : 'Đã mở lại góp ý');
    } catch (err) {
      showToast('error', 'Chưa đổi được trạng thái', getErrorMessage(err));
    }
  }

  function openAdminMenu() {
    if (!data) return;
    sheet.show({
      title: data.userName || 'Góp ý',
      actions: [
        closed
          ? { label: 'Mở lại góp ý', icon: 'refresh-outline', onPress: () => void changeStatus('REPLIED') }
          : { label: 'Đóng góp ý', icon: 'checkmark-done-outline', onPress: () => void changeStatus('CLOSED') },
        {
          label: 'Xoá góp ý',
          icon: 'trash-outline',
          danger: true,
          onPress: () =>
            sheet.confirm({
              title: 'Xoá góp ý này?',
              message: 'Cả luồng trò chuyện sẽ mất, không khôi phục được.',
              label: 'Xoá',
              icon: 'trash-outline',
              onConfirm: async () => {
                try {
                  await removeFeedback.mutateAsync(id);
                  showToast('success', 'Đã xoá góp ý');
                  router.back();
                } catch (err) {
                  showToast('error', 'Chưa xoá được', getErrorMessage(err));
                }
              },
            }),
        },
      ],
    });
  }

  async function pickImages() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 5 - images.length),
      quality: 1,
    });
    if (!res.canceled) setImages((current) => [...current, ...res.assets.map((a) => a.uri)].slice(0, 5));
  }

  async function send() {
    const message = text.trim();
    if (!message && !images.length) return;
    try {
      await addMessage.mutateAsync({ message, images });
      setText('');
      setImages([]);
    } catch (err) {
      showToast('error', 'Gửi không thành công', getErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoider>
      <Stack.Screen
        options={{
          title: isAdmin ? data?.userName || 'Góp ý' : 'Chi tiết góp ý',
          headerRight: isAdmin
            ? () => (
                <Pressable onPress={openAdminMenu} hitSlop={8} accessibilityLabel="Tuỳ chọn" className="active:opacity-60">
                  <Ionicons name="ellipsis-horizontal" size={22} color={muted} />
                </Pressable>
              )
            : undefined,
        }}
      />
      {sheet.sheet}
      <View className="flex-1 bg-background">
        {detail.isLoading ? (
          <LoadingView />
        ) : detail.isError || !data ? (
          <StateView
            icon="cloud-offline-outline"
            title="Không mở được góp ý"
            description={getErrorMessage(detail.error)}
            actionLabel="Thử lại"
            onAction={() => detail.refetch()}
          />
        ) : (
          <>
            <ScrollView
              className="flex-1"
              contentContainerClassName="gap-3 p-4 pb-6"
              refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
              <View className="flex-row items-center gap-2">
                <Badge label={FEEDBACK_TYPE_LABEL[data.type] ?? data.type} tone="info" />
                {status ? <Badge label={status.label} tone={status.tone} /> : null}
              </View>

              <Bubble
                mine={!isAdmin}
                name={isAdmin ? data.userName || 'Người gửi' : 'Bạn'}
                time={data.createdAt}
                message={data.message}
                images={data.images}
                onOpenImage={setViewer}
              />

              {/* class-be lưu LUÔN tin đầu vào mảng `messages` (feedback.service create) nên nếu vẽ cả
                  `data.message` lẫn cả mảng thì tin đầu hiện 2 lần. Bỏ bản trùng ở đầu mảng, vẫn giữ
                  bong bóng riêng phía trên vì ảnh đính kèm nằm ở `data.images` chứ không ở trong mảng. */}
              {threadMessages.map((m, i) => {
                const fromUser = m.senderType === 'USER';
                return (
                  <Bubble
                    key={`${m.createdAt}-${i}`}
                    mine={isAdmin ? !fromUser : fromUser}
                    name={fromUser ? (isAdmin ? data.userName || 'Người gửi' : 'Bạn') : isAdmin ? 'Bạn' : m.senderName || 'Uspeak'}
                    time={m.createdAt}
                    message={m.message}
                    images={m.images}
                    onOpenImage={setViewer}
                  />
                );
              })}

              {closed ? (
                <Text className="py-2 text-center text-[13px] text-muted">
                  {isAdmin ? 'Góp ý đã đóng. Mở lại ở menu góc trên nếu cần trả lời tiếp.' : 'Góp ý đã được đóng. Cần hỗ trợ thêm, bạn gửi góp ý mới nhé.'}
                </Text>
              ) : null}
            </ScrollView>

            {canWrite ? (
              <View className="gap-2 border-t border-border bg-surface p-3">
                {images.length ? (
                  <View className="flex-row flex-wrap gap-2">
                    {images.map((uri, i) => (
                      <View key={uri} className="relative">
                        <Image source={{ uri }} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
                        <Pressable
                          hitSlop={6}
                          onPress={() => setImages((current) => current.filter((_, j) => j !== i))}
                          accessibilityLabel="Bỏ ảnh"
                          className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-full bg-black/60">
                          <Ionicons name="close" size={12} color="#fff" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View className="flex-row items-end gap-2">
                  <Pressable
                    onPress={pickImages}
                    hitSlop={6}
                    accessibilityLabel="Thêm ảnh"
                    className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted active:opacity-70">
                    <Ionicons name="image-outline" size={20} color={brand} />
                  </Pressable>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder={isAdmin ? 'Trả lời người gửi…' : 'Nhắn tiếp cho Uspeak…'}
                    placeholderTextColor={muted}
                    multiline
                    className="max-h-28 flex-1 rounded-2xl bg-surface-muted px-3.5 py-2.5 text-base text-foreground"
                  />
                  <Pressable
                    onPress={send}
                    disabled={addMessage.isPending || (!text.trim() && !images.length)}
                    accessibilityLabel="Gửi"
                    className={`h-10 w-10 items-center justify-center rounded-full bg-brand ${addMessage.isPending || (!text.trim() && !images.length) ? 'opacity-40' : 'active:opacity-80'}`}>
                    {addMessage.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={17} color="#fff" />}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        )}
        <ImageViewer uri={viewer} onClose={() => setViewer(null)} />
      </View>
    </KeyboardAvoider>
  );
}

function Bubble({
  mine,
  name,
  time,
  message,
  images,
  onOpenImage,
}: {
  mine: boolean;
  name: string;
  time: string;
  message?: string;
  images?: FeedbackImage[];
  onOpenImage: (uri: string) => void;
}) {
  return (
    <View className={`max-w-[88%] gap-2 rounded-2xl p-3.5 ${mine ? 'self-end bg-brand-soft' : 'self-start border border-border bg-surface'}`}>
      <View className="flex-row items-center gap-2">
        <Text className={`text-[13px] font-bold ${mine ? 'text-brand' : 'text-foreground'}`}>{name}</Text>
        <Text className="text-[11px] text-muted">{formatDateTime(time)}</Text>
      </View>
      {message?.trim() ? <Text className="text-[15px] leading-6 text-foreground">{message}</Text> : null}
      {images?.length ? (
        <View className="flex-row flex-wrap gap-2">
          {images.map((img) => (
            <Pressable key={img.key} onPress={() => img.url && onOpenImage(img.url)} className="active:opacity-80">
              <Image source={{ uri: img.url, cacheKey: img.key }} style={{ width: 96, height: 96, borderRadius: 10 }} contentFit="cover" />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
