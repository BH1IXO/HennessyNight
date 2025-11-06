const nodemailer = require('nodemailer');

console.log('nodemailer:', typeof nodemailer);
console.log('nodemailer keys:', Object.keys(nodemailer));
console.log('nodemailer.default:', typeof nodemailer.default);
if (nodemailer.default) {
  console.log('nodemailer.default.createTransporter:', typeof nodemailer.default.createTransporter);
}

// Try default import
if (nodemailer.default && nodemailer.default.createTransporter) {
  const transporter = nodemailer.default.createTransporter({
    host: 'smtp.qq.com',
    port: 587,
    secure: false,
    auth: {
      user: 'test@qq.com',
      pass: 'test'
    }
  });
  console.log('✅ Transporter created successfully with .default!');
}
