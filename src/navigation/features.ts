import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { RoleCode } from '@/features/auth/types';

/**
 * Danh mục TOÀN BỘ màn hình của app, ánh xạ 1-1 từ menu web
 * (uspeak-class-fe/src/config/menuConfig.ts) — thiết kế đủ cho mọi vai trò ngay từ đầu,
 * còn làm thật thì theo đợt (`phase`). Màn chưa làm vẫn hiện trong "Tất cả tính năng"
 * với nhãn "Sắp có", nên người dùng biết app sẽ có gì và mình có checklist tiến độ.
 *
 * Thêm/bớt quyền: sửa `roles` ở đây cho khớp menuConfig bên web (class-be vẫn là nơi chặn thật).
 */

export type Phase =
  | 1 // MVP học viên
  | 2 // học viên mở rộng
  | 3 // giáo viên / trợ giảng / người nhận xét
  | 4; // quản trị — phần lớn mở web vì cần màn hình lớn

export type FeatureStatus =
  | 'ready' // đã làm trên app
  | 'planned' // sẽ làm native
  | 'web'; // cố ý mở bản web (màn hình phức tạp/ít dùng trên điện thoại)

export type FeatureGroup = 'learn' | 'practice' | 'community' | 'teach' | 'grading' | 'admin' | 'account';

export interface AppFeature {
  key: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  group: FeatureGroup;
  roles: RoleCode[];
  phase: Phase;
  status: FeatureStatus;
  /** Route trong app (khi status = ready) */
  route?: string;
  /** Đường dẫn bên web class (khi status = web) */
  webPath?: string;
  /**
   * Mã quyền của class-be (giống `requiredPermission` trong menuConfig của web). Có khai báo thì
   * tài khoản phải có quyền đó mới thấy mục này; không khai báo = chỉ cần đúng vai trò.
   */
  permission?: string;
}

const ALL: RoleCode[] = ['AD', 'TE', 'TA', 'TG', 'ST'];
const STAFF: RoleCode[] = ['AD', 'TE', 'TA', 'TG'];
const TEACHING: RoleCode[] = ['AD', 'TE', 'TA'];

/** Tên vai trò hiển thị — dùng chung cho màn Tài khoản và menu tổng. */
export const ROLE_NAMES: Record<string, string> = {
  AD: 'Quản trị viên',
  TE: 'Giáo viên',
  TA: 'Trợ giảng',
  TG: 'Nhận xét bài',
  ST: 'Học viên',
};

export const GROUP_LABELS: Record<FeatureGroup, string> = {
  learn: 'Học tập',
  practice: 'Luyện tập',
  community: 'Cộng đồng',
  teach: 'Giảng dạy',
  grading: 'Nhận xét bài',
  admin: 'Quản trị',
  account: 'Tài khoản',
};

