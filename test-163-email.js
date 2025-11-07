/**
 * 163邮箱SMTP连接测试脚本
 * 用于独立测试163邮箱的SMTP配置是否正确
 */

const nodemailer = require('nodemailer');

// 配置信息
const config = {
  host: 'smtp.163.com',
  port: 465,
  secure: true, // 使用SSL
  user: 'hennessynight@163.com',
  pass: 'VDcq5kJmcnMWyeMp', // 您的授权码
  from: '会议纪要系统 <hennessynight@163.com>'
};

console.log('='.repeat(60));
console.log('163邮箱SMTP连接测试');
console.log('='.repeat(60));
console.log('配置信息:');
console.log(`  SMTP服务器: ${config.host}`);
console.log(`  端口: ${config.port}`);
console.log(`  SSL加密: ${config.secure}`);
console.log(`  用户名: ${config.user}`);
console.log(`  授权码长度: ${config.pass.length}`);
console.log(`  授权码前4位: ${config.pass.substring(0, 4)}`);
console.log('='.repeat(60));

// 创建传输器
const transporter = nodemailer.createTransport({
  host: config.host,
  port: config.port,
  secure: config.secure,
  auth: {
    user: config.user,
    pass: config.pass
  },
  logger: true,
  debug: true
});

// 测试连接
console.log('\n开始测试SMTP连接...\n');

transporter.verify(function(error, success) {
  if (error) {
    console.error('\n❌ SMTP连接失败:');
    console.error('错误信息:', error.message);
    console.error('错误代码:', error.code);
    console.error('响应代码:', error.responseCode);

    console.error('\n⚠️  请确认以下事项:');
    console.error('1. 163邮箱是否已登录网页版：https://mail.163.com/');
    console.error('2. 是否已进入"设置" -> "POP3/SMTP/IMAP"');
    console.error('3. "IMAP/SMTP服务"状态是否为"已开启"');
    console.error('4. 是否点击了"客户端授权密码"并生成新的授权码');
    console.error('5. 授权码是否复制正确（注意没有空格）');
    console.error('\n当前使用的授权码:', config.pass);
    console.error('授权码长度:', config.pass.length, '位（应为16位）');
  } else {
    console.log('\n✅ SMTP连接成功！');
    console.log('服务器已准备好发送邮件\n');

    // 尝试发送测试邮件
    const testEmail = {
      from: config.from,
      to: config.user, // 发送给自己
      subject: '163邮箱SMTP测试邮件 - ' + new Date().toLocaleString('zh-CN'),
      text: '这是一封测试邮件，用于验证163邮箱SMTP配置是否正常。\n\n发送时间: ' + new Date().toLocaleString('zh-CN'),
      html: '<h1>✅ 测试成功！</h1><p>如果您收到这封邮件，说明163邮箱SMTP配置正常！</p><p>发送时间: ' + new Date().toLocaleString('zh-CN') + '</p>'
    };

    console.log('尝试发送测试邮件到:', config.user);

    transporter.sendMail(testEmail, (error, info) => {
      if (error) {
        console.error('\n❌ 邮件发送失败:');
        console.error('错误信息:', error.message);
        console.error('错误代码:', error.code);
      } else {
        console.log('\n🎉 邮件发送成功！');
        console.log('Message ID:', info.messageId);
        console.log('收件人:', config.user);
        console.log('\n请登录邮箱查收测试邮件');
      }
      console.log('\n' + '='.repeat(60));
    });
  }
});
