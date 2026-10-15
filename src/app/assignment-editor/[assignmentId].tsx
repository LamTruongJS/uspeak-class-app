import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { useEditableAssignment } from '@/features/assignments/editor/api';
import { AssignmentForm } from '@/features/assignments/editor/assignment-form';
import { getErrorMessage } from '@/lib/api/client';

/** Sửa bài tập (GET /assignments/:id/edit-detail → PATCH /assignments/:id). Bài Shadowing sửa ở hệ Shadowing. */
export default function EditAssignmentScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const q = useEditableAssignment(assignmentId);
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Sửa bài tập', headerShown: true }} />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError || !q.data ? (
        <StateView icon="cloud-offline-outline" title="Không mở được bài tập" description={getErrorMessage(q.error)} actionLabel="Thử lại" onAction={() => q.refetch()} />
      ) : q.data.shadowing ? (
        <StateView icon="pulse-outline" title="Bài Shadowing" description="Bài giao từ thư viện Shadowing — sửa trên hệ Shadowing." />
      ) : (
        <AssignmentForm
          classId={q.data.class_id}
          initial={q.data}
          onSaved={() => {
            router.back();
            showToast('success', 'Đã cập nhật bài tập');
          }}
        />
      )}
    </View>
  );
}
