# Uspeak Class — app mobile (iOS + Android)

App native cho hệ thống lớp học Uspeak, viết bằng **Expo (SDK 57) + React Native + TypeScript**.
Dùng chung backend với web: `uspeak-class-be` (prod: `https://class.uspeak.vn/api`).

> **Nhận việc tiếp?** Đọc [`docs/HANDOFF.md`](docs/HANDOFF.md) trước: mục đích, kiến trúc, màn đã làm / chưa làm, việc đang dở, thay đổi class-be chưa deploy, các bẫy đã gặp.

## Công cụ cần cài (Windows)

| Công cụ | Dùng để |
|---|---|
| **VS Code** + extension *Expo Tools*, *React Native Tools* | Viết code |
| **Expo Go** trên iPhone (App Store) | Xem app iOS: quét QR, lưu file là app cập nhật |
| **Android Studio** (chỉ dùng phần *Device Manager* → tạo máy ảo Pixel) | Xem app Android trên máy tính |
| Node 20+ | Chạy Metro |

## Chạy dev

```bash
npm install
npx expo start
```

- **iPhone:** mở Camera quét QR trong terminal → mở bằng Expo Go. Điện thoại và máy tính phải **chung Wi-Fi**.
- **Android:** mở máy ảo trong Android Studio trước, rồi bấm `a` trong terminal Expo.
- **Gọi API:** `.env` để `EXPO_PUBLIC_API_URL=http://localhost:6001/api` — app tự đổi `localhost`
  thành IP LAN của máy chạy Metro (xem `src/config/env.ts`), nên cần class-be chạy trên máy này.
  Muốn trỏ thẳng production thì tạo `.env.local` với `EXPO_PUBLIC_API_URL=https://class.uspeak.vn/api`
  (chỉ được sau khi bản class-be có chế độ mobile đã deploy).

Kiểm tra trước khi xong việc:

```bash
npx tsc --noEmit
npx expo lint
```

## Đăng nhập trên mobile

Web dùng cookie HttpOnly; app gửi header `X-Client-Type: mobile` nên class-be trả token trong body
(`tokens: { accessToken, refreshToken, expiredAt }`). App cất token trong **SecureStore**
(Keychain/Keystore), gọi API bằng `Authorization: Bearer`, hết hạn thì tự refresh một lần rồi gọi lại
(`src/lib/api/client.ts`). Phía BE: `uspeak-class-be/src/common/auth-cookie.util.ts` → `isMobileClient`.

## Ghi âm câu nói (quiz)

Azure chỉ chấm WAV PCM16. iOS ghi thẳng WAV 16kHz mono; **Android không ghi được WAV** nên ghi AAC `.m4a`,
class-be tự chuyển sang WAV bằng `ffmpeg` của hệ thống trước khi lưu/chấm
(`uspeak-class-be/src/speech/audio-transcode.util.ts`). Server phải có `ffmpeg` (VPS class đã có vì shadowing-be dùng).

## Thông báo đẩy (push)

Dùng **Expo Push Service** (Expo lo APNs + FCM). class-be lưu token ở collection `mobile_push_tokens`
(`POST/DELETE /push/mobile-token`) và gửi ở `ExpoPushService` — tại đúng chỗ Web Push đang gửi (tin chat,
thông báo phòng) + thông báo trong app (bài mới, đã chấm, yêu cầu làm lại).

Cần làm 1 lần trước khi push chạy:
1. `npx eas-cli@latest login` rồi `npx eas-cli@latest init` → ghi `extra.eas.projectId` vào app.json.
2. Android: tạo project Firebase, tải `google-services.json`, upload FCM V1 key lên expo.dev (Credentials).
3. iOS: `eas build` tự tạo APNs key khi đăng nhập Apple Developer.
4. **Expo Go Android không nhận push** (từ SDK 53) → test bằng development build: `npx eas-cli@latest build --profile development`.
   Expo Go trên iPhone vẫn nhận được.

## Cấu trúc

```
src/
  app/                 # màn hình (Expo Router — mỗi file là 1 route)
    _layout.tsx        # providers + chặn route theo trạng thái đăng nhập (Stack.Protected)
    login.tsx
    (tabs)/            # 5 tab: Trang chủ · Lớp học · Chat · Bài tập · Tài khoản
    features.tsx       # "Tất cả tính năng" theo vai trò
    feature/[key].tsx  # màn giữ chỗ cho tính năng chưa làm
  components/ui/       # Button, TextField, Screen, StateView, Avatar
  features/<module>/   # api + type + component theo từng nghiệp vụ (copy logic từ class-fe)
  lib/                 # api client, token storage, react-query
  navigation/features.ts  # DANH MỤC TOÀN BỘ MÀN HÌNH theo vai trò + đợt + trạng thái
  stores/              # zustand
  global.css           # token màu sáng/tối (Uniwind — viết className kiểu Tailwind)
```

Style: **Uniwind** (Tailwind v4 cho React Native) — `className="bg-surface text-foreground"`.
Màu lấy từ token trong `src/global.css` (đã có bản tối), không hard-code mã màu.
Prop native không nhận className (màu icon, spinner…) thì dùng `useThemeColor('brand')`.

## Lộ trình

Danh mục đầy đủ + trạng thái từng màn: `src/navigation/features.ts`.

- **Đợt 1 (học viên):** ✅ khung app, đăng nhập, lớp học của tôi, chi tiết lớp (thông tin, vào Zoom, chat lớp, bài tập, điểm danh, báo cáo, thông báo lớp),
  lịch trình (tuần/tháng + Lịch hôm nay), tab Bài tập, làm & nộp bài (video YouTube / ảnh / nhiều mục / quiz có ghi âm /
  shadowing qua SSO), kết quả bài nộp, chat lớp (realtime, @nhắc tên, ảnh/video/tệp/tin thoại, trả lời bằng vuốt, sửa/ghim/chuyển tiếp/thu hồi, đã xem, tin ghim, thông tin phòng + đổi tên/ảnh phòng, nhắn 1-1 mới, tạo nhóm chat, tạo bình chọn, xem trước link, tìm tin trong phòng, vạch tin chưa đọc), tài khoản, thông báo đẩy (push) cho chat ·
  phiếu khảo sát của lớp, E-Learning (video, bài đọc, phần chữ của bài luyện tập) · mở bản web: luyện nói & shadowing
  (cần nhận dạng giọng nói của trình duyệt), phần tương tác của bài luyện tập;
  bài kiểm tra dựng sẵn (test_template) vẫn làm trên web
- **Đợt 2 (học viên):** ✅ tài liệu, wiki + hướng dẫn sử dụng, chứng chỉ, đăng kí lớp UspeakPro, diễn đàn, góp ý/báo lỗi ·
  mở bản web: khoá học mở đăng ký (có thanh toán), trò chơi
- **Đợt 3 (GV/TA/TG):** ✅ lớp dạy, chi tiết lớp dạy (học viên, bài tập, điểm danh, thông báo lớp), hàng chờ nhận xét bài,
  nhóm giảng dạy, bảng điểm, đang trực tuyến, theo dõi PRO, lịch sử nhận xét, bài yêu cầu làm lại, nhận xét bài lại,
  review bài nhận xét, yêu cầu thanh toán, khảo sát đầu vào · mở bản web: form chấm bài (cần video + rubric), luyện âm
- **Đợt 4 (quản trị):** phần lớn mở bản web

Không đưa giỏ hàng / thanh toán vào app (chính sách thanh toán của App Store / Google Play).
