/**
 * 邮件发送路由
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { EmailService } from '@/services/email/EmailService';
import { MeetingSummary } from '@/services/ai/DeepSeekService';

const router = Router();

// 获取邮件服务实例的函数（延迟初始化，确保能读取到正确的环境变量）
function getEmailService(): EmailService {
  // 直接从 .env 中读取配置（已经被 dotenv 加载）
  const config = {
    host: process.env.SMTP_HOST || 'smtp.163.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE !== 'false',  // 默认为true
    user: process.env.SMTP_USER || 'hennessynight@163.com',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || '会议纪要系统 <hennessynight@163.com>'
  };

  console.log('[Email Route] 创建EmailService实例，配置:', {
    host: config.host,
    port: config.port,
    user: config.user,
    passLength: config.pass?.length
  });

  return new EmailService(config);
}

/**
 * POST /api/v1/email/send-summary
 * 发送会议纪要邮件
 */
router.post('/send-summary', asyncHandler(async (req: Request, res: Response) => {
  const {
    recipients,
    cc,
    bcc,
    subject,
    summary,
    meetingDate
  }: {
    recipients: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    summary: MeetingSummary;
    meetingDate?: string;
  } = req.body;

  // 验证输入
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    throw createError('收件人列表不能为空', 400, 'INVALID_RECIPIENTS');
  }

  if (!subject || subject.trim().length === 0) {
    throw createError('邮件主题不能为空', 400, 'INVALID_SUBJECT');
  }

  if (!summary) {
    throw createError('会议纪要内容不能为空', 400, 'INVALID_SUMMARY');
  }

  // 验证邮箱格式
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const allEmails = [...recipients, ...(cc || []), ...(bcc || [])];
  const invalidEmails = allEmails.filter(email => email && !emailRegex.test(email));
  if (invalidEmails.length > 0) {
    throw createError(
      `无效的邮箱地址: ${invalidEmails.join(', ')}`,
      400,
      'INVALID_EMAIL_FORMAT'
    );
  }

  console.log('[Email API] 收到发送请求');
  console.log(`[Email API] 收件人数量: ${recipients.length}`);
  if (cc && cc.length > 0) {
    console.log(`[Email API] 抄送数量: ${cc.length}`);
  }
  if (bcc && bcc.length > 0) {
    console.log(`[Email API] 密送数量: ${bcc.length}`);
  }
  console.log(`[Email API] 邮件主题: ${subject}`);

  try {
    // 发送邮件（使用延迟初始化的EmailService）
    const emailService = getEmailService();
    await emailService.sendMeetingSummaryEmail({
      recipients,
      cc,
      bcc,
      subject,
      summary,
      meetingDate
    });

    console.log('[Email API] 邮件发送成功');

    res.json({
      message: '邮件发送成功',
      data: {
        recipientCount: recipients.length,
        ccCount: cc?.length || 0,
        bccCount: bcc?.length || 0,
        recipients: recipients
      }
    });

  } catch (error: any) {
    console.error('[Email API] 邮件发送失败:', error.message);

    throw createError(
      `邮件发送失败: ${error.message}`,
      500,
      'EMAIL_SEND_FAILED'
    );
  }
}));

/**
 * GET /api/v1/email/test-connection
 * 测试SMTP连接
 */
router.get('/test-connection', asyncHandler(async (req: Request, res: Response) => {
  console.log('[Email API] 测试SMTP连接');

  try {
    const emailService = getEmailService();
    const isConnected = await emailService.verifyConnection();

    if (isConnected) {
      res.json({
        message: 'SMTP连接正常',
        data: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          user: process.env.SMTP_USER
        }
      });
    } else {
      throw createError('SMTP连接失败', 500, 'SMTP_CONNECTION_FAILED');
    }

  } catch (error: any) {
    console.error('[Email API] SMTP连接测试失败:', error.message);

    throw createError(
      `SMTP连接失败: ${error.message}`,
      500,
      'SMTP_CONNECTION_FAILED'
    );
  }
}));

export default router;
