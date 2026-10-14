import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { SuccessIcon } from '@/features/assignments/submit/submit-forms';

/** Nộp bài (video / ảnh / nhiều mục) thành công. */
export default function SubmitSuccessScreen() {
  const { grading } = useLocalSearchParams<{ id: string; grading?: string }>();
  const needsGrading = grading !== '0';

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Stack.Screen options={{ title: '', headerBackVisible: false, gestureEnabled: false }} />
      <SuccessIcon />
      <Text className="text-center text-2xl font-bold text-foreground">Nộp bài thành công</Text>
      <Text className="text-center text-base text-muted">
        {needsGrading
          ? 'Giáo viên sẽ nhận xét bài của bạn. Khi có kết quả, bài sẽ chuyển sang trạng thái "Đã nhận xét".'
          : 'Bài này không cần chấm — bạn đã hoàn thành.'}
      </Text>
      <View className="w-full gap-3 pt-4">
        <Button title="Quay lại" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Button title="Về trang chủ" variant="ghost" onPress={() => router.dismissTo('/')} />
      </View>
    </View>
  );
}
