import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
import { useIsDark } from '@/theme/theme-preference';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Đăng nhập bằng Google (cách chính, như web) hoặc email + mật khẩu (CRM cấp tài khoản). Một email
 * có thể gắn nhiều vai trò / nhiều tài khoản → class-be trả `needSelection` và mình hỏi tiếp từng
 * bước, giống web (uspeak-class-fe/src/app/[locale]/login/page.tsx): luồng mật khẩu gọi lại
 * /auth/login kèm role_code/userId, luồng Google gọi /auth/google-select. Google đi qua trang web
 * cầu nối /mobile-login (xem features/auth/google-web) nên dùng chung OAuth client với web.
 *
 * Giao diện giống màn đăng nhập app Task (uspeak-chat-task-app/src/app/login.tsx): nền trơn có 2 đốm
 * màu mờ, thẻ trắng giữa màn với logo, tiêu đề, nút Google, vạch "hoặc", ô Email / Mật khẩu. Đổi
 * kiểu ở app này thì xem bên kia cho 2 app giống nhau. Ảnh nền 3D kiểu web cũ đã bỏ (03/11/2026).
 */
const PRIVACY_URL = 'https://uspeak.vn/chinh-sach-bao-mat';
const TERMS_URL = 'https://uspeak.vn/dieu-khoan-su-dung';
type Step = { kind: 'form' } | { kind: 'role'; roles: RoleOption[] } | { kind: 'account'; role: string; users: AccountOption[] };

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const dark = useIsDark();
  const completeLogin = useAuthStore((s) => s.completeLogin);
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // key của nút đang chờ
  const [step, setStep] = useState<Step>({ kind: 'form' });
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

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* Đốm màu mờ trang trí — cùng kiểu màn đăng nhập app Task (uspeak-chat-task-app) */}
      <View className="absolute -left-16 top-10 h-72 w-72 rounded-full bg-info opacity-[0.07]" />
      <View className="absolute -right-20 bottom-16 h-80 w-80 rounded-full bg-violet opacity-[0.07]" />

      <KeyboardAvoider>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          bounces={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: 20,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
          }}>
          <View
            className="w-full gap-4 self-center rounded-2xl border border-border bg-surface p-7"
            style={{ maxWidth: 440, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}>
            <View className="items-center pb-1">
              <Image
                source={require('@/assets/images/logo-horizontal.png')}
                style={{ width: 180, height: 58 }}
                contentFit="contain"
                tintColor={dark ? '#ffffff' : undefined}
                accessibilityLabel="Uspeak"
              />
            </View>

            {step.kind === 'form' ? (
              <>
                <View className="items-center gap-1 pb-2">
                  <Text className="text-[24px] font-bold tracking-tight text-foreground">Đăng nhập</Text>
                  <Text className="text-center text-[13.5px] text-muted">Đăng nhập để vào hệ thống học tập của Uspeak</Text>
                </View>

                {error ? <ErrorBox message={error} /> : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đăng nhập bằng Google"
                  onPress={() => void signInWithGoogle()}
                  disabled={!!loading}
                  className={`h-12 flex-row items-center justify-center gap-3 rounded-xl border border-border bg-surface active:opacity-80 ${loading ? 'opacity-60' : ''}`}>
                  {loading === 'google' ? <ActivityIndicator color={muted} /> : <GoogleIcon />}
                  <Text className="text-[14px] font-medium text-foreground">
                    {loading === 'google' ? 'Đang đăng nhập bằng Google...' : 'Đăng nhập bằng Google'}
                  </Text>
                </Pressable>

                <View className="flex-row items-center gap-3">
                  <View className="h-px flex-1 bg-border" />
                  <Text className="text-[11.5px] font-medium uppercase tracking-widest text-muted">hoặc</Text>
                  <View className="h-px flex-1 bg-border" />
                </View>

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
                  placeholder="••••••••"
                  password
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={() => submit()}
                />
                <Button
                  title="Đăng nhập"
                  loading={loading === 'form'}
                  disabled={!!loading && loading !== 'form'}
                  onPress={() => submit()}
                />
              </>
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
          </View>

          <View className="flex-row items-center justify-center gap-2 pt-5">
            <Pressable hitSlop={8} onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}>
              <Text className="text-[12px] text-muted">Chính sách bảo mật</Text>
            </Pressable>
            <Text className="text-[12px] text-muted">·</Text>
            <Pressable hitSlop={8} onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}>
              <Text className="text-[12px] text-muted">Điều khoản sử dụng</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoider>
    </View>
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
