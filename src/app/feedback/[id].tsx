import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { ImageViewer } from '@/features/chat/message-content';
import {
  FEEDBACK_STATUS_VIEW,
  FEEDBACK_TYPE_LABEL,
  useAddFeedbackMessage,
  useFeedbackDetail,
  type FeedbackImage,
} from '@/features/feedback/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Một luồng góp ý: tin đầu của mình, các lượt nhắn qua lại với Uspeak, và ô nhắn tiếp. */
export default function FeedbackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');

  const detail = useFeedbackDetail(id);
  const addMessage = useAddFeedbackMessage(id);
  const pull = usePullRefresh(() => detail.refetch());

  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);

  const data = detail.data;
  const status = data ? (FEEDBACK_STATUS_VIEW[data.status] ?? FEEDBACK_STATUS_VIEW.NEW) : null;
  const closed = data?.status === 'CLOSED';

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
      Alert.alert('Gửi không thành công', getErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoider>
      <Stack.Screen options={{ title: 'Chi tiết góp ý' }} />
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
                mine
                name="Bạn"
                time={data.createdAt}
                message={data.message}
                images={data.images}
                onOpenImage={setViewer}
              />

              {data.messages?.map((m, i) => (
                <Bubble
                  key={`${m.createdAt}-${i}`}
                  mine={m.senderType === 'USER'}
                  name={m.senderType === 'USER' ? 'Bạn' : m.senderName || 'Uspeak'}
                  time={m.createdAt}
                  message={m.message}
                  images={m.images}
                  onOpenImage={setViewer}
                />
              ))}

              {closed ? (
                <Text className="py-2 text-center text-[13px] text-muted">Góp ý đã được đóng. Cần hỗ trợ thêm, bạn gửi góp ý mới nhé.</Text>
              ) : null}
            </ScrollView>

            {!closed ? (
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
                    placeholder="Nhắn tiếp cho Uspeak…"
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