export const FEATURES: AppFeature[] = [
  // ── Học tập (học viên) ──────────────────────────────────────────────
  { key: 'my-classes', label: 'Lớp học của tôi', icon: 'school-outline', group: 'learn', roles: ['ST'], phase: 1, status: 'ready', route: '/classes', permission: 'MY_CLASSES_VIEW' },
  { key: 'schedule', label: 'Lịch trình', icon: 'calendar-outline', group: 'learn', roles: ['ST'], phase: 1, status: 'ready', route: '/schedule', permission: 'SCHEDULE_VIEW' },
  { key: 'my-assignments', label: 'Bài tập của tôi', icon: 'document-text-outline', group: 'learn', roles: ['ST'], phase: 1, status: 'ready', route: '/assignments' },
  { key: 'documents', label: 'Tài liệu', icon: 'folder-open-outline', group: 'learn', roles: ALL, phase: 2, status: 'ready', route: '/documents', permission: 'DOCUMENT_VIEW' },
  { key: 'wiki', label: 'Wiki', icon: 'library-outline', group: 'learn', roles: ALL, phase: 2, status: 'ready', route: '/wiki', permission: 'WIKI_VIEW' },
  { key: 'guide', label: 'Hướng dẫn sử dụng', icon: 'help-buoy-outline', group: 'learn', roles: ALL, phase: 2, status: 'ready', route: '/wiki?space=guide', permission: 'GUIDE_VIEW' },
  { key: 'class-surveys', label: 'Phiếu khảo sát', icon: 'clipboard-outline', group: 'learn', roles: ['ST'], phase: 1, status: 'ready', route: '/class-surveys' },
  { key: 'my-certificates', label: 'Chứng chỉ học tập', icon: 'ribbon-outline', group: 'learn', roles: ['ST'], phase: 2, status: 'ready', route: '/certificates', permission: 'MY_CERTIFICATES_VIEW' },
  { key: 'open-courses', label: 'Khoá học mở đăng ký', icon: 'megaphone-outline', group: 'learn', roles: ['ST'], phase: 2, status: 'ready', route: '/open-courses', permission: 'OPEN_COURSES_VIEW' },
  { key: 'course-privileges', label: 'Đăng kí lớp UspeakPro', icon: 'star-outline', group: 'learn', roles: ['ST'], phase: 2, status: 'ready', route: '/pro-register', permission: 'COURSE_PRIVILEGES_VIEW' },

  // ── Luyện tập ───────────────────────────────────────────────────────
  { key: 'speech-practice', label: 'Luyện nói', icon: 'mic-outline', group: 'practice', roles: ALL, phase: 1, status: 'web', webPath: '/speech-practice', permission: 'SPEECH_PRACTICE_VIEW' },
  { key: 'shadowing', label: 'Luyện tập Shadowing', icon: 'headset-outline', group: 'practice', roles: ALL, phase: 1, status: 'web', webPath: '/shadowing-sso', permission: 'SHADOWING_PRACTICE_VIEW' },
  { key: 'pronunciation-practice', label: 'Luyện âm', icon: 'pulse-outline', group: 'practice', roles: TEACHING, phase: 3, status: 'web', webPath: '/pronunciation-practice', permission: 'PRONUNCIATION_PRACTICE_VIEW' },
  { key: 'games', label: 'Trò chơi', icon: 'game-controller-outline', group: 'practice', roles: ALL, phase: 2, status: 'web', webPath: '/games', permission: 'GAME_VIEW' },

  // ── Cộng đồng ───────────────────────────────────────────────────────
  { key: 'chat', label: 'Chat', icon: 'chatbubbles-outline', group: 'community', roles: ALL, phase: 1, status: 'ready', route: '/chat', permission: 'CHAT_VIEW' },
  { key: 'forum', label: 'Diễn đàn', icon: 'newspaper-outline', group: 'community', roles: ALL, phase: 2, status: 'ready', route: '/forum', permission: 'FORUM_VIEW' },
  { key: 'feedback', label: 'Góp ý / Báo lỗi', icon: 'bug-outline', group: 'community', roles: ALL, phase: 2, status: 'ready', route: '/feedback', permission: 'FEEDBACK_SUBMIT' },

  // ── Giảng dạy (GV / TA) ─────────────────────────────────────────────
  { key: 'dashboard', label: 'Tổng quan giảng dạy', icon: 'grid-outline', group: 'teach', roles: TEACHING, phase: 3, status: 'ready', route: '/', permission: 'DASHBOARD_VIEW' },
  { key: 'classes', label: 'Lớp học', icon: 'school-outline', group: 'teach', roles: TEACHING, phase: 3, status: 'ready', route: '/classes', permission: 'CLASS_VIEW' },
  { key: 'teaching-groups', label: 'Nhóm giảng dạy', icon: 'people-outline', group: 'teach', roles: TEACHING, phase: 3, status: 'ready', route: '/teach/groups', permission: 'TEACHING_GROUPS_VIEW' },
  { key: 'gradebook', label: 'Bảng điểm', icon: 'stats-chart-outline', group: 'teach', roles: TEACHING, phase: 3, status: 'ready', route: '/grading/gradebook', permission: 'GRADEBOOK_VIEW' },
  { key: 'online-users', label: 'Đang trực tuyến', icon: 'radio-outline', group: 'teach', roles: ['AD', 'TE'], phase: 3, status: 'ready', route: '/teach/online-users', permission: 'ONLINE_USERS_VIEW' },
  { key: 'pro-tracking', label: 'Theo dõi học viên PRO', icon: 'trending-up-outline', group: 'teach', roles: ['AD', 'TE'], phase: 3, status: 'ready', route: '/teach/pro', permission: 'PRO_TRACKING_VIEW' },
  { key: 'reports', label: 'Thống kê', icon: 'bar-chart-outline', group: 'teach', roles: TEACHING, phase: 4, status: 'ready', route: '/grading/stats', permission: 'REPORT_STATISTICS_VIEW' },

  // ── Nhận xét bài ────────────────────────────────────────────────────
  { key: 'grading', label: 'Nhận xét bài', icon: 'create-outline', group: 'grading', roles: STAFF, phase: 3, status: 'ready', route: '/assignments', permission: 'GRADING_QUEUE_VIEW' },
  { key: 'regrades', label: 'Nhận xét bài lại', icon: 'refresh-outline', group: 'grading', roles: STAFF, phase: 3, status: 'ready', route: '/grading/regrades', permission: 'REGRADE_QUEUE_VIEW' },
  { key: 'redo-requests', label: 'Bài yêu cầu làm lại', icon: 'return-down-back-outline', group: 'grading', roles: STAFF, phase: 3, status: 'ready', route: '/grading/redo-requests', permission: 'REDO_REQUEST_VIEW' },
  { key: 'grading-history', label: 'Lịch sử nhận xét', icon: 'time-outline', group: 'grading', roles: STAFF, phase: 3, status: 'ready', route: '/grading/history', permission: 'GRADING_HISTORY_VIEW' },
  { key: 'grading-reviews', label: 'Review bài nhận xét', icon: 'checkmark-done-outline', group: 'grading', roles: ['AD', 'TE'], phase: 3, status: 'ready', route: '/grading/reviews', permission: 'REVIEW_QUEUE_VIEW' },
  { key: 'payment-requests', label: 'Yêu cầu thanh toán', icon: 'wallet-outline', group: 'grading', roles: ['TG', 'TE', 'TA'], phase: 3, status: 'ready', route: '/grading/payment-requests', permission: 'PAYMENT_REQUEST_VIEW' },
  { key: 'input-surveys', label: 'Khảo sát đầu vào', icon: 'clipboard-outline', group: 'grading', roles: STAFF, phase: 2, status: 'ready', route: '/surveys', permission: 'INPUT_SURVEY_VIEW' },
  { key: 'grading-management', label: 'Quản lý chấm bài', icon: 'briefcase-outline', group: 'grading', roles: ['AD', 'TE'], phase: 4, status: 'ready', route: '/grading/management', permission: 'GRADING_MANAGEMENT_VIEW' },
  { key: 'rubric-templates', label: 'Template Rubric', icon: 'list-outline', group: 'grading', roles: ['AD', 'TE'], phase: 4, status: 'web', webPath: '/assignments/templates', permission: 'RUBRIC_MANAGE' },

  // ── Quản trị ────────────────────────────────────────────────────────
  { key: 'permissions', label: 'Phân quyền hệ thống', icon: 'shield-checkmark-outline', group: 'admin', roles: ['AD'], phase: 4, status: 'web', webPath: '/permissions', permission: 'PERMISSION_MANAGE' },
  { key: 'payment-settings', label: 'Cài đặt thanh toán', icon: 'card-outline', group: 'admin', roles: ['AD'], phase: 4, status: 'ready', route: '/payment-settings', permission: 'PAYMENT_SETTINGS_MANAGE' },
  { key: 'admin-feedback', label: 'Quản lý góp ý', icon: 'mail-unread-outline', group: 'admin', roles: ['AD'], phase: 4, status: 'ready', route: '/admin/feedback', permission: 'FEEDBACK_MANAGE' },
  { key: 'certificate-editor', label: 'Editor mẫu chứng chỉ', icon: 'brush-outline', group: 'admin', roles: ['AD', 'TE'], phase: 4, status: 'web', webPath: '/certificate-template-editor', permission: 'CERTIFICATE_TEMPLATE_EDITOR_VIEW' },

  // ── Tài khoản ───────────────────────────────────────────────────────
  { key: 'account', label: 'Thông tin tài khoản', icon: 'person-circle-outline', group: 'account', roles: ALL, phase: 1, status: 'ready', route: '/account' },
  { key: 'policies', label: 'Điều khoản & chính sách', icon: 'document-lock-outline', group: 'account', roles: ALL, phase: 1, status: 'ready', route: '/policies' },
];

