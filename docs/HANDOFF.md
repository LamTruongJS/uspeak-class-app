# Uspeak Class App — Tài liệu bàn giao

> Cập nhật: 13/10/2026. Đọc file này trước khi nhận việc. Mọi thay đổi **chưa commit**: thư mục app là git repo nhưng mới chỉ có 1 commit khung Expo, toàn bộ phần đã làm đang nằm ở working tree; class-be cũng có thay đổi chưa commit/deploy — xem mục 7.

---

## 1. Mục đích

Đưa hệ thống lớp học **class.uspeak.vn** (web Next.js `uspeak-class-fe`) thành **app điện thoại native iOS + Android** để phát hành lên App Store / CH Play.

- Không bọc web bằng Capacitor (đã bỏ phương án đó) — viết lại giao diện native, **dùng chung backend `uspeak-class-be`** (NestJS) với web.
- Người dùng chủ yếu: **học viên** (đợt 1–2), sau đó **giáo viên / trợ giảng / người nhận xét / quản trị** (đợt 3–4).
- Phần lớn thời gian dùng app là **chat lớp** → chat được làm kỹ nhất.
- Màn nào quá phức tạp cho điện thoại (quản trị, phân quyền, chấm bài có rubric/video…) thì **mở bản web** trong trình duyệt của app (`status: 'web'` trong danh mục màn).
- Không đưa giỏ hàng / thanh toán vào app (chính sách IAP của Apple/Google).

## 2. Mô hình hiện tại

| Thành phần | Công nghệ |
|---|---|
| App | **Expo SDK 57**, React Native 0.86, React 19.2, TypeScript, **expo-router** (typed routes, `Stack.Protected`, tab JS + thanh menu nổi tự vẽ), `react-native-webview` (chỉ để nhúng trình phát video E-Learning) |
| Style | **Uniwind** (Tailwind v4) — token màu trong `src/global.css`, đọc màu cho icon bằng `useThemeColor()` (`src/theme/use-theme-color.ts`) |
| Dữ liệu | TanStack Query (`src/lib/query-client.ts`), axios `src/lib/api/client.ts`, upload multipart bằng `fetch` (`src/lib/api/upload.ts`) |
| Realtime | socket.io-client → namespace `/chat` của class-be (`src/features/chat/socket.ts`), đổ sự kiện vào cache react-query |
| Danh sách dài | `@shopify/flash-list` v2 (danh sách chat, lớp, hàng chờ chấm, kho media) |
| Biểu đồ | tự vẽ bằng `react-native-svg` (`src/features/dashboard/area-chart.tsx`) |
| Push | Expo Push Service (class-be `ExpoPushService`) — `src/features/push/push.ts` |
| Backend | `D:\Uspeak\uspeak-class-be` (NestJS), dùng chung với web; CRM (`uspeak-crm-be`) cấp tài khoản |

**Đăng nhập mobile:** app gửi header `X-Client-Type: mobile` → class-be trả token trong body (không set cookie). Token lưu `expo-secure-store`, axios tự refresh 1 luồng (single-flight).

**Media:** link `/api/uploads/file?key=…` cần `&mt=<media token>` (POST `/uploads/media-token`, hạn 2h) → `src/lib/media.ts` (`resolveMediaUrl`, `mediaCacheKey` = S3 key để token đổi không tải lại ảnh).

### Cấu trúc thư mục chính
```
src/app/                 # route (mỗi file = 1 màn)
  (tabs)/                # 5 tab: index (Trang chủ/Dashboard), classes, chat, assignments, account
  chat/[roomId] · chat/info/[roomId] · chat/media/[roomId] · chat/new · chat/new-group
  class/[id]             # chi tiết lớp — HỌC VIÊN
  teach/[id]             # chi tiết lớp — GIÁO VIÊN / TRỢ GIẢNG / QUẢN TRỊ
  assignment/[id] · result/[id] · submit-success · schedule · features · feature/[key] · login
src/features/            # logic + component theo nghiệp vụ
  auth · assignments · chat · classes · dashboard · push · schedule
src/navigation/features.ts   # DANH MỤC TOÀN BỘ MÀN theo vai trò / đợt / trạng thái (ready|planned|web)
src/components/ui/       # Avatar, Badge, Button, Screen, StateView, TextField, KeyboardAvoider, Segmented…
docs/HANDOFF.md          # file này
```

## 3. Chạy & kiểm tra

```bash
# Local cần: 2 SSH tunnel DB (27018 class, 27019 CRM), CRM-BE :4000, class-be :6001 — xem README.md
npx expo start            # iPhone: Expo Go quét QR; Android: máy ảo Pixel_8 rồi bấm "a"
npx tsc --noEmit          # typecheck
npx expo lint             # lint (React Compiler: cấm Date.now()/đọc ref trong render, hook có điều kiện)
CI=1 npx expo export --platform android --output-dir <tmp>   # thử đóng gói (iOS tương tự)
npx expo-doctor
```
- Thêm route mới → chạy `CI=1 timeout 50 npx expo start --port 8090` một lần để sinh lại typed routes.
- Dự án không có file cấu hình prettier: nếu format thì `npx prettier --write --single-quote --print-width 140 --bracket-same-line <file>`.
- ⚠️ Local dùng **DB thật** qua tunnel: mở phòng chat = đánh dấu đã đọc thật; "Nhận bài" = giữ bài thật; gửi tin = gửi thật. Test trong nhóm "TEST".

## 4. Màn hình ĐÃ LÀM

### Chung
- **Đăng nhập** (`login.tsx`) — giao diện theo web class (ảnh nền 3D, gradient navy), chọn vai trò / tài khoản khi 1 email có nhiều.
- **Trang chủ = Dashboard** (`(tabs)/index.tsx`): học viên → dashboard học tập (công thức copy từ web, `student-metrics.ts`); AD/TE/TA có `DASHBOARD_VIEW` → thống kê hệ thống + biểu đồ ngày/tuần/tháng/năm.
- **Tài khoản** (`(tabs)/account.tsx`): đổi ảnh đại diện, email/SĐT, đổi mật khẩu (sheet), giao diện Theo máy/Sáng/Tối (`src/theme/theme-preference.ts`), thông báo, chuyển vai trò, hotline, đăng xuất.
- **Tất cả tính năng** (`features.tsx`) + **lối tắt ở Trang chủ** — đọc từ `navigation/features.ts`, lọc bằng `featuresForUser(role, permissions)`: đúng vai trò **và** có mã quyền tương ứng trong `effective_permissions` (`GET /permissions/me`), y như cách web dựng menu. Mã quyền của từng mục copy từ `uspeak-class-fe/src/config/menuConfig.ts`.
- **Push** (Expo) — bấm thông báo mở đúng phòng chat / bài tập / kết quả; badge icon app.

### Chat (làm kỹ nhất)
- Danh sách phòng (FlashList, lọc Tất cả/Chưa đọc/Lớp/Nhóm/Cá nhân, avatar mã lớp, nhấn giữ → menu).
  Làm lại 14/10/2026 kiểu Messenger: tiêu đề "Đoạn chat", ô tìm tròn (tìm theo từng từ, không dấu, **tô đỏ phần khớp** + "N cuộc trò chuyện"), chip lọc có **số phòng chưa đọc của từng loại**, hàng "Đang hoạt động" (người nhắn riêng đang online), dòng không kẻ vạch, giờ gửi nằm sau đoạn xem trước, ngày cùng năm bỏ năm.
