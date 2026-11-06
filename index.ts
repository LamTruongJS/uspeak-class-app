// Tác vụ nền của thông báo đẩy phải đăng ký ở phạm vi toàn cục TRƯỚC khi app chạy — hệ điều hành có
// thể đánh thức app ngầm (push "đã đọc", bấm nút Trả lời khi app tắt) mà không dựng giao diện nào.
import './src/features/push/background';
import 'expo-router/entry';
