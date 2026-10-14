import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { TextField } from '@/components/ui/text-field';
import { authApi } from '@/features/auth/api';
import type { AccountOption, LoginResult, RoleOption } from '@/features/auth/types';
import { getErrorMessage } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Đăng nhập email + mật khẩu (CRM cấp tài khoản). Một email có thể gắn nhiều vai trò / nhiều
 * tài khoản → class-be trả `needSelection` và mình hỏi tiếp từng bước, giống web
 * (uspeak-class-fe/src/app/[locale]/login/page.tsx).
 *
 * Giao diện theo trang đăng nhập web class: ảnh nền 3D + lớp phủ xanh navy, logo trắng, form
 * nằm trong thẻ trắng (ở điện thoại là tấm trượt từ dưới lên, đè lên mép dưới ảnh).
 */
const NAVY = '#141f5f';
const PRIVACY_URL = 'https://uspeak.vn/chinh-sach-bao-mat';
const TERMS_URL = 'https://uspeak.vn/dieu-khoan-su-dung';
type Step = { kind: 'form' } | { kind: 'role'; roles: RoleOption[] } | { kind: 'account'; role: string; users: AccountOption[] };

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const brand = useThemeColor('brand');
  const surface = useThemeColor('surface');
  const completeLogin = useAuthStore((s) => s.completeLogin);
  const passwordRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Bàn phím mở xong mới cuộn: Android tự cuộn tới ô đang gõ TRƯỚC khi KeyboardAvoider kịp thêm
  // khoảng đệm → cuộn thiếu, ô mật khẩu vẫn bị che. Cuộn hẳn xuống cuối để thấy cả nút Đăng nhập.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60));
    return () => sub.remove();
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // key của nút đang chờ
  const [step, setStep] = useState<Step>({ kind: 'form' });

  async function handleResult(result: LoginResult) {
    if (!result.needSelection) {
      await completeLogin(result);
      return;
    }
    if (result.selectionType === 'role') setStep({ kind: 'role', roles: result.availableRoles });
    else setStep({ kind: 'account', role: result.selectedRole, users: result.users });
  }

  async function submit(extra: { role_code?: string; userId?: string } = {}, key = 'form') {
    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }
    setError(null);
    setLoading(key);
    try {
      const result = await authApi.login({ email: email.trim(), password, ...extra });
      await handleResult(result);
    } catch (err) {
      setError(getErrorMessage(err, 'Email hoặc mật khẩu không đúng.'));
    } finally {
      setLoading(null);
    }
  }

  // Ảnh nền chiếm ~45% màn hình (không quá cao trên máy dài, không quá thấp trên máy ngắn)
  const heroHeight = Math.round(Math.max(300, Math.min(width * 1.05, height * 0.46)));

  return (
    // Nền gốc để MÀU THẺ (trắng/tối), không để navy: phần dưới thẻ — vùng thanh điều hướng của
    // Android, chỗ nảy khi kéo — mà để navy thì lòi ra một dải xanh dưới đáy. Navy chỉ đặt cho
    // riêng khối ảnh nền ở trên.
    <KeyboardAvoider style={{ flex: 1, backgroundColor: surface }}>
      <StatusBar style="light" />
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ flexGrow: 1 }}>
        {/* ── Ảnh nền + thương hiệu (giống cột trái trang đăng nhập web) ── */}
        <View style={{ height: heroHeight, backgroundColor: NAVY }}>
          <Image
            source={require('@/assets/images/login-hero.webp')}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="cover"
            contentPosition={{ top: '35%', left: '62%' }}
          />
          {/* Phủ navy từ trái sang (chữ dễ đọc) + từ trên/dưới xuống (hoà vào nền) — cùng thông số web */}
          <LinearGradient
            colors={['rgba(20,31,95,0.92)', 'rgba(31,43,104,0.6)', 'rgba(39,56,128,0.15)', 'rgba(182,32,37,0.12)']}
            locations={[0, 0.45, 0.75, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <LinearGradient
            colors={['rgba(20,30,88,0.55)', 'rgba(20,30,88,0)', 'rgba(20,28,78,0.85)']}
            locations={[0, 0.35, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View className="flex-1 justify-between px-6 pb-12" style={{ paddingTop: insets.top + 16 }}>
            <Image
              source={require('@/assets/images/logo-horizontal.png')}
              style={{ width: 132, height: 43 }}
              contentFit="contain"
              tintColor="#ffffff"
              accessibilityLabel="Uspeak"
            />
            <View className="gap-3">
              <View className="flex-row items-center gap-1.5 self-start rounded-full border border-white/20 bg-white/10 px-3 py-1">
                <Ionicons name="shield-checkmark" size={14} color="#ffffff" />
                <Text className="text-xs font-semibold text-white/90">Uspeak English</Text>
              </View>
              <Text className="max-w-[300px] text-[26px] font-bold leading-[33px] text-white">
                Quản lý lớp học, bài tập và nhận xét bài tập.
              </Text>
            </View>
          </View>
        </View>

        {/* ── Thẻ đăng nhập — tấm trượt đè lên mép dưới ảnh ── */}
        <View className="-mt-7 flex-1 rounded-t-[28px] bg-surface px-6 pt-7" style={{ paddingBottom: insets.bottom + 20 }}>
          {step.kind === 'form' ? (
            <View className="mb-6 items-center gap-2">
              <View className="mb-1 h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
                <Ionicons name="school-outline" size={24} color={brand} />
              </View>
              <Text className="text-2xl font-bold text-foreground">Đăng nhập</Text>
              <Text className="text-center text-sm leading-5 text-muted">
                Đăng nhập để vào hệ thống học tập và nhận xét điểm của Uspeak.
              </Text>
            </View>
          ) : null}

          {step.kind === 'form' ? (
            <View className="gap-4">
              <TextField
                label="Email"
                icon="mail-outline"
                placeholder="ten@truonghoc.edu.vn"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="username"
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <TextField
                ref={passwordRef}
                label="Mật khẩu"
                icon="lock-closed-outline"
                placeholder="Nhập mật khẩu"
                password
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={() => submit()}
              />
              {error ? <ErrorBox message={error} /> : null}
              <Button title="Đăng nhập" icon="log-in-outline" loading={loading === 'form'} onPress={() => submit()} className="mt-2" />
            </View>
          ) : null}

          {step.kind === 'role' ? (
            <SelectionList
              title="Chọn vai trò"
              description="Email này có nhiều vai trò. Bạn muốn vào với vai trò nào?"
              error={error}
              onBack={() => setStep({ kind: 'form' })}
              items={step.roles.map((r) => ({
                key: r.role_code,
                title: r.role_name,
                subtitle: r.user_count > 1 ? `${r.user_count} tài khoản` : undefined,
                loading: loading === r.role_code,
                onPress: () => submit({ role_code: r.role_code }, r.role_code),
              }))}
            />
          ) : null}

          {step.kind === 'account' ? (
            <SelectionList
              title="Chọn tài khoản"
              description="Có nhiều tài khoản dùng chung email này."
              error={error}
              onBack={() => setStep({ kind: 'form' })}
              items={step.users.map((u) => ({
                key: u._id,
                title: u.name,
                subtitle: u.classes?.map((c) => c.class_code).join(', ') || u.phone,
                avatar: { name: u.name, uri: u.avatar },
                loading: loading === u._id,
                onPress: () => submit({ role_code: step.role, userId: u._id }, u._id),
              }))}
            />
          ) : null}

          <View className="mt-auto flex-row justify-center gap-6 pt-8">
            <Pressable hitSlop={8} onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}>
              <Text className="text-xs font-semibold uppercase tracking-widest text-muted">Chính sách bảo mật</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}>
              <Text className="text-xs font-semibold uppercase tracking-widest text-muted">Điều khoản</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoider>
  );
}

