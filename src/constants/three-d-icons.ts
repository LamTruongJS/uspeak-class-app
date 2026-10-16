/** Asset 3D dùng ở các màn chi tiết lớp và danh sách bài tập. */
export const CLASS_QUICK_ACTION_3D_ICONS: Readonly<Record<string, number>> = {
  chat: require('../../assets/images/shortcut-icons/class-chat.png'),
  grade: require('../../assets/images/shortcut-icons/staff-average-grading-time.png'),
  gradebook: require('../../assets/images/shortcut-icons/learning-report.png'),
  attendance: require('../../assets/images/shortcut-icons/attendance.png'),
  schedule: require('../../assets/images/shortcut-icons/class-schedule.png'),
  survey: require('../../assets/images/shortcut-icons/class-survey.png'),
  support: require('../../assets/images/shortcut-icons/support.png'),
};

/** Asset 3D cho danh mục quản lý trong màn chi tiết lớp của nhân sự. */
export const STAFF_CLASS_MANAGEMENT_3D_ICONS = {
  students: require('../../assets/images/shortcut-icons/home-teaching-groups.png'),
  assignments: require('../../assets/images/shortcut-icons/class-assignments.png'),
  attendance: require('../../assets/images/shortcut-icons/attendance.png'),
  notifications: require('../../assets/images/shortcut-icons/open-courses-color.png'),
  submissions: require('../../assets/images/shortcut-icons/staff-total-submissions.png'),
  report: require('../../assets/images/shortcut-icons/learning-report.png'),
  groups: require('../../assets/images/shortcut-icons/home-online-users.png'),
  surveys: require('../../assets/images/shortcut-icons/class-surveys-color.png'),
  certificates: require('../../assets/images/shortcut-icons/my-certificates-color.png'),
  practice: require('../../assets/images/shortcut-icons/home-pronunciation-practice.png'),
  exemptions: require('../../assets/images/shortcut-icons/staff-completed-reviews.png'),
  elearning: require('../../assets/images/shortcut-icons/elearning.png'),
} as const;

/** Asset 3D cho lối tắt Trang chủ của mọi vai trò. */
export const HOME_SHORTCUT_3D_ICONS: Readonly<Record<string, number>> = {
  'my-classes': require('../../assets/images/shortcut-icons/my-classes-color.png'),
  schedule: require('../../assets/images/shortcut-icons/schedule-color.png'),
  'my-assignments': require('../../assets/images/shortcut-icons/my-assignments-color.png'),
  documents: require('../../assets/images/shortcut-icons/home-documents.png'),
  wiki: require('../../assets/images/shortcut-icons/home-wiki.png'),
  guide: require('../../assets/images/shortcut-icons/home-guide.png'),
  'class-surveys': require('../../assets/images/shortcut-icons/class-surveys-color.png'),
  'my-certificates': require('../../assets/images/shortcut-icons/my-certificates-color.png'),
  'open-courses': require('../../assets/images/shortcut-icons/open-courses-color.png'),
  'course-privileges': require('../../assets/images/shortcut-icons/course-privileges-color.png'),
  'speech-practice': require('../../assets/images/shortcut-icons/elearning-practice.png'),
  shadowing: require('../../assets/images/shortcut-icons/shadowing-color.png'),
  'pronunciation-practice': require('../../assets/images/shortcut-icons/home-pronunciation-practice.png'),
  games: require('../../assets/images/shortcut-icons/home-games.png'),
  chat: require('../../assets/images/shortcut-icons/class-chat.png'),
  forum: require('../../assets/images/shortcut-icons/home-forum.png'),
  feedback: require('../../assets/images/shortcut-icons/home-feedback.png'),
  dashboard: require('../../assets/images/shortcut-icons/learning-report.png'),
  classes: require('../../assets/images/shortcut-icons/my-classes-color.png'),
  'teaching-groups': require('../../assets/images/shortcut-icons/home-teaching-groups.png'),
  gradebook: require('../../assets/images/shortcut-icons/learning-report.png'),
  'online-users': require('../../assets/images/shortcut-icons/home-online-users.png'),
  'pro-tracking': require('../../assets/images/shortcut-icons/learning-report.png'),
  reports: require('../../assets/images/shortcut-icons/report-submission-status.png'),
  grading: require('../../assets/images/shortcut-icons/class-assignments.png'),
  regrades: require('../../assets/images/shortcut-icons/home-regrades.png'),
  'redo-requests': require('../../assets/images/shortcut-icons/home-redo-requests.png'),
  'grading-history': require('../../assets/images/shortcut-icons/dashboard-overdue.png'),
  'grading-reviews': require('../../assets/images/shortcut-icons/report-completion.png'),
  'payment-requests': require('../../assets/images/shortcut-icons/home-payment-requests.png'),
  'input-surveys': require('../../assets/images/shortcut-icons/class-survey.png'),
  'grading-management': require('../../assets/images/shortcut-icons/staff-pending-grading.png'),
  'rubric-templates': require('../../assets/images/shortcut-icons/elearning-document.png'),
  permissions: require('../../assets/images/shortcut-icons/home-online-users.png'),
  'payment-settings': require('../../assets/images/shortcut-icons/home-payment-requests.png'),
  'admin-feedback': require('../../assets/images/shortcut-icons/home-feedback.png'),
  'certificate-editor': require('../../assets/images/shortcut-icons/my-certificates-color.png'),
  account: require('../../assets/images/shortcut-icons/home-online-users.png'),
  policies: require('../../assets/images/shortcut-icons/home-documents.png'),
};

