const express = require('express');
const { MessagingResponse } = require('twilio').twiml;

const app = express();

// Middleware giải mã dữ liệu form gửi từ Twilio Webhook
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Trang chủ kiểm tra trạng thái
app.get('/', (req, res) => {
    res.send('<h1>🎉 Hadowa WhatsApp Auto-Reply Bot đang chạy 24/7 trên Render!</h1>');
});

// Endpoint Webhook tiếp nhận tin nhắn WhatsApp từ người dùng
app.post('/whatsapp', (req, res) => {
    const twiml = new MessagingResponse();
    const body = (req.body.Body || '').trim();
    const fromNumber = req.body.From;

    console.log(`📩 Nhận tin nhắn từ [${fromNumber}]: "${body}"`);

    // Bóc tách cú pháp: "nuoc 123456" hoặc chỉ nhập 4 đến 8 chữ số
    const nuocRegex = /^(?:nuoc\s+|nước\s+)?(\d{4,8})$/i;
    const match = body.match(nuocRegex);

    if (match) {
        const customerCode = match[1];
        
        const replyText = 
`💧 *KẾT QUẢ TRA CỨU TIỀN NƯỚC HADOWA (HÀ ĐÔNG)* 💧
━━━━━━━━━━━━━━━━━━━━━━
👤 *Khách hàng:* Nguyễn Văn A
🔖 *Mã KH:* \`${customerCode}\`
📍 *Địa chỉ:* Phường Quang Trung, Q. Hà Đông
📅 *Kỳ cước:* *Tháng 08/2026*
📊 *Sản lượng:* \`18 m³\` (Chỉ số: 1042 -> 1060)
💰 *Số tiền cần nộp:* *175.000 VNĐ*
📌 *Trạng thái:* 🔴 Chưa thanh toán
━━━━━━━━━━━━━━━━━━━━━━
👉 *Tra cứu gốc:* https://hadowa.vn/tra-cuu-thong-tin-su-dung-nuoc`;

        twiml.message(replyText);
    } else {
        twiml.message(
`🤖 *HỆ THỐNG TRA CỨU TIỀN NƯỚC HADOWA (24/7)*
━━━━━━━━━━━━━━━━━━━━━━
👉 Để tra cứu hóa đơn, bạn vui lòng nhắn theo cú pháp:
📝 *nuoc <mã_khách_hàng>*
_(Ví dụ: nuoc 123456 hoặc chỉ cần gõ 123456)_`
        );
    }

    // Phản hồi định dạng XML cho Twilio
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang lắng nghe tại cổng ${PORT}`);
});
