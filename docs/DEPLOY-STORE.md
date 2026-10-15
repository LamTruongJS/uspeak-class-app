# Đưa app Uspeak Class lên App Store & Google Play

> Viết 15/10/2026. Giá và thời gian chờ là theo thông tin đến 2026 — kiểm tra lại trên trang chính thức lúc đăng ký.

## 0. Hiểu đúng "deploy" của app mobile

| Phần | Chạy ở đâu | Việc cần làm |
|---|---|---|
| **class-be** (API) | VPS (như hiện tại) | Deploy các thay đổi đang chờ (mục 4.1) — app gọi `https://class.uspeak.vn/api` |
| **Mã nguồn app** (`uspeak-class-app`) | Git (GitHub/GitLab, hoặc repo git trên VPS) — chỉ để **lưu trữ** | App **không chạy trên VPS** |
| **Bản cài app** (.ipa / .aab) | Build bằng **EAS Build** (máy chủ của Expo) → nộp lên App Store / Google Play | Mục 5 |

VPS Linux **không build được bản iOS** (iOS bắt buộc macOS + Xcode). Dùng EAS Build (đám mây của Expo) là đường
ngắn nhất: không cần máy Mac, Expo tự lo chứng chỉ ký app iOS.

## 1. Tài khoản cần mua / tạo

| Tài khoản | Phí | Ghi chú |
|---|---|---|
| **Apple Developer Program** | 99 USD / năm | Hết hạn không gia hạn là app bị gỡ khỏi App Store |
| **Google Play Console** | 25 USD, trả 1 lần | Dùng mãi |
| **Expo (expo.dev)** | Miễn phí | Gói free đủ build vài chục bản/tháng (xếp hàng chậm hơn); cần nhanh thì nâng gói trả phí |

### Nên đăng ký dạng TỔ CHỨC (công ty), không phải cá nhân
- Trên store sẽ hiện người bán là **Công ty TNHH Đào Tạo Việt Anh** thay vì tên cá nhân anh.
- Google Play: tài khoản **cá nhân** mới phải chạy thử kín với **≥12 người trong 14 ngày** rồi mới được phát hành
  công khai; tài khoản **tổ chức** không bị ràng buộc này.
- Cả hai đều cần **số D-U-N-S** của công ty (miễn phí, do Dun & Bradstreet cấp).

### Bước 1 — Xin số D-U-N-S (làm ĐẦU TIÊN, mất 1–3 tuần)
1. Vào https://developer.apple.com/enroll/duns-lookup/ → tra tên công ty.
2. Chưa có thì bấm yêu cầu cấp mới, khai đúng tên pháp lý, địa chỉ, MST như giấy phép kinh doanh
   (Công ty TNHH Đào Tạo Việt Anh – MST 4202026696 – 42 Lê Thành Phương, Tây Nha Trang, Khánh Hòa).
3. D&B có thể gọi/email xác minh → trả lời đúng. Có số rồi chờ thêm vài ngày để Apple đồng bộ.

### Bước 2 — Apple Developer (dạng Organization)
Chuẩn bị: Apple ID **dùng email công ty** (vd `admin@uspeak.vn`) đã bật xác thực 2 lớp, số D-U-N-S,
website công ty (uspeak.vn), người đăng ký có quyền ký thay công ty, thẻ Visa/Master thanh toán quốc tế.
1. Tải app **Apple Developer** trên iPhone (nhanh nhất) hoặc vào https://developer.apple.com/programs/enroll/
2. Chọn **Organization** → điền D-U-N-S, thông tin công ty → thanh toán 99 USD.
3. Apple có thể gọi điện xác minh (tiếng Anh) → duyệt trong vài ngày.

### Bước 3 — Google Play Console (dạng Organization)
1. Vào https://play.google.com/console/signup bằng tài khoản Google của công ty.
2. Chọn **Organization** → điền D-U-N-S, thông tin công ty, website, số điện thoại → trả 25 USD.
3. Google xác minh danh tính + tổ chức (có thể cần giấy tờ) → vài ngày.

### Bước 4 — Tài khoản Expo
1. Đăng ký https://expo.dev (miễn phí), nên tạo **Organization "uspeak"** để nhiều người cùng quản lý.
2. Báo em tên tài khoản → em gắn project vào (`eas init`), việc này cũng bật **thông báo đẩy** (hiện app chưa có
   `projectId` nên push chưa chạy trên bản thật).

## 2. Cấu hình app (em làm khi anh có tài khoản)
- Định danh đã đặt: iOS `vn.uspeak.classapp`, Android `vn.uspeak.classapp` — **không đổi được sau khi đã phát hành**.
- Thêm `eas.json`: bản production gọi `https://class.uspeak.vn/api`, tự tăng số build.
- Push: Android cần khoá **FCM v1** (tạo project Firebase miễn phí → tải khoá service account → `eas credentials`);
  iOS EAS tự tạo khoá APNs.
