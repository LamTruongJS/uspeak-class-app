import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { AssignmentForm } from '@/features/assignments/editor/assignment-form';

/** Tạo bài tập cho 1 lớp (`?classId=`) — mở từ màn Bài tập của lớp dạy. */
export default function NewAssignmentScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Tạo bài tập', headerShown: true }} />
      <AssignmentForm
        classId={classId}
        onSaved={() => {
          router.back();
          showToast('success', 'Đã tạo bài tập');
        }}
      />
    </View>
  );
}