- Phòng chat: chữ + @nhắc tên, ảnh/album, video, tệp, tin thoại, trả lời (vuốt/menu), sửa, ghim, chuyển tiếp, thu hồi, cảm xúc, nhảy tới tin, "đang nhập…", đã xem, nháp theo phòng, gửi lỗi tự gửi lại khi có mạng, vạch "tin chưa đọc", tìm tin trong phòng, bình chọn (tạo/bình chọn/thêm lựa chọn/kết thúc), xem trước link, thẻ Uspeak Bot giống web (`cards.tsx`).
- Giao diện phòng kiểu Messenger (14/10/2026): header có ảnh phòng + tên canh trái; bong bóng không viền, bo góc theo cụm tin (`message-item.tsx` — `radius` theo first/lastOfCluster); giờ gửi nằm TRONG góc bong bóng (chữ có khoảng trống vô hình `metaSpacer` để giờ không đè chữ, ảnh/video có viên giờ đè góc); cảm xúc là viên nhỏ đè lên mép dưới bong bóng; menu nhấn giữ = hàng cảm xúc nổi + lưới thao tác 4 cột (`message-actions.tsx`). Thẻ Bot: bỏ vạch đầu thẻ và nút tràn viền của web → nút bo tròn trong thẻ; thẻ Bài tập dùng nút nền nhạt navy "Làm bài" (khác web cố ý — nhiều thẻ liền nhau mà nút đỏ đặc thì cả màn đỏ).
- Ô soạn tin kiểu Messenger (`composer.tsx`): + / camera / ảnh / mic bên trái; bên phải ô trống là 👍 gửi nhanh 1 chạm, có chữ thì thành nút gửi. **Bộ biểu tượng kiểu Zalo/Messenger**: nút mặt cười nằm TRONG ô nhập, bấm là bảng emoji (`emoji-panel.tsx` + `emoji-data.ts`: ~670 emoji, 9 nhóm + "Gần đây" nhớ bằng AsyncStorage, nút ⌫) thế chỗ bàn phím — chiều cao lấy từ `useKeyboardHeight()` trừ `insets.bottom` nên ô nhập KHÔNG nhảy khi đổi qua lại; bấm emoji là **chèn vào ô nhập tại con trỏ** (dùng lại `forcedSelection` của @nhắc tên), gõ chữ xen emoji rồi bấm Gửi. Bấm vào ô nhập / bấm nút bàn phím / bàn phím bật lên vì lý do khác (chọn trả lời, sửa tin) → bảng tự đóng; Android nút Back đóng bảng trước. **Android giữ con trỏ** khi mở bảng (`showSoftInputOnFocus={false}`) — iOS không có prop tương đương nên vẫn nhả focus. Tin chỉ gồm 1–3 emoji hiện to, không bong bóng (`isJumboEmoji` trong `message-item.tsx`, regex `\p{…}` tạo trong try để engine không hỗ trợ thì chỉ tắt tính năng).
- Thông tin phòng: đổi tên/ảnh (theo quyền), tìm tin, tắt thông báo, tin ghim, thành viên chia nhóm, **kho Ảnh/Tệp/Link** (`chat/media/[roomId]`).
  Làm lại 14/10/2026: header liền màu nền không tiêu đề, 4 nút nhanh (**Xem lớp** → `/class/[id]` cho HV, `/teach/[id]` cho nhân viên · Tìm tin · Tắt/Bật thông báo · Tin ghim có số đếm), thẻ "Ảnh, tệp, link" gọn (Xem tất cả + 4 ảnh + 3 nút), mỗi nhóm thành viên hiện 6 người + "Xem thêm N người" (đang tìm thì hiện hết). Nút nhắn riêng ở từng thành viên theo **đúng danh sách server cho phép** (`useDmAllowedIds` → `/chat/users/dm-eligible`; AD/TE thì mọi người).
  Kho Ảnh/Tệp/Link (14/10/2026): bộ chọn viên thuốc, tiêu đề tháng dính, tệp/link xếp khối + nút "⋯" (Mở · Sao chép link · Chia sẻ · Xem trong đoạn chat), link có tiêu đề + ảnh từ `/chat/link-preview`; ảnh/video mở **thư viện vuốt ngang** (`features/chat/media-gallery.tsx`: người gửi + giờ + "3/44", Chia sẻ, Xem trong đoạn chat).
- Nhắn tin mới (nhóm theo vai trò, gần đây), tạo nhóm chat (quyền `CHAT_ROOM_CREATE`).

### Học viên
- **Lớp học của tôi** (`(tabs)/classes.tsx` → `StudentClasses`): thẻ ảnh bìa, lọc Đang học/Hoàn thành, nợ học phí, lớp khoá.
- **Chi tiết lớp** (`class/[id]/index.tsx`, làm lại kiểu app 14/10/2026 — phần đầu ở `features/classes/student-class-hero.tsx`):
  ảnh bìa tràn lên thanh trạng thái + thanh trên cùng trong suốt (cuộn qua ảnh thì hiện nền + tên lớp), giảng viên,
  thẻ **Buổi học tiếp theo** (suy từ `class_time`, đếm ngược, "Đang diễn ra" → nút vào Zoom chuyển xanh; `features/classes/next-session.ts`),
  học phí còn nợ → **mã QR chuyển khoản** (`payment-qr.tsx`) hoặc gọi hotline, 4 lối tắt icon (Chat lớp có số chưa đọc · Lịch học · Khảo sát · Hỗ trợ),
  thẻ **Kết quả học tập** 3 vòng tiến độ (`components/ui/progress-ring.tsx`) + "Còn N bài chưa nộp → Làm ngay" (nhảy sang tab Bài tập, lọc sẵn Chưa nộp).
  rồi **danh sách mục dọc** "Nội dung lớp học", mỗi mục mở một MÀN RIÊNG (14/10/2026 — **bỏ hẳn thanh tab cuộn ngang**: 5 tab tràn khỏi màn hình điện thoại, tab cuối bị khuất, đổi tab là mất chỗ đang đọc):
  **E-Learning** → `elearning/[classId].tsx` (chỉ hiện khi lớp CÓ nội dung — lớp Zoom vẫn có thể có bài giảng, đừng gắn theo `course_type`; dòng phụ "Đã học x/y mục") ·
  **Bài tập** → `class/[id]/assignments.tsx` (chip lọc + tải thêm; nhận tham số `status` để "Làm ngay" mở thẳng bộ lọc Chưa nộp) ·
  **Điểm danh** → `class/[id]/attendance.tsx` (vòng tỉ lệ + dải chấm từng buổi + danh sách liền khối, `features/classes/attendance-view.tsx`) ·
  **Báo cáo học tập** → `class/[id]/report.tsx` (`features/classes/class-report.tsx` — port công thức `computeAssignmentStats` + DashboardTab của web) ·
  **Thông báo lớp** → `class/[id]/notifications.tsx` (chỉ hiện khi lớp đang có thông báo còn hiệu lực; mở ra 0,8s thì tự `mark-read` như web).
  Các màn con dùng header native bình thường (tên = "Bài tập · AT02"), lấy mã lớp từ cache `useClassInfo` nên không cần truyền tham số.
