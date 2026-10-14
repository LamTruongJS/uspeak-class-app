import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { ImagesEditor, type PickedImage } from '@/features/assignments/submit/images-editor';
import { FEEDBACK_TYPES, useSubmitFeedback, type FeedbackType } from '@/features/feedback/api';
import { getErrorMessage } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/** Gửi góp ý / báo lỗi mới (kèm tối đa 5 ảnh, ảnh tự nén trước khi gửi). */
export default function NewFeedbackScreen() {
  const user = useAuthStore((s) => s.user);
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');

  const [type, setType] = useState<FeedbackType>('BUG');
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const submit = useSubmitFeedback();

  async function send() {
    const text = message.trim();
    if (!text) {
      Alert.alert('Chưa có nội dung', 'Mô tả giúp Uspeak vấn đề bạn gặp hoặc điều bạn muốn góp ý.');
      return;
    }
    try {
      const res = await submit.mutateAsync({
        type,
        message: text,
        images: images.flatMap((i) => (i.kind === 'new' ? [i.uri] : [])),
        userId: user?._id,
        userName: user?.name,
      });
      const id = res.data?._id;
      if (id) router.replace({ pathname: '/feedback/[id]', params: { id } });
      else router.back();
    } catch (err) {
      Alert.alert('Gửi không thành công', getErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoider>
      <Stack.Screen options={{ title: 'Gửi góp ý' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">Nội dung muốn gửi</Text>
          <View className="flex-row flex-wrap gap-2">
            {FEEDBACK_TYPES.map((t) => {
              const active = t.value === type;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setType(t.value)}
                  className={`flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${active ? 'border-brand bg-brand' : 'border-border bg-surface'}`}>
                  <Ionicons name={t.icon} size={14} color={active ? '#fff' : muted} />
                  <Text className={`text-[13px] font-semibold ${active ? 'text-on-brand' : 'text-foreground'}`}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">Mô tả</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Bạn gặp vấn đề gì, ở màn hình nào? Càng cụ thể càng dễ xử lý."
            placeholderTextColor={muted}
            multiline
            textAlignVertical="top"
            className="min-h-[140px] rounded-xl border border-border bg-surface p-3.5 text-base text-foreground"
          />
          <Text className="text-xs text-muted">{message.trim().length}/5000 ký tự</Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">Ảnh minh hoạ (không bắt buộc)</Text>
          <ImagesEditor images={images} onChange={setImages} max={5} disabled={submit.isPending} />
        </View>

        <Button title="Gửi cho Uspeak" icon="send" loading={submit.isPending} onPress={send} />
        <Text className="text-center text-xs text-muted" style={{ color: brand }}>
          {submit.isPending ? 'Đang gửi, ảnh lớn có thể mất vài giây…' : ''}
        </Text>
      </ScrollView>
    </KeyboardAvoider>
  );
}
