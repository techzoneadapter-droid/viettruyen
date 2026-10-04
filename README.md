# Việt Truyện

Ứng dụng Windows tiếng Việt để sáng tác truyện dài từ 1 đến 1.000 chương, lưu dữ liệu riêng trên máy và cập nhật ngay trong app.

**Tải bản cài:** https://github.com/techzoneadapter-droid/viettruyen/releases/latest

## Dùng lần đầu
1. Cài `VietTruyen-Setup-*.exe` (Windows 10/11 64-bit).
2. Mở **Kết nối AI**. Chọn ChatGPT và đăng nhập bằng trình duyệt, hoặc nhập Gemini/OpenAI API key.
3. Bấm **Lấy danh sách model**, chọn model rồi **Lưu kết nối** và **Thử kết nối**. Việc thử kết nối có sử dụng hạn mức AI.
4. **Tạo truyện mới**, nhập ý tưởng, thể loại, văn phong, số chương và số từ mỗi chương.
5. Tạo hồ sơ và dàn ý quyển để xem hướng phát triển trước; có thể sửa hồ sơ. Bấm **Viết đợt đầu** hoặc **Tiếp tục viết**, nên bắt đầu 5 chương.
6. Xem bản thảo, dàn ý, trạng thái nhân vật, các tuyến đang mở. AI kiểm tra không thay thế biên tập viên.
7. Xuất TXT để dùng cho app truyện/video hoặc xuất JSON để sao lưu; Nhập sao lưu tạo một bản truyện riêng.

## Dịch truyện
Vào **Dịch truyện**, chọn tiếng Trung, tiếng Anh hoặc bản convert, nhập văn phong và bảng tên/thuật ngữ (mỗi dòng `tên gốc = tên tiếng Việt`). Nhập một hoặc nhiều TXT (UTF-8, UTF-16 LE, GB18030/GBK), hoặc dán văn bản. App tách theo tiêu đề chương Trung/Anh/Việt; kiểm tra danh sách sau khi nhập. File không có tiêu đề là một chương. Chưa hỗ trợ Word, PDF, EPUB.

Bấm **Tiếp tục dịch** để dịch theo đợt bằng model đã chọn. Chương dài chia thành phần nhỏ, lưu bản dịch trước khi kiểm tra. Hết hạn mức/mất mạng thì giữ phần đã lưu; chạy tiếp không dịch lại phần đã hoàn tất. Tên và thuật ngữ được giữ xuyên các phần; mâu thuẫn tên hoặc bản dịch không đạt kiểm tra sẽ dừng để bạn đối chiếu. Bản gốc và bản dịch hiển thị cạnh nhau. **Lưu & duyệt chương** xác nhận thủ công toàn bộ chương, kể cả khi bản tự động còn thiếu phần.

Xuất bản dịch TXT hoặc sao lưu cả gốc và bản dịch JSON. Dữ liệu dịch nằm trong thư mục `translations` ở nơi lưu truyện đã chọn, được chuyển và sao lưu khi cập nhật. Dịch/biên tập giữ tình tiết và nghĩa gốc theo yêu cầu gửi cho AI; chưa kiểm chứng chất lượng bằng tài khoản AI thật, AI kiểm tra không thay thế người duyệt.

## Nơi lưu truyện
Vào **Nơi lưu truyện → Đổi thư mục lưu truyện**, chọn thư mục trống trên ổ đĩa mong muốn. App sao chép và kiểm tra truyện, bộ nhớ, bản sao lưu và ý tưởng rồi mới áp dụng; bản gốc được giữ nguyên. Không đổi giữa tác vụ. Thư mục đã chọn được giữ sau khi đóng/mở app và cập nhật. API key/token vẫn ở kho mã hóa hệ điều hành. Nếu dùng ổ rời, cần kết nối ổ trước khi mở app.

## Ý tưởng & xu hướng
Vào **Ý tưởng & xu hướng**, nhập chủ đề, bấm **Lấy tín hiệu mới từ web**. App lấy tiêu đề tin Google News gần đây (30 ngày), hiển thị nguồn và thời điểm lấy dữ liệu. Sau đó chọn thể loại và bấm **AI đề xuất hướng truyện** để tạo ý tưởng, điểm cuốn hút và hướng nhiều quyển cho truyện dài. Dùng nút **Dùng ý tưởng tạo truyện** để điền sẵn form tạo truyện.

Lấy tín hiệu web không cần AI; tạo ý tưởng dùng model đã chọn và tiêu tốn hạn mức. Gợi ý là suy luận sáng tạo dựa trên tiêu đề, không phải thống kê lượt đọc hoặc bảng xếp hạng truyện. Nếu mạng lỗi hoặc không có tin, app thông báo và giữ kết quả trước đó.

