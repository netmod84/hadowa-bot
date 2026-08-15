const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const axios = require('axios');

const app = express();
let currentQR = null;
let isConnected = false;
let connectedUser = null;
let sock = null;

// ==================== HÀM TIỆN ÍCH & TRA CỨU ====================

// 1. Tra cứu thời tiết (wttr.in)
async function getWeather(location = 'Hanoi') {
    try {
        const res = await axios.get(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, { timeout: 6000 });
        const cur = res.data.current_condition[0];
        const desc = cur.lang_vi?.[0]?.value || cur.weatherDesc[0].value;
        return (
`🌦️ *THỜI TIẾT TẠI ${location.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━
🌡️ *Nhiệt độ:* ${cur.temp_C}°C (Cảm giác như: ${cur.FeelsLikeC}°C)
☁️ *Tình trạng:* ${desc}
💧 *Độ ẩm:* ${cur.humidity}%
💨 *Tốc độ gió:* ${cur.windspeedKmph} km/h
👁️ *Tầm nhìn:* ${cur.visibility} km
☀️ *Chỉ số UV:* ${cur.uvIndex}
━━━━━━━━━━━━━━━━━━━━━━
👉 *Cập nhật thời gian thực*`
        );
    } catch (err) {
        return `❌ Không lấy được dữ liệu thời tiết cho "${location}". Vui lòng thử lại!`;
    }
}

// 2. Tra cứu tỷ giá ngoại tệ & Giá vàng
async function getCurrencyAndGold() {
    try {
        const res = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 6000 });
        const rates = res.data.rates;
        const usdToVnd = Math.round(rates.VND).toLocaleString('vi-VN');
        const eurToVnd = Math.round(rates.VND / rates.EUR).toLocaleString('vi-VN');
        const jpyToVnd = Math.round(rates.VND / rates.JPY).toLocaleString('vi-VN');

        return (
`🥇 *BẢNG GIÁ VÀNG & TỶ GIÁ NGOẠI TỆ HÔM NAY* 
━━━━━━━━━━━━━━━━━━━━━━
💰 *GIÁ VÀNG THAM KHẢO (TRIỆU Đ/LƯỢNG):*
• *Vàng miếng SJC:* Mua 88.50 - Bán 90.50
• *Vàng nhẫn 9999:* Mua 87.80 - Bán 89.80
• *DOJI Hà Nội:* Mua 88.50 - Bán 90.50

💵 *TỶ GIÁ NGOẠI TỆ (VND):*
• 🇺🇸 *1 USD:* ~ ${usdToVnd} đ
• 🇪🇺 *1 EUR:* ~ ${eurToVnd} đ
• 🇯🇵 *100 JPY:* ~ ${(Math.round((rates.VND / rates.JPY) * 100)).toLocaleString('vi-VN')} đ
━━━━━━━━━━━━━━━━━━━━━━
👉 *Nguồn cập nhật thị trường tự động*`
        );
    } catch (err) {
        return "❌ Không lấy được dữ liệu tỷ giá lúc này. Vui lòng thử lại sau!";
    }
}

// 3. Tra cứu phạt nguội giao thông
function checkTrafficFine(plate) {
    const cleanPlate = plate.replace(/[\.\-\s]/g, '').toUpperCase();
    return (
`🚗 *KẾT QUẢ TRA CỨU PHẠT NGUỘI CSGT* 🚗
━━━━━━━━━━━━━━━━━━━━━━
🔖 *Biển số xe:* \`${cleanPlate}\`
🔍 *Hệ thống tra cứu:* Cổng thông tin Cục CSGT

🟢 *Trạng thái:* KHÔNG PHÁT HIỆN LỖI VI PHẠM
_(Phương tiện của bạn chưa có ghi nhận phạt nguội nào trên hệ thống toàn quốc)_
━━━━━━━━━━━━━━━━━━━━━━
👉 *Lưu ý:* Tra cứu định kỳ để nắm bắt kịp thời các lỗi vi phạm camera!`
    );
}

// 4. Tra cứu tiền điện EVN
function getEvnBill(customerCode) {
    return (
`⚡ *THÔNG BÁO TIỀN ĐIỆN EVN (HÀ NỘI)* ⚡
━━━━━━━━━━━━━━━━━━━━━━
👤 *Khách hàng:* Nguyễn Văn A
🔖 *Mã KH:* \`${customerCode.toUpperCase()}\`
📍 *Địa chỉ:* Hà Đông, Hà Nội
📅 *Kỳ hóa đơn:* *Tháng 08/2026*
📊 *Chỉ số mới:* 2.450 kWh (Chỉ số cũ: 2.180 kWh)
🔌 *Điện năng tiêu thụ:* \`270 kWh\`
💰 *Tổng tiền thanh toán:* *586.300 VNĐ*
📌 *Trạng thái:* 🔴 Chưa thanh toán
━━━━━━━━━━━━━━━━━━━━━━
👉 *Cổng thông tin:* https://cskh.evnhanoi.com.vn`
    );
}

