import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { HtmlView } from '@/components/ui/html-view';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { ImageViewer } from '@/features/chat/message-content';
import { avatarColor } from '@/features/chat/room-avatar';
import { useIncrementWikiView, useWikiDoc, type WikiAttachment, type WikiSection } from '@/features/wiki/api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

const formatSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Gom các đề mục: mỗi đề mục cấp 1 mở 1 thẻ, đề mục cấp 2–3 nằm trong thẻ của cấp 1 phía trước. */
function groupSections(sections: WikiSection[]) {
  const groups: { head: WikiSection; subs: WikiSection[] }[] = [];
  for (const s of sections) {
    const last = groups[groups.length - 1];
    if (last && s.level > 1 && last.head.level <= s.level) last.subs.push(s);
    else groups.push({ head: s, subs: [] });
  }
  return groups;
}

/**
 * Đọc 1 bài Wiki / Hướng dẫn kiểu bài báo trên điện thoại: thẻ đầu bài (danh mục, tiêu đề, tác giả,
 * lượt xem) → mỗi phần là 1 thẻ có vạch màu → đính kèm. Thanh tiến độ đọc dưới header, nút mục lục
 * (bài ≥3 đề mục) cuộn tới phần, bấm ảnh để xem to.
 */
export default function WikiDocScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useWikiDoc(id);
  const increment = useIncrementWikiView();
  const pull = usePullRefresh(() => doc.refetch());
  const brand = useThemeColor('brand');
  const fg = useThemeColor('foreground');
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef(new Map<string, number>());
  const [tocOpen, setTocOpen] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  // Tiến độ đọc: Animated (native driver) để cuộn không render lại cả bài
  const [scrollY] = useState(() => new Animated.Value(0));
  const [contentH, setContentH] = useState(0);
  const [viewH, setViewH] = useState(0);
  const maxScroll = Math.max(1, contentH - viewH);

  // Lượt xem tăng đúng 1 lần khi mở bài (class-be không tự tăng trong GET /wiki/:id).
  useEffect(() => {
    if (id) increment.mutate(id);
    // mutation object đổi mỗi render → chỉ phụ thuộc id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const data = doc.data;
  const sections = useMemo(() => data?.sections?.filter((s) => s.tieu_de?.trim() || s.noi_dung?.trim()) ?? [], [data]);
  const groups = useMemo(() => groupSections(sections), [sections]);
  const toc = sections.filter((s) => s.tieu_de?.trim());
  const color = avatarColor(data?.category_id?._id ?? id ?? '');

  const jump = (key: string) => {
    setTocOpen(false);
    const y = sectionY.current.get(key);
    if (y !== undefined) scrollRef.current?.scrollTo({ y: y - 12, animated: true });
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: '',
          headerRight:
            toc.length >= 3
              ? () => (
                  <Pressable onPress={() => setTocOpen(true)} hitSlop={10} accessibilityLabel="Mục lục" className="px-1 active:opacity-60">
                    <Ionicons name="list" size={23} color={fg} />
                  </Pressable>
                )
              : undefined,
        }}
      />
      {doc.isLoading ? (
        <LoadingView />
      ) : doc.isError || !data ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không mở được bài viết"
          description={getErrorMessage(doc.error)}
          actionLabel="Thử lại"
          onAction={() => doc.refetch()}
        />
      ) : (
        <>
          <View className="h-[3px] bg-transparent">
            <Animated.View
              className="h-full bg-brand"
              style={{
                width: '100%',
                transformOrigin: 'left',
                transform: [{ scaleX: scrollY.interpolate({ inputRange: [0, maxScroll], outputRange: [0, 1], extrapolate: 'clamp' }) }],
              }}
            />
          </View>
          <Animated.ScrollView
            ref={scrollRef}
            contentContainerClassName="gap-3 p-4 pb-12"
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
            onContentSizeChange={(_, h) => setContentH(h)}
            onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
            refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
            {/* Đầu bài */}
            <View className="gap-3 overflow-hidden rounded-3xl bg-surface p-5">
              <View className="absolute -right-10 -top-10 h-36 w-36 rounded-full" style={{ backgroundColor: `${color}14` }} />
              <View className="flex-row items-center gap-2">
                <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1f` }}>
                  <Ionicons name={data.space === 'guide' ? 'book' : 'document-text'} size={18} color={color} />
                </View>
                <Text className="text-[12.5px] font-bold uppercase tracking-wide" style={{ color }}>
                  {data.category_id?.ten || (data.space === 'guide' ? 'Hướng dẫn' : 'Wiki')}
                </Text>
              </View>
              <Text className="text-[23px] font-extrabold leading-8 text-foreground">{data.tieu_de}</Text>
              {data.tom_tat ? <Text className="text-[15px] leading-6 text-muted">{data.tom_tat}</Text> : null}
              <View className="flex-row items-center gap-2.5 border-t border-border pt-3">
                <Avatar name={data.nguoi_tao_id?.ho_ten || 'Uspeak'} size={32} />
                <View className="flex-1">
                  <Text className="text-[13.5px] font-semibold text-foreground" numberOfLines={1}>
                    {data.nguoi_tao_id?.ho_ten || 'Uspeak'}
                  </Text>
                  <Text className="text-[12px] text-muted">Cập nhật {formatDate(data.updated_at || data.created_at)}</Text>
                </View>
                <View className="flex-row items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1">
                  <Ionicons name="eye-outline" size={13} color="#6b7280" />
                  <Text className="text-[12px] font-semibold text-muted">{data.luot_xem ?? 0}</Text>
                </View>
              </View>
            </View>

            {toc.length >= 3 ? (
              <Pressable onPress={() => setTocOpen(true)} className="flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3 active:opacity-80">
                <Ionicons name="list" size={18} color={color} />
                <Text className="flex-1 text-[14.5px] font-semibold text-foreground">Mục lục · {toc.length} mục</Text>
                <Ionicons name="chevron-down" size={16} color="#9ca3af" />
              </Pressable>
            ) : null}

            {groups.length ? (
              groups.map(({ head, subs }) => (
                <View
                  key={head.key}
                  onLayout={(e) => sectionY.current.set(head.key, e.nativeEvent.layout.y)}
                  className="gap-3 rounded-3xl bg-surface p-4">
                  {head.tieu_de?.trim() ? <SectionTitle title={head.tieu_de} color={color} /> : null}
                  <HtmlView html={head.noi_dung} onImagePress={setViewer} />
                  {subs.map((sub) => (
                    <View
                      key={sub.key}
                      // toạ độ con tính theo thẻ cha → cộng thêm vị trí thẻ khi cuộn tới
                      onLayout={(e) => {
                        const parent = sectionY.current.get(head.key) ?? 0;
                        sectionY.current.set(sub.key, parent + e.nativeEvent.layout.y);
                      }}
                      className="gap-2.5 border-t border-border pt-3">
                      {sub.tieu_de?.trim() ? (
                        <Text className={`text-foreground ${sub.level === 2 ? 'text-[17px] font-extrabold' : 'text-[15.5px] font-bold'}`}>
                          {sub.tieu_de}
                        </Text>
                      ) : null}
                      <HtmlView html={sub.noi_dung} onImagePress={setViewer} />
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <View className="rounded-3xl bg-surface p-4">
                <HtmlView html={data.noi_dung} onImagePress={setViewer} />
              </View>
            )}

            {data.dinh_kem?.length ? (
              <View className="gap-2 rounded-3xl bg-surface p-4">
                <Text className="text-[15px] font-extrabold text-foreground">Tài liệu đính kèm · {data.dinh_kem.length}</Text>
                {data.dinh_kem.map((file) => (
                  <AttachmentRow key={file.key} file={file} />
                ))}
              </View>
            ) : null}
          </Animated.ScrollView>
        </>
      )}

      <Modal visible={tocOpen} transparent animationType="slide" onRequestClose={() => setTocOpen(false)} statusBarTranslucent>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="absolute inset-0" onPress={() => setTocOpen(false)} />
          <View className="max-h-[75%] rounded-t-3xl bg-surface pt-3" style={{ paddingBottom: insets.bottom + 8 }}>
            <View className="h-1 w-10 self-center rounded-full bg-border" />
            <Text className="px-5 pb-2 pt-3 text-[17px] font-extrabold text-foreground">Mục lục</Text>
            <ScrollView>
              {toc.map((t, i) => (
                <Pressable
                  key={t.key}
                  onPress={() => jump(t.key)}
                  className={`flex-row items-center gap-3 py-3 pr-5 active:bg-surface-muted ${i ? 'border-t border-border' : ''}`}
                  style={{ paddingLeft: 20 + Math.max(0, t.level - 1) * 16 }}>
                  <Text className={`flex-1 text-[14.5px] text-foreground ${t.level <= 1 ? 'font-bold' : ''}`}>{t.tieu_de}</Text>
                  <Ionicons name="chevron-forward" size={15} color="#9ca3af" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ImageViewer uri={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

function SectionTitle({ title, color }: { title: string; color: string }) {
  return (
    <View className="flex-row gap-2.5">
      <View className="w-1 rounded-full" style={{ backgroundColor: color }} />
      <Text className="flex-1 text-[19px] font-extrabold leading-7 text-foreground">{title}</Text>
    </View>
  );
}

function AttachmentRow({ file }: { file: WikiAttachment }) {
  const brand = useThemeColor('brand');
  const ext = (file.name.split('.').pop() ?? '').slice(0, 4).toUpperCase();
  return (
    <Pressable
      onPress={() => file.url && Linking.openURL(file.url)}
      className="flex-row items-center gap-3 rounded-2xl bg-surface-muted p-3 active:opacity-80">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
        <Text className="text-[10px] font-extrabold text-brand">{ext || 'FILE'}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
          {file.name}
        </Text>
        {formatSize(file.size) ? <Text className="text-[12px] text-muted">{formatSize(file.size)}</Text> : null}
      </View>
      <Ionicons name="download-outline" size={18} color={brand} />
    </Pressable>
  );
}
