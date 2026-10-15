import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { dashboardHeaderBackground } from '@/constants/dashboard-backgrounds';
import type { User } from '@/features/auth/types';
import { mediaCacheKey, useMediaUrl } from '@/lib/media';

type IconName = ComponentProps<typeof Ionicons>['name'];

const HERO_TEXT_SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.9)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

/** Hero dùng chung cho các dashboard nhân sự để mọi vai trò có cùng trải nghiệm với học viên. */
export function DashboardHeader({
  user,
  greeting,
  eyebrow,
  description,
  icon = 'sparkles',
  children,
}: {
  user?: User | null;
  greeting: string;
  eyebrow: string;
  description: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  const avatarUri = useMediaUrl(user?.avatar);
  const [openedAt] = useState(() => Date.now());
  const background = dashboardHeaderBackground(`${user?._id ?? 'staff'}-${user?.role_code ?? 'role'}-${openedAt}`);
  const expanded = children !== undefined && children !== null;

  return (
    <View className={`${expanded ? 'h-60' : 'h-48'} overflow-hidden rounded-3xl bg-brand-soft`}>
      <Image
        source={background}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 0 }}
        contentFit="cover"
        transition={250}
        accessible={false}
      />
      <View className="absolute inset-0 bg-black/20" />

      <View className="absolute left-4 top-4 flex-row items-center gap-1.5 rounded-full border border-white/20 bg-black/30 px-3 py-1.5">
        <Ionicons name={icon} size={12} color="#ffffff" />
        <Text className="text-[10px] font-extrabold uppercase tracking-wider text-white" style={HERO_TEXT_SHADOW}>
          {eyebrow}
        </Text>
      </View>

      <View className="absolute bottom-4 left-4 right-4">
        <View className="flex-row items-center gap-3">
          <View className="rounded-full border-[3px] border-white bg-white/20">
            <Avatar name={user?.name} uri={avatarUri} cacheKey={mediaCacheKey(user?.avatar)} size={56} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[12px] font-semibold text-white" style={HERO_TEXT_SHADOW}>
              {greeting} 👋
            </Text>
            <Text className="text-[22px] font-extrabold leading-7 text-white" style={HERO_TEXT_SHADOW} numberOfLines={1}>
              {user?.name || 'Người dùng'}
            </Text>
            <Text className="text-[12px] font-medium leading-4 text-white" style={HERO_TEXT_SHADOW} numberOfLines={1}>
              {description}
            </Text>
          </View>
        </View>
        {expanded ? <View className="mt-3">{children}</View> : null}
      </View>
    </View>
  );
}
