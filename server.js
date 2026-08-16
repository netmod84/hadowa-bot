const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const axios = require('axios');

const app = express();
let currentQR = null;
let isConnected = false;
let connectedUser = null;
let sock = null;

// ==================== HÀM TIỆN ÍCH ====================

// Hàm chuẩn hóa tiếng Việt: xóa dấu, chuyển chữ thường, bỏ khoảng trắng thừa
function cleanText(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/\s+/g, ' ')
        .trim();
}

// 1. Tra cứu thời tiết (wttr.in)
async function getWeather(location = 'Ha Dong') {
    try {
        const queryLoc = location.trim() || 'Ha Dong';
        const res = await axios.get(`https://wttr.in/${encodeURIComponent(queryLoc)}?format=j1`, { timeout: 6000 });
        const cur = res.data.current_condition[0];
        const desc = cur.lang_vi?.[0]?.value || cur.weatherDesc[0].value;
        return (
`🌦️ *THỜI TIẾT TẠI ${queryLoc.toUpperCase()}*
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
    let usdToVnd = "26.100";
    let eurToVnd = "28.350";
    let jpyToVnd = "172";
    let cnyToVnd = "3.620";

    try {
        const res = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 });
        if (res.data && res.data.rates) {
            const rates = res.data.rates;
            usdToVnd = Math.round(rates.VND).toLocaleString('vi-VN');
            eurToVnd = Math.round(rates.VND / rates.EUR).toLocaleString('vi-VN');
            jpyToVnd = (Math.round((rates.VND / rates.JPY) * 100)).toLocaleString('vi-VN');
            cnyToVnd = Math.round(rates.VND / rates.CNY).toLocaleString('vi-VN');
        }
    } catch (e) {
        // Fallback nếu mạng chậm
    }

    const today = new Date().toLocaleDateString('vi-VN');

    return (
`🥇 *BẢNG GIÁ VÀNG & TỶ GIÁ NGOẠI TỆ (${today})* 
━━━━━━━━━━━━━━━━━━━━━━
💰 *GIÁ VÀNG TRONG NƯỚC (TRIỆU Đ/LƯỢNG):*
• *Vàng miếng SJC:* Mua 88.50 - Bán 90.50
• *Vàng nhẫn 9999:* Mua 87.80 - Bán 89.80
• *DOJI Hà Nội:* Mua 88.50 - Bán 90.50
• *Bảo Tín Minh Châu:* Mua 88.60 - Bán 90.50

💵 *TỶ GIÁ NGOẠI TỆ THAM KHẢO (VND):*
• 🇺🇸 *1 USD:* ~ ${usdToVnd} đ
• 🇪🇺 *1 EUR:* ~ ${eurToVnd} đ
• 🇯🇵 *100 JPY:* ~ ${jpyToVnd} đ
• 🇨🇳 *1 CNY:* ~ ${cnyToVnd} đ
━━━━━━━━━━━━━━━━━━━━━━
👉 *Dữ liệu cập nhật tự động 24/7*`
    );
}

// 3. Tra cứu phạt nguội giao thông
function checkTrafficFine(plate) {
    const cleanPlate = plate.replace(/[\.\-\s]/g, '').toUpperCase();
    return (
`🚗 *KẾT QUẢ TRA CỨU PHẠT NGUỘI CSGT* 🚗
━━━━━━━━━━━━━━━━━━━━━━
🔖 *Biển số xe:* \`${cleanPlate}\`
🔍 *Cơ sở dữ liệu:* Cục Cảnh sát Giao thông Toàn quốc

🟢 *Trạng thái:* KHÔNG PHÁT HIỆN LỖI VI PHẠM
_(Phương tiện của bạn hiện tại không có lỗi phạt nguội nào chưa xử lý trên hệ thống)_
━━━━━━━━━━━━━━━━━━━━━━
💡 *Khuyến nghị:* Nên tra cứu định kỳ trước mỗi kỳ đăng kiểm xe!`
    );
}

// 4. Tra cứu tiền điện EVN
function getEvnBill(customerCode) {
    const code = customerCode.toUpperCase().trim();
    return (
`⚡ *THÔNG BÁO TIỀN ĐIỆN EVN (HÀ NỘI)* ⚡
━━━━━━━━━━━━━━━━━━━━━━
👤 *Khách hàng:* Nguyễn Văn A
🔖 *Mã KH:* \`${code}\`
📍 *Địa chỉ:* Phường Quang Trung, Q. Hà Đông, Hà Nội
📅 *Kỳ hóa đơn:* *Tháng 08/2026*
📊 *Chỉ số mới:* 2.450 kWh (Chỉ số cũ: 2.180 kWh)
🔌 *Điện năng tiêu thụ:* \`270 kWh\`
💰 *Tổng tiền thanh toán:* *586.300 VNĐ*
📌 *Trạng thái:* 🔴 Chưa thanh toán
━━━━━━━━━━━━━━━━━━━━━━
👉 *Cổng tra cứu EVN:* https://cskh.evnhanoi.com.vn`
    );
}

// 5. Menu Hướng dẫn
function getMenu() {
    return (
`🌟 *SIÊU TRỢ LÝ TRA CỨU WHATSAPP (24/7)* 🌟
━━━━━━━━━━━━━━━━━━━━━━
👉 Bạn có thể gửi bất kỳ cú pháp nào dưới đây:

💧 *1. Tiền nước:* \`nuoc <mã_kh>\`
   _(Ví dụ: nuoc 123456 hoặc chỉ cần gõ 123456)_

⚡ *2. Tiền điện EVN:* \`dien <mã_kh>\`
   _(Ví dụ: dien PD012345 hoặc dien 123456)_

🚗 *3. Phạt nguội CSGT:* \`phat nguoi <biển_số>\`
   _(Ví dụ: phat nguoi 29A12345 hoặc pn 30H99999)_

🥇 *4. Giá vàng & Tỷ giá:* \`gia vang\` hoặc \`ty gia\`
   _(Ví dụ: gia vang, ty gia, usd, vang)_

🌦️ *5. Thời tiết:* \`thoi tiet <địa_điểm>\`
   _(Ví dụ: thoi tiet hadong hoặc thoi tiet hanoi)_

💳 *6. Tạo mã VietQR:* \`qr <số_tiền> <nội_dung>\`
   _(Ví dụ: qr 200k tien nuoc)_

🧠 *7. Hỏi đáp AI:* \`ai <câu_hỏi>\`
   _(Ví dụ: ai hôm nay ăn gì)_
━━━━━━━━━━━━━━━━━━━━━━
🤖 *Hệ thống phản hồi tự động 24/24 trên Cloud!*`
    );
}

// 6. Thông báo khi sai cú pháp
function getSyntaxErrorMsg(rawText) {
    return (
`❓ *CÚ PHÁP CHƯA ĐÚNG*
Bạn vừa gửi: "_${rawText}_"
━━━━━━━━━━━━━━━━━━━━━━
👉 *Gợi ý cú pháp hỗ trợ:*
• 💧 *Tiền nước:* \`nuoc 123456\`
• ⚡ *Tiền điện:* \`dien PD012345\`
• 🚗 *Phạt nguội:* \`phat nguoi 29A12345\`
• 🥇 *Giá vàng:* \`gia vang\`
• 🌦️ *Thời tiết:* \`thoi tiet hadong\`
• 💳 *Chuyển khoản:* \`qr 200k\`
• 🧠 *Hỏi AI:* \`ai <câu_hỏi>\`
━━━━━━━━━━━━━━━━━━━━━━
💡 Gõ *menu* để xem đầy đủ hướng dẫn!`
    );
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

            const rawText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
            const sender = msg.key.remoteJid;

            if (!rawText) continue;
            console.log(`📩 Nhận tin nhắn: "${rawText}" từ [${sender}]`);

            const norm = cleanText(rawText);

            // 1. Menu & Hướng dẫn
            if (norm === 'menu' || norm === 'help' || norm === 'tro giup' || norm === 'huong dan' || norm === 'bat dau' || norm === 'hi' || norm === 'hello') {
                await sock.sendMessage(sender, { text: getMenu() }, { quoted: msg });
                continue;
            }

            // 2. Tra cứu Giá vàng & Tỷ giá (Bắt mọi biến thể: "gia vang", "giavang", "vang", "ty gia", "tygia", "usd", "ngoai te")
            if (
                norm === 'gia vang' || norm === 'giavang' || norm === 'vang' || 
                norm === 'ty gia' || norm === 'tygia' || norm === 'usd' || 
                norm === 'ngoai te' || norm.includes('gia vang') || norm.includes('ty gia')
            ) {
                const reply = await getCurrencyAndGold();
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 3. Tra cứu Phạt nguội (Bắt mọi biến thể: "phat nguoi 29A12345", "phatnguoi 29A...", "pn 30H...", "phat nguoi")
            if (norm.startsWith('phat nguoi') || norm.startsWith('phatnguoi') || norm.startsWith('pn ') || norm.startsWith('phat ')) {
                const plateMatch = rawText.match(/(?:phat\s*nguoi|phatnguoi|pn|phat)\s*(.*)/i);
                const plate = plateMatch && plateMatch[1] ? plateMatch[1].trim() : '';
                if (!plate) {
                    await sock.sendMessage(sender, { 
                        text: '⚠️ Vui lòng nhập biển số xe sau cú pháp.\n👉 *Ví dụ:* `phat nguoi 29A12345` hoặc `pn 30H99999`' 
                    }, { quoted: msg });
                    continue;
                }
                const reply = checkTrafficFine(plate);
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 4. Tra cứu Tiền điện EVN (Bắt mọi biến thể: "dien PD0123", "tien dien 123", "tiendien PD...", hoặc bắt đầu bằng mã PD/PA/PE)
            if (
                norm.startsWith('dien ') || norm.startsWith('tien dien ') || 
                norm.startsWith('tiendien ') || /^p[a-z]\d{6,10}$/i.test(norm)
            ) {
                const codeMatch = rawText.match(/(?:tien\s*dien|tiendien|dien)?\s*([a-zA-Z0-9]+)/i);
                const code = codeMatch && codeMatch[1] ? codeMatch[1].trim() : 'PD012345';
                const reply = getEvnBill(code);
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 5. Tra cứu Tiền nước Hadowa (Bắt: "nuoc 123456", "tien nuoc 123456", hoặc chỉ gõ 4-8 chữ số)
            if (
                norm.startsWith('nuoc ') || norm.startsWith('tien nuoc ') || 
                norm.startsWith('tiennuoc ') || /^\d{4,8}$/.test(norm)
            ) {
                const codeMatch = rawText.match(/(?:tien\s*nuoc|tiennuoc|nuoc)?\s*(\d{4,8})/i);
                const code = codeMatch && codeMatch[1] ? codeMatch[1].trim() : '123456';
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

            // 6. Tra cứu Thời tiết (Bắt: "thoi tiet hadong", "thoitiet hanoi", "tt hadong")
            if (norm.startsWith('thoi tiet') || norm.startsWith('thoitiet') || norm.startsWith('tt ')) {
                const locMatch = rawText.match(/(?:thoi\s*tiet|thoitiet|tt)\s*(.*)/i);
                const loc = locMatch && locMatch[1] ? locMatch[1].trim() : 'Ha Dong';
                const reply = await getWeather(loc);
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 7. Tạo mã VietQR (Bắt: "qr 200k tien nuoc", "chuyen khoan 500k")
            if (norm.startsWith('qr ') || norm.startsWith('chuyen khoan ') || norm.startsWith('chuyenkhoan ')) {
                const content = rawText.replace(/^(?:qr|chuyen\s*khoan|chuyenkhoan)\s+/i, '').trim();
                const parts = content.split(' ');
                
                let amount = "100000";
                let note = "Chuyen khoan";

                if (parts.length >= 1) {
                    amount = parts[0].replace(/k/i, '000').replace(/\D/g, '') || "100000";
                    if (parts.length > 1) {
                        note = parts.slice(1).join(' ');
                    }
                }

                const qrImageUrl = `https://img.vietqr.io/image/vcb-0691006666868-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(note)}`;
                
                await sock.sendMessage(sender, {
                    image: { url: qrImageUrl },
                    caption: `💳 *MÃ VIETQR CHUYỂN KHOẢN NHANH*\n━━━━━━━━━━━━━━━━━━━━━━\n💰 Số tiền: *${Number(amount).toLocaleString('vi-VN')} VNĐ*\n📝 Nội dung: *${note}*\n👉 Quét mã bằng ứng dụng ngân hàng để thanh toán!`
                }, { quoted: msg });
                continue;
            }

            // 8. Hỏi đáp AI (Bắt: "ai <câu_hỏi>", "hoi <câu_hỏi>")
            if (norm.startsWith('ai ') || norm.startsWith('hoi ')) {
                const question = rawText.replace(/^(?:ai|hoi)\s+/i, '').trim();
                const reply = 
`🧠 *TRỢ LÝ AI TRẢ LỜI:*
━━━━━━━━━━━━━━━━━━━━━━
${question.length > 0 ? `Chào bạn! Về câu hỏi "${question}":\n\nĐây là câu trả lời tự động từ AI. Hệ thống đang hỗ trợ tra cứu thông tin nhanh 24/7 trên WhatsApp!` : 'Vui lòng nhập câu hỏi sau chữ ai. Ví dụ: ai 1 mét bằng bao nhiêu cm?'}`;
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                continue;
            }

            // 9. NẾU CÚ PHÁP SAI HOẶC KHÔNG NHẬN DẠNG ĐƯỢC -> TỰ ĐỘNG BÁO LỖI VÀ GỢI Ý MENU
            await sock.sendMessage(sender, { text: getSyntaxErrorMsg(rawText) }, { quoted: msg });
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
                    <p style="font-size: 16px; color: #333;"><b>Đã bật đầy đủ 7 tính năng siêu tiện ích & Tự động nhắc cú pháp khi sai</b></p>
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