## Cập nhật
Vào **Cập nhật ứng dụng → Cập nhật ngay**. Một lần bấm sẽ kiểm tra, tải và cài bản mới, rồi khởi động lại app. Bạn cũng có thể dùng các nút kiểm tra/tải/cài riêng nếu muốn xem bản mới trước.

Mỗi lần code trên `main` thay đổi, GitHub Actions build NSIS, chạy kiểm thử, cài bản Windows để kiểm tra app, và phát hành bản mới với phiên bản riêng (`major.minor.github_run_number`). Chỉ bản phát hành có installer + `latest.yml` mới được app dùng để cập nhật; thay đổi README và `mumu-upstream` không tạo bản desktop mới. Thông tin tài khoản và truyện không nằm trong thư mục cài đặt. App sao lưu truyện trước khi cài bản mới. Không cập nhật giữa tác vụ viết.

## Kết nối và hạn mức
- ChatGPT: luồng OAuth chính thức Sign in with ChatGPT cho ứng dụng nguồn mở chạy local; kiểm tra chữ ký ID token, nonce, state, PKCE và quyền dùng gói. Model lấy từ tài khoản. Không dùng cookie hay backend-api. Nếu tài khoản chưa được cấp quyền, thông báo lỗi để bạn dùng nguồn khác.
- Gemini/OpenAI API: nhập key của bạn. Gemini có thể có tầng miễn phí tùy model và hạn mức. API trả phí tính theo sử dụng. App không tự chọn nguồn trả phí thay thế.
- Chưa kiểm thử bằng tài khoản ChatGPT/Gemini thật hoặc tạo đủ 1.000 chương. Các bài kiểm thử AI dùng phản hồi giả lập để kiểm tra lưu dữ liệu, lỗi, kiểm duyệt và tiếp tục; không chứng minh chất lượng văn học.

## Viết truyện dài
Hồ sơ toàn truyện → quyển → dàn ý từng đợt 10 chương → viết → kiểm tra → sửa một lần nếu có lỗi → lưu bộ nhớ. Một chương không đạt sẽ dừng đợt cho bạn xem lại. Mỗi lần gọi AI nhận hồ sơ, trạng thái mới nhất, ba ký ức gần nhất, đoạn kết chương trước và ký ức cũ được tìm theo từ khóa. Bộ nhớ hiện dùng tìm kiếm từ khóa; không phải toàn bộ hệ thống embedding của MuMu.

App giữ tóm tắt, dữ kiện, trạng thái nhân vật và các tuyến đang mở. Sửa nội dung chương yêu cầu kiểm tra lại chương đó và chương sau để bộ nhớ không giữ dữ kiện lỗi. Hết hạn mức hoặc mất mạng sẽ giữ các bước đã lưu, bấm Tiếp tục để chạy tiếp. Độ dài chương là yêu cầu gửi cho AI, cần kiểm tra thực tế.

## Dữ liệu và bảo mật
Truyện: `%APPDATA%\VietTruyen\data\projects`. Sao lưu tự động trước đợt viết và cập nhật: `%APPDATA%\VietTruyen\data\backups`. Mỗi lần lưu còn giữ `project.json.bak`. Kết nối được mã hóa bằng Electron safeStorage (Windows DPAPI); key/token không trả về giao diện hay ghi trong sao lưu truyện. Không xóa các thư mục này nếu muốn giữ dữ liệu.

Renderer bật sandbox, tắt Node integration và có CSP. IPC giới hạn nguồn, lệnh và kiểm tra dữ liệu. Bản cài hiện chưa có chứng chỉ ký thương mại. App chỉ lấy cập nhật từ repo này; checksum của electron-updater kiểm tra tính toàn vẹn file tải.

## MuMuAINovel
Mã nguồn gốc giữ nguyên tại `mumu-upstream/`, phiên bản `749186d40894b40b9fd0589791fec243d42e60c9`, để dùng hoặc phát triển bản web MuMu đầy đủ. Desktop Việt Truyện là lớp giao diện tiếng Việt và engine local riêng; không chạy backend Python/PostgreSQL của MuMu và chưa chuyển toàn bộ chức năng MuMu sang desktop. Nguồn: https://github.com/xiamuceer-j/MuMuAINovel. GPL-3.0, xem LICENSE và NOTICE.md.

## Phát triển
Node.js 24:
```sh
npm ci
npm test
npm start
npm run dist:win
```
Build đầy đủ Windows nên chạy trên Windows/GitHub Actions. `npm run test:desktop` dùng bản app đã đóng gói trong `dist/win-unpacked`. Không đưa key/token vào Git. Để phát hành thủ công: Actions → Build and release Windows → Run workflow.
