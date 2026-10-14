import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { avatarColor } from '@/features/chat/room-avatar';
import { scheduleParts } from '@/features/classes/next-session';
import { formatDate, formatVnd } from '@/lib/format';
import { resolveMediaUrl } from '@/lib/media';

import { COURSE_TYPE_LABEL, daysUntil, discountLabel, pricing, sessionsText, type OpenCourseClass } from './api';

export const priceText = (v: number) => (v > 0 ? formatVnd(v) : 'Liên hệ');

/** Còn bao nhiêu chỗ (null = lớp không giới hạn sĩ số). */
export const seatsLeft = (c: OpenCourseClass) =>
  typeof c.max_students === 'number' && c.max_students > 0 ? Math.max(0, c.max_students - c.active_students) : null;

/** Ảnh bìa lớp — ảnh lớp nếu có, không thì nền màu theo lớp + mã lớp mờ (giống thẻ lớp học). */
export function CourseCover({
  c,
  height,
  token,
  codeAt = 'bottom',
  children,
}: {
  c: OpenCourseClass;
  height: number;
  token?: string;
  /** Vị trí mã lớp mờ — 'top' khi đáy ảnh bìa đã có tiêu đề (màn chi tiết) để khỏi đè chữ. */
  codeAt?: 'top' | 'bottom';
  children?: React.ReactNode;
}) {
  const uri = resolveMediaUrl(c.class_image, token) ?? (c.class_image?.startsWith('http') ? c.class_image : undefined);
  return (
    <View style={{ height, backgroundColor: avatarColor(c._id) }} className="overflow-hidden">
      {uri ? (
        <Image source={{ uri }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" transition={150} recyclingKey={c._id} />
      ) : (
        <>
          <View className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <Text
            className={`absolute right-4 font-black tracking-tighter text-white/20 ${codeAt === 'top' ? 'top-3' : 'bottom-3'}`}
            style={{ fontSize: 44 }}
            numberOfLines={1}>
            {c.class_code}
          </Text>
        </>
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.6 }}
      />
      {children}
    </View>
  );
}

/**
 * Thẻ 1 lớp đang mở đăng ký: ảnh bìa (nhãn giảm giá, "Khai giảng sau N ngày"), tên khoá + lớp, giảng viên,
 * lịch + ngày khai giảng + số chỗ còn, giá (gạch giá gốc khi có ưu đãi).
 */
export const CourseCard = memo(function CourseCard({ c, token, onPress }: { c: OpenCourseClass; token?: string; onPress: () => void }) {
  const p = pricing(c);
  const off = discountLabel(c);
  const days = daysUntil(c.start_date);
  const seats = seatsLeft(c);
  const sch = scheduleParts(c.class_time);

  return (
    <Pressable onPress={onPress} className="overflow-hidden rounded-3xl bg-surface active:opacity-90">
      <CourseCover c={c} height={150} token={token}>
        <View className="absolute left-3 right-3 top-3 flex-row flex-wrap gap-1.5">
          {off && p.hasPromo ? (
            <View className="flex-row items-center gap-1 rounded-full bg-brand px-2.5 py-1">
              <Ionicons name="flame" size={11} color="#fff" />
              <Text className="text-[11.5px] font-extrabold text-white">{off}</Text>
            </View>
          ) : null}
          {days !== null && days <= 14 ? (
            <View className="rounded-full bg-white/90 px-2.5 py-1">
              <Text className="text-[11.5px] font-bold" style={{ color: '#111827' }}>
                {days === 0 ? 'Khai giảng hôm nay' : `Khai giảng sau ${days} ngày`}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1">
          <Text className="text-[11.5px] font-bold text-white">{COURSE_TYPE_LABEL[c.course_type] ?? c.course_type}</Text>
        </View>
      </CourseCover>

      <View className="gap-2.5 p-4">
        <View className="gap-0.5">
          <Text className="text-[12px] font-bold uppercase tracking-wide text-brand" numberOfLines={1}>
            {c.course?.course_name || 'Khoá học Uspeak'}
          </Text>
          <Text className="text-[17px] font-extrabold leading-6 text-foreground" numberOfLines={2}>
            {c.display_name || c.class_name}
          </Text>
        </View>

        <View className="gap-1.5">
          {c.teacher?.name ? (
            <View className="flex-row items-center gap-2">
              <Avatar name={c.teacher.name} uri={resolveMediaUrl(c.teacher.avatar, token)} size={22} />
              <Text className="text-[13.5px] text-foreground" numberOfLines={1}>
                {c.teacher.name}
              </Text>
            </View>
          ) : null}
          <Meta
            icon="calendar-outline"
            text={[`Khai giảng ${formatDate(c.start_date)}`, sessionsText(c)].filter(Boolean).join(' · ')}
          />
          {sch ? (
            <Meta icon="time-outline" text={`${sch.days.join(' · ')} · ${sch.time}`} />
          ) : c.class_time ? (
            <Meta icon="time-outline" text={c.class_time} />
          ) : null}
          {seats !== null ? (
            <Meta icon="people-outline" text={seats > 0 ? `Còn ${seats} chỗ` : 'Đã đủ học viên'} warn={seats <= 5} />
          ) : null}
        </View>

        <View className="flex-row items-end justify-between border-t border-border pt-2.5">
          <View>
            {p.hasPromo ? <Text className="text-[12.5px] text-muted line-through">{priceText(c.price)}</Text> : null}
            <Text className="text-[19px] font-extrabold text-brand">{priceText(p.finalPrice)}</Text>
          </View>
          <View className="flex-row items-center gap-1 rounded-full bg-brand-soft px-3.5 py-2">
            <Text className="text-[13.5px] font-bold text-brand">Xem chi tiết</Text>
            <Ionicons name="arrow-forward" size={14} color="#b62025" />
          </View>
        </View>
      </View>
    </Pressable>
  );
});

function Meta({ icon, text, warn }: { icon: 'calendar-outline' | 'time-outline' | 'people-outline'; text: string; warn?: boolean }) {
  return (
    <View className="flex-row items-center gap-2">
      <Ionicons name={icon} size={15} color={warn ? '#d97706' : '#6b7280'} />
      <Text className={`flex-1 text-[13.5px] ${warn ? 'font-semibold text-warning' : 'text-muted'}`} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