/** 5 đường dẫn nằm sẵn trên thanh tab — những màn này đã có thanh của navigator. */
const TAB_PATHS = new Set(['/', '/classes', '/chat', '/assignments', '/account']);

/**
 * Tính năng ứng với đường dẫn đang mở, CHỈ tính màn mở từ menu (không phải tab, đã làm trong app).
 * Dùng cho thanh tab nổi ở màn Stack: màn không có trên thanh thì thay vào ô cuối.
 * So khớp đúng đường dẫn, không tính màn con (vd `/policies/dieu-khoan`) — vào sâu rồi thì để màn
 * hình trống cho nội dung.
 */
export function featureForPath(pathname?: string): AppFeature | undefined {
  if (!pathname || TAB_PATHS.has(pathname)) return undefined;
  return FEATURES.find((f) => f.status === 'ready' && f.route?.split('?')[0] === pathname);
}

/** Màn Stack này có phải màn mở từ menu không — `name` là tên route của expo-router. */
export function isMenuRoute(routeName: string) {
  return !!featureForPath('/' + routeName.replace(/\/index$/, ''));
}

export function featuresForRole(role: RoleCode | undefined): AppFeature[] {
  const r = role || 'ST';
  return FEATURES.filter((f) => f.roles.includes(r));
}

/**
 * Danh sách tính năng người này ĐƯỢC THẤY: đúng vai trò **và** có quyền tương ứng
 * (`effective_permissions` của `/permissions/me`, giống cách web dựng menu).
 *
 * `codes` chưa tải xong hoặc gọi lỗi (null/undefined) thì chỉ lọc theo vai trò — thà hiện thừa
 * một lúc còn hơn hiện màn trống rồi người dùng tưởng mất tính năng.
 */
