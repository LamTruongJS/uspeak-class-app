import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  className?: string;
}

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-brand',
  secondary: 'bg-brand-soft',
  ghost: 'bg-transparent',
  danger: 'bg-danger-soft',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-on-brand',
  secondary: 'text-brand',
  ghost: 'text-brand',
  danger: 'text-danger',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  className = '',
}: ButtonProps) {
  const onBrand = useThemeColor('on-brand');
  const brand = useThemeColor('brand');
  const danger = useThemeColor('danger');
  const tint = variant === 'primary' ? onBrand : variant === 'danger' ? danger : brand;
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      className={`h-12 flex-row items-center justify-center rounded-xl px-5 active:opacity-80 ${CONTAINER[variant]} ${inactive ? 'opacity-60' : ''} ${className}`}>
      {loading ? (
        <ActivityIndicator color={tint} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon ? <Ionicons name={icon} size={18} color={tint} /> : null}
          <Text className={`text-base font-semibold ${LABEL[variant]}`}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
