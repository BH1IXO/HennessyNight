/**
 * 邮件发送服务
 * 使用nodemailer发送会议纪要邮件
 */

import { MeetingSummary } from '../ai/DeepSeekService';

const nodemailer = require('nodemailer');
type Transporter = any;

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface SendMeetingSummaryEmailOptions {
  recipients: string[];           // 收件人邮箱列表
  cc?: string[];                  // 抄送列表
  bcc?: string[];                 // 密送列表
  subject: string;                // 邮件主题
  summary: MeetingSummary;        // 会议纪要内容
  meetingDate?: string;           // 会议日期
}

export class EmailService {
  private transporter: Transporter;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;

    console.log('[EmailService] 初始化邮件服务配置:');
    console.log(`  - SMTP服务器: ${config.host}`);
    console.log(`  - 端口: ${config.port}`);
    console.log(`  - 安全连接: ${config.secure}`);
    console.log(`  - 用户名: ${config.user}`);
    console.log(`  - 密码长度: ${config.pass?.length || 0}`);
    console.log(`  - 密码前4位: ${config.pass?.substring(0, 4) || 'N/A'}`);
    console.log(`  - 发件人: ${config.from}`);

    // 创建邮件传输器 (注意: nodemailer 7.x 使用 createTransport 而不是 createTransporter)
    // 163邮箱需要SSL连接，端口465
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure, // 465端口使用true
      auth: {
        user: config.user,
        pass: config.pass
      },
      // 添加调试信息
      logger: true,
      debug: true
    });

    console.log('[EmailService] Transporter配置完成');
  }

  /**
   * 发送会议纪要邮件
   */
  async sendMeetingSummaryEmail(options: SendMeetingSummaryEmailOptions): Promise<void> {
    const { recipients, cc, bcc, subject, summary, meetingDate } = options;

    // 验证收件人
    if (!recipients || recipients.length === 0) {
      throw new Error('至少需要一个收件人');
    }

    // 生成HTML邮件内容
    const htmlContent = this.generateMeetingSummaryHTML(summary, meetingDate);

    // 生成纯文本内容(备用)
    const textContent = this.generateMeetingSummaryText(summary);

    try {
      const mailOptions: any = {
        from: this.config.from,
        to: recipients.join(', '),
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      // 添加抄送
      if (cc && cc.length > 0) {
        mailOptions.cc = cc.join(', ');
      }

      // 添加密送
      if (bcc && bcc.length > 0) {
        mailOptions.bcc = bcc.join(', ');
      }

      const info = await this.transporter.sendMail(mailOptions);

      console.log('[EmailService] 邮件发送成功:', info.messageId);
      console.log('[EmailService] 收件人:', recipients.join(', '));
      if (cc && cc.length > 0) {
        console.log('[EmailService] 抄送:', cc.join(', '));
      }
      if (bcc && bcc.length > 0) {
        console.log('[EmailService] 密送:', bcc.length, '人');
      }
    } catch (error: any) {
      console.error('[EmailService] 邮件发送失败:', error.message);
      throw new Error(`邮件发送失败: ${error.message}`);
    }
  }

  /**
   * 将Markdown文本转换为HTML
   */
  private convertMarkdownToHTML(text: string): string {
    if (!text) return '';

    let html = text;

    // 1. 先处理代码块(避免被其他规则干扰)
    html = html.replace(/```([\s\S]*?)```/g, '<pre style="background: #f7fafc; padding: 12px; border-radius: 6px; overflow-x: auto; border-left: 3px solid #667eea;"><code>$1</code></pre>');

    // 2. 处理行内代码
    html = html.replace(/`([^`]+)`/g, '<code style="background: #f7fafc; padding: 2px 6px; border-radius: 3px; font-family: monospace; color: #e53e3e;">$1</code>');

    // 3. 处理标题(从大到小,避免误匹配)
    html = html.replace(/^###\s+(.+)$/gm, '<h3 style="color: #2d3748; margin-top: 15px; margin-bottom: 10px; font-size: 16px;">$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2 style="color: #2d3748; margin-top: 20px; margin-bottom: 12px; font-size: 18px;">$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1 style="color: #2d3748; margin-top: 25px; margin-bottom: 15px; font-size: 20px;">$1</h1>');

    // 4. 处理加粗(必须在斜体之前)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight: 600;">$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong style="font-weight: 600;">$1</strong>');

    // 5. 处理斜体
    html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<em>$1</em>');

    // 6. 处理链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #667eea; text-decoration: none;">$1</a>');

    // 7. 处理无序列表
    html = html.replace(/^[\-\*]\s+(.+)$/gm, '<li style="margin: 5px 0;">$1</li>');

    // 8. 处理有序列表
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li style="margin: 5px 0;">$1</li>');

    // 9. 包装连续的列表项
    html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, match => {
      // 检查是否有编号(有序列表)
      const hasNumbers = /^\d+\.\s/.test(text);
      const tag = hasNumbers ? 'ol' : 'ul';
      return `<${tag} style="margin: 10px 0; padding-left: 25px; line-height: 1.8;">${match}</${tag}>`;
    });

    // 10. 处理段落换行
    html = html.replace(/\n\n+/g, '</p><p style="margin: 8px 0; line-height: 1.8;">');
    html = html.replace(/\n/g, '<br>');

    // 11. 包装在段落中(如果还没有HTML标签)
    if (!html.match(/^<(h\d|p|ul|ol|pre|div)/)) {
      html = '<p style="margin: 8px 0; line-height: 1.8;">' + html + '</p>';
    }

    return html;
  }

  /**
   * 生成会议纪要HTML内容
   */
  private generateMeetingSummaryHTML(summary: MeetingSummary, meetingDate?: string): string {
    // 格式化日期和时间
    const formattedDate = meetingDate || summary.date;
    const displayDate = formattedDate ? new Date(formattedDate).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }) : '未知日期';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      line-height: 1.6;
      color: #2d3748;
      background: linear-gradient(135deg, #f5f7fa 0%, #e4edf5 100%);
      padding: 20px;
    }
    .email-wrapper {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(102, 126, 234, 0.15);
    }
    .email-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 35px 40px;
      text-align: center;
    }
    .email-header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 15px;
      letter-spacing: -0.5px;
    }
    .email-header .meta-info {
      font-size: 16px;
      opacity: 0.95;
      margin-top: 10px;
    }
    .email-header .meta-info div {
      margin: 5px 0;
    }
    .email-body {
      padding: 40px;
    }
    .section {
      margin-bottom: 35px;
      padding: 20px;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.03) 0%, rgba(118, 75, 162, 0.03) 100%);
      border-radius: 12px;
      border: 1px solid rgba(102, 126, 234, 0.1);
      transition: all 0.3s ease;
    }
    .section:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.12);
      border-color: rgba(102, 126, 234, 0.2);
    }
    .section-title {
      color: #667eea;
      font-size: 22px;
      font-weight: 600;
      margin-bottom: 18px;
      padding-bottom: 12px;
      border-bottom: 2px solid rgba(102, 126, 234, 0.15);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    .attendees {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
    }
    .attendee-tag {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.25);
    }
    .summary-text {
      color: #2d3748;
      line-height: 1.9;
      font-size: 15px;
      text-align: justify;
      padding: 15px;
      background: white;
      border-radius: 8px;
      margin-top: 12px;
    }
    .key-points, .decisions, .next-steps {
      list-style: none;
      padding: 0;
      margin-top: 15px;
    }
    .key-points li, .decisions li, .next-steps li {
      padding: 16px 20px;
      margin-bottom: 12px;
      background: white;
      border-left: 5px solid #667eea;
      border-radius: 10px;
      font-size: 15px;
      line-height: 1.7;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      transition: all 0.3s ease;
    }
    .key-points li:hover, .decisions li:hover, .next-steps li:hover {
      transform: translateX(8px);
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.2);
    }
    .action-items {
      margin-top: 15px;
    }
    .action-item {
      padding: 16px 20px;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #fff5e6 0%, #ffe8cc 100%);
      border-left: 5px solid #ff9500;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(255, 149, 0, 0.1);
      transition: all 0.3s ease;
    }
    .action-item:hover {
      transform: translateX(8px);
      box-shadow: 0 4px 16px rgba(255, 149, 0, 0.25);
    }
    .action-task {
      font-weight: 600;
      color: #2d3748;
      font-size: 15px;
      margin-bottom: 8px;
    }
    .action-meta {
      font-size: 13px;
      color: #718096;
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
    }
    .action-meta span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .priority-high {
      color: #f44336;
      font-weight: 600;
    }
    .priority-medium {
      color: #ff9800;
      font-weight: 600;
    }
    .priority-low {
      color: #4caf50;
      font-weight: 600;
    }
    .footer {
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      padding: 30px 40px;
      text-align: center;
      border-top: 3px solid #667eea;
    }
    .footer-content {
      margin-bottom: 20px;
    }
    .footer-content p {
      color: #666;
      font-size: 14px;
      margin: 8px 0;
      line-height: 1.8;
    }
    .footer-brand {
      margin-top: 25px;
      padding-top: 20px;
      border-top: 1px solid #dee2e6;
    }
    .footer-brand .brand-name {
      font-size: 18px;
      font-weight: 700;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 8px;
    }
    .footer-brand .team-info {
      color: #718096;
      font-size: 13px;
      margin-top: 8px;
    }
    .footer-brand .team-members {
      color: #999;
      font-size: 12px;
      margin-top: 5px;
    }
    @media only screen and (max-width: 600px) {
      .email-body {
        padding: 25px;
      }
      .email-header {
        padding: 25px 20px;
      }
      .email-header h1 {
        font-size: 24px;
      }
      .section-title {
        font-size: 18px;
      }
      .attendees {
        gap: 8px;
      }
      .attendee-tag {
        padding: 6px 12px;
        font-size: 13px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-header">
      <h1>${summary.title || '会议纪要'}</h1>
      <div class="meta-info">
        <div>📅 会议日期: ${displayDate}</div>
        ${summary.duration ? `<div>⏱️ 会议时长: ${summary.duration}</div>` : ''}
      </div>
    </div>

    <div class="email-body">
      <!-- 会议基本信息 -->
      <div class="section">
        <div class="section-title">
          <span class="section-icon">ℹ️</span>
          会议基本信息
        </div>
        <div style="line-height: 2.0; color: #4a5568;">
          <div><strong style="color: #2d3748;">📆 会议日期:</strong> ${displayDate}</div>
          ${summary.duration ? `<div><strong style="color: #2d3748;">⏱️ 会议时长:</strong> ${summary.duration}</div>` : ''}
          <div><strong style="color: #2d3748;">📧 发件人:</strong> VNET 智能会议 Agent</div>
        </div>
      </div>

      ${summary.attendees && summary.attendees.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">👥</span>
          参会人员
        </div>
        <div class="attendees">
          ${summary.attendees.map(attendee => `<span class="attendee-tag">${attendee}</span>`).join('')}
        </div>
      </div>
      ` : ''}

      ${summary.summary ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">📋</span>
          会议摘要
        </div>
        <div class="summary-text">${this.convertMarkdownToHTML(summary.summary)}</div>
      </div>
      ` : ''}

      ${summary.keyPoints && summary.keyPoints.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">💡</span>
          关键讨论点
        </div>
        <ul class="key-points">
          ${summary.keyPoints.map(point => `<li>${this.convertMarkdownToHTML(point)}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${summary.decisions && summary.decisions.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">✓</span>
          决策事项
        </div>
        <ul class="decisions">
          ${summary.decisions.map(decision => `<li>${this.convertMarkdownToHTML(decision)}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${summary.actionItems && summary.actionItems.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">📌</span>
          行动项
        </div>
        <div class="action-items">
          ${summary.actionItems.map(item => `
            <div class="action-item">
              <div class="action-task">📍 ${this.convertMarkdownToHTML(item.task)}</div>
              <div class="action-meta">
                ${item.assignee ? `<span>👤 负责人: ${item.assignee}</span>` : ''}
                ${item.deadline ? `<span>📅 截止日期: ${item.deadline}</span>` : ''}
                ${item.priority ? `<span class="priority-${item.priority}">⚡ 优先级: ${item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      ${summary.nextSteps && summary.nextSteps.length > 0 ? `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">→</span>
          下一步计划
        </div>
        <ul class="next-steps">
          ${summary.nextSteps.map(step => `<li>${this.convertMarkdownToHTML(step)}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      <div class="footer-content">
        <p>本邮件由 <strong>VNET 智能会议 Agent</strong> 自动生成</p>
        <p style="font-size: 13px; color: #999;">Generated by VNET Intelligent Meeting Agent</p>
      </div>
      <div class="footer-brand">
        <div class="brand-name">由轩尼诗之夜团队研发</div>
        <div class="team-info">队长：谭红波</div>
        <div class="team-members">队员：陈宁 · 任玺言 · 李雨荷</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * 生成会议纪要纯文本内容
   */
  private generateMeetingSummaryText(summary: MeetingSummary): string {
    let text = `${summary.title}\n`;
    text += `${'='.repeat(summary.title.length)}\n\n`;
    text += `日期: ${summary.date}\n`;
    if (summary.duration) {
      text += `时长: ${summary.duration}\n`;
    }
    text += '\n';

    if (summary.attendees && summary.attendees.length > 0) {
      text += `参会人员:\n${summary.attendees.map(a => `  - ${a}`).join('\n')}\n\n`;
    }

    if (summary.summary) {
      text += `会议摘要:\n${summary.summary}\n\n`;
    }

    if (summary.keyPoints && summary.keyPoints.length > 0) {
      text += `关键讨论点:\n${summary.keyPoints.map(p => `  • ${p}`).join('\n')}\n\n`;
    }

    if (summary.decisions && summary.decisions.length > 0) {
      text += `决策事项:\n${summary.decisions.map(d => `  ✓ ${d}`).join('\n')}\n\n`;
    }

    if (summary.actionItems && summary.actionItems.length > 0) {
      text += `行动项:\n`;
      summary.actionItems.forEach(item => {
        text += `  • ${item.task}\n`;
        if (item.assignee) text += `    负责人: ${item.assignee}\n`;
        if (item.deadline) text += `    截止日期: ${item.deadline}\n`;
        if (item.priority) text += `    优先级: ${item.priority}\n`;
      });
      text += '\n';
    }

    if (summary.nextSteps && summary.nextSteps.length > 0) {
      text += `下一步计划:\n${summary.nextSteps.map(s => `  → ${s}`).join('\n')}\n\n`;
    }

    text += '\n---\n此邮件由会议纪要系统自动生成\n';
    return text;
  }

  /**
   * 验证邮件配置
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log('[EmailService] SMTP连接验证成功');
      return true;
    } catch (error: any) {
      console.error('[EmailService] SMTP连接验证失败:', error.message);
      return false;
    }
  }
}
