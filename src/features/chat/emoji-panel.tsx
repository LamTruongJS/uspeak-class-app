import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

import { EMOJI_CATEGORIES } from './emoji-data';

const RECENT_KEY = 'chat:recent-emoji';
const RECENT_MAX = 24;
const COLUMNS = 8;

/**
 * Bảng biểu tượng của ô soạn tin — kiểu Zalo/Messenger: KHÔNG phải hộp thoại nổi, mà là một
 * khối nằm ĐÚNG chỗ bàn phím (`height` do ô soạn tin truyền xuống = chiều cao bàn phím vừa đo),
 * nên đổi qua lại bàn phím ↔ biểu tượng thì ô nhập đứng yên.
 *
 * Bấm 1 biểu tượng = CHÈN vào ô nhập tại vị trí con trỏ (không gửi) — gõ chữ xen biểu tượng thoải
 * mái rồi bấm Gửi, giống web và giống Zalo. Nút ⌫ xoá lùi 1 ký tự cho khỏi phải mở lại bàn phím.
 */
export function EmojiPanel({
  height,
  onPick,
  onBackspace,
}: {
  height: number;
  onPick: (emoji: string) => void;
  onBackspace: () => void;
}) {
  const { width } = useWindowDimensions();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [tabKey, setTabKey] = useState(EMOJI_CATEGORIES[0].key);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => setRecent(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => undefined);
  }, []);

  const pick = (emoji: string) => {
    void Haptics.selectionAsync();
    onPick(emoji);
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  // Tab "Gần đây" chỉ hiện khi đã từng dùng. Nhớ tab đang xem theo KHOÁ chứ không theo số thứ tự:
  // lần chèn đầu tiên làm tab này chen vào đầu danh sách, theo số thứ tự là mọi nhóm lùi 1 ô.
  const tabs = recent.length
    ? [{ key: 'recent', label: 'Gần đây', icon: 'time-outline' as const, items: recent }, ...EMOJI_CATEGORIES]
    : EMOJI_CATEGORIES;
  const current = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const cell = width / COLUMNS;

  return (
    <View className="bg-surface" style={{ height }}>
      <FlatList
        // key theo nhóm: đổi nhóm là vẽ lại từ đầu, không giữ vị trí cuộn của nhóm trước
        key={current.key}
        data={current.items}
        numColumns={COLUMNS}
        keyExtractor={(item, i) => `${item}-${i}`}
        keyboardShouldPersistTaps="always"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 4 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => pick(item)}
            className="items-center justify-center active:opacity-50"
            style={{ width: cell, height: cell }}>
            {/* lineHeight thoáng hơn fontSize: emoji nhiều tầng (👨‍👩‍👧) bị cắt chân trên Android */}
            <Text style={{ fontSize: cell * 0.56, lineHeight: cell * 0.76 }}>{item}</Text>
          </Pressable>
        )}
      />

      <View className="flex-row items-center border-t border-border px-1 py-1">
        {tabs.map((t) => {
          const active = t.key === current.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTabKey(t.key)}
              accessibilityLabel={t.label}
              className="flex-1 items-center justify-center py-1">
              <View
                className="h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: active ? `${brand}1f` : 'transparent' }}>
                <Ionicons name={t.icon} size={18} color={active ? brand : muted} />
              </View>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onBackspace}
          hitSlop={6}
          accessibilityLabel="Xoá lùi"
          className="h-8 w-9 items-center justify-center rounded-full active:opacity-60">
          <Ionicons name="backspace-outline" size={19} color={muted} />
        </Pressable>
      </View>
    </View>
  );
}
