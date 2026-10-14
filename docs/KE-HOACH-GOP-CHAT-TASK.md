# Gộp Uspeak Chat-Task vào app mobile Uspeak Class — đánh giá & kế hoạch

> ## ⛔ ĐÃ CHỐT 14/10/2026: KHÔNG GỘP — giữ 2 app riêng
> Anh chủ dự án quyết định **tách 2 app** (app Class cho học viên/giáo viên + app Task cho nhân viên) sau khi
> rõ phí store tính theo tài khoản, không theo số app (Apple 99 USD/năm, Google 25 USD một lần — cả 2 app
> đăng chung 1 tài khoản công ty). File dưới đây chỉ giữ làm tham khảo nếu sau này đổi ý. **Đừng code theo nó.**

> Trạng thái cũ: đề xuất, chưa code. Viết 14/10/2026 sau khi đọc code 4 repo: `uspeak-class-app`,
> `uspeak-class-be`, `uspeak-chat-task-be`, `uspeak-chat-task-fe`.

## 1. Kết luận ngắn

**Làm được**, và hợp lý: một app mobile, hai **workspace**:

| Workspace | Hệ thống phía sau | Ai dùng |
|---|---|---|
| **Uspeak Academy** | class-be (đăng nhập qua CRM) — app hiện tại | Học viên, giáo viên, trợ giảng, quản trị lớp |
| **Uspeak** (công ty) | chat-task-be (DB riêng) | Nhân viên công ty |

Người có tài khoản ở cả hai (giáo viên/trợ giảng/nhân sự kiêm dạy) đăng nhập 1 lần, chọn workspace, đổi
qua lại trong app không phải đăng nhập lại.

Hai điểm em muốn anh biết trước khi chốt:

1. **Về chi phí store: gộp app KHÔNG giảm phí store.** Apple Developer là **99 USD/năm cho cả tài khoản**,
   đăng bao nhiêu app cũng vậy; Google Play là **25 USD một lần** cho cả tài khoản. Cái gộp app tiết kiệm
   thật là: 1 lần build + duyệt store mỗi bản, 1 bộ cấu hình push, 1 chỗ sửa lỗi chung (đăng nhập, ảnh,
   bàn phím, thông báo…), và người vừa dạy vừa làm việc chỉ cài 1 app. Nếu mục tiêu chính chỉ là phí store
   thì 2 app riêng vẫn tốn y như 1 app.
2. **Không viết lại toàn bộ chat-task thành app native.** Web chat-task hiện ~108.000 dòng, ~33 màn
   (công việc, dự án, KPI, lương thưởng, Steam, kho tài liệu, wiki, chatbot…). Viết lại hết là dự án
   nhiều tháng. Đề xuất: làm **native những màn nhân viên dùng nhiều trên điện thoại** (Chat, Thông báo,
   Việc của tôi), phần còn lại **mở bản web ngay trong app** (WebView đã đăng nhập sẵn) — giống cách app
   Class đang làm với các màn quản trị.

## 2. Hiện trạng hai hệ thống (đã kiểm tra code)

| | Uspeak Class | Uspeak Chat-Task |
|---|---|---|
| Backend | NestJS `uspeak-class-be` | NestJS `uspeak-chat-task-be` (~38.500 dòng, 28 module) |
| Tài khoản | **User của CRM** — class-be gọi CRM để đăng nhập; 1 người có vai trò chính + phụ (`switch-role`) | **DB riêng** (`users`: email, mật khẩu bcrypt, `vai_tro`, phòng ban). Đã có `crm_user_id` để liên kết sang CRM (admin duyệt) |
| Đăng nhập | Email/SĐT + mật khẩu, Google. Đã có **chế độ mobile** (`X-Client-Type: mobile` → token trong body) | Email + mật khẩu, Google. **Chỉ có cookie** — guard và socket đều đọc cookie, chưa nhận `Authorization: Bearer` |
| Realtime | socket.io `/chat` | socket.io (chat + notifications), xác thực bằng cookie |
| Push | Expo Push (`mobile_push_tokens`) | Web Push + FCM qua `firebase-admin` (`/push/native`), viết cho app Capacitor |
| App mobile hiện có | Expo (React Native) — app này, `vn.uspeak.classapp`, **chưa phát hành** | Capacitor **bọc web** `task.uspeak.vn`, `vn.uspeak.app`, tên "Uspeak" |

