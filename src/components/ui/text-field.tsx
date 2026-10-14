import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState, type ComponentProps } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** Ô mật khẩu: có nút con mắt để hiện/ẩn */
  password?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, icon, password, ...inputProps },
  ref,
) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  const muted = useThemeColor('muted');

  const borderClass = error ? 'border-danger' : focused ? 'border-brand' : 'border-border';

  return (
    <View className="gap-1.5">
      {label ? <Text className="text-sm font-medium text-foreground">{label}</Text> : null}
      <View
        className={`h-12 flex-row items-center gap-2 rounded-xl border bg-surface px-3.5 ${borderClass}`}>
        {icon ? <Ionicons name={icon} size={18} color={muted} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={muted}
          secureTextEntry={password && hidden}
          autoCapitalize="none"
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          className="flex-1 text-base text-foreground"
        />
        {password ? (
          <Pressable
            hitSlop={10}
            accessibilityLabel={hidden ? 'Hiện mật khẩu' : 'Ẩn mật khẩu'}
            onPress={() => setHidden((v) => !v)}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
    </View>
  );
});