- **Bài tập** (`(tabs)/assignments.tsx` → `StudentAssignments`, làm lại 14/10/2026: tiêu đề kèm "N bài cần làm · N sắp hết hạn · N quá hạn", **ô tìm bài** (gửi `search` lên `/assignments/my`, hoãn bằng `useDeferredValue`), chip lọc có số đếm **xuống dòng chứ không cuộn ngang** (6 bộ lọc mà cuộn thì 2 cái cuối luôn khuất), bài nhóm theo hạn Quá hạn/Hôm nay/Ngày mai/Tuần này/Sau đó/Đã nộp; thẻ `assignment-card.tsx` mới: icon theo loại bài, "Lớp · Buổi · Loại", hạn kiểu "Còn 3 ngày", tiến độ shadowing — dùng chung cho chi tiết lớp; số "Chưa nộp" đếm theo `student_status === not_submitted` cho khớp bộ lọc server — server tách riêng "Quá hạn"), **làm bài / nộp bài** (`assignment/[id].tsx`: quiz kể cả câu ghi âm, nộp ảnh/video/văn bản…), **kết quả** (`result/[id].tsx`, làm lại 14/10/2026): thẻ điểm có **vòng tròn % + điểm trên thang thật** ("8.1 / 10" — trước chỉ hiện 8.1, không biết thang mấy), câu động viên theo % (chép `getMotivation` của web), dấu **Nhận xét lần N** / **Đã chỉnh sửa N lần** (`feedback.grading_round`, `edit_count` — BE vẫn trả, trước app bỏ qua); bảng **Tiêu chí nhận xét** có mô tả từng tiêu chí + thanh màu theo ngưỡng 75/60 + dòng tổng; nhận xét của giáo viên; **Yêu cầu bài tập** / **Yêu cầu nhận xét** gấp mở được (`assignment_description`, `assignment_review_requirement`).
- **Lịch trình** (`schedule.tsx`, làm lại kiểu app 14/10/2026): dải tuần 7 ô (vuốt trái/phải đổi tuần), bấm "Tháng 10, 2026 ▾" mở lưới tháng, nút "Hôm nay"; dòng tóm tắt "Tuần này: 3 buổi học · 2 việc cần nộp"; sự kiện của ngày chọn dạng agenda (cột giờ + thẻ, `features/schedule/event-row.tsx`) + mục **Sắp tới** (5 sự kiện kế tiếp trong 14 ngày). Bấm THÂN thẻ buổi học = mở chi tiết lớp, vào Zoom phải bấm đúng **nút "Vào lớp"** (trước đây bấm chỗ nào trên thẻ cũng mở Zoom, kể cả buổi 3 ngày nữa → vào phòng chưa mở). Tên lớp tra `display_name` từ `/assignments/my-classes` vì `class_name` của `/assignments/schedule` là tên nội bộ CRM ("EET22 - 05h00 T246 - 160926"), không có thì rút về mã lớp (`shortClassName`). Hạn nộp đã nộp hiện mờ "Đã nộp" và không chấm đỏ trên lịch; buổi học hôm nay có nút Vào lớp (đang học/≤15 phút → xanh lá).
- **E-Learning của lớp** (`elearning/[classId].tsx`, mở từ mục E-Learning ở chi tiết lớp, nội dung `elearning/item/[nodeId].tsx`): mục lục cây node (`/elearning/student-tree`) có dấu tích đã học + % tiến độ; mở từng mục: **video** (Bunny ký link qua `/elearning/bunny/sign` → WebView; YouTube/Vimeo nhúng WebView; file mp4/m3u8 phát bằng `expo-video`), **bài đọc** (HTML + đính kèm presigned), **luyện tập** (phần chữ: rich text + danh sách từ/câu; phần tương tác mở web), **bài tập** mở thẳng màn làm bài/kết quả có sẵn. Có nút đánh dấu đã học (`/elearning/progress/mark`) và gửi thời gian học (`/study-time/...`).
- **Phiếu khảo sát lớp** (`class-surveys/index.tsx`, `class-surveys/[templateId].tsx`): danh sách phiếu của các lớp (`/survey/student/pending`, mở từ chi tiết lớp thì lọc theo lớp) và màn điền đủ 6 loại câu hỏi TEXT · TEXTAREA · URL · SELECT · RADIO · CHECKBOX. Gửi lại = cập nhật câu trả lời cũ nên màn điền nạp sẵn đáp án đã gửi (`/survey/responses/check/:templateId?classId=`).
- **Tài liệu** (`documents/index.tsx`, `documents/[id].tsx`): kho kiểu Google Drive của class-be (`/drive`) — 4 view Kho/Chia sẻ/Gắn sao/Gần đây, tìm, vào thư mục, mở ảnh ngay trong app, tệp khác mở bằng app ngoài. Tạo thư mục / tải tệp lên / chia sẻ vẫn ở web. Cần quyền `DOCUMENT_VIEW`.
- **Wiki & Hướng dẫn sử dụng** (`wiki/index.tsx`, `wiki/[id].tsx`): cùng một màn, khác `?space=wiki|guide`; lọc theo loại, tìm, xem bài (mục lục có cấu trúc), đính kèm, tăng lượt xem đúng 1 lần.
- **Chứng chỉ học tập** (`certificates.tsx`): GET `/students/me/certificates`, gom theo lớp, xem toàn màn hình, tải xuống (link presigned, hết hạn thì kéo làm mới).
- **Đăng kí lớp UspeakPro** (`pro-register.tsx`): gói combo (`/classes/my-combo-classes`) → đăng ký / huỷ lớp theo suất (`/classes/combo/register|cancel`). Không dính thanh toán nên đưa vào app được.
- **Diễn đàn** (`forum/index.tsx`, `forum/new.tsx`, `forum/[id].tsx`): bảng tin chung + theo lớp (cursor), đăng bài kèm ảnh, cảm xúc, bình luận + trả lời.
- **Góp ý / Báo lỗi** (`feedback/index.tsx`, `feedback/new.tsx`, `feedback/[id].tsx`): gửi góp ý kèm ảnh, nhắn qua lại với admin trong cùng luồng.

### Giáo viên / trợ giảng / quản trị
- **Lớp dạy** (`(tabs)/classes.tsx` → `StaffClasses`): GET `/classes?limit=200`, lọc Tất cả/Lớp của tôi (quyền `CLASS_VIEW_ALL`), trạng thái, tìm.
- **Chi tiết lớp dạy** (`teach/[id]/index.tsx`, làm lại 14/10/2026 cùng khung với lớp học viên — `components/ui/collapsing-header.tsx` + `ClassCover`): ảnh bìa, thẻ **Buổi dạy tiếp theo** (đếm ngược), lối tắt Chat lớp · Chấm bài · Bảng điểm · Bản web (mở đúng `?tab=`), thẻ **Tình hình lớp** 3 vòng (tỷ lệ nộp · đã nhận xét · điểm TB) + "N học viên cần chú ý", rồi **danh sách mục dọc** "Quản lý lớp" — mỗi mục mở một màn riêng, **không còn thanh tab cuộn ngang** (đồng bộ với màn học viên). **Chưa xem trên máy bằng tài khoản giáo viên** (máy ảo đang đăng nhập học viên). 4 màn con (`teach/[id]/…`, mỗi màn có nút **Bản web** ở góc phải header mở đúng tab tương ứng — `features/classes/open-class-web.tsx`):
  **Học viên** (tìm + sắp xếp, nộp/chưa nộp/trễ, điểm TB, chuyên cần, nhắn riêng) · **Bài tập** (GET `/assignments?class_id=`, bấm để xem mô tả + hạn nhận xét) ·
  **Điểm danh** (GET `/classes/:id/sessions`, bấm 1 buổi để xem có mặt / vắng / người lạ vào phòng, thời lượng gộp các lần vào-ra) ·
  **Thông báo** (GET `/class-notifications/:classId`, gồm cả tin hẹn giờ và hết hiệu lực). Tất cả **chỉ xem** — sửa điểm danh, tạo/sửa bài tập & thông báo vẫn làm trên web.
