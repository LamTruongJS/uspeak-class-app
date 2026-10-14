import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { useAssignmentDetail } from '@/features/assignments/detail-api';
import { QuizRunner } from '@/features/assignments/quiz/quiz-runner';
import { AssignmentHeader } from '@/features/assignments/submit/assignment-header';
import {
  ImageSubmit,
  MultiTaskSubmit,
  ShadowingPanel,
  TestTemplateNotice,
  VideoSubmit,
} from '@/features/assignments/submit/submit-forms';
import { getErrorMessage } from '@/lib/api/client';

/**
 * Làm / nộp bài tập — port từ uspeak-class-fe my-assignments/[id]/submit/page.tsx.
 * Chọn giao diện theo assignment_type.code: quiz · image_upload · multi_task · shadowing · (còn lại) video.
 */
export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: assignment, isLoading, isError, error, refetch } = useAssignmentDetail(id);

  if (isLoading) {
    return (
      <Shell title="Bài tập">
        <LoadingView />
      </Shell>
    );
  }
  if (isError || !assignment) {
    return (
      <Shell title="Bài tập">
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được bài tập"
          description={getErrorMessage(error)}
          actionLabel="Thử lại"
          onAction={() => refetch()}
        />
      </Shell>
    );
  }

  const type = assignment.assignment_type?.code;
  const header = <AssignmentHeader assignment={assignment} />;

  if (type === 'quiz') {
    // Quiz đã nộp xong → mở thẳng trang kết quả. Mở form làm bài là "mất điểm":
    // form không hiện điểm và còn có thể nộp đè (xem memory quiz-result-routing).
    if (!assignment.can_submit && assignment.latest_submission?._id) {
      return <Redirect href={{ pathname: '/result/[id]', params: { id: assignment.latest_submission._id } }} />;
    }
    if (!assignment.can_submit) {
      return (
        <Shell title="Quiz">
          <ScrollView contentContainerClassName="gap-4 p-4">{header}</ScrollView>
        </Shell>
      );
    }
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: 'Quiz' }} />
        <QuizRunner assignment={assignment} header={header} />
      </View>
    );
  }

  let form: ReactNode;
  if (assignment.test_template) form = <TestTemplateNotice />;
  else if (type === 'shadowing' && assignment.shadowing) form = <ShadowingPanel assignment={assignment} />;
  else if (type === 'image_upload') form = <ImageSubmit assignment={assignment} />;
  else if (type === 'multi_task') form = <MultiTaskSubmit assignment={assignment} />;
  else form = <VideoSubmit assignment={assignment} />;

  return (
    <Shell title={assignment.assignment_type?.label ?? 'Bài tập'}>
      <KeyboardAvoider>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-12" keyboardShouldPersistTaps="handled">
          {header}
          {form}
        </ScrollView>
      </KeyboardAvoider>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title }} />
      {children}
    </View>
  );
}
