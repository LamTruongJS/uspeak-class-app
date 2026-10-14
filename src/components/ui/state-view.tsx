import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

import { Button } from './button';

interface StateViewProps {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Trạng thái rỗng / lỗi / sắp có — một khuôn chung cho mọi màn. */
export function StateView({ icon = 'sparkles-outline', title, description, actionLabel, onAction }: StateViewProps) {
  const brand = useThemeColor('brand');
  return (
    <View className="items-center gap-3 px-6 py-16">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
        <Ionicons name={icon} size={30} color={brand} />
      </View>
      <Text className="text-center text-lg font-semibold text-foreground">{title}</Text>
      {description ? <Text className="text-center text-base text-muted">{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="secondary" onPress={onAction} className="mt-2" />
      ) : null}
    </View>
  );
}

export function LoadingView() {
  const brand = useThemeColor('brand');
  return (
    <View className="items-center py-16">
      <ActivityIndicator size="large" color={brand} />
    </View>
  );
}