- **Nhận xét bài** (`(tabs)/assignments.tsx` → `GradingQueueScreen`): hàng chờ GET `/assignments/grading-queue`, bài gấp (<12h) lên đầu, **Nhận bài** PATCH `/assignments/submissions/:id/claim`.
- **Màn nhận xét NGAY TRONG APP** — 1 màn dùng chung 3 chế độ `features/assignments/grading-workbench.tsx` (route mỏng `grading/[id]` = chấm · `grading/regrade/[id]` = nhận xét lại · `grading/review/[id]` = review). Chế độ chấm (14/10/2026 — trước mở web): port luật `assignments/grading/[id]/page.tsx`: chỉ khi bài `claimed`; heartbeat 30s (`PATCH …/heartbeat`) + gửi khi app quay lại; đồng hồ `claimed_at + grading_duration_minutes` hết giờ → release + thoát; rời màn → hỏi rồi release (`beforeRemove`); video phát trong app bằng `components/ui/youtube-player.tsx` (YouTube IFrame API trong WebView, báo giây đang phát + seekTo) → chạm "Bắt đầu/Kết thúc" lấy mốc, gõ là tự chốt mốc + dừng video; nhận xét theo ảnh (bài nhiều mục mỗi ảnh ≥1); điểm từng tiêu chí bước 0,5 (`features/assignments/score-slider.tsx`), tổng = trung bình; điều kiện nộp + payload POST `/grade` y web; **Yêu cầu làm lại** (quyền `SUBMISSION_REDO_REQUEST`, POST `/request-redo`); tab Đề bài / Ghi chú; **nháp tự lưu AsyncStorage** (`uspeak.gradingDraft.<id>`). **Chưa thử nộp thật** (sẽ chấm bài của học viên thật).
  · **Nhận xét lại** (port `regrades/[id]/page.tsx`): bài `regrade_requested`, nạp sẵn điểm/mốc/nhận xét cũ, không giữ bài/đồng hồ, POST `/grade` + `is_regrade: true`. Mở từ "Nhận xét bài lại" (tab được giao, bài đang chờ) và từ Lịch sử nhận xét.
  · **Review** (port `reviews/[id]/page.tsx`): bài `waiting_review`, nạp sẵn nhận xét của người chấm + thẻ người chấm (điểm, số lỗi đã ghi nhận), ô "Góp ý cho người chấm" (`graderFeedback`); **Phê duyệt** = POST `/review`; nút "Khác": Y/c nhận xét lại (POST `/request-regrade`, tick ghi lỗi nếu có quyền `GRADING_ERROR_RECORD`) · Chuyển người nhận xét (quyền `RETURN_TO_GRADING`, chọn người từ GET `/assignments/graders` trừ người đang chấm + học viên, POST `/return-to-grading` + `record_error: true`) · Tự nhận xét (cùng quyền, ẩn khi bài đứng tên mình, cần nhận xét đầy đủ, POST `/takeover-grade`). Review không chặn khi bài thiếu tiêu chí (web cũng không).
  · **Chưa xem trên máy + chưa thao tác thật** cả 3 chế độ (máy ảo đăng nhập học viên; thao tác nào cũng ghi vào bài thật).
- **Kết quả bài** (`result/[id].tsx`): video phát TRONG APP (YoutubePlayer), bấm mốc nhận xét = tua đúng giây + tô mốc đang phát; ảnh mở bằng trình xem của app. `?staff=1` = nhân viên xem (GET `/assignments/submissions/:id`) — dùng từ Lịch sử nhận xét / Bài yêu cầu làm lại. Không còn bật YouTube/trình duyệt.
- **Nhóm giảng dạy** (`teach/groups/index.tsx`, `teach/groups/[id].tsx`): nhóm mình phụ trách + thống kê nhóm + học viên (dùng chung ô học viên `features/classes/student-row.tsx` với màn lớp dạy).
- **Bảng điểm** (`grading/gradebook/index.tsx` → `[classId].tsx`, làm lại 14/10/2026): chọn lớp (lớp của tôi + đang dạy lên trước, mặc định ẩn lớp đã kết thúc) → thẻ tổng quan (điểm TB lớp, phân bố Giỏi/Khá/TB/Yếu, chờ chấm, lượt chưa nộp), 2 góc nhìn **Theo học viên** (hạng, dải ô màu từng bài, sắp xếp điểm cao/thấp/nợ bài/tên, bấm bung điểm từng bài + chú thích màu) và **Theo bài tập** (TB bài + đã chấm/chờ/chưa nộp/không chấm); nút **CSV** ở header = chia sẻ bảng điểm qua bảng chia sẻ của máy (web: Xuất CSV). Nhãn ô + màu y web (`cellView`). **Chưa xem trên máy bằng tài khoản giáo viên.**
- **Đang trực tuyến** (`teach/online-users.tsx`): GET `/chat/presence`, 2 tab nhân sự / học viên, tự làm mới 30s (web thì vừa poll vừa nghe socket).
- **Theo dõi học viên PRO** (`teach/pro/index.tsx` → `[comboId].tsx`): gói PRO → học viên + tiến độ dùng suất, điểm TB, tỉ lệ đi học (xin `full: true` để BE trả đủ số liệu).
- **Lịch sử nhận xét** (`grading/history.tsx`) · **Bài yêu cầu làm lại** (`grading/redo-requests.tsx`) · **Nhận xét bài lại** (`grading/regrades.tsx`) · **Review bài nhận xét** (`grading/reviews.tsx`): làm lại 14/10/2026 trên bộ khung chung `features/assignments/staff-list.tsx` (ô tìm + tab 2 phía + chip lọc, thẻ có avatar học viên + khung lý do, nhóm theo ngày Hôm nay/Hôm qua/Thứ…; Review chia nhóm Gấp / Chờ duyệt). Mở bài đều trong app: chấm / nhận xét lại / review / kết quả (`?staff=1` chỉ khi xem bài người khác — tab "Tôi phải làm lại" là bài của chính mình nên mở kết quả học viên).
- **Yêu cầu thanh toán** (`grading/payment-requests.tsx`): thu nhập (`/payment-settings/my-earnings`), gửi yêu cầu cho số bài chưa tính tiền, theo dõi yêu cầu đã gửi. Điền CCCD / tài khoản ngân hàng vẫn ở web.
- **Khảo sát đầu vào** (`surveys/index.tsx`, `surveys/[id].tsx`): tạo phiếu + copy link công khai (`/phieu-khao-sat?user=…`), xem video người ta nộp, nhận xét Phù hợp / Không phù hợp.

- **Khoá học mở đăng ký** (`open-courses/index.tsx` → `open-courses/[id].tsx`, 14/10/2026): danh sách lớp OPEN_REGISTRATION (thẻ tổng quan, tìm không dấu, chip theo khoá + số lớp, Ưu đãi / Zoom / E-Learning, sắp xếp) → chi tiết (học phí + ưu đãi, khai giảng/lịch/số buổi/sĩ số, giảng viên, link trang giới thiệu). **Đăng ký = gọi hotline tư vấn**, KHÔNG thanh toán trong app (chính sách IAP Apple/Google cấm bán khoá học bằng cổng ngoài). Dữ liệu từ route MỚI `GET /classes/open-registration` (class-be, **chưa deploy**) — `GET /classes` chỉ cho nhân sự (học viên 403) và trả cả zoom_id/zoom_pass; route mới lọc OPEN_REGISTRATION + public, lược field. Luật lọc lớp nội bộ (STEAM / training GV) + giá ưu đãi chép từ web `open-course.utils.ts`.

## 5. Màn hình CHƯA LÀM / CỐ Ý MỞ WEB

Danh mục đầy đủ ở `src/navigation/features.ts`. Sau đợt 13/10/2026 **không còn mục `status: 'planned'`** —
mọi màn trong danh mục hoặc đã làm native (`ready`), hoặc cố ý mở bản web (`web`) với lý do bên dưới.

