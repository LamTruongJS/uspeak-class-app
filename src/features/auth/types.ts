/**
 * Kiểu dữ liệu đăng nhập — copy từ uspeak-class-fe/src/stores/auth/types.ts,
 * bỏ các field chỉ web dùng. Sửa bên này thì soát lại bên web cho khớp class-be.
 */
import type { SessionTokens } from '@/lib/auth/token-storage';

/** AD quản trị · TE giáo viên · TA trợ giảng · TG nhận xét bài · ST học viên */
export type RoleCode = 'AD' | 'TE' | 'TA' | 'TG' | 'ST' | (string & {});

/** Thông tin nhận tiền công nhận xét (chỉ nhân sự) — khớp `payment_info` của CRM. */
export interface PaymentInfo {
  /** Mã ngân hàng VietQR — CRM dựng ảnh QR theo mã này */
  bank_code?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  cccd_number?: string;
  cccd_issued_date?: string;
  cccd_issued_place?: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  payment_info?: PaymentInfo;
  role_code?: RoleCode;
  avatar?: string;
  class_systemmode?: string;
  isActive: boolean;
  available_roles?: { role_code: RoleCode; role_name: string }[];
  overdue_debts?: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  role_code?: string;
  userId?: string;
}

export interface RoleOption {
  role_code: RoleCode;
  role_name: string;
  user_count: number;
}

export interface AccountOption {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role_code: RoleCode;
  avatar: string;
  classes: { _id: string; class_code: string; class_name: string }[];
}

/** Đăng nhập xong — class-be (chế độ mobile) trả kèm `tokens`. */
export interface LoginSuccess {
  needSelection?: false;
  data: User;
  message: string;
  tokens: SessionTokens;
}

/** Một email gắn nhiều vai trò → phải chọn vai trò trước. */
export interface NeedRoleSelection {
  needSelection: true;
  selectionType: 'role';
  email: string;
  availableRoles: RoleOption[];
}

/** Một vai trò có nhiều tài khoản → chọn tài khoản. */
export interface NeedAccountSelection {
  needSelection: true;
  selectionType: 'account';
  selectedRole: RoleCode;
  users: AccountOption[];
}

export type LoginResult = LoginSuccess | NeedRoleSelection | NeedAccountSelection;
