# Hồ sơ đăng store — Uspeak Academy

Bản nháp để dán vào Google Play Console (và App Store Connect khi có team tổ chức).
Ảnh ở `docs/store/`. Cập nhật file này khi đổi nội dung trên store.

## 1. Thông tin cơ bản

| Mục | Giá trị |
|---|---|
| Tên ứng dụng (≤30 ký tự) | Uspeak Academy |
| Tên dưới icon trên máy | Uspeak Academy (`app.json` → `expo.name`; iPhone có thể cắt thành "Uspeak Acad…") |
| Package / Bundle ID | `vn.uspeak.classapp` (không đổi được — học viên không nhìn thấy) |
| Ngôn ngữ mặc định | Tiếng Việt (vi-VN) |
| Loại | Ứng dụng · Miễn phí |
| Danh mục | Giáo dục (Education) |
| Email liên hệ | admin@uspeak.vn |
| Điện thoại | 0988 095 880 |
| Website | https://uspeak.vn |
| Chính sách quyền riêng tư | https://uspeak.vn/chinh-sach-bao-mat |

## 2. Mô tả

**Mô tả ngắn (≤80 ký tự):**

> Học tiếng Anh cùng Uspeak: bài giảng, bài tập, chấm chữa và chat với lớp.

**Mô tả đầy đủ:**

> Uspeak Academy là ứng dụng học tập dành cho học viên của Uspeak English (Công ty TNHH Đào tạo Việt Anh).
>
> LỚP HỌC CỦA BẠN
> • Xem lịch học, buổi học và tài liệu của từng lớp
> • Học bài giảng video, đọc tài liệu, lật sách điện tử
>
> BÀI TẬP & CHẤM CHỮA
> • Làm bài tập, bài kiểm tra, luyện nói và nghe chép chính tả ngay trên điện thoại
> • Nộp bài bằng ảnh, ghi âm hoặc video
> • Nhận điểm và nhận xét chi tiết từ giáo viên
>
> CHAT VỚI LỚP
> • Trò chuyện với giáo viên, trợ giảng và bạn cùng lớp
> • Gửi ảnh, tin nhắn thoại, nhãn dán; xem thông báo của lớp
>
> THÔNG BÁO TỨC THÌ
> • Nhận thông báo khi có tin nhắn mới, bài tập mới hoặc bài đã được chấm
>
> Ứng dụng dành cho học viên đã đăng ký khoá học tại Uspeak. Tài khoản do Uspeak cấp khi bạn đăng ký học.

## 3. Ảnh

| Mục | Yêu cầu Play | File |
|---|---|---|
| Biểu tượng | 512×512 PNG | `docs/store/play-icon-512.png` |
| Ảnh nổi bật | 1024×500 PNG/JPG | `docs/store/play-feature-graphic-1024x500.png` |
| Ảnh chụp màn hình điện thoại | 2–8 ảnh, tỉ lệ 9:16 | `docs/store/screenshots/` — chụp bằng **tài khoản demo** (không lộ tên/tin nhắn học viên thật) |

## 4. Nội dung ứng dụng (Play Console → Chính sách → Nội dung ứng dụng)

| Mục | Trả lời |
|---|---|
| Chính sách quyền riêng tư | https://uspeak.vn/chinh-sach-bao-mat |
| Quyền truy cập ứng dụng | **Một số chức năng bị hạn chế** → hướng dẫn "Đăng nhập bằng email + mật khẩu ở màn hình đầu tiên" + tài khoản **học viên demo** (nằm trong 1 lớp demo, có sẵn vài bài tập) |
| Quảng cáo | Không chứa quảng cáo |
| Phân loại nội dung | Danh mục: **Giáo dục** (hoặc "Tất cả các loại khác"). Người dùng tương tác với nhau: **Có** (chat lớp). Chia sẻ vị trí: Không. Mua hàng kỹ thuật số: Không. Bạo lực, tình dục, ngôn từ, chất kích thích, cờ bạc: Không |
| Đối tượng mục tiêu | **18 tuổi trở lên** nếu học viên đều là người lớn. Có học viên dưới 18 thì chọn thêm **13–15, 16–17** (app không quảng cáo nên vẫn qua, nhưng Google xét chặt hơn) |
| Ứng dụng tin tức / chính phủ / sức khoẻ | Không |
| Tính năng tài chính | Không có |
| Quyền dùng dịch vụ nền trước | Không dùng (đã tắt phát âm thanh nền của expo-audio) |

## 5. An toàn dữ liệu (Data safety)

- Có thu thập, **không chia sẻ** với bên thứ ba. Mã hoá khi truyền: **Có** (HTTPS).
- Xoá dữ liệu: **Có** — qua admin@uspeak.vn (tài khoản do Uspeak cấp, không tạo trong app).

| Loại dữ liệu | Thu thập | Bắt buộc? | Mục đích |
|---|---|---|---|
| Thông tin cá nhân → Tên | Có | Bắt buộc | Chức năng ứng dụng, Quản lý tài khoản |
| Thông tin cá nhân → Email | Có | Bắt buộc | Chức năng ứng dụng, Quản lý tài khoản |
| Thông tin cá nhân → Số điện thoại | Có | Bắt buộc | Quản lý tài khoản |
| Tin nhắn → Tin nhắn khác trong ứng dụng | Có | Tuỳ chọn | Chức năng ứng dụng |
| Ảnh và video → Ảnh, Video | Có | Tuỳ chọn (nộp bài, chat) | Chức năng ứng dụng |
| Âm thanh → Bản ghi âm giọng nói | Có | Tuỳ chọn (luyện nói, tin nhắn thoại) | Chức năng ứng dụng |
| Tệp và tài liệu | Có | Tuỳ chọn | Chức năng ứng dụng |
| Hoạt động trong ứng dụng → Tương tác trong ứng dụng | Có (thời gian học, tiến độ bài) | Bắt buộc | Chức năng ứng dụng |
| Mã nhận dạng thiết bị hoặc mã khác | Có (mã push thông báo) | Bắt buộc | Chức năng ứng dụng |

Không thu thập: vị trí, danh bạ, lịch, sức khoẻ, tài chính, lịch sử duyệt web, analytics/crash SDK.

## 6. Lưu ý trước khi lên bản Chính thức

- **Thanh toán học phí:** app hiện mã VietQR chuyển khoản học phí (`features/classes/payment-qr.tsx`). Google bắt dùng Google Play Billing cho nội dung số dùng trong app; học phí lớp có giáo viên dạy trực tiếp thường không thuộc diện này, nhưng người duyệt có thể hỏi. Nếu bị từ chối vì lý do thanh toán → ẩn mã QR trên Android, chỉ ghi "liên hệ tư vấn viên".
- **Chat có người dùng tạo nội dung:** cần nút báo cáo / chặn (đã có "Báo cáo vấn đề" trên tin nhắn — kiểm xem đủ cho chính sách UGC chưa).