| Màn | Vì sao vẫn mở bản web |
|---|---|
| **Luyện nói** (`/speech-practice`) | Web nhận dạng giọng nói **trực tiếp trong trình duyệt** (mic → Deepgram streaming) rồi mới gửi chữ lên BE chấm. Muốn native phải thêm đường audio→chữ ở class-be (hoặc STT trên máy) — là việc backend mới, không phải port màn hình. |
| **Luyện âm** (`/pronunciation-practice`) | Cùng lý do trên + màn web ~3.800 dòng (soạn gói luyện âm, chấm từng âm vị). |
| **Trò chơi** (`/games`) | 5 game bộ đề + Uspeak Live (kiểu Kahoot) + Đoán từ — mỗi game là một engine riêng. Đáng làm native nhưng là một dự án tách riêng, không phải chuyển đổi 1 màn. |
| **Shadowing** (`/shadowing-sso`) | Đã chốt từ đầu: dùng SSO sang hệ Shadowing (kho câu, chấm phát âm Azure, lặp câu) thay vì dựng lại trong app. |
| **Thống kê, Quản lý chấm bài, Rubric, Phân quyền, Cài đặt thanh toán, Quản lý góp ý, Editor chứng chỉ** | Màn quản trị nhiều cột / kéo-thả — chốt từ đầu là mở web (đợt 4). |
| **Phần TƯƠNG TÁC của bài luyện tập E-Learning** (ghi âm chấm phát âm, trò chơi Everyday English / TVST / Active Talk) | 4 bộ renderer của web ~2.400 dòng, mỗi loại là một ứng dụng nhỏ. App đã vẽ phần chữ của bài luyện tập; phần tương tác mở `my-classes/:id?tab=elearning`. |

Kế hoạch gộp app **Uspeak Chat-Task** (nhân viên) vào app này thành 2 workspace (Uspeak Academy / Uspeak): xem [`docs/KE-HOACH-GOP-CHAT-TASK.md`](KE-HOACH-GOP-CHAT-TASK.md) — **ĐÃ CHỐT KHÔNG GỘP (14/10/2026): giữ 2 app riêng**, file chỉ để tham khảo.

Việc kỹ thuật chưa làm:
- `eas init` (projectId) → chưa lấy được Expo push token; chưa có development build / EAS build / phát hành store.
- Expo Go Android không nhận push (SDK 53+) → cần development build để test push Android.
- Chưa có test tự động.
- Wiki / Hướng dẫn sử dụng: web **không có mục menu** cho hai kho này (chỉ vào bằng quyền `WIKI_VIEW` / `GUIDE_VIEW`); app vẫn hiện trong "Tất cả tính năng" cho mọi vai trò, ai không có quyền thì BE trả 403 và màn hiện đúng câu báo đó.

## 6. Việc tiếp theo ở hai màn chi tiết lớp

Hai việc đang dở của bản bàn giao trước (**thêm tab cho chi tiết lớp giáo viên và chi tiết lớp học viên**) đã **làm xong** — xem mục 4.
File mới sinh ra trong đợt này, cần biết khi sửa tiếp:

| File | Việc |
|---|---|
| `src/features/class-notifications/api.ts` | 2 đường lấy thông báo (học viên: `/active` cursor + `mark-read`; nhân viên: danh sách đầy đủ), `isNotificationActive`, `notificationStatus` |
| `src/features/class-notifications/notification-card.tsx` | Thẻ thông báo (ảnh / tệp / link video) + `useNotificationReader` (mở 0,8s mới tính là đã xem) |
| `src/features/classes/sessions-api.ts` | Buổi học + gộp người tham gia (`groupParticipants`, `absentList`, `sessionTitle/Badge`) — port y công thức `AttendanceTab.tsx` của web |
| `src/features/classes/session-card.tsx` | Thẻ 1 buổi học, bung ra xem có mặt / vắng / người lạ |
| `src/features/assignments/class-api.ts` + `class-assignment-card.tsx` | Bài tập theo lớp nhìn từ phía giáo viên (khác `/assignments/my` của học viên) |
| `src/features/classes/class-report.tsx` | Tab Báo cáo của học viên (`computeClassReport` + thanh ngang thay cho radar/bar chart của web) |
| `src/components/ui/segmented.tsx` | Thêm `variant="underline"`: tab gạch chân cuộn ngang, có số đếm + chấm đỏ — dùng khi từ 4 tab trở lên |
| `src/components/ui/html-view.tsx` | **Bộ hiển thị HTML tự viết** (tiêu đề, đoạn, danh sách, trích dẫn, bảng, ảnh, link, đậm/nghiêng) — dùng cho Wiki, sau này dùng được cho mọi nội dung soạn bằng editor web. Không thêm `react-native-webview` để Expo Go vẫn test được |
| `src/features/documents/*` | Kho tài liệu `/drive` (api + màn dùng chung cho gốc và thư mục con) |
| `src/features/wiki/api.ts` | Wiki/Hướng dẫn (2 space), tăng lượt xem riêng 1 lần |
| `src/features/feedback/api.ts` | Góp ý: gửi + nhắn tiếp (multipart, ảnh tự nén) |
| `src/features/forum/*` | Diễn đàn: bảng tin cursor, đăng bài, cảm xúc (patch cache), bình luận + trả lời |
| `src/features/surveys/api.ts` | Khảo sát đầu vào: danh sách, tạo phiếu, nhận xét |
| `src/features/assignments/requests-api.ts` | 3 hàng chờ của người nhận xét (lịch sử / làm lại / nhận xét lại) |
| `src/features/payment/api.ts` | Thu nhập + yêu cầu thanh toán |
| `src/features/classes/teach-api.ts` | Đang trực tuyến, nhóm giảng dạy, bảng điểm, theo dõi PRO |
| `src/features/classes/student-row.tsx` | Ô học viên dùng chung giữa màn lớp dạy và nhóm giảng dạy |

Còn thiếu (để đợt sau):
- **Tạo / sửa / xoá thông báo lớp** cho giáo viên: API đã có (`POST /class-notifications/:classId`, `PATCH|DELETE /class-notifications/:id`, upload `POST /class-notifications/upload/files`) nhưng app chưa làm form — hiện mở web.
- Tab Bài tập (giáo viên) chưa có "danh sách nộp bài" từng bài: web mở modal `SubmissionBreakdownModal` chứ không có URL riêng, muốn làm trên app phải gọi `assignmentApi.getSubmissionBreakdownCountsBatch` / API breakdown tương ứng.
- Sửa điểm danh, lý do vắng, cấu hình Zoom từng buổi: `PATCH /classes/sessions/:sessionId/attendance` đã có sẵn nếu sau này muốn làm trên app.

## 7. Thay đổi ở class-be CHƯA DEPLOY (bắt buộc deploy thì app prod mới chạy)
Repo `D:\Uspeak\uspeak-class-be`, chưa commit:
1. **Đăng nhập mobile**: `src/common/auth-cookie.util.ts` (`isMobileClient`, `toMobileTokens`) + `src/auth/auth.controller.ts` (nhánh mobile cho login/refresh/logout/google/google-select/switch-role).
2. **Quiz ghi âm Android**: `src/speech/audio-transcode.util.ts` (ffmpeg m4a→WAV) dùng trong `assignments.service.ts uploadQuizSpeakingAudio` — server cần có `ffmpeg`.
3. **Push mobile**: `src/database/mobile-push-token.schema.ts`, `src/push/expo-push.service.ts`, `push.service.ts`, `push.module.ts`, `push.controller.ts` (POST/DELETE `/push/mobile-token`), `notification/notification.service.ts`.
4. **Chat**: GET `/chat/rooms/:roomId/messages/search` và GET `/chat/rooms/:roomId/media` (`chat.controller.ts`, `chat.service.ts` — `searchMessages`, `getRoomMedia`).
5. **Luật điểm TB bỏ qua bài chưa nộp**: `classes/classes.service.ts`, `certificate/certificate.service.ts`, `pro-tracking/pro-tracking.service.ts`, `elearning/elearning-internal.controller.ts` (+ web `src/utils/gradebook.ts`, `pro-tracking/ClassDetailModal.tsx`). Sau deploy, điểm TB của học viên nợ bài sẽ TĂNG và một số học viên có thể đủ điều kiện chứng chỉ.
6. **Ảnh bìa video chat**: `chat/chat.gateway.ts` (nhận thêm `thumbnail_key` trong `send_message`) + `chat/chat.service.ts` (`sendMessage` ưu tiên `attachment.thumbnail_key`, trả `thumbnail_url/thumbnail_key`; `getMessages` dựng `thumbnail_url` từ `thumbnail_key` cho CẢ video chứ không chỉ ảnh) + `chat/dto/chat.dto.ts` & `chat/chat-activity.service.ts` (nộp kết quả hoạt động cũng gửi kèm được). Chưa deploy thì app vẫn gửi được video, chỉ là ảnh bìa không lưu lại sau khi tải lại màn. **Web cũng đã cắt bìa** (`uspeak-class-fe`: `stores/chat/upload.api.ts captureVideoPoster`, dùng ở trang /chat, ChatLauncher, ActivityReportModal) — deploy web cùng đợt.
7. **Socket local**: `src/notification/notification.gateway.ts` — cho phép Origin localhost/LAN khi `NODE_ENV !== 'production'` (mọi gateway dùng chung engine socket.io nên trước đây chặn luôn `/chat` khi dev).

