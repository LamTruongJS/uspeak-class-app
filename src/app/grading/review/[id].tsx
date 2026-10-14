import { useLocalSearchParams } from 'expo-router';

import { GradingWorkbench } from '@/features/assignments/grading-workbench';

/** Review kết quả nhận xét — xem features/assignments/grading-workbench.tsx */
export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GradingWorkbench id={id} mode="review" />;
}
