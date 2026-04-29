const fs = require('fs');
const axios = require('axios');
const puppeteer = require('puppeteer');
const path = require('path');

function randomUsername() {
  return 'user' + Math.random().toString(36).substring(2, 10);
}

function randomPassword() {
  return (
    Math.random().toString(36).substring(2, 4).toUpperCase() +
    Math.random().toString(36).substring(2, 4).toLowerCase() +
    Math.floor(1000 + Math.random() * 9000) + '!'
  );
}

async function getMailToken(email, password) {
  const response = await axios.post('https://api.mail.tm/token', {
    address: email,
    password
  });
  return response.data.token;
}

async function getVerifyCode(token) {
  const headers = { Authorization: `Bearer ${token}` };
  let tries = 0;

  while (tries < 10) {
    const res = await axios.get('https://api.mail.tm/messages', { headers });
    const garenaMail = res.data['hydra:member'].find(m =>
      m.from && m.from.address.includes('garena')
    );

    if (garenaMail) {
      const mailContent = await axios.get(`https://api.mail.tm/messages/${garenaMail.id}`, { headers });
      const code = mailContent.data.text.match(/\d{6}/);
      return code ? code[0] : null;
    }

    console.log('⌛ Đợi mã xác minh...');
    await new Promise(r => setTimeout(r, 5000));
    tries++;
  }

  throw new Error('Không tìm thấy mã xác nhận!');
}

async function registerAccount(email, mailPass) {
  const username = randomUsername();
  const password = randomPassword();

  console.log(`\n📩 Đang xử lý: ${email}`);

  let token;
  try {
    token = await getMailToken(email, mailPass);
    console.log('✅ Đăng nhập mail thành công!');
  } catch (err) {
    console.error(`❌ Lỗi đăng nhập mail ${email}: ${err.message}`);
    return false;
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://account.garena.com/register', { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name="email"]', { timeout: 15000 });

    await page.type('input[name="email"]', email);
    await page.type('input[name="username"]', username);
    await page.type('input[name="password"]', password);
    await page.type('input[name="re_password"]', password);
    await page.click('button[type="submit"]');

    const verifyCode = await getVerifyCode(token);
    await page.type('input[name="verify_code"]', verifyCode);
    await page.click('button.confirm');

    if (!fs.existsSync('res')) fs.mkdirSync('res');

    const accInfo = `${email}|${mailPass}|${username}|${password}\n`;
    fs.appendFileSync(path.join('res', 'accounts.txt'), accInfo);
    console.log(`✅ Đăng ký thành công: ${username}`);
    await browser.close();
    return true;
  } catch (err) {
    console.error(`❌ Lỗi đăng ký ${email}: ${err.message}`);
    await page.screenshot({ path: `res/error-${Date.now()}.png` });
    await browser.close();
    return false;
  }
}

(async () => {
  if (!fs.existsSync('mails.txt')) {
    console.error('⚠️ Không tìm thấy mails.txt');
    return;
  }

  let emails = fs.readFileSync('mails.txt', 'utf8').trim().split('\n');
  const toRegister = emails.slice(0, 20); // lấy 20 email đầu tiên

  for (let line of toRegister) {
    const [email, pass] = line.trim().split('|');
    if (!email || !pass) continue;

    await registerAccount(email, pass);
  }

  // Cập nhật lại mails.txt: xóa 20 dòng đầu
  emails = emails.slice(20);
  fs.writeFileSync('mails.txt', emails.join('\n'), 'utf8');

  console.log('\n🎉 Hoàn tất xử lý 20 tài khoản!');
})();
