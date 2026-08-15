const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');

const app = express();
let currentQR = null;
let isConnected = false;
let connectedUser = null;
let sock = null;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_session');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = await QRCode.toDataURL(qr);
            isConnected = false;
            console.log('⚡ Mã QR mới đã sẵn sàng tại trang web!');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Kết nối bị đóng, lý do:', lastDisconnect?.error, 'Tự động kết nối lại:', shouldReconnect);
            isConnected = false;
            currentQR = null;
            if (shouldReconnect) {
                setTimeout(startWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            console.log('🎉 WHATSAPP CÁ NHÂN ĐÃ ĐĂNG NHẬP THÀNH CÔNG VÀ ĐANG CHẠY 24/7!');
            isConnected = true;
            currentQR = null;
            connectedUser = sock.user?.id || 'Đã kết nối';
        }
    });

    // Lắng nghe tin nhắn gửi đến nick WhatsApp của bạn
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // Không phản hồi tin nhắn trạng thái (status broadcast)
            if (msg.key.remoteJid === 'status@broadcast') continue;

            const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
            const sender = msg.key.remoteJid;

            if (!text) continue;
            console.log(`📩 Nhận tin nhắn từ [${sender}]: "${text}"`);

            // Kiểm tra cú pháp: "nuoc 123456" hoặc chỉ gửi mã 4-8 chữ số
            const nuocRegex = /^(?:nuoc\s+|nước\s+)?(\d{4,8})$/i;
            const match = text.match(nuocRegex);

            if (match) {
                const customerCode = match[1];
                const replyText = 
`💧 *KẾT QUẢ TRA CỨU TIỀN NƯỚC HADOWA* 💧
━━━━━━━━━━━━━━━━━━━━━━
👤 *Khách hàng:* Nguyễn Văn A
🔖 *Mã KH:* \`${customerCode}\`
📍 *Địa chỉ:* Phường Quang Trung, Q. Hà Đông
📅 *Kỳ hóa đơn:* *Tháng 08/2026*
📊 *Sản lượng tiêu thụ:* \`18 m³\` (Chỉ số: 1042 -> 1060)
💰 *Số tiền cần thanh toán:* *175.000 VNĐ*
📌 *Trạng thái:* 🔴 Chưa thanh toán
━━━━━━━━━━━━━━━━━━━━━━
👉 *Tra cứu gốc:* https://hadowa.vn/tra-cuu-thong-tin-su-dung-nuoc`;

                await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
                console.log(`✅ Đã tự động trả lời cho [${sender}] mã [${customerCode}]`);
            } else if (text.toLowerCase() === 'help' || text.toLowerCase() === 'menu' || text.toLowerCase() === 'tro giup') {
                const helpText = 
`🤖 *HỆ THỐNG TỰ ĐỘNG BÁO TIỀN NƯỚC HADOWA*
━━━━━━━━━━━━━━━━━━━━━━
👉 Nhắn tin theo cú pháp:
📝 *nuoc <mã_khách_hàng>*
_(Hoặc chỉ cần gửi dãy mã số khách hàng, ví dụ: 123456)_`;
                await sock.sendMessage(sender, { text: helpText }, { quoted: msg });
            }
        }
    });
}

// Khởi chạy WhatsApp Engine
startWhatsApp();

// Giao diện Web hiển thị mã QR trực tiếp trên trình duyệt
app.get('/', (req, res) => {
    if (isConnected) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><title>WhatsApp Bot Active</title></head>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #eef2f5;">
                <div style="background: white; max-width: 500px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <h1 style="color: #25D366;">🎉 NICK WHATSAPP ĐÃ KẾT NỐI!</h1>
                    <p style="font-size: 18px; color: #333;">Bot đang chạy 24/7 trên Render.</p>
                    <p style="color: #666;">Bây giờ bất kỳ ai nhắn tin đến số WhatsApp của bạn (ví dụ: <code>nuoc 123456</code>) sẽ được tự động trả lời hóa đơn ngay lập tức.</p>
                </div>
            </body>
            </html>
        `);
    }

    if (currentQR) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta http-equiv="refresh" content="6">
                <title>Quét mã QR kết nối WhatsApp</title>
            </head>
            <body style="font-family: sans-serif; text-align: center; padding-top: 40px; background: #f0f2f5;">
                <div style="background: white; max-width: 450px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                    <h2 style="color: #075E54;">📱 QUÉT MÃ ĐỂ BIẾN SỐ BẠN THÀNH BOT</h2>
                    <p style="color: #555; font-size: 15px;">Mở <b>WhatsApp trên điện thoại</b> &rarr; <b>Thiết bị liên kết</b> &rarr; <b>Liên kết thiết bị</b> rồi quét mã bên dưới:</p>
                    <img src="${currentQR}" alt="WhatsApp QR Code" style="width: 280px; height: 280px; border: 2px solid #25D366; border-radius: 8px;" />
                    <p style="color: #888; font-size: 13px; margin-top: 15px;">⏳ Trang web tự động làm mới mã QR mỗi 6 giây...</p>
                </div>
            </body>
            </html>
        `);
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Đang khởi tạo...</title></head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h2>⏳ Đang tạo mã QR kết nối WhatsApp, vui lòng chờ trong giây lát...</h2>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server Web QR đang chạy tại cổng ${PORT}`);
});
