import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { mediaCacheKey, useMediaUrl } from '@/lib/media';
import { Screen } from '@/components/ui/screen';
import { SUPPORT_HOTLINE, SUPPORT_HOTLINE_TEL } from '@/constants/support';
import { authApi } from '@/features/auth/api';
import { ChangePasswordSheet } from '@/features/auth/change-password-sheet';
import { EditProfileSheet } from '@/features/auth/edit-profile-sheet';
import { PaymentInfoSheet } from '@/features/auth/payment-info-sheet';
import { findBank } from '@/features/auth/vietqr-banks';
import { getErrorMessage } from '@/lib/api/client';
import { FEATURES } from '@/navigation/features';
import { openFeature } from '@/navigation/open-feature';
import { useAuthStore } from '@/stores/auth.store';
import { setThemePreference, useThemePreference, type ThemePreference } from '@/theme/theme-preference';
import { useThemeColor } from '@/theme/use-theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ROLE_NAMES: Record<string, string> = {
  AD: 'Quản trị viên',
  TE: 'Giáo viên',
  TA: 'Trợ giảng',
  TG: 'Nhận xét bài',
  ST: 'Học viên',
};

/** Icon + màu nền của từng vai trò (ô vuông màu kiểu Cài đặt iOS) */
const ROLE_STYLE: Record<string, { icon: IconName; color: string }> = {
  AD: { icon: 'shield-checkmark', color: '#475569' },
  TE: { icon: 'school', color: '#2563eb' },
  TA: { icon: 'people', color: '#7c3aed' },
  TG: { icon: 'create', color: '#d97706' },
  ST: { icon: 'person', color: '#059669' },
};

const THEMES: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'system', label: 'Theo máy', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Sáng', icon: 'sunny-outline' },
  { value: 'dark', label: 'Tối', icon: 'moon-outline' },
];

/**
 * Tài khoản: thẻ hồ sơ (đổi ảnh đại diện), thông tin liên hệ, đổi mật khẩu, giao diện sáng/tối,
 * thông báo, chuyển vai trò, hỗ trợ, đăng xuất.
 */
