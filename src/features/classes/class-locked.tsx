import { isAxiosError } from 'axios';
import { Linking } from 'react-native';

import { StateView } from '@/components/ui/state-view';
import { SUPPORT_HOTLINE, SUPPORT_HOTLINE_TEL } from '@/constants/support';

/** Mã lỗi class-be (crm-client.service assertClassNotLocked) khi học viên bị khoá quyền vào lớp */
const CLASS_ACCESS_LOCKED = 'CLASS_ACCESS_LOCKED';

/**
 * Lỗi 403 "bị khoá quyền truy cập lớp" → trả lý do (có thể rỗng); lỗi khác → null.
 * Body có thể là `{ code, lock_reason }` hoặc bọc trong `message` tuỳ exception filter.
 */
export function classLockOf(error: unknown): { reason: string | null } | null {
  if (!isAxiosError(error) || error.response?.status !== 403) return null;
  const data = error.response.data as Record<string, unknown> | undefined;
  const inner = data?.message && typeof data.message === 'object' ? (data.message as Record<string, unknown>) : undefined;
  const body = data?.code === CLASS_ACCESS_LOCKED ? data : inner?.code === CLASS_ACCESS_LOCKED ? inner : null;
  if (!body) return null;
  return { reason: typeof body.lock_reason === 'string' && body.lock_reason ? body.lock_reason : null };
}

/** Màn báo "bị khoá quyền truy cập lớp" — thay cho câu lỗi chung, giống popup AccessLockedDialog của web */
export function ClassLockedView({ reason }: { reason: string | null }) {
  return (
    <StateView
      icon="lock-closed-outline"
      title="Bạn đã bị khoá quyền truy cập lớp học này"
      description={`${reason ? `Lý do: ${reason}\n` : ''}Liên hệ hotline ${SUPPORT_HOTLINE} để được hỗ trợ.`}
      actionLabel="Gọi hotline"
      onAction={() => void Linking.openURL(SUPPORT_HOTLINE_TEL)}
    />
  );
}