export function featuresForUser(role: RoleCode | undefined, codes: string[] | null | undefined): AppFeature[] {
  const byRole = featuresForRole(role);
  if (!codes) return byRole;
  return byRole.filter((f) => !f.permission || codes.includes(f.permission));
}

/** 4 tab (ngoài Tài khoản) của navigator `(tabs)`. */
export type TabName = 'index' | 'classes' | 'chat' | 'assignments';
const TAB_NAMES = new Set<string>(['index', 'classes', 'chat', 'assignments']);

/**
 * 4 ô MẶC ĐỊNH của thanh tab dưới theo vai trò (ô thứ 5 luôn là ảnh đại diện → Tài khoản), chép từ
 * `ROLE_NAV` của MobileFooterNav (PWA class-fe) cho 2 bản giống nhau. Mỗi ô là tên tab của `(tabs)`
 * hoặc `key` một tính năng — tính năng thì bấm vào mở màn Stack, thanh tab vẫn hiện và tô đúng ô đó.
 *
 * Khác PWA 2 chỗ:
 * - Học viên giữ ô Bài tập thay cho Lịch trình (anh chốt 16/10/2026) — Lịch trình vào từ menu.
 * - TG: PWA để "Review" đầu thanh nhưng menu web không cho TG vào Review (chỉ AD/TE), nên thay bằng
 *   hàng chờ Nhận xét bài — cũng là trang web mở đầu tiên của TG.
 */
const ROLE_TAB_BAR: Record<string, string[]> = {
  ST: ['index', 'classes', 'chat', 'assignments'],
  TE: ['classes', 'chat', 'assignments', 'grading-reviews'],
  TA: ['index', 'teaching-groups', 'chat', 'assignments'],
  TG: ['assignments', 'regrades', 'grading-history', 'payment-requests'],
  AD: ['index', 'classes', 'chat', 'teaching-groups'],
};

/**
 * Tab mở ra đầu tiên khi vào app — theo `getDefaultRouteByRole` của web, phải là 1 tab CÓ trên thanh.
 * TA vào Trang chủ (trang chủ trợ giảng) như admin/học viên — anh chốt 16/10/2026.
 */
const ROLE_HOME_TAB: Record<string, TabName> = { ST: 'index', TE: 'classes', TA: 'index', TG: 'assignments', AD: 'index' };

export function homeTabForRole(role: RoleCode | undefined): TabName {
  return ROLE_HOME_TAB[role || 'ST'] ?? 'index';
}

export interface TabBarSlot {
  key: string;
  tab?: TabName;
  feature?: AppFeature;
}

/**
 * Các ô của thanh tab cho người này. Ô là tính năng mà tài khoản không có quyền thì bỏ (giống menu);
 * `codes` chưa tải xong thì giữ nguyên, như `featuresForUser`.
 */
export function tabBarSlots(role: RoleCode | undefined, codes: string[] | null | undefined): TabBarSlot[] {
  const keys = ROLE_TAB_BAR[role || 'ST'] ?? ROLE_TAB_BAR.ST;
  return keys.flatMap((key): TabBarSlot[] => {
    if (TAB_NAMES.has(key)) return [{ key, tab: key as TabName }];
    const feature = FEATURES.find((f) => f.key === key && f.status === 'ready');
    if (!feature || (codes && feature.permission && !codes.includes(feature.permission))) return [];
    return [{ key, feature }];
  });
}

/** Nhân viên (GV/TA/TG/AD) — ẩn các mục chỉ dành cho học viên trên tab. */
export function isStaffRole(role: RoleCode | undefined) {
  return !!role && role !== 'ST';
}