- (Tuỳ chọn, nên có) cài `expo-updates` → sửa lỗi giao diện/JS đẩy thẳng xuống máy người dùng trong vài phút,
  **không phải chờ store duyệt lại** (chỉ khi đổi thư viện native mới phải build + nộp lại).

## 3. Hồ sơ trên store (anh/marketing chuẩn bị)
- Tên app, mô tả ngắn + dài (tiếng Việt), từ khoá, danh mục **Education / Giáo dục**.
- Icon 1024×1024 (đã có `assets/images/icon.png`), ảnh chụp màn hình: iPhone 6.7" và 6.5", Android điện thoại
  (em chụp được từ máy ảo/simulator nếu cần).
- **Link chính sách bảo mật công khai** (không cần đăng nhập): `https://uspeak.vn/chinh-sach-bao-mat` (đã kiểm tra mở được không cần đăng nhập).
- **Tài khoản demo cho người duyệt** (Apple bắt buộc vì app phải đăng nhập): tạo 1 học viên test có sẵn lớp,
  bài tập, chat — **đừng dùng tài khoản thật của học viên**.
- Khai báo quyền riêng tư: Apple "App Privacy", Google "Data safety" (app thu: họ tên, email, SĐT, ảnh/video/ghi âm
  bài làm, tin nhắn chat; không bán dữ liệu; có mã hoá khi truyền).
- Phân loại độ tuổi: trả lời bảng câu hỏi (app giáo dục, có chat giữa người dùng → khai có tương tác người dùng).

## 4. Việc PHẢI xong trước khi nộp

### 4.1 Deploy class-be lên VPS (các thay đổi đang chờ)
- Đăng nhập mobile qua header `X-Client-Type` → trả token trong body (thiếu là app không đăng nhập được).
- `GET /classes/open-registration` (màn Khoá học mở đăng ký).
- Luật điểm TB bỏ bài chưa nộp (classes / certificate / pro-tracking / elearning-internal).
Chi tiết ở `docs/HANDOFF.md`.

### 4.2 Theo chính sách store
- **Không thu tiền trong app** — đã làm: đăng ký khoá học = gọi hotline, không có giỏ hàng/QR thanh toán.
  Đừng thêm link "thanh toán trên web" vào app (Apple từ chối).
- **Xoá tài khoản**: Apple và Google đều yêu cầu app có tài khoản phải cho người dùng **yêu cầu xoá tài khoản**
  (Google còn đòi 1 link web công khai). Hiện app CHƯA có → em sẽ thêm mục "Yêu cầu xoá tài khoản" ở màn Tài khoản
  + cần 1 trang web công khai (vd uspeak.vn/xoa-tai-khoan) mô tả cách gửi yêu cầu.
- Các mục "Bản web" (Luyện nói, Luyện âm, Trò chơi…) mở trình duyệt trong app — chấp nhận được, nhưng càng ít
  càng tốt để không bị chê "app chỉ bọc web".

## 5. Build & nộp (em chạy, anh chỉ cần đăng nhập tài khoản)
```bash
npm i -g eas-cli
eas login
eas init                                   # gắn project Expo, ghi projectId vào app.json
eas build -p android --profile production  # ra file .aab
eas build -p ios --profile production      # Expo tự tạo chứng chỉ + provisioning (đăng nhập Apple ID khi được hỏi)
eas submit -p ios                          # đẩy lên App Store Connect → TestFlight
eas submit -p android                      # cần khoá service account Google Play
```
- **Google Play lần đầu**: phải tải file .aab lên **bằng tay** trong Play Console (Google không cho API tải bản đầu tiên),
  các lần sau `eas submit` tự động.
- Nên chạy **thử nội bộ** trước: iOS qua **TestFlight**, Android qua kênh **Internal testing** — gửi link cho vài
  giáo viên/học viên dùng thử 3–5 ngày.
- Sau đó gửi duyệt: Apple thường 1–3 ngày; Google lần đầu có thể 3–7 ngày.

## 6. Lịch dự kiến
| Tuần | Việc |
|---|---|
| 1 | Xin D-U-N-S, đăng ký Expo, deploy class-be, em thêm xoá tài khoản + eas.json + push |
| 2–3 | Có D-U-N-S → mua Apple + Google, chuẩn bị ảnh/mô tả/tài khoản demo |
| 3–4 | Build, TestFlight + Internal testing, sửa lỗi |
| 4–5 | Gửi duyệt → phát hành |
