const GENRES=['Tiên hiệp','Tu tiên','Huyền huyễn','Kiếm hiệp','Võ hiệp','Đô thị','Đô thị dị năng','Đô thị tu tiên','Ngôn tình','Ngôn tình hiện đại','Ngôn tình cổ đại','Thanh xuân vườn trường','Lãng mạn','Gia đình','Đam mỹ','Bách hợp','Trinh thám','Hình sự','Tâm lý','Kinh dị','Linh dị','Sinh tồn','Mạt thế','Khoa học viễn tưởng','Du hành không gian','Cyberpunk','Fantasy phương Tây','Lịch sử','Quân sự','Phiêu lưu','Hài hước','Đời thường','Thể thao','Thương trường','Game / võng du','Xuyên không','Trọng sinh','Hệ thống','Vô hạn lưu','Khác'];
const STYLE_PRESETS=[
 {name:'Tự nhiên, dễ đọc',text:'Tiếng Việt tự nhiên, rõ ràng, mượt mà; câu dài ngắn linh hoạt, đối thoại có cá tính, tránh lặp từ và diễn giải thừa.'},
 {name:'Truyện mạng, nhịp nhanh',text:'Nhịp truyện nhanh, mở cảnh có mục tiêu rõ, nhiều hành động và đối thoại; mỗi chương có tiến triển và điểm móc hợp lý, tránh câu kéo và lặp công thức.'},
 {name:'Tiên hiệp, cổ phong',text:'Giọng kể cổ phong vừa phải, trang trọng, giàu không khí tu hành; xưng hô phù hợp vai vế, hình ảnh có sức gợi, thuật ngữ nhất quán; tránh lạm dụng từ Hán Việt khó hiểu.'},
 {name:'Huyền huyễn, sử thi',text:'Không khí rộng lớn, kỳ ảo, giọng kể mạnh mẽ; quy tắc thế giới và năng lực rõ ràng, cảnh chiến đấu có diễn biến cụ thể, giữ góc nhìn nhân vật và cảm xúc.'},
 {name:'Hài hước, dí dỏm',text:'Giọng kể dí dỏm, đối thoại duyên dáng; hài đến từ tính cách và tình huống, tiết chế châm biếm; không phá logic hay cảm xúc nghiêm túc của câu chuyện.'},
 {name:'Lãng mạn, giàu cảm xúc',text:'Giọng văn mềm mại, cảm xúc qua hành động và chi tiết nhỏ; đối thoại tinh tế, tình cảm phát triển có cơ sở, tránh sáo ngữ và kể lể nội tâm kéo dài.'},
 {name:'Đời thường, gần gũi',text:'Văn phong gần gũi, chân thực, giàu chi tiết sinh hoạt; nhân vật nói năng tự nhiên, chú trọng quan hệ và những thay đổi nhỏ, tiết chế kịch tính gượng ép.'},
 {name:'Trinh thám, chặt chẽ',text:'Giọng kể rõ ràng, tiết chế; gieo manh mối có cơ sở, suy luận theo dữ kiện, giữ bí mật và giới hạn nhận thức từng nhân vật; tăng hồi hộp bằng diễn biến hợp lý.'},
 {name:'Kinh dị, ám ảnh',text:'Không khí bất an, chi tiết giác quan có chọn lọc, nhịp căng thẳng tăng dần; gợi hơn kể, giữ logic của hiểm nguy, tránh lặp hù dọa và mô tả máu me vô nghĩa.'},
 {name:'Điện ảnh, giàu hình ảnh',text:'Cảnh rõ về không gian, chuyển động, âm thanh và ánh sáng; thể hiện cảm xúc bằng hành động, đối thoại gọn, chuyển cảnh có liên kết; tránh viết thành kịch bản máy quay.'},
 {name:'Tâm lý, sâu sắc',text:'Khắc họa động cơ, mâu thuẫn và chuyển biến tâm lý qua hành động, đối thoại và nội tâm có chọn lọc; nhiều tầng cảm xúc, giọng kể tinh tế, không giảng giải dài dòng.'},
 {name:'Tối giản, sắc gọn',text:'Câu văn gọn, từ chính xác, ít tính từ; ưu tiên hành động và chi tiết đắt giá, đối thoại tiết chế; giữ cảm xúc và mạch truyện rõ, tránh cắt cụt ý.'},
 {name:'Hành động, mạnh mẽ',text:'Nhịp căng và linh hoạt, hành động có mục tiêu và hậu quả; mô tả chiến thuật và vị trí rõ, đối thoại dứt khoát; tránh sức mạnh vô cớ và cảnh chiến đấu lặp lại.'},
 {name:'Khoa học viễn tưởng, sáng rõ',text:'Giọng kể sáng rõ, gắn công nghệ với lựa chọn và hậu quả của nhân vật; giải thích vừa đủ, quy tắc nhất quán, tạo cảm giác khám phá; tránh nhồi thuật ngữ.'}
];