## 8. Bẫy đã gặp (đọc để khỏi vấp lại)
- **Thứ tự tin**: `getMessages` trả trang 1 = 40 tin mới nhất nhưng trong trang sắp cũ→mới → app tự sort mới→cũ (`useRoomMessages`). Sai là `mark_read` gửi id cũ, số chưa đọc không về 0.
- **FlatList `inverted` trên Android** lật cả 2 chiều → đừng đặt `ListEmptyComponent` lật bù; vẽ trạng thái trống ngoài danh sách.
- **Bàn phím Android** (edge-to-edge SDK 54+): dùng `KeyboardAvoider` (`src/components/ui/keyboard-avoider.tsx`), không dùng KeyboardAvoidingView; `keyboardDismissMode="interactive"` chỉ cho iOS.
- **Kéo để làm mới**: không truyền `isRefetching` vào RefreshControl (danh sách nhảy lên đầu) → dùng `usePullRefresh` (`src/lib/use-pull-refresh.ts`).
- **Expo Go Android** ném lỗi ngay khi import `expo-notifications` → `push.ts` nạp có điều kiện.
- **Danh sách dài**: item `memo`, không tự gọi hook trong item; callback qua `useStableCallback` (`src/lib/use-stable-callback.ts`); badge/1 phòng dùng `useQuery` + `select` (`useUnreadTotal`, `useChatRoom`).
- `/chat/users/dm-eligible` nhánh AD trả user CRM thô (`name`, `avatar`) → đã chuẩn hoá trong `useDmEligibleUsers`.
- Admin (AD) được tính "phụ trách" mọi lớp và đọc phòng qua bảng `chat_admin_room_reads` (không phải `chat_members`).
- Màu: luôn dùng token (`bg-surface`, `text-muted`, `bg-brand-soft`…) cho sáng/tối; token mới thêm: `navy`, `navy-soft`, `zoom`, `orange`.
- **Đổi tab mà dùng chung 1 FlashList**: phải đặt `key={tab}` cho từng danh sách, không thì list tái dùng ô cũ của tab trước (chiều cao sai, cuộn giữ nguyên vị trí cũ).
- **React Compiler cấm `setState` trong `useEffect`** (lint `react-hooks/set-state-in-effect`). Kiểu "tab Thông báo biến mất thì nhảy về tab khác" phải **suy ra khi render** (`const tab = selected === 'notifications' && !has ? 'assignments' : selected`), đừng sửa state trong effect.
- **Lọc theo thời gian** (thông báo còn hiệu lực, buổi học đã diễn ra): lọc trong `queryFn` chứ đừng gọi `Date.now()` lúc render — vừa dính luật React Compiler, vừa có mốc giờ mới mỗi lần tải lại.
- **Thông báo lớp**: `attachments` đã kèm link S3 presigned (7 ngày) do class-be ký sẵn → dùng thẳng, KHÔNG nối media token như file chat.
- **Đánh dấu đã xem thông báo**: chỉ sửa cache, đừng `invalidate` — API `/active` xếp tin chưa xem lên đầu nên tải lại sẽ làm tin nhảy chỗ ngay lúc đang đọc.
- **Diễn đàn không có API lấy 1 bài**: class-be chỉ có bảng tin phân trang cursor → màn chi tiết đọc bài từ cache bảng tin (`useForumPostFromCache`). Vào thẳng link bài mà chưa mở bảng tin thì phần bài trống, bình luận vẫn tải — đừng "sửa" bằng cách gọi `GET /forum/posts/:id`, endpoint đó không tồn tại.
- **Gói combo (UspeakPro) trả lớp trùng**: CRM gộp `granted_classes` từ nhiều khoá và KHÔNG lọc trùng → phải dedupe theo `_id` trước khi render, không thì lớp hiện hai lần và key React trùng.
- **Ảnh/tệp của mỗi hệ ký kiểu khác nhau**: thông báo lớp, feedback, wiki, diễn đàn → class-be trả **link presigned dùng thẳng**; còn file trong chat và kho tài liệu (`/uploads/file?key=`) thì phải nối **media token**. Nối token vào link presigned là vô ích, quên nối ở link `/uploads/file` là ảnh không hiện.
- **Không thêm `react-native-webview`** để render HTML: Expo Go có thể không nạp được module native → mất luôn đường test nhanh. Nội dung rich-text dùng `components/ui/html-view.tsx`.
- **Thanh menu dưới là loại NỔI** (`components/ui/floating-tab-bar.tsx`, đè lên nội dung): mọi màn trong `(tabs)` phải chừa `useTabBarSpace()` ở đáy danh sách, không thì dòng cuối nằm khuất dưới thanh. Đã bỏ NativeTabs vì thanh native không bỏ được chữ, không bo tròn nổi và không thay icon bằng ảnh đại diện được.
- **Ảnh đại diện phải đi qua `useMediaUrl`**: `user.avatar` của class-be là `/uploads/file?key=…`, thiếu media token là ảnh im lặng không hiện — lỗi đã gặp ở Trang chủ / Tài khoản.
- **Link class-be chưa có media token thì `resolveMediaUrl` trả `undefined`** (không trả link trần): gọi lúc token chưa về chỉ nhận 401 rồi ảnh trắng — đó là lý do avatar "lâu lâu biến mất" lúc mới mở app. Chỗ hiển thị phải có ảnh dự phòng: `Avatar` tự quay về chữ cái tên khi link hỏng, thanh menu dùng icon người khi chưa có link.
- **Menu phải lọc theo QUYỀN, không chỉ theo vai trò**: hai tài khoản cùng vai trò vẫn có thể khác quyền (CRM gán riêng). `useMyPermissionCodes()` trả `null` khi gọi lỗi — lúc đó chỉ lọc theo vai trò, KHÔNG ẩn sạch menu (mạng chập chờn mà ẩn hết thì người dùng tưởng mất tính năng). 5 tab dưới cùng vẫn cố định cho mọi vai trò vì đổi số tab lúc chạy sẽ remount navigator.
- **`expo export` làm hỏng file typed routes**: sau khi export, `.expo/types/router.d.ts` có thể lẫn cả file ngoài thư mục `app/` (`/../features/...`) và biến `/class-surveys` thành `/class-surveys/index` → `tsc` báo lỗi route không tồn tại. Cách chữa: `rm -rf .expo/types` rồi chạy lại `CI=1 npx expo start` (một lần) trước khi typecheck.
- **Tab E-Learning bật theo NỘI DUNG, không theo `course_type`**: web hiện tab khi cây node có dữ liệu; lớp Zoom vẫn có bài giảng E-Learning. Gắn theo hình thức lớp là học viên lớp Zoom mất chỗ xem video (đã từng sai như vậy).
- **Video E-Learning là khung nhúng (iframe)**: Bunny/Vimeo/YouTube đều phải phát trong `react-native-webview` (có sẵn trong Expo Go). Link Bunny BẮT BUỘC xin chữ ký ở `/elearning/bunny/sign` — tự ghép `iframe.mediadelivery.net/embed/...` là bị chặn.
- **Thời gian học của video nhúng là ước lượng**: WebView không báo trạng thái đang phát về app, nên màn nội dung đếm thời gian MỞ màn (app chạy nền thì dừng đếm) rồi gửi `/study-time/video/heartbeat`. Số này hơi rộng tay hơn web (web đếm theo sự kiện của trình phát) — nhớ điều này khi so báo cáo giữa app và web.
- **Buổi học của CRM đánh số từ buổi khai giảng**: buổi 1 = "Khai giảng", buổi N hiển thị là N-1 (`sessionTitle`/`sessionBadge`; bên học viên áp trong `AttendanceRow`) — lệch luật này là số buổi trên app khác web.
- **Nội dung soạn thảo giờ hiện ĐÚNG ĐỊNH DẠNG**: `components/ui/html-parse.ts` đọc HTML của Tiptap thành khối, `rich-text.tsx` vẽ bằng Text/View lồng nhau (đậm, nghiêng, tiêu đề, danh sách, trích dẫn, mã, đường kẻ, **liên kết bấm được**, **ảnh** đi qua `useMediaUrl` và tự đo tỉ lệ). Trước đây chỉ lọc bỏ thẻ nên mất sạch định dạng. Hai lưu ý: (1) `numberOfLines` vẫn rút về chữ thường một khối vì cắt dòng chỉ làm được trên MỘT thẻ Text — chỗ nào cần gấp nội dung nhiều khối thì khoá `maxHeight` + `overflow:hidden` như `assignment-header.tsx`; (2) tên thực thể HTML PHÂN BIỆT hoa thường (`&Agrave;` ≠ `&agrave;`), hạ hết về chữ thường là sai chữ hoa tiếng Việt. Parser tách riêng khỏi phần vẽ để chạy thử được bằng node: `npx tsc src/components/ui/html-parse.ts --ignoreConfig --outDir <thư mục tạm> --module commonjs --target es2020` rồi `node`.
- **Điểm bài = TRUNG BÌNH CỘNG các tiêu chí, thang 10** (web: `totalScore` ở `assignments/result/[id]`), KHÔNG phải tổng điểm và mẫu số KHÔNG phải tổng `maxScore`. 4 tiêu chí thang 10 mà cộng dồn mẫu số sẽ ra "8.1/40" — nhìn như trượt trong khi thực tế 8.1/10, và % dùng để chọn câu động viên / màu vòng tròn cũng sai theo (81% → 20%). Dòng cuối bảng tiêu chí tên đúng là **"Điểm trung bình"**.
- **Nhận xét theo mốc có CẢ bắt đầu và kết thúc**: `timestamp_comments` của class-be lưu `time` + `endTime`. Màn chấm bài lưu `endTime = max(end ?? time + 1, time + 1)` nên **không chọn mốc kết thúc vẫn có `endTime`** hơn đúng 1 giây — đó là giá trị kỹ thuật, không phải ý người chấm. Dùng `segmentEnd()` trong `features/assignments/segment-loop.ts` để phân biệt (ngưỡng 1,2 giây), đừng hiện "0:16–0:17" hay phát lặp 1 giây. Màn kết quả của học viên lặp A–B như web (dừng 1 giây rồi quay lại đầu đoạn), màn chấm bài phát hết đoạn rồi dừng.
- **Thanh tab dính dưới header trong suốt** (nay chỉ còn màn chi tiết lớp của GIÁO VIÊN `teach/[id].tsx` — màn học viên đã bỏ tab, xem mục 4): FlatList chỉ dính được ở mép trên cùng (mà mép đó đang là thanh trên cùng trong suốt) → tab bar là lớp vẽ đè, `translateY` = nội suy từ vị trí cuộn, trong danh sách chỉ để chỗ trống cùng chiều cao. Dùng **Animated của React Native** (native driver), KHÔNG dùng Reanimated ở đây: (1) ref của `Animated.FlatList` bên Reanimated không có `scrollToOffset` (nút "Làm ngay" im lặng không cuộn); (2) style Reanimated bắt giá trị JS thay đổi sau khi đo (chiều cao ảnh bìa) bị dựng lại lúc render → cảnh báo strict mode "Reading from `value` during component render". `contentContainerStyle.minHeight = collapseAt + chiều cao thật của list` để tab ít nội dung vẫn cuộn tới chỗ dính.
- **Màn ẩn header native tự vẽ `StatusBar`** thì chỉ vẽ khi màn đang focus (`useFocusEffect`), không thì màn đè lên (chat, bài tập) bị chữ trắng trên nền trắng.
- **Ảnh lưới / avatar PHẢI xin bản thu nhỏ `?w=`** (`thumbMediaUrl` trong `src/lib/media.ts`): class-be resize ra webp vài chục KB rồi cache bản đó trên S3. Tải ảnh gốc cho từng ô vừa ngốn 3G của học viên, vừa giữ socket S3 của BE lâu — đúng nút thắt đã gây lỗi 502 bên web. Kèm theo: key cache phải có bề rộng (`thumbCacheKey`), dùng chung một key cho nhiều cỡ thì ô to lấy nhầm bản nhỏ đã cache và hiện ra mờ nhoè.
- **iOS gạt công tắc im lặng là không có tiếng**: tin thoại và trình phát video phải gọi `setAudioModeAsync({ playsInSilentMode: true })` trước khi phát, không thì bấm phát mà im re (thanh sóng vẫn chạy) — người dùng tưởng tin hỏng.
- **Ảnh bìa video do MÁY NGƯỜI GỬI cắt, không phải server**: class-be chỉ có `sharp` (ảnh), cắt khung video phải cần ffmpeg — nặng CPU trên VPS đang chật. App cắt bằng `expo-video` `generateThumbnailsAsync` (`features/chat/video-poster.ts`), web cắt bằng canvas (`stores/chat/upload.api.ts captureVideoPoster`), cả hai upload ảnh bìa rồi gửi kèm `thumbnail_key`. Hai hệ quả phải nhớ: (1) **video gửi TRƯỚC đợt này không có bìa** — app phải luôn giữ nhánh dự phòng "thẻ tối + tên tệp + thời lượng", đừng bỏ; (2) thêm bề mặt gửi video mới (web hay app) là phải cắt bìa ở đó luôn, không thì bên kia lại thấy ô đen.
- **Upload trong chat chạy XHR chứ không fetch**: `fetch` của React Native không có sự kiện tiến trình và không huỷ được. `lib/api/upload.ts` dùng `XMLHttpRequest` (`upload.onprogress` + `abort()`), có `UploadAbortedError` để chỗ gọi phân biệt "người dùng huỷ" với "gửi lỗi". Báo % theo bước 5% — báo từng % là vẽ lại cả danh sách tin, máy yếu cuộn giật.
- **`deliver()` dựng lại bong bóng từ `temp` gốc**: mọi thứ cập nhật trong lúc upload (% tiến trình, ảnh bìa video vừa cắt) nằm ở item trong `pending`, không nằm trong `temp` → phải merge lại, không thì lúc chờ socket trả lời bong bóng nhảy về 0% và mất ảnh bìa.
- **`flex-1` trong bong bóng chat bị đo ra bề rộng 0**: bong bóng co theo nội dung (chỉ có `maxWidth` 74%), mà trong khung co-theo-nội-dung thì Yoga tính con `flex-1` ra 0 → tin **tệp** từng hiện thành cột cao nghều, tên tệp xuống dòng từng ký tự. Nội dung có hàng ngang trong bong bóng phải **khóa bề rộng** (`FileContent`, `VoiceContent` đều đặt `width`).
- **Đổi bàn phím ↔ bảng emoji trên Android phải nhả rồi bắt lại focus**: `showSoftInputOnFocus={false}` chỉ CHẶN bàn phím lúc focus chứ không ẩn bàn phím đang mở, còn `Keyboard.dismiss()` thì nhả luôn focus (mất con trỏ). Cách đúng: đổi state trước, đợi 1 khung hình (`requestAnimationFrame`) cho prop xuống native, rồi `blur()` + `focus()`. Lúc bật lại bàn phím cũng phải blur/focus vì ô nhập đang focus sẵn — gọi `focus()` không là RN bỏ qua, bàn phím không lên. Nhớ cờ `switching` để cú blur/focus đó không kích hoạt listener `keyboardDidShow` tự đóng mất bảng.
- **Bảng emoji phải chiếm ĐÚNG chỗ bàn phím**: màn chat dùng `KeyboardAvoider` (đệm đáy = chiều cao bàn phím) + màn phòng tự chừa `insets.bottom` khi bàn phím đóng. Bảng emoji mở ra là bàn phím đóng → chiều cao bảng phải là `useKeyboardHeight() - insets.bottom`, lấy nguyên chiều cao bàn phím là ô soạn tin nhảy lên một đoạn bằng vùng an toàn đáy. Mở bảng TRƯỚC rồi mới `Keyboard.dismiss()`.
- **Đừng để `selectable` trên chữ trong bong bóng chat**: Android nhấn giữ bật thanh Copy/Share/Select all của hệ thống đè lên menu nhấn giữ của app (menu đã có "Sao chép").
- **Modal menu nhấn giữ**: nền tối phải bọc CẢ khối (View `flex-1 justify-end bg-black/45` + Pressable phủ để đóng); để nền tối là 1 Pressable `flex-1` phía trên thì dải chứa hàng cảm xúc không bị tối.
- **Lưới lịch bằng `w-[14.2857%]` + `flex-wrap` rớt ô thứ 7 xuống hàng** (làm tròn %) → chia sẵn từng hàng 7 ô `flex-1`.
- **Quyền nhắn riêng (DM) không suy từ vai trò ở app**: luật ở class-be `canDirectMessage` phụ thuộc lớp/nhóm (HV chỉ nhắn GV lớp mình + TA nhóm mình; TA nhắn GV + HV nhóm mình phụ trách; AD/TE mọi người; TG/SALES… không ai). Web hỏi `/chat/users/:id/dm-permission` từng người ở thẻ hover; app lấy cả tập qua `/chat/users/dm-eligible` (1 lượt). Nhóm "Giáo viên & trợ giảng" ở màn Thông tin chia theo vai trò TRONG PHÒNG (`context_role_code`) nên có thể có GV nằm ở nhóm Học viên mà vẫn có nút nhắn — đúng theo server.
- **Nền tròn + con tràn ra ngoài trên Android**: view vừa có `backgroundColor`+`borderRadius` vừa chứa phần tử `position:absolute` lòi ra ngoài (huy hiệu số) thì Android vẽ thành hình VUÔNG — tách nền tròn thành lớp riêng không chứa gì (`floating-tab-bar.tsx`, tab Chat).
- **Luật điểm TB bảng điểm (đổi 14/10/2026 theo yêu cầu)**: CHỈ tính bài đã nộp VÀ đã có điểm — chưa nộp / chờ chấm / không cần chấm đều BỎ QUA (trước: chưa nộp tính 0). Nguồn duy nhất: web `uspeak-class-fe/src/utils/gradebook.ts` (dùng cho trang Bảng điểm + tab Bảng điểm trong chi tiết lớp — trước đó 2 chỗ chép tay riêng) ⇄ app `features/classes/teach-api.ts` (`studentAverage`, `cellView`, `visibleAssignments`). Backend đã đổi theo cùng luật (14/10/2026, **chưa deploy**): `classes.service` (average_score chi tiết lớp + nhóm giảng dạy), `certificate.service` (điều kiện chứng chỉ "Điểm TB > 6" — thiếu bài vẫn chặn riêng qua "Không làm ≥5 bài"), `pro-tracking.service` (tổng + chi tiết 1 lớp), `elearning-internal.controller` (API nội bộ). Trang chủ học viên (web + app) vốn đã chỉ tính bài có điểm.
- **Mở thẳng 1 màn từ link / thông báo đẩy mất nút quay lại** (màn đó thành gốc ngăn xếp) → `src/app/_layout.tsx` có `unstable_settings = { initialRouteName: '(tabs)' }` để luôn đặt Trang chủ bên dưới. Lúc chưa đăng nhập (tabs) bị `Stack.Protected` ẩn thì React Navigation tự rơi về màn còn lại (login).
- **Gesture RNGH trong worklet**: callback phải gắn thẳng vào chuỗi `Gesture.Pan().onStart(...)`; gắn sau biểu thức điều kiện `(cond ? a : b).onStart(...)` thì plugin worklets không biến thành worklet → cảnh báo "None of the callbacks… are worklets". Muốn cấu hình theo điều kiện thì gọi `pan.activeOffsetY(...)` sau.
- **YouTube trong WebView phải có `baseUrl` là domain thật** (`components/ui/youtube-player.tsx` dùng WEB_URL): nạp HTML trần thì YouTube báo lỗi 152/153 vì thiếu Referer.
- **Khung ảnh bìa + tab dính dùng chung** (`components/ui/collapsing-header.tsx`): `listRef` do màn tự `useRef` rồi truyền vào hook — hook mà trả ref trong object thì lint React Compiler chặn ("Cannot access refs during render").
- **`completed_assignments` của `/assignments/my-classes` gần như luôn 0**: class-be chỉ đếm submission có status `graded`, mà status thật là `completed`/`submitted`… → app hiện "đã nộp = total_assignments − pending_assignments" (khớp "BT 27/30" ở Trang chủ). Sửa tận gốc thì sửa `getMyClasses` ở class-be.
- **`session_number` của bài tập lúc là số, lúc là cả tên buổi** ("Buổi 11: bài tập…") → ghép "Buổi " vào ra "Buổi Buổi 11: …". `AssignmentCard` chỉ lấy phần "Buổi N".