function ErrorBox({ message }: { message: string }) {
  const danger = useThemeColor('danger');
  return (
    <View className="flex-row items-start gap-2 rounded-xl bg-danger-soft p-3">
      <Ionicons name="alert-circle" size={18} color={danger} />
      <Text className="flex-1 text-sm text-danger">{message}</Text>
    </View>
  );
}

interface SelectionItem {
  key: string;
  title: string;
  subtitle?: string;
  avatar?: { name: string; uri?: string };
  loading?: boolean;
  onPress: () => void;
}

function SelectionList({
  title,
  description,
  items,
  error,
  onBack,
}: {
  title: string;
  description: string;
  items: SelectionItem[];
  error: string | null;
  onBack: () => void;
}) {
  const muted = useThemeColor('muted');
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-xl font-semibold text-foreground">{title}</Text>
        <Text className="text-base text-muted">{description}</Text>
      </View>
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((item, i) => (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            disabled={item.loading}
            className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-surface-muted ${i > 0 ? 'border-t border-border' : ''}`}>
            {item.avatar ? <Avatar name={item.avatar.name} uri={item.avatar.uri} size={36} /> : null}
            <View className="flex-1">
              <Text className="text-base font-medium text-foreground">{item.title}</Text>
              {item.subtitle ? (
                <Text className="text-sm text-muted" numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            <Ionicons name={item.loading ? 'hourglass-outline' : 'chevron-forward'} size={18} color={muted} />
          </Pressable>
        ))}
      </View>
      {error ? <ErrorBox message={error} /> : null}
      <Button title="Quay lại" variant="ghost" onPress={onBack} />
    </View>
  );
}
