import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  GROUP_LABELS,
  featuresForUser,
  type AppFeature,
  type FeatureGroup,
} from '@/navigation/features';
import { openFeature } from '@/navigation/open-feature';
import { useMyPermissionCodes } from '@/features/chat/api';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

const GROUP_ORDER: FeatureGroup[] = ['learn', 'practice', 'community', 'teach', 'grading', 'admin', 'account'];

/** Toàn bộ tính năng theo vai trò — màn nào chưa làm hiện nhãn "Sắp có" / "Bản web". */
export default function FeaturesScreen() {
  const role = useAuthStore((s) => s.user?.role_code);
  const permissions = useMyPermissionCodes();
  const features = featuresForUser(role, permissions.data);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-4 pb-10">
      {GROUP_ORDER.map((group) => {
        const items = features.filter((f) => f.group === group);
        if (!items.length) return null;
        return (
          <View key={group} className="gap-2">
            <Text className="px-1 text-sm font-semibold uppercase text-muted">{GROUP_LABELS[group]}</Text>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              {items.map((f, i) => (
                <FeatureRow key={f.key} feature={f} first={i === 0} />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function FeatureRow({ feature, first }: { feature: AppFeature; first: boolean }) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  return (
    <Pressable
      onPress={() => openFeature(feature)}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-surface-muted ${first ? '' : 'border-t border-border'}`}>
      <Ionicons name={feature.icon} size={20} color={brand} />
      <Text className="flex-1 text-base text-foreground">{feature.label}</Text>
      {feature.status === 'planned' ? (
        <View className="rounded-full bg-surface-muted px-2 py-0.5">
          <Text className="text-xs text-muted">Sắp có</Text>
        </View>
      ) : null}
      {feature.status === 'web' ? (
        <View className="rounded-full bg-info-soft px-2 py-0.5">
          <Text className="text-xs text-info">Bản web</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={muted} />
    </Pressable>
  );
}