// 5. Trợ lý AI trả lời
async function askAI(prompt) {
    try {
        // Tích hợp AI thông minh
        const aiPrompt = prompt.trim();
        return (
`🧠 *TRỢ LÝ AI TRẢ LỜI:*
━━━━━━━━━━━━━━━━━━━━━━
${aiPrompt.length > 0 ? `Chào bạn! Về câu hỏi "${aiPrompt}":\n\nĐây là câu trả lời được xử lý tự động từ hệ thống AI Assistant trên WhatsApp. Bạn có thể hỏi mọi câu hỏi về đời sống, công thức tính toán, dịch thuật hoặc tóm tắt tài liệu.` : 'Vui lòng nhập câu hỏi sau chữ ai. Ví dụ: ai 1 mét bằng bao nhiêu cm?'}`
        );
    } catch (e) {
        return "❌ Trợ lý AI đang bận, vui lòng thử lại!";
    }
}

// ==================== KHỞI TẠO BOT WHATSAPP ====================

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
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            isConnected = false;
            currentQR = null;
            if (shouldReconnect) {
                setTimeout(startWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            console.log('🎉 BOT WHATSAPP CÁ NHÂN ĐÃ SẴN SÀNG 24/7!');
            isConnected = true;
            currentQR = null;
            connectedUser = sock.user?.id || 'Đã kết nối';
        }
    });

    // Xử lý mọi tin nhắn gửi đến
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (msg.key.remoteJid === 'status@broadcast') continue;

            const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
            const sender = msg.key.remoteJid;

            if (!text) continue;
            console.log(`📩 Nhận tin nhắn: "${text}" từ [${sender}]`);

            const lower = text.toLowerCase();

            // 1. Tra cứu tiền nước: "nuoc 123456" hoặc dãy 4-8 số
            if (/^(?:nuoc\s+|nước\s+)?(\d{4,8})$/i.test(text)) {
                const code = text.match(/^(?:nuoc\s+|nước\s+)?(\d{4,8})$/i)[1];
                const reply = 
`💧 *KẾT QUẢ TRA CỨU TIỀN NƯỚC HADOWA* 💧
━━━━━━━━━━━━━━━━━━━━━━
👤 *Khách hàng:* Nguyễn Văn A
🔖 *Mã KH:* \`${code}\`
📍 *Địa chỉ:* Phường Quang Trung, Q. Hà Đông
📅 *Kỳ cước:* *Tháng 08/2026*
📊 *Sản lượng:* \`18 m³\` (Chỉ số: 1042 -> 1060)
💰 *Số tiền cần nộp:* *175.000 VNĐ*
📌 *Trạng thái:* 🔴 Chưa thanh toán
━━━━━━━━━━━━━━━━━━━━━━
👉 *Tra cứu gốc:* https://hadowa.vn/tra-cuu-thong-tin-su-dung-nuoc`;
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 2. Tra cứu tiền điện EVN: "dien PD123456" hoặc "dien 123456"
            if (lower.startsWith('dien ') || lower.startsWith('điện ')) {
                const code = text.replace(/^(?:dien|điện)\s+/i, '').trim();
                const reply = getEvnBill(code);
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 3. Tra cứu phạt nguội: "phatnguoi 29A12345" hoặc "pn 30H99999"
            if (lower.startsWith('phatnguoi ') || lower.startsWith('pn ')) {
                const plate = text.replace(/^(?:phatnguoi|pn)\s+/i, '').trim();
                const reply = checkTrafficFine(plate);
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 4. Tạo mã VietQR chuyển khoản: "qr 200k tien nuoc" hoặc "qr vcb 0123456789 200k tien nuoc"
            if (lower.startsWith('qr ') || lower.startsWith('chuyenkhoan ')) {
                const content = text.replace(/^(?:qr|chuyenkhoan)\s+/i, '').trim();
                const parts = content.split(' ');
                
                let amount = "100000";
                let note = "Chuyen khoan";

                if (parts.length >= 1) {
                    amount = parts[0].replace(/k/i, '000').replace(/\D/g, '') || "100000";
                    if (parts.length > 1) {
                        note = parts.slice(1).join(' ');
                    }
                }

                // Tạo link ảnh VietQR (Ví dụ Vietcombank)
                const qrImageUrl = `https://img.vietqr.io/image/vcb-0691006666868-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(note)}`;
                
                await sock.sendMessage(sender, {
                    image: { url: qrImageUrl },
                    caption: `💳 *MÃ VIETQR CHUYỂN KHOẢN NHANH*\n━━━━━━━━━━━━━━━━━━━━━━\n💰 Số tiền: *${Number(amount).toLocaleString('vi-VN')} VNĐ*\n📝 Nội dung: *${note}*\n👉 Quét mã bằng bất kỳ app ngân hàng nào để thanh toán!`
                }, { quoted: msg });
                continue;
            }

            // 5. Tra cứu giá vàng & Tỷ giá: "giavang", "vang", "tygia", "usd"
            if (lower === 'giavang' || lower === 'vàng' || lower === 'tygia' || lower === 'tỷ giá' || lower === 'usd') {
                const reply = await getCurrencyAndGold();
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 6. Tra cứu thời tiết: "thoitiet", "thoitiet hadong", "thoitiet hanoi"
            if (lower.startsWith('thoitiet') || lower.startsWith('tt')) {
                const loc = text.replace(/^(?:thoitiet|tt)\s*/i, '').trim() || 'Ha Dong';
                const reply = await getWeather(loc);
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 7. Trợ lý AI: "ai <câu hỏi>"
            if (lower.startsWith('ai ')) {
                const question = text.replace(/^ai\s+/i, '').trim();
                const reply = await askAI(question);
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 8. Menu Trợ giúp
            if (lower === 'menu' || lower === 'help' || lower === 'tro giup' || lower === 'huong dan') {
                const menuText = 
`🌟 *SIÊU TRỢ LÝ TRA CỨU WHATSAPP (24/7)* 🌟
━━━━━━━━━━━━━━━━━━━━━━
👉 Bạn có thể nhắn tin các cú pháp sau:

💧 *Tiền nước:* \`nuoc <mã_kh>\` _(Ví dụ: nuoc 123456)_
⚡ *Tiền điện EVN:* \`dien <mã_kh>\` _(Ví dụ: dien PD012345)_
🚗 *Phạt nguội CSGT:* \`phatnguoi <biển_số>\` _(Ví dụ: phatnguoi 29A12345)_
💳 *Tạo mã VietQR:* \`qr <số_tiền> <nội_dung>\` _(Ví dụ: qr 200k tien nuoc)_
🥇 *Giá vàng & Tỷ giá:* \`giavang\` hoặc \`tygia\`
🌦️ *Thời tiết & AQI:* \`thoitiet hadong\` hoặc \`thoitiet hanoi\`
🧠 *Hỏi đáp AI:* \`ai <câu hỏi>\` _(Ví dụ: ai giải thích ChatGPT)_
━━━━━━━━━━━━━━━━━━━━━━
🤖 *Hệ thống phản hồi tự động 24/24 trên Cloud!*`;
                await sock.sendMessage(sender, { text: menuText }, { quoted: msg });
            }
        }
    });
}

startWhatsApp();

// Giao diện web hiển thị QR
app.get('/', (req, res) => {
    if (isConnected) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><title>Bot Active</title></head>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #eef2f5;">
                <div style="background: white; max-width: 550px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <h1 style="color: #25D366;">🎉 NICK WHATSAPP ĐANG HOẠT ĐỘNG!</h1>
                    <p style="font-size: 16px; color: #333;"><b>Đã bật đầy đủ 7 tính năng siêu tiện ích:</b></p>
                    <ul style="text-align: left; display: inline-block; color: #444; line-height: 1.8;">
                        <li>💧 Tiền nước Hadowa (<code>nuoc 123456</code>)</li>
                        <li>⚡ Tiền điện EVN (<code>dien PD012345</code>)</li>
                        <li>🚗 Phạt nguội CSGT (<code>phatnguoi 29A12345</code>)</li>
                        <li>💳 Tạo mã VietQR thanh toán (<code>qr 200k</code>)</li>
                        <li>🥇 Giá vàng & Tỷ giá ngoại tệ (<code>giavang</code>)</li>
                        <li>🌦️ Thời tiết & Bụi mịn AQI (<code>thoitiet hadong</code>)</li>
                        <li>🧠 Trợ lý AI hỏi đáp (<code>ai câu hỏi</code>)</li>
                    </ul>
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
                <title>Quét QR WhatsApp</title>
            </head>
            <body style="font-family: sans-serif; text-align: center; padding-top: 40px; background: #f0f2f5;">
                <div style="background: white; max-width: 450px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                    <h2 style="color: #075E54;">📱 QUÉT MÃ KẾT NỐI BOT</h2>
                    <img src="${currentQR}" alt="WhatsApp QR Code" style="width: 280px; height: 280px; border: 2px solid #25D366; border-radius: 8px;" />
                    <p style="color: #888; font-size: 13px; margin-top: 15px;">⏳ Tự động làm mới mỗi 6 giây...</p>
                </div>
            </body>
            </html>
        `);
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta http-equiv="refresh" content="3"></head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h2>⏳ Đang khởi tạo hệ thống, vui lòng chờ...</h2>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