Mật khẩu của một người ở hai hệ thống **là hai mật khẩu khác nhau** (CRM vs DB chat-task), có thể trùng hoặc
không. Đây là điểm quyết định cách làm màn đăng nhập.

## 3. Luồng đăng nhập đề xuất

### 3.1. Không tra "email có tồn tại không" trước khi kiểm mật khẩu

Ý ban đầu: "bấm Đăng nhập, nếu email có ở 2 DB thì hiện popup chọn workspace". Em đề xuất chỉnh một chút:
**không hỏi server "email này có trong DB nào"** trước khi kiểm mật khẩu, vì như vậy ai cũng gõ email bất kỳ
để dò được người đó có phải nhân viên Uspeak không (lộ danh sách nhân sự). Thay vào đó:

```
Người dùng nhập email + mật khẩu → bấm Đăng nhập
        │
        ├─► gọi song song  POST class-be  /auth/login      (X-Client-Type: mobile)
        └─► gọi song song  POST task-be   /auth/login      (X-Client-Type: mobile)
        │
        ▼
 Số workspace đăng nhập THÀNH CÔNG:
   0 → báo "Email hoặc mật khẩu không đúng" (một câu chung, không nói sai ở hệ nào)
   1 → vào thẳng workspace đó
   2 → popup "Chọn workspace": [Uspeak Academy] [Uspeak]  (+ ô "Ghi nhớ lựa chọn")
```

Kết quả với người dùng y như anh mô tả (có tài khoản ở 2 nơi → hiện popup), nhưng không lộ thông tin.

### 3.2. Các trường hợp cần xử lý

| Trường hợp | Cách xử lý |
|---|---|
| Học viên | Chỉ class-be thành công → vào thẳng Academy, không thấy gì về chat-task |
| Nhân viên thuần (không dạy) | Chỉ task-be thành công → vào thẳng workspace Uspeak |
| Có ở cả 2, **cùng mật khẩu** | Popup chọn workspace; lưu token của **cả hai** → đổi workspace không cần đăng nhập lại |
| Có ở cả 2, **khác mật khẩu** | Chỉ 1 bên thành công → vào bên đó. Ở màn Tài khoản có mục **"Thêm workspace"** để đăng nhập bên còn lại (nhập mật khẩu của hệ đó) |
| Đăng nhập Google | Gửi cùng Google ID token lên cả 2 backend (cả 2 đều đã có `/auth/google`), xử lý y như trên |
| Nhiều vai trò trong Academy (GV + HV…) | Giữ nguyên luồng chọn vai trò hiện có của class (`google-select` / `switch-role`) — nằm BÊN TRONG workspace Academy, khác với chọn workspace |
| Tài khoản bị khoá ở 1 bên | Bên đó báo lỗi riêng; bên kia vẫn vào được |

### 3.3. Đổi workspace trong app

- Nút đổi workspace ở **đầu tab Tài khoản** (kiểu Slack): avatar + tên workspace, bấm → danh sách workspace đã đăng nhập + "Thêm workspace".
- Mỗi workspace giữ **token riêng** (SecureStore), **cache dữ liệu riêng** (React Query theo khoá workspace), **socket riêng**.
  Đổi workspace = đổi bộ tab + đổi "API đang dùng", không gọi lại đăng nhập.
- Có chấm đỏ số chưa đọc của workspace **không** đang mở, để không bỏ sót tin.
- Đăng xuất: hỏi "Đăng xuất workspace này" hay "Đăng xuất tất cả".

## 4. Kiến trúc trong app