export const CLASS_CONTENT_3D_ICONS = {
  elearning: require('../../assets/images/shortcut-icons/elearning.png'),
  assignments: require('../../assets/images/shortcut-icons/class-assignments.png'),
  attendance: require('../../assets/images/shortcut-icons/attendance.png'),
  report: require('../../assets/images/shortcut-icons/learning-report.png'),
} as const;

export const ASSIGNMENT_3D_ICONS = {
  videoSpeaking: require('../../assets/images/shortcut-icons/assignment-video-speaking.png'),
  shadowing: require('../../assets/images/shortcut-icons/assignment-shadowing.png'),
  imageUpload: require('../../assets/images/shortcut-icons/assignment-image-upload.png'),
  quiz: require('../../assets/images/shortcut-icons/assignment-quiz.png'),
  generic: require('../../assets/images/shortcut-icons/class-assignments.png'),
} as const;

/** Asset 3D theo từng loại nội dung trong mục lục E-Learning. */
export const ELEARNING_NODE_3D_ICONS: Readonly<Record<string, number>> = {
  video: require('../../assets/images/shortcut-icons/assignment-video-speaking.png'),
  lesson_content: require('../../assets/images/shortcut-icons/elearning-document.png'),
  practice: require('../../assets/images/shortcut-icons/elearning-practice.png'),
  assignment: require('../../assets/images/shortcut-icons/class-assignments.png'),
};

/** Asset 3D cho các chỉ số và nhóm dữ liệu trên màn Báo cáo học tập. */
export const CLASS_REPORT_3D_ICONS = {
  assignments: require('../../assets/images/shortcut-icons/class-assignments.png'),
  completion: require('../../assets/images/shortcut-icons/report-completion.png'),
  attendance: require('../../assets/images/shortcut-icons/report-attendance.png'),
  averageScore: require('../../assets/images/shortcut-icons/report-average-score.png'),
  submissionStatus: require('../../assets/images/shortcut-icons/report-submission-status.png'),
  assignmentScores: require('../../assets/images/shortcut-icons/learning-report.png'),
  attendanceDetails: require('../../assets/images/shortcut-icons/attendance.png'),
} as const;

/** Asset 3D cho các cảnh báo trên dashboard học viên. */
export const STUDENT_DASHBOARD_3D_ICONS = {
  classes: require('../../assets/images/shortcut-icons/my-classes-color.png'),
  attendance: require('../../assets/images/shortcut-icons/report-attendance.png'),
  averageScore: require('../../assets/images/shortcut-icons/report-average-score.png'),
  learningIndex: require('../../assets/images/shortcut-icons/learning-report.png'),
  warning: require('../../assets/images/shortcut-icons/dashboard-warning.png'),
  overdue: require('../../assets/images/shortcut-icons/dashboard-overdue.png'),
  safe: require('../../assets/images/shortcut-icons/report-completion.png'),
  assignments: require('../../assets/images/shortcut-icons/class-assignments.png'),
} as const;

/** Asset 3D cho dashboard quản trị, giáo viên, trợ giảng và người nhận xét. */
export const STAFF_DASHBOARD_3D_ICONS = {
  totalSubmissions: require('../../assets/images/shortcut-icons/staff-total-submissions.png'),
  completedReviews: require('../../assets/images/shortcut-icons/staff-completed-reviews.png'),
  publishedAssignments: require('../../assets/images/shortcut-icons/staff-published-assignments.png'),
  averageGradingTime: require('../../assets/images/shortcut-icons/staff-average-grading-time.png'),
  pendingGrading: require('../../assets/images/shortcut-icons/staff-pending-grading.png'),
  activeGrading: require('../../assets/images/shortcut-icons/staff-active-grading.png'),
  waitingReview: require('../../assets/images/shortcut-icons/staff-waiting-review.png'),
  regradeRequest: require('../../assets/images/shortcut-icons/staff-regrade-request.png'),
  urgent: require('../../assets/images/shortcut-icons/dashboard-warning.png'),
} as const;

/** Asset 3D cho màn thống kê hoạt động nhận xét của người chấm. */
export const GRADING_STATS_3D_ICONS = {
  level: require('../../assets/images/shortcut-icons/course-privileges-color.png'),
  earnings: require('../../assets/images/shortcut-icons/home-payment-requests.png'),
  approved: require('../../assets/images/shortcut-icons/staff-completed-reviews.png'),
  waiting: require('../../assets/images/shortcut-icons/staff-waiting-review.png'),
  overdue: require('../../assets/images/shortcut-icons/dashboard-overdue.png'),
  regrade: require('../../assets/images/shortcut-icons/staff-regrade-request.png'),
  timeout: require('../../assets/images/shortcut-icons/dashboard-warning.png'),
} as const;

/** Asset 3D cho trang chủ trợ giảng (features/dashboard/assistant-dashboard.tsx). */
export const ASSISTANT_DASHBOARD_3D_ICONS = {
  schedule: require('../../assets/images/shortcut-icons/class-schedule.png'),
  pendingGrading: require('../../assets/images/shortcut-icons/staff-pending-grading.png'),
  attention: require('../../assets/images/shortcut-icons/dashboard-warning.png'),
  groups: require('../../assets/images/shortcut-icons/home-teaching-groups.png'),
  attendance: require('../../assets/images/shortcut-icons/report-attendance.png'),
  completion: require('../../assets/images/shortcut-icons/report-completion.png'),
  score: require('../../assets/images/shortcut-icons/report-average-score.png'),
} as const;
