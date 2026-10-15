import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, Text, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useThemeColor } from '@/theme/use-theme-color';

/** Ảnh trong bài nộp: ảnh đã nộp trước đó (có S3 key) hoặc ảnh mới chọn trên máy. */
export type PickedImage = { kind: 'existing'; key: string; url: string } | { kind: 'new'; uri: string };

interface Props {
  images: PickedImage[];
  onChange: (next: PickedImage[]) => void;
  max?: number;
  disabled?: boolean;
}

/** Chọn ảnh bài làm từ thư viện hoặc chụp mới; lưới ảnh thu nhỏ có nút xoá. */
export function ImagesEditor({ images, onChange, max = 10, disabled }: Props) {
  const brand = useThemeColor('brand');
  const onBrand = useThemeColor('on-brand');
  const room = max - images.length;

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 1, // nén sau bằng image-manipulator (detail-api.uploadImages)
    });
    if (!res.canceled) add(res.assets.map((a) => a.uri));
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast('warning', 'Chưa có quyền camera', 'Vào Cài đặt → Uspeak Class để bật quyền camera.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!res.canceled) add(res.assets.map((a) => a.uri));
  }

  function add(uris: string[]) {
    const next = [...images, ...uris.map((uri) => ({ kind: 'new' as const, uri }))].slice(0, max);
    if (images.length + uris.length > max) showToast('warning', 'Quá số ảnh', `Mỗi bài tối đa ${max} ảnh.`);
    onChange(next);
  }

  return (
    <View className="gap-3">
      {images.length ? (
        <View className="flex-row flex-wrap gap-2">
          {images.map((img, i) => (
            <View key={img.kind === 'existing' ? img.key : img.uri} className="relative">
              <Image
                source={{ uri: img.kind === 'existing' ? img.url : img.uri }}
                style={{ width: 100, height: 100, borderRadius: 12 }}
                contentFit="cover"
              />
              {!disabled ? (
                <Pressable
                  hitSlop={6}
                  accessibilityLabel="Xoá ảnh"
                  onPress={() => onChange(images.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60">
                  <Ionicons name="close" size={14} color={onBrand} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {!disabled && room > 0 ? (
        <View className="flex-row gap-2">
          <PickButton icon="images-outline" label="Chọn ảnh" color={brand} onPress={pickFromLibrary} />
          <PickButton icon="camera-outline" label="Chụp ảnh" color={brand} onPress={takePhoto} />
        </View>
      ) : null}
      <Text className="text-xs text-muted">
        {images.length}/{max} ảnh · ảnh được nén tự động trước khi gửi
      </Text>
    </View>
  );
}

function PickButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: 'images-outline' | 'camera-outline';
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3.5 active:opacity-70">
      <Ionicons name={icon} size={20} color={color} />
      <Text className="text-sm font-semibold text-brand">{label}</Text>
    </Pressable>
  );
}

/** Upload ảnh mới (nếu có) rồi trả về danh sách S3 key đầy đủ theo đúng thứ tự hiển thị. */
export async function resolveImageKeys(
  images: PickedImage[],
  upload: (uris: string[]) => Promise<string[]>,
): Promise<string[]> {
  const newUris = images.flatMap((i) => (i.kind === 'new' ? [i.uri] : []));
  const uploaded = newUris.length ? await upload(newUris) : [];
  if (uploaded.length !== newUris.length) throw new Error('Tải ảnh lên chưa xong, vui lòng thử lại.');
  let n = 0;
  return images.map((i) => (i.kind === 'existing' ? i.key : uploaded[n++]));
}

export function existingImages(urls?: string[], keys?: string[]): PickedImage[] {
  return (keys ?? []).map((key, i) => ({ kind: 'existing' as const, key, url: urls?.[i] ?? '' }));
}