export default function AccountScreen() {
  const user = useAuthStore((s) => s.user);
  // Ảnh đại diện lưu ở class-be dạng `/uploads/file?key=…` → phải nối media token mới tải được
  const avatarUri = useMediaUrl(user?.avatar);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const completeLogin = useAuthStore((s) => s.completeLogin);
  const theme = useThemePreference();
  const [switching, setSwitching] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const sheet = useActionSheet();
  const [profileOpen, setProfileOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const roles = user?.available_roles ?? [];
  // Khối "Thông tin nhận tiền" ẩn với học viên — giống bản web (chỉ người chấm bài mới cần)
  const isStudent = (user?.role_code ?? 'ST') === 'ST';
  const payment = user?.payment_info;
  const paymentBank = findBank(payment?.bank_code);
  const policies = FEATURES.find((f) => f.key === 'policies');
  const roleName = ROLE_NAMES[user?.role_code ?? ''] ?? user?.role_code ?? '';

  async function changeAvatar() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled || !res.assets[0] || !user) return;
    setUploading(true);
    try {
      const url = await authApi.uploadAvatar(res.assets[0].uri);
      if (url) setUser({ ...user, avatar: url });
    } catch (err) {
      showToast('error', 'Chưa đổi được ảnh', getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function switchRole(roleCode: string) {
    if (roleCode === user?.role_code) return;
    setSwitching(roleCode);
    try {
      const result = await authApi.switchRole(roleCode);
      if (result.needSelection) {
        showToast('warning', 'Cần chọn tài khoản', 'Vai trò này có nhiều tài khoản — vui lòng đăng xuất rồi đăng nhập lại để chọn.');
        return;
      }
      await completeLogin(result);
      router.navigate('/');
    } catch (err) {
      showToast('error', 'Không đổi được vai trò', getErrorMessage(err));
    } finally {
      setSwitching(null);
    }
  }

  function confirmLogout() {
    sheet.confirm({
      title: 'Đăng xuất',
      message: 'Bạn chắc chắn muốn đăng xuất?',
      label: 'Đăng xuất',
      icon: 'log-out-outline',
      onConfirm: async () => {
        setLoggingOut(true);
        await logout();
      },
    });
  }

  return (
    <Screen title="Tài khoản">
      {/* ── Thẻ hồ sơ ── */}
      <LinearGradient
        colors={['#c8262c', '#8b191e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 22, overflow: 'hidden' }}>
        <View className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <View className="absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-white/5" />
        <View className="flex-row items-center gap-4 p-5">
          <Pressable onPress={changeAvatar} disabled={uploading} accessibilityLabel="Đổi ảnh đại diện" className="active:opacity-80">
            <View className="rounded-full border-[3px] border-white/40">
              <Avatar name={user?.name} uri={avatarUri} cacheKey={mediaCacheKey(user?.avatar)} size={72} />
            </View>
            <View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-2 border-[#a81e23] bg-white">
              {uploading ? <ActivityIndicator size="small" color="#b62025" /> : <Ionicons name="camera" size={14} color="#b62025" />}
            </View>
          </Pressable>
          <View className="flex-1 gap-1">
            <Text className="text-xl font-bold text-white" numberOfLines={2}>
              {user?.name}
            </Text>
            <View className="flex-row items-center gap-1.5 self-start rounded-full bg-white/20 px-2.5 py-1">
              <Ionicons name={ROLE_STYLE[user?.role_code ?? '']?.icon ?? 'person'} size={12} color="#fff" />
              <Text className="text-xs font-semibold text-white">{roleName}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* ── Thông tin liên hệ ── */}
      <Section title="Thông tin">
        <InfoRow first icon="mail" color="#2563eb" label="Email" value={user?.email} />
        <InfoRow icon="call" color="#059669" label="Số điện thoại" value={user?.phone} />
        <Row icon="create" color="#7c3aed" label="Sửa hồ sơ" hint="Tên · SĐT" onPress={() => setProfileOpen(true)} />
      </Section>

      {/* ── Nhận tiền chấm bài (nhân sự) ── */}
      {!isStudent ? (
        <Section title="Nhận tiền chấm bài">
          <Row
            first
            icon="card"
            color="#059669"
            label={paymentBank ? paymentBank.shortName : 'Thêm tài khoản nhận tiền'}
            hint={payment?.bank_account_number ? maskAccount(payment.bank_account_number) : 'Chưa có'}
            onPress={() => setPaymentOpen(true)}
          />
        </Section>
      ) : null}

      {/* ── Bảo mật ── */}
      <Section title="Bảo mật">
        <Row first icon="key" color="#d97706" label="Đổi mật khẩu" onPress={() => setPasswordOpen(true)} />
      </Section>

      {/* ── Cài đặt ── */}
      <Section title="Cài đặt">
        <View className="gap-2.5 px-4 py-3.5">
          <View className="flex-row items-center gap-3">
            <IconBox icon="color-palette" color="#7c3aed" />
            <Text className="flex-1 text-base text-foreground">Giao diện</Text>
          </View>
          <View className="flex-row rounded-xl bg-surface-muted p-1">
            {THEMES.map((t) => (
              <ThemeOption key={t.value} option={t} active={theme === t.value} onPress={() => setThemePreference(t.value)} />
            ))}
          </View>
        </View>
        <Row icon="notifications" color="#dc2626" label="Thông báo" hint="Cài đặt máy" onPress={() => void Linking.openSettings()} />
      </Section>

      {/* ── Vai trò ── */}
      {roles.length > 1 ? (
        <Section title="Vai trò">
          {roles.map((r, i) => {
            const st = ROLE_STYLE[r.role_code] ?? ROLE_STYLE.ST;
            const active = r.role_code === user?.role_code;
            return (
              <Row
                key={r.role_code}
                first={i === 0}
                icon={st.icon}
                color={st.color}
                label={r.role_name || ROLE_NAMES[r.role_code] || r.role_code}
                loading={switching === r.role_code}
                selected={active}
                onPress={() => switchRole(r.role_code)}
              />
            );
          })}
        </Section>
      ) : null}

      {/* ── Hỗ trợ ── */}
      <Section title="Hỗ trợ">
        <Row
          first
          icon="call"
          color="#059669"
          label="Hotline hỗ trợ"
          hint={SUPPORT_HOTLINE}
          onPress={() => void Linking.openURL(SUPPORT_HOTLINE_TEL)}
        />
        <Row icon="apps" color="#2563eb" label="Tất cả tính năng" onPress={() => router.push('/features')} />
        {policies ? <Row icon="document-text" color="#475569" label={policies.label} onPress={() => openFeature(policies)} /> : null}
      </Section>

      <Pressable
        onPress={confirmLogout}
        disabled={loggingOut}
        className="mt-6 flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3.5 active:bg-surface-muted">
        {loggingOut ? <ActivityIndicator color="#dc2626" /> : <Ionicons name="log-out-outline" size={20} color="#dc2626" />}
        <Text className="text-base font-semibold text-danger">Đăng xuất</Text>
      </Pressable>

      <Text className="pt-4 text-center text-xs text-muted">Uspeak Class · Phiên bản {Constants.expoConfig?.version ?? '—'}</Text>

      {sheet.sheet}
      <ChangePasswordSheet visible={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <EditProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
      <PaymentInfoSheet visible={paymentOpen} onClose={() => setPaymentOpen(false)} />
    </Screen>
  );
}

/** "…4321" — số tài khoản không hiện đủ trên màn hình dễ bị người khác nhìn thấy. */
function maskAccount(v: string) {
  return v.length > 4 ? `••••${v.slice(-4)}` : v;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2 pt-6">
      <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</Text>
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">{children}</View>
    </View>
  );
}

function IconBox({ icon, color }: { icon: IconName; color: string }) {
  return (
    <View className="h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: color }}>
      <Ionicons name={icon} size={17} color="#fff" />
    </View>
  );
}

function InfoRow({ icon, color, label, value, first }: { icon: IconName; color: string; label: string; value?: string; first?: boolean }) {
  return (
    <View className={`flex-row items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-border'}`}>
      <IconBox icon={icon} color={color} />
      <View className="flex-1">
        <Text className="text-xs text-muted">{label}</Text>
        <Text className="text-base text-foreground" selectable numberOfLines={1}>
          {value || 'Chưa cập nhật'}
        </Text>
      </View>
    </View>
  );
}

function Row({
  icon,
  color,
  label,
  hint,
  onPress,
  loading,
  selected,
  first,
}: {
  icon: IconName;
  color: string;
  label: string;
  hint?: string;
  onPress: () => void;
  loading?: boolean;
  selected?: boolean;
  first?: boolean;
}) {
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className={`flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted ${first ? '' : 'border-t border-border'}`}>
      <IconBox icon={icon} color={color} />
      <Text className={`flex-1 text-base ${selected ? 'font-semibold text-foreground' : 'text-foreground'}`}>{label}</Text>
      {hint ? <Text className="text-sm text-muted">{hint}</Text> : null}
      {loading ? (
        <ActivityIndicator size="small" />
      ) : selected ? (
        <View className="flex-row items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5">
          <Ionicons name="checkmark" size={13} color={brand} />
          <Text className="text-xs font-semibold text-brand">Đang dùng</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={muted} />
      )}
    </Pressable>
  );
}

function ThemeOption({ option, active, onPress }: { option: (typeof THEMES)[number]; active: boolean; onPress: () => void }) {
  const fg = useThemeColor(active ? 'brand' : 'muted');
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${active ? 'bg-surface' : ''}`}>
      <Ionicons name={option.icon} size={15} color={fg} />
      <Text className={`text-sm font-medium ${active ? 'text-brand' : 'text-muted'}`}>{option.label}</Text>
    </Pressable>
  );
}
