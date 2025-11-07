/**
 * 163邮箱SMTP测试 - 尝试多种配置方式
 */

const nodemailer = require('nodemailer');

const authCode = 'VDcq5kJmcnMWyeMp';
const email = 'hennessynight@163.com';

// 测试配置1: 端口465 + SSL
console.log('\n========================================');
console.log('测试1: 端口465 + SSL');
console.log('========================================\n');

const config1 = {
  host: 'smtp.163.com',
  port: 465,
  secure: true,
  auth: {
    user: email,
    pass: authCode
  },
  logger: true,
  debug: true
};

const transporter1 = nodemailer.createTransport(config1);

transporter1.verify((error, success) => {
  if (error) {
    console.error('❌ 测试1失败:', error.message);
    console.error('错误代码:', error.code);

    // 测试配置2: 端口25 + STARTTLS
    console.log('\n========================================');
    console.log('测试2: 端口25 + STARTTLS');
    console.log('========================================\n');

    const config2 = {
      host: 'smtp.163.com',
      port: 25,
      secure: false,
      requireTLS: true,
      auth: {
        user: email,
        pass: authCode
      },
      logger: true,
      debug: true
    };

    const transporter2 = nodemailer.createTransport(config2);

    transporter2.verify((error2, success2) => {
      if (error2) {
        console.error('❌ 测试2失败:', error2.message);

        // 测试配置3: 端口587 + STARTTLS
        console.log('\n========================================');
        console.log('测试3: 端口587 + STARTTLS');
        console.log('========================================\n');

        const config3 = {
          host: 'smtp.163.com',
          port: 587,
          secure: false,
          requireTLS: true,
          auth: {
            user: email,
            pass: authCode
          },
          logger: true,
          debug: true
        };

        const transporter3 = nodemailer.createTransport(config3);

        transporter3.verify((error3, success3) => {
          if (error3) {
            console.error('❌ 测试3失败:', error3.message);
            console.error('\n所有测试都失败了。');
            console.error('\n可能的原因:');
            console.error('1. 授权码不正确或未激活');
            console.error('2. 163邮箱需要在网页版进行额外的安全验证');
            console.error('3. 账号可能被临时限制SMTP访问');
            console.error('4. 需要等待授权码生效（可能需要几分钟）');
          } else {
            console.log('✅ 测试3成功！使用端口587 + STARTTLS');
            testSendEmail(transporter3);
          }
        });
      } else {
        console.log('✅ 测试2成功！使用端口25 + STARTTLS');
        testSendEmail(transporter2);
      }
    });
  } else {
    console.log('✅ 测试1成功！使用端口465 + SSL');
    testSendEmail(transporter1);
  }
});

function testSendEmail(transporter) {
  console.log('\n尝试发送测试邮件...\n');

  const mailOptions = {
    from: `会议纪要系统 <${email}>`,
    to: email,
    subject: '163邮箱SMTP测试成功 - ' + new Date().toLocaleString('zh-CN'),
    text: '恭喜！163邮箱SMTP配置成功！\n\n发送时间: ' + new Date().toLocaleString('zh-CN'),
    html: '<h1>🎉 测试成功！</h1><p>163邮箱SMTP配置正常，可以发送邮件了！</p><p>发送时间: ' + new Date().toLocaleString('zh-CN') + '</p>'
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('❌ 邮件发送失败:', error.message);
    } else {
      console.log('🎉 邮件发送成功！');
      console.log('Message ID:', info.messageId);
      console.log('请登录 https://mail.163.com/ 查收测试邮件\n');
    }
  });
}
