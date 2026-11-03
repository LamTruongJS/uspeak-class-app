import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { TvstBusinessAssignment } from '@/features/tvst/tvst-business-assignment';

/**
 * Giáo viên xem bài TVST Business của 1 học viên (chỉ đọc, kèm đáp án + điểm từng ô) —
 * GET /assignments/:id/tvst-business/students/:studentId (AD/TE/TA/TG). Mở từ danh sách bài nộp
 * của lớp dạy: router.push({ pathname: '/tvst-business/[assignmentId]', params: { assignmentId, studentId } }).
 */
export default function TvstBusinessStudentWorkScreen() {
  const { assignmentId, studentId, name } = useLocalSearchParams<{ assignmentId: string; studentId: string; name?: string }>();
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: name ? `Bài của ${name}` : 'Bài TVST đi làm' }} />
      <ScrollView contentContainerClassName="p-4 pb-12">
        <TvstBusinessAssignment assignmentId={assignmentId} studentId={studentId} />
      </ScrollView>
    </View>
  );
}
