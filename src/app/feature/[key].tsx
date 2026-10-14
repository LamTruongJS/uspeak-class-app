import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { StateView } from '@/components/ui/state-view';
import { FEATURES } from '@/navigation/features';

const PHASE_TEXT: Record<number, string> = {
  1: 'đợt 1',
  2: 'đợt 2',
  3: 'đợt 3 (giáo viên / trợ giảng)',
  4: 'đợt 4 (quản trị)',
};

/** Màn giữ chỗ cho tính năng chưa làm trên app. */
export default function FeaturePlaceholder() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const feature = FEATURES.find((f) => f.key === key);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: feature?.label ?? '' }} />
      <StateView
        icon={feature?.icon ?? 'construct-outline'}
        title="Tính năng sắp có trên app"
        description={
          feature
            ? `"${feature.label}" nằm trong ${PHASE_TEXT[feature.phase]} của kế hoạch làm app.`
            : 'Không tìm thấy tính năng này.'
        }
      />
    </View>
  );
}
