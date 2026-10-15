import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { Segmented } from '@/components/ui/segmented';
import { ImagesEditor, type PickedImage } from '@/features/assignments/submit/images-editor';
import { useCreateForumPost, useForumClasses } from '@/features/forum/api';
import { getErrorMessage } from '@/lib/api/client';
import { useThemeColor } from '@/theme/use-theme-color';

/** Viết bài diễn đàn: nội dung + ảnh + chọn đăng chung hay trong một lớp. */
export default function NewForumPostScreen() {
  const muted = useThemeColor('muted');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [classId, setClassId] = useState('all');

  const classes = useForumClasses();
  const create = useCreateForumPost();

  const classItems = useMemo(
    () => [
      { value: 'all', label: 'Diễn đàn chung' },
      ...(classes.data ?? []).map((c) => ({ value: c._id, label: c.class_code || c.name || 'Lớp' })),
    ],
    [classes.data],
  );

  async function submit() {
    const text = content.trim();
    if (!text) {
      showToast('warning', 'Chưa có nội dung', 'Viết vài dòng trước khi đăng nhé.');
      return;
    }
    try {
      await create.mutateAsync({
        content: text,
        classId: classId === 'all' ? undefined : classId,
        images: images.flatMap((i) => (i.kind === 'new' ? [i.uri] : [])),
      });
      router.back();
    } catch (err) {
      showToast('error', 'Đăng bài không thành công', getErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoider>
      <Stack.Screen options={{ title: 'Viết bài' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
        {classItems.length > 1 ? (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Đăng vào</Text>
            <Segmented variant="chip" value={classId} onChange={setClassId} items={classItems} />
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">Nội dung</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Bạn muốn chia sẻ điều gì?"
            placeholderTextColor={muted}
            multiline
            textAlignVertical="top"
            autoFocus
            className="min-h-[160px] rounded-xl border border-border bg-surface p-3.5 text-base text-foreground"
          />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">Ảnh kèm theo (không bắt buộc)</Text>
          <ImagesEditor images={images} onChange={setImages} max={6} disabled={create.isPending} />
        </View>

        <Button title="Đăng bài" icon="send" loading={create.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoider>
  );
}
