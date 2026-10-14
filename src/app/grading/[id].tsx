import { useLocalSearchParams } from 'expo-router';

import { GradingWorkbench } from '@/features/assignments/grading-workbench';

/** Nhận xét bài (bài đã "Nhận bài" ở hàng chờ) — xem features/assignments/grading-workbench.tsx */
export default function GradingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GradingWorkbench id={id} mode="grade" />;
}