```
src/
  workspaces/
    registry.ts          # { academy: { apiBase, label, ... }, uspeak: { ... } }
    workspace.store.ts   # workspace đang mở + token từng workspace (SecureStore)
    login-all.ts         # gọi song song 2 backend, gom kết quả
  app/
    login.tsx            # 1 màn đăng nhập chung
    (academy)/(tabs)/... # = app Class hiện tại (dời vào nhóm route này)
    (uspeak)/(tabs)/...  # workspace công ty: Chat · Việc · Thông báo · Thêm · Tài khoản
  lib/api/
    client.ts            # đổi thành factory: mỗi workspace 1 axios (baseURL + token + refresh riêng)
```

- `Stack.Protected` chọn nhóm route theo workspace đang mở (cơ chế app đang dùng cho đăng nhập).
- Phần dùng chung giữ nguyên: UI kit, bàn phím, ảnh/video, trình xem ảnh, ghi âm, push.
- Màn Chat của workspace Uspeak **viết riêng** theo API chat-task (khác class-be: kênh, thread, flag,
  thông báo kênh, nhãn dán…) nhưng tái dùng được nhiều component chat đã làm (bong bóng, ô soạn tin, xem ảnh).

### Phần chat-task mở web trong app

- WebView mở `task.uspeak.vn/<màn>` **đã đăng nhập sẵn**: chat-task-be thêm 1 route kiểu
  `GET /auth/mobile-session?ticket=…` đổi vé dùng 1 lần (sống ~60 giây) thành cookie phiên rồi chuyển
  sang màn cần mở. **Không** đưa token phiên dài hạn vào URL.
- Ẩn khung menu web khi chạy trong app (cờ `?embed=1`, giống class-fe đã làm cho Task).

## 5. Việc phải làm ở backend

### chat-task-be (bắt buộc)
1. **Chế độ mobile cho đăng nhập**: `login` / `google` / `me` trả token trong body khi có `X-Client-Type: mobile` (đang chỉ set cookie). Copy cách class-be đã làm (`auth-cookie.util.ts` → `isMobileClient`).
2. **Nhận `Authorization: Bearer`** ở `JwtAuthGuard` (`common/guards/jwt-auth.guard.ts` đang chỉ đọc cookie) và ở 2 gateway socket (`chat.gateway.ts`, `notifications.gateway.ts` đang chỉ đọc cookie handshake).
3. **Refresh token cho mobile**: token chat-task hiện sống 30 ngày, gia hạn trượt qua cookie. Mobile cần cơ chế làm mới tương đương (gia hạn khi gọi `/auth/me`, hoặc thêm refresh token).
4. **Push qua Expo**: app Expo không lấy được FCM token trên iOS theo cách Capacitor đang dùng. Cách gọn: chat-task-be thêm kênh **Expo Push** (copy `ExpoPushService` của class-be), giữ nguyên Web Push + FCM cho web/app cũ.
5. Route `mobile-session` cho WebView (mục 4).

### class-be
- Không cần đổi gì cho đăng nhập (đã có chế độ mobile). Các thay đổi class-be **chưa deploy** ở `docs/HANDOFF.md` mục 7 vẫn phải deploy trước.

### Không cần
- **Không gộp DB, không gộp tài khoản.** Mỗi workspace giữ tài khoản của mình; app chỉ "giữ 2 phiên đăng nhập". Liên kết CRM ⇄ chat-task (`crm_user_id`) đã có, dùng sau nếu muốn hiện "cùng một người".

## 6. Thông báo đẩy

- Mỗi workspace đăng ký push với backend của nó (Expo push token gửi cho cả hai).
- Payload phải mang `workspace` + đường dẫn. Bấm thông báo của workspace đang KHÔNG mở → app tự đổi workspace rồi mở đúng màn.
- Badge icon app = tổng chưa đọc của các workspace.
- Đăng xuất 1 workspace → gỡ push token ở backend đó (nếu không người đã đăng xuất vẫn nhận tin công ty).

