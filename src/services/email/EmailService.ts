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
  subject: string;                // 邮件主题
  summary: MeetingSummary;        // 会议纪要内容
  meetingDate?: string;           // 会议日期
}

export class EmailService {
  private transporter: Transporter;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;

    // 创建邮件传输器 (注意: nodemailer 7.x 使用 createTransport 而不是 createTransporter)
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    });
  }

  /**
   * 发送会议纪要邮件
   */
  async sendMeetingSummaryEmail(options: SendMeetingSummaryEmailOptions): Promise<void> {
    const { recipients, subject, summary, meetingDate } = options;

    // 验证收件人
    if (!recipients || recipients.length === 0) {
      throw new Error('至少需要一个收件人');
    }

    // 生成HTML邮件内容
    const htmlContent = this.generateMeetingSummaryHTML(summary, meetingDate);

    // 生成纯文本内容(备用)
    const textContent = this.generateMeetingSummaryText(summary);

    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        to: recipients.join(', '),
        subject: subject,
        text: textContent,
        html: htmlContent
      });

      console.log('[EmailService] 邮件发送成功:', info.messageId);
      console.log('[EmailService] 收件人:', recipients.join(', '));
    } catch (error: any) {
      console.error('[EmailService] 邮件发送失败:', error.message);
      throw new Error(`邮件发送失败: ${error.message}`);
    }
  }

  /**
   * 生成会议纪要HTML内容
   */
  private generateMeetingSummaryHTML(summary: MeetingSummary, meetingDate?: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 3px solid #06ffa5;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    h1 {
      color: #1a1a1a;
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .meta-info {
      color: #666;
      font-size: 14px;
    }
    .section {
      margin: 25px 0;
    }
    .section-title {
      color: #1a1a1a;
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 15px;
      padding-left: 10px;
      border-left: 4px solid #06ffa5;
    }
    .attendees {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .attendee-tag {
      background: #e8f9f5;
      color: #06ffa5;
      padding: 5px 12px;
      border-radius: 15px;
      font-size: 14px;
    }
    .summary-text {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 6px;
      line-height: 1.8;
    }
    .key-points, .decisions, .next-steps {
      padding-left: 0;
      list-style: none;
    }
    .key-points li, .decisions li, .next-steps li {
      padding: 10px 0;
      padding-left: 25px;
      position: relative;
    }
    .key-points li:before {
      content: "▶";
      position: absolute;
      left: 0;
      color: #06ffa5;
    }
    .decisions li:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #4caf50;
      font-weight: bold;
    }
    .next-steps li:before {
      content: "→";
      position: absolute;
      left: 0;
      color: #2196f3;
      font-weight: bold;
    }
    .action-items {
      background: #fff3e0;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #ff9800;
    }
    .action-item {
      margin: 10px 0;
      padding: 10px;
      background: white;
      border-radius: 4px;
    }
    .action-task {
      font-weight: 600;
      color: #333;
    }
    .action-meta {
      font-size: 13px;
      color: #666;
      margin-top: 5px;
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
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      color: #999;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${summary.title}</h1>
      <div class="meta-info">
        <div>日期: ${meetingDate || summary.date}</div>
        ${summary.duration ? `<div>时长: ${summary.duration}</div>` : ''}
      </div>
    </div>

    ${summary.attendees && summary.attendees.length > 0 ? `
    <div class="section">
      <div class="section-title">参会人员</div>
      <div class="attendees">
        ${summary.attendees.map(attendee => `<span class="attendee-tag">${attendee}</span>`).join('')}
      </div>
    </div>
    ` : ''}

    ${summary.summary ? `
    <div class="section">
      <div class="section-title">会议摘要</div>
      <div class="summary-text">${summary.summary.replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    ${summary.keyPoints && summary.keyPoints.length > 0 ? `
    <div class="section">
      <div class="section-title">关键讨论点</div>
      <ul class="key-points">
        ${summary.keyPoints.map(point => `<li>${point}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${summary.decisions && summary.decisions.length > 0 ? `
    <div class="section">
      <div class="section-title">决策事项</div>
      <ul class="decisions">
        ${summary.decisions.map(decision => `<li>${decision}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${summary.actionItems && summary.actionItems.length > 0 ? `
    <div class="section">
      <div class="section-title">行动项</div>
      <div class="action-items">
        ${summary.actionItems.map(item => `
          <div class="action-item">
            <div class="action-task">${item.task}</div>
            <div class="action-meta">
              ${item.assignee ? `<span>负责人: ${item.assignee}</span> ` : ''}
              ${item.deadline ? `<span>截止日期: ${item.deadline}</span> ` : ''}
              ${item.priority ? `<span class="priority-${item.priority}">优先级: ${item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    ${summary.nextSteps && summary.nextSteps.length > 0 ? `
    <div class="section">
      <div class="section-title">下一步计划</div>
      <ul class="next-steps">
        ${summary.nextSteps.map(step => `<li>${step}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <div class="footer">
      <p>此邮件由会议纪要系统自动生成</p>
      <p>Generated by Meeting Summary System</p>
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
