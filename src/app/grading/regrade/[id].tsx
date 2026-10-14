import { useLocalSearchParams } from 'expo-router';

import { GradingWorkbench } from '@/features/assignments/grading-workbench';

/** Nhận xét lại bài theo yêu cầu của người review — xem features/assignments/grading-workbench.tsx */
export default function RegradeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GradingWorkbench id={id} mode="regrade" />;
}