## 7. Danh tính app trên store

App Capacitor "Uspeak" (`vn.uspeak.app`) đã có cấu hình sẵn. **Cần anh xác nhận nó đã lên store chưa**:
- **Đã lên store, có người dùng** → app gộp nên phát hành **dưới chính `vn.uspeak.app`** (cùng chữ ký Android + cùng App ID iOS) để người đang dùng bản Task được **cập nhật** sang app mới thay vì phải cài app khác. Expo làm được việc này (đặt `bundleIdentifier`/`package` + dùng lại keystore cũ).
- **Chưa lên store** → chọn 1 ID mới, tên app gợi ý "Uspeak".

## 8. Rủi ro & cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Apple duyệt app có phần chỉ dành cho nhân viên | Cung cấp tài khoản demo cho **cả 2 workspace** khi nộp duyệt; workspace công ty có đăng nhập rõ ràng (Apple chấp nhận app có phần nội bộ) |
| Lẫn dữ liệu giữa 2 workspace (cache, socket, push) | Mọi query key, socket, push đều gắn workspace; đổi workspace thì ngắt socket bên cũ |
| Hai backend lệch phiên bản | App kiểm từng backend độc lập; 1 bên lỗi không làm hỏng bên kia |
| Trùng tên/khác tên cùng 1 người ở 2 hệ | Mỗi workspace hiện hồ sơ của chính nó (đúng như Slack nhiều workspace) |
| Đăng nhập chậm hơn vì gọi 2 nơi | Gọi song song; kết quả nhanh bên nào xong trước vẫn phải chờ bên kia ~tối đa vài giây (đặt timeout riêng, bên quá giờ coi như "không có") |

## 9. Lộ trình đề xuất

| Đợt | Nội dung | Ước lượng |
|---|---|---|
| **0. Chốt** | Anh trả lời các câu ở mục 10 | — |
| **1. Nền móng** | Workspace store + API client theo workspace + màn đăng nhập chung + popup chọn workspace + đổi workspace ở Tài khoản; dời app Class vào nhóm `(academy)`. chat-task-be: chế độ mobile + Bearer + socket token | 1–1,5 tuần |
| **2. Workspace Uspeak bản đầu** | Bộ tab công ty: **Chat native** (danh sách kênh/DM, phòng chat, gửi ảnh/tệp, thread, cảm xúc), **Thông báo native**, các màn còn lại mở web trong app qua `mobile-session` | 2–3 tuần |
| **3. Push 2 workspace** | Expo push ở chat-task-be, bấm thông báo đổi đúng workspace, badge tổng | 3–5 ngày |
| **4. Native thêm theo nhu cầu** | Việc của tôi / Hôm nay, Lịch hẹn, Duyệt… — chọn theo số liệu màn nhân viên mở nhiều nhất trên điện thoại | theo từng màn |
| **5. Phát hành** | 1 app trên 2 store (dưới `vn.uspeak.app` nếu đã có) | 3–5 ngày + thời gian duyệt |

Ước lượng là thời gian làm của 1 người quen 2 codebase, chưa gồm thời gian chờ duyệt store.

## 10. Cần anh chốt

1. Mục tiêu gộp là **1 app cho người dùng** (tiện, 1 lần build/duyệt) chứ không phải giảm phí store — anh đồng ý với nhận định ở mục 1 chứ?
2. Luồng đăng nhập: **gọi song song 2 backend, chỉ hiện workspace đăng nhập thành công** (mục 3.1) thay cho "tra email có trong DB" — anh OK?
3. App Capacitor `vn.uspeak.app` đã lên store chưa (mục 7)?
4. Workspace công ty bản đầu: native **Chat + Thông báo**, còn lại mở web trong app — hay anh muốn màn nào khác native ngay?
5. Tên hiển thị 2 workspace: "**Uspeak Academy**" (học tập) và "**Uspeak**" (công ty) — đúng ý anh chưa?
