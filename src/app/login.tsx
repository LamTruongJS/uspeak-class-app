import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { TextField } from '@/components/ui/text-field';
import { authApi } from '@/features/auth/api';
import { getGoogleAccessTokenViaWeb } from '@/features/auth/google-web';
import type { AccountOption, LoginResult, RoleOption } from '@/features/auth/types';
import { getErrorMessage } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Đăng nhập bằng Google (cách chính, như web) hoặc email + mật khẩu (CRM cấp tài khoản). Một email
 * có thể gắn nhiều vai trò / nhiều tài khoản → class-be trả `needSelection` và mình hỏi tiếp từng
 * bước, giống web (uspeak-class-fe/src/app/[locale]/login/page.tsx): luồng mật khẩu gọi lại
 * /auth/login kèm role_code/userId, luồng Google gọi /auth/google-select. Google đi qua trang web
 * cầu nối /mobile-login (xem features/auth/google-web) nên dùng chung OAuth client với web.
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
  // Như web: Google là cách chính, form email/mật khẩu chỉ mở khi người dùng chủ động chọn
  const [showForm, setShowForm] = useState(false);
  /**
   * Đang chọn vai trò/tài khoản cho luồng Google (null = luồng mật khẩu). `ticket` là vé class-be
   * phát kèm needSelection — google-select bắt buộc có (sống 10 phút), avatar Google nằm trong vé.
   */
  const [google, setGoogle] = useState<{ email: string; ticket: string } | null>(null);

  async function handleResult(result: LoginResult) {
    if (!result.needSelection) {
      await completeLogin(result);
      return;
    }
    if (result.selectionType === 'role') setStep({ kind: 'role', roles: result.availableRoles });
    else setStep({ kind: 'account', role: result.selectedRole, users: result.users });
  }

  async function signInWithGoogle() {
    if (loading) return;
    Keyboard.dismiss();
    setError(null);
    setLoading('google');
    try {
      const accessToken = await getGoogleAccessTokenViaWeb();
      if (!accessToken) return; // tự đóng trình duyệt / huỷ ở Google
      const result = await authApi.googleLogin(accessToken);
      if (result.needSelection) {
        const email = result.selectionType === 'role' ? result.email : (result.users[0]?.email ?? '');
        setGoogle({ email, ticket: result.selectionTicket ?? '' });
      }
      await handleResult(result);
    } catch (err) {
      setError(getErrorMessage(err, 'Đăng nhập Google thất bại.'));
    } finally {
      setLoading(null);
    }
  }

  /** Chọn vai trò / tài khoản: luồng Google gọi google-select, luồng mật khẩu gọi lại login. */
  async function choose(extra: { role_code?: string; userId?: string }, key: string, accountEmail?: string) {
    if (!google) return submit(extra, key);
    setError(null);
    setLoading(key);
    try {
      const result = await authApi.googleSelect({
        selectionTicket: google.ticket,
        email: accountEmail || google.email,
        ...extra,
      });
      if (result.needSelection && result.selectionTicket) setGoogle({ ...google, ticket: result.selectionTicket });
      await handleResult(result);
    } catch (err) {
      setError(getErrorMessage(err, 'Chọn tài khoản thất bại.'));
    } finally {
      setLoading(null);
    }
  }

  function backToForm() {
    setStep({ kind: 'form' });
    setGoogle(null);
    setError(null);
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đăng nhập bằng Google"
                onPress={() => void signInWithGoogle()}
                disabled={!!loading}
                className={`h-12 flex-row items-center justify-center gap-3 rounded-xl border border-brand bg-surface active:opacity-80 ${loading ? 'opacity-60' : ''}`}>
                {loading === 'google' ? <ActivityIndicator color={brand} /> : <GoogleIcon />}
                <Text className="text-sm font-semibold text-foreground">Đăng nhập bằng Google</Text>
              </Pressable>
              {error && !showForm ? <ErrorBox message={error} /> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showForm }}
                onPress={() => setShowForm((v) => !v)}
                className="flex-row items-center gap-3 py-2">
                <View className="h-px flex-1 bg-border" />
                <Text className="text-sm font-medium text-muted">Hoặc đăng nhập bằng cách thông thường</Text>
                <View className="h-px flex-1 bg-border" />
              </Pressable>
            </View>
          ) : null}

          {step.kind === 'form' && showForm ? (
            <View className="mt-2 gap-4">
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
              <Button
                title="Đăng nhập"
                icon="log-in-outline"
                loading={loading === 'form'}
                disabled={!!loading && loading !== 'form'}
                onPress={() => submit()}
                className="mt-2"
              />
            </View>
          ) : null}

          {step.kind === 'role' ? (
            <SelectionList
              title="Chọn vai trò"
              description="Email này có nhiều vai trò. Bạn muốn vào với vai trò nào?"
              error={error}
              onBack={backToForm}
              items={step.roles.map((r) => ({
                key: r.role_code,
                title: r.role_name,
                subtitle: r.user_count > 1 ? `${r.user_count} tài khoản` : undefined,
                loading: loading === r.role_code,
                onPress: () => choose({ role_code: r.role_code }, r.role_code),
              }))}
            />
          ) : null}

          {step.kind === 'account' ? (
            <SelectionList
              title="Chọn tài khoản"
              description="Có nhiều tài khoản dùng chung email này."
              error={error}
              onBack={backToForm}
              items={step.users.map((u) => ({
                key: u._id,
                title: u.name,
                subtitle: u.classes?.map((c) => c.class_code).join(', ') || u.phone,
                avatar: { name: u.name, uri: u.avatar },
                loading: loading === u._id,
                onPress: () => choose({ role_code: step.role, userId: u._id }, u._id, u.email),
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

/** Logo "G" nhiều màu — cùng path với nút Google trang /login của web. */
function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
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