## 9. Trạng thái kiểm thử
- Đã chạy thật trên máy ảo Android Pixel_8 (API 37, Expo Go) với tài khoản **Admin** + class-be local (DB thật).
- Phần làm ngày 13/10/2026 (tab mới của 2 màn chi tiết lớp + 16 màn chuyển đổi ở mục 4) **mới chỉ qua `npx tsc --noEmit`, `npx expo lint` và `expo export` (đóng gói Android chạy được)** — CHƯA mở trên máy thật/máy ảo, chưa thử với dữ liệu thật của từng vai trò.
- 14/10/2026: **chi tiết lớp học viên** (bản làm lại kiểu app) đã chạy trên máy ảo bằng tài khoản **học viên** thật (lớp EET22): cuộn + tab dính, đổi tab, "Làm ngay", E-Learning / Bài tập / Điểm danh / Báo cáo, sáng + tối. Chưa bấm "Vào phòng học" (gọi verify Zoom thật), chưa thử lớp E-Learning thuần / lớp đã kết thúc / lớp còn nợ học phí.
- **Chưa test**: vai trò giáo viên thật trên máy; iPhone thật; push; nhận bài chấm; đổi ảnh đại diện / đổi mật khẩu thật; gửi ảnh/video/tin thoại thật; chế độ tối toàn bộ màn.
