/**
 * 邮件发送模块
 * 负责会议纪要邮件发送功能
 */

console.log('📧 加载邮件发送模块');

// ==================== 全局配置 ====================
const EMAIL_API_BASE_URL = '/api/v1';

// ==================== 邮件发送管理器 ====================
class EmailApp {
    constructor() {
        this.currentSummary = null;
        this.attendees = [];
        this.init();
    }

    /**
     * 初始化邮件发送模块
     */
    init() {
        console.log('📧 [Email] ========== 初始化邮件发送模块 ==========');
        console.log('📧 [Email] window.summaryManager 存在?', !!window.summaryManager);
        console.log('📧 [Email] window 对象:', window);

        // 绑定事件监听器
        this.bindEvents();

        // 监听会议纪要生成事件
        this.listenForSummaryUpdates();

        console.log('📧 [Email] ========== 初始化完成 ==========');
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 发送邮件按钮
        const sendBtn = document.getElementById('sendEmailBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendEmail());
        }

        // 刷新预览按钮
        const refreshBtn = document.getElementById('refreshPreviewBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshPreview());
        }

        // 监听邮件 Tab 切换
        const emailTab = document.querySelector('[data-tab="email"]');
        if (emailTab) {
            emailTab.addEventListener('click', () => {
                // 当切换到邮件 Tab 时，自动刷新内容
                setTimeout(() => this.refreshPreview(), 100);
            });
        }
    }

    /**
     * 监听会议纪要更新
     */
    listenForSummaryUpdates() {
        // console.log('📧 [Email] 开始监听会议纪要更新');

        // 监听全局的 summaryManager 更新
        const checkSummary = () => {
            // console.log('📧 [Email] 检查 summaryManager:', {
            //     hasSummaryManager: !!window.summaryManager,
            //     hasCurrentSummary: !!(window.summaryManager && window.summaryManager.currentSummary),
            //     currentSummary: window.summaryManager?.currentSummary
            // });

            if (window.summaryManager && window.summaryManager.currentSummary) {
                // 🎯 只有当会议纪要真正更新时才执行更新邮件内容
                const newSummary = window.summaryManager.currentSummary;
                if (this.currentSummary !== newSummary) {
                    // console.log('📧 [Email] 发现会议纪要,准备更新邮件内容');
                    this.currentSummary = newSummary;
                    this.updateEmailContent();
                }
            } else {
                // console.log('📧 [Email] 尚未发现会议纪要');
            }
        };

        // 立即检查一次
        checkSummary();

        // 定期检查
        setInterval(checkSummary, 2000);
    }

    /**
     * 🎯 从实时语音识别获取参会人员（包含邮箱）
     */
    async getAttendeesWithEmails() {
        try {
            let attendees = [];

            // 🎯 方法1：从 realtimeApp.speechManager 获取识别出的说话人
            if (window.realtimeApp && window.realtimeApp.speechManager) {
                const identifiedSpeakers = window.realtimeApp.speechManager.getIdentifiedSpeakers();
                console.log('📧 从实时识别获取到参会人员:', identifiedSpeakers);

                // 这些参会人员已经包含了邮箱信息（从服务器声纹数据获取）
                attendees = identifiedSpeakers.map(speaker => ({
                    name: speaker.name,
                    email: speaker.email || null
                }));
            }

            // 🎯 方法2：如果没有实时识别数据，尝试从会议纪要中提取
            if (attendees.length === 0 && this.currentSummary && this.currentSummary.attendees) {
                const summaryAttendees = this.currentSummary.attendees;

                // 尝试从服务器获取声纹数据来匹配邮箱
                const serverSpeakers = await this.fetchServerSpeakers();

                attendees = summaryAttendees.map(name => {
                    const speaker = serverSpeakers.find(s => s.name === name);
                    return {
                        name: name,
                        email: speaker ? speaker.email : null
                    };
                });
            }

            console.log(`📧 获取到 ${attendees.length} 个参会人员（含邮箱）:`, attendees);
            return attendees;

        } catch (error) {
            console.error('❌ 获取参会人员失败:', error);
            return [];
        }
    }

    /**
     * 🎯 从服务器获取声纹数据
     */
    async fetchServerSpeakers() {
        try {
            const response = await fetch('/api/v1/speakers');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const result = await response.json();
            return result.data || [];
        } catch (error) {
            console.error('❌ 获取服务器声纹数据失败:', error);
            return [];
        }
    }

    /**
     * 从会议纪要中提取参会人员
     */
    extractAttendeesFromSummary(summary) {
        if (!summary) return [];

        const attendees = [];

        // 从 attendees 字段提取
        if (summary.attendees && Array.isArray(summary.attendees)) {
            summary.attendees.forEach(attendee => {
                if (typeof attendee === 'string') {
                    attendees.push({ name: attendee, email: null });
                } else if (attendee.name) {
                    attendees.push(attendee);
                }
            });
        }

        // 从 metadata 提取
        if (summary.metadata && summary.metadata.attendees) {
            summary.metadata.attendees.forEach(attendee => {
                if (!attendees.find(a => a.name === attendee)) {
                    attendees.push({ name: attendee, email: null });
                }
            });
        }

        return attendees;
    }

    /**
     * 🎯 更新邮件内容（标题、收件人、预览）
     */
    async updateEmailContent() {
        if (!this.currentSummary) {
            return;
        }

        console.log('📧 开始更新邮件内容,会议纪要:', this.currentSummary);

        // 🎯 从实时识别获取参会人员（已包含邮箱）
        this.attendees = await this.getAttendeesWithEmails();

        // 更新收件人输入框
        this.updateRecipientsInput();

        // 更新邮件标题
        this.updateEmailSubject();

        // 更新邮件预览
        this.updateEmailPreview();
    }

    /**
     * 更新收件人输入框
     */
    updateRecipientsInput() {
        const recipientsInput = document.getElementById('emailRecipients');
        if (!recipientsInput) return;

        // 提取有邮箱的参会人员
        const emailList = this.attendees
            .filter(attendee => attendee.email)
            .map(attendee => attendee.email)
            .join(', ');

        if (emailList) {
            recipientsInput.value = emailList;
            console.log(`📧 自动填充收件人: ${emailList}`);
        }
    }

    /**
     * 🎯 移除文本中的所有Markdown符号（用于纯文本场景如邮件标题）
     */
    stripMarkdown(text) {
        if (!text) return '';
        let stripped = text;

        // 移除知识库术语标记
        stripped = stripped.replace(/\[\[([^\]]+)\]\]/g, '$1');

        // 移除代码块
        stripped = stripped.replace(/```[\s\S]*?```/g, '');

        // 移除标题符号
        stripped = stripped.replace(/^#{1,6}\s+/gm, '');

        // 移除粗体
        stripped = stripped.replace(/\*\*(.+?)\*\*/g, '$1');
        stripped = stripped.replace(/__(.+?)__/g, '$1');

        // 移除斜体
        stripped = stripped.replace(/\*([^*]+?)\*/g, '$1');
        stripped = stripped.replace(/_([^_]+?)_/g, '$1');

        // 移除删除线
        stripped = stripped.replace(/~~(.+?)~~/g, '$1');

        // 移除列表标记
        stripped = stripped.replace(/^\d+\.\s+/gm, '');
        stripped = stripped.replace(/^[\-\*]\s+/gm, '');

        // 移除链接，保留文本
        stripped = stripped.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

        // 移除代码标记
        stripped = stripped.replace(/`([^`]+)`/g, '$1');

        // 移除引用标记
        stripped = stripped.replace(/^>\s+/gm, '');

        // 移除水平线
        stripped = stripped.replace(/^(\-\-\-|\*\*\*)$/gm, '');

        return stripped.trim();
    }

    /**
     * 🎯 更新邮件标题（从会议纪要提取标题，添加时间）
     */
    updateEmailSubject() {
        const subjectInput = document.getElementById('emailSubject');
        if (!subjectInput || subjectInput.value.trim()) return; // 如果用户已填写，不覆盖

        const summary = this.currentSummary;
        let title = '会议纪要';

        // 🎯 从 summary 中提取会议标题（去除Markdown符号）
        if (summary.title) {
            title = this.stripMarkdown(summary.title);
        } else if (summary.metadata && summary.metadata.title) {
            title = this.stripMarkdown(summary.metadata.title);
        }

        // 🎯 获取会议日期和时间
        let dateTimeStr = '';
        if (summary.date) {
            dateTimeStr = summary.date;  // 已经是格式化后的日期字符串
        } else if (summary.meetingDate) {
            // 如果是Date对象，格式化为包含时间的字符串
            const date = summary.meetingDate instanceof Date
                ? summary.meetingDate
                : new Date(summary.meetingDate);
            dateTimeStr = date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            dateTimeStr = new Date().toLocaleDateString('zh-CN');
        }

        // 🎯 组合标题：会议标题 - 日期时间
        const subject = `${title} - ${dateTimeStr}`;

        subjectInput.value = subject;
        console.log(`📧 自动填充邮件标题: ${subject}`);
    }

    /**
     * 更新邮件内容预览
     */
    updateEmailPreview() {
        // console.log('📧 [Email] updateEmailPreview 被调用');
        const previewBox = document.getElementById('emailContentPreview');
        // console.log('📧 [Email] previewBox 元素:', previewBox);

        if (!previewBox) {
            // console.error('📧 [Email] 找不到 emailContentPreview 元素!');
            return;
        }

        const summary = this.currentSummary;
        // console.log('📧 [Email] 当前会议纪要:', summary);

        if (!summary) {
            // console.log('📧 [Email] 没有会议纪要,显示空状态');
            previewBox.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>生成会议纪要后，邮件内容将在此预览</p>
                </div>
            `;
            return;
        }

        // 构建邮件HTML内容
        // console.log('📧 [Email] 开始构建邮件HTML');
        const emailHTML = this.buildEmailHTML(summary);
        // console.log('📧 [Email] 邮件HTML长度:', emailHTML.length);
        previewBox.innerHTML = emailHTML;

        // console.log('📧 [Email] ✅ 邮件预览已更新成功!');
    }

    /**
     * 🎯 渲染Markdown为HTML（与meeting-app保持一致）
     */
    renderMarkdown(text) {
        if (!text) return '';
        let html = text;

        // 1. 处理知识库术语标记 [[术语]]
        html = html.replace(/\[\[([^\]]+)\]\]/g, (match, term) => {
            return `<span style="background: linear-gradient(120deg, #ffd89b 0%, #19547b 100%); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 600; border-bottom: 2px dotted #19547b;" title="${term}">${term}</span>`;
        });

        // 2. 处理表格
        html = this.renderMarkdownTable(html);

        // 3. 处理代码块
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background: #f7fafc; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 10px 0;"><code style="color: #2d3748; font-family: monospace; font-size: 0.9em;">$2</code></pre>');

        // 4. 处理标题
        html = html.replace(/^#### (.+)$/gm, '<h5 style="color: #4361ee; font-size: 14px; font-weight: 600; margin: 8px 0 6px 0;">$1</h5>');
        html = html.replace(/^### (.+)$/gm, '<h4 style="color: #4361ee; font-size: 16px; font-weight: 600; margin: 10px 0 6px 0;">$1</h4>');
        html = html.replace(/^## (.+)$/gm, '<h3 style="color: #4361ee; font-size: 18px; font-weight: 600; margin: 12px 0 8px 0;">$1</h3>');
        html = html.replace(/^# (.+)$/gm, '<h2 style="color: #4361ee; font-size: 20px; font-weight: 700; margin: 15px 0 10px 0;">$1</h2>');

        // 5. 处理粗体
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight: 600;">$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong style="font-weight: 600;">$1</strong>');

        // 6. 处理斜体
        html = html.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
        html = html.replace(/_([^_]+?)_/g, '<em>$1</em>');

        // 7. 处理删除线
        html = html.replace(/~~(.+?)~~/g, '<del style="color: #a0aec0;">$1</del>');

        // 8. 处理有序列表
        html = html.replace(/^\d+\.\s+(.+)$/gm, '<div style="padding-left: 20px; margin: 4px 0; position: relative;"><span style="position: absolute; left: 0; color: #4361ee; font-weight: 600;">•</span> $1</div>');

        // 9. 处理无序列表
        html = html.replace(/^[\-\*]\s+(.+)$/gm, '<div style="padding-left: 20px; margin: 4px 0; position: relative;"><span style="position: absolute; left: 0; color: #4361ee;">•</span> $1</div>');

        // 10. 处理链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #4361ee; text-decoration: underline;" target="_blank">$1</a>');

        // 11. 处理单行代码
        html = html.replace(/`([^`]+)`/g, '<code style="background: #f7fafc; padding: 2px 6px; border-radius: 4px; color: #e53e3e; font-family: monospace; font-size: 0.9em;">$1</code>');

        // 12. 处理引用
        html = html.replace(/^>\s+(.+)$/gm, '<blockquote style="border-left: 4px solid #4361ee; padding-left: 12px; margin: 8px 0; color: #4a5568; font-style: italic;">$1</blockquote>');

        // 13. 处理水平线
        html = html.replace(/^(\-\-\-|\*\*\*)$/gm, '<hr style="border: none; border-top: 2px solid #e2e8f0; margin: 15px 0;">');

        // 14. 处理换行
        html = html.replace(/\n\n/g, '<br>');
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    /**
     * 🎯 渲染Markdown表格为HTML表格
     */
    renderMarkdownTable(text) {
        const tableRegex = /^\|(.+)\|\n\|[\s\-:|]+\|\n((?:\|.+\|\n?)+)/gm;

        return text.replace(tableRegex, (match, header, rows) => {
            const headers = header.split('|').map(h => h.trim()).filter(h => h);
            const headerHtml = headers.map(h => `<th style="padding: 8px 12px; background: linear-gradient(135deg, #4361ee 0%, #6c63ff 100%); color: white; font-weight: 600; border: 1px solid #e2e8f0;">${h}</th>`).join('');

            const rowsArray = rows.trim().split('\n');
            const rowsHtml = rowsArray.map(row => {
                const cells = row.split('|').map(c => c.trim()).filter(c => c);
                const cellsHtml = cells.map(c => `<td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${c}</td>`).join('');
                return `<tr>${cellsHtml}</tr>`;
            }).join('');

            return `<table style="border-collapse: collapse; width: 100%; margin: 15px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;">
                <thead><tr>${headerHtml}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>`;
        });
    }

    /**
     * 构建邮件HTML内容
     */
    buildEmailHTML(summary) {
        const date = summary.meetingDate || summary.date || new Date().toLocaleDateString('zh-CN');

        // 🎯 渲染标题（去除Markdown符号）
        const renderedTitle = this.renderMarkdown(summary.title || '会议纪要');

        let html = `
            <div style="font-family: 'Microsoft YaHei', Arial, sans-serif; line-height: 1.8; color: #333;">
                <div style="background: linear-gradient(135deg, #4361ee, #6c63ff); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">
                        <i class="fas fa-file-alt"></i> ${renderedTitle}
                    </h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 14px;">
                        <i class="fas fa-calendar-alt"></i> ${date}
                    </p>
                </div>

                <div style="padding: 30px; background: white;">
        `;

        // 会议基本信息
        if (summary.metadata || summary.attendees) {
            html += `
                <div style="margin-bottom: 25px; padding: 20px; background: #f8f9fa; border-left: 4px solid #4361ee; border-radius: 5px;">
                    <h3 style="margin: 0 0 15px 0; color: #4361ee; font-size: 18px;">
                        <i class="fas fa-info-circle"></i> 会议信息
                    </h3>
            `;

            if (summary.attendees && summary.attendees.length > 0) {
                const attendeesList = summary.attendees.join('、');
                html += `
                    <p style="margin: 8px 0;">
                        <strong><i class="fas fa-users"></i> 参会人员：</strong>${attendeesList}
                    </p>
                `;
            }

            if (summary.metadata && summary.metadata.duration) {
                html += `
                    <p style="margin: 8px 0;">
                        <strong><i class="fas fa-clock"></i> 会议时长：</strong>${summary.metadata.duration}
                    </p>
                `;
            }

            html += `</div>`;
        }

        // 会议概要
        if (summary.summary) {
            html += `
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #4361ee; border-bottom: 2px solid #4361ee; padding-bottom: 10px; font-size: 18px;">
                        <i class="fas fa-align-left"></i> 会议概要
                    </h3>
                    <p style="margin: 15px 0; line-height: 1.8;">${this.renderMarkdown(summary.summary)}</p>
                </div>
            `;
        }

        // 讨论要点
        if (summary.keyPoints && summary.keyPoints.length > 0) {
            html += `
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #4361ee; border-bottom: 2px solid #4361ee; padding-bottom: 10px; font-size: 18px;">
                        <i class="fas fa-list-ul"></i> 讨论要点
                    </h3>
                    <ul style="margin: 15px 0; padding-left: 25px;">
            `;
            summary.keyPoints.forEach(point => {
                html += `<li style="margin: 10px 0; line-height: 1.8;">${this.renderMarkdown(point)}</li>`;
            });
            html += `</ul></div>`;
        }

        // 待办事项
        if (summary.actionItems && summary.actionItems.length > 0) {
            html += `
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #ffd166; border-bottom: 2px solid #ffd166; padding-bottom: 10px; font-size: 18px;">
                        <i class="fas fa-tasks"></i> 待办事项
                    </h3>
                    <ul style="margin: 15px 0; padding-left: 25px;">
            `;
            summary.actionItems.forEach(item => {
                html += `<li style="margin: 10px 0; padding: 12px; background: #fff3cd; border-left: 4px solid #ffd166; border-radius: 5px; line-height: 1.8;">${this.renderMarkdown(item)}</li>`;
            });
            html += `</ul></div>`;
        }

        // 决策事项
        if (summary.decisions && summary.decisions.length > 0) {
            html += `
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #4cc9f0; border-bottom: 2px solid #4cc9f0; padding-bottom: 10px; font-size: 18px;">
                        <i class="fas fa-check-circle"></i> 决策事项
                    </h3>
                    <ul style="margin: 15px 0; padding-left: 25px;">
            `;
            summary.decisions.forEach(decision => {
                html += `<li style="margin: 10px 0; padding: 12px; background: #e3f2fd; border-left: 4px solid #4cc9f0; border-radius: 5px; line-height: 1.8;">${this.renderMarkdown(decision)}</li>`;
            });
            html += `</ul></div>`;
        }

        // 页脚
        html += `
                </div>
                <div style="padding: 20px; background: #f8f9fa; text-align: center; border-radius: 0 0 10px 10px; color: #666; font-size: 13px;">
                    <p style="margin: 0;">
                        <i class="fas fa-robot"></i> 本邮件由智能会议纪要系统自动生成
                    </p>
                    <p style="margin: 5px 0 0 0;">
                        <i class="fas fa-calendar"></i> 生成时间: ${new Date().toLocaleString('zh-CN')}
                    </p>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * 刷新预览
     */
    refreshPreview() {
        console.log('📧 手动刷新预览');
        this.updateEmailContent();
    }

    /**
     * 解析邮箱列表（逗号分隔）
     */
    parseEmailList(emailString) {
        if (!emailString || !emailString.trim()) {
            return [];
        }

        return emailString
            .split(',')
            .map(email => email.trim())
            .filter(email => email.length > 0);
    }

    /**
     * 验证邮箱格式
     */
    validateEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    /**
     * 发送邮件
     */
    async sendEmail() {
        console.log('📧 准备发送邮件');

        // 获取表单数据
        const recipientsInput = document.getElementById('emailRecipients');
        const ccInput = document.getElementById('emailCC');
        const bccInput = document.getElementById('emailBCC');
        const subjectInput = document.getElementById('emailSubject');

        // 解析邮箱列表
        const recipients = this.parseEmailList(recipientsInput.value);
        const cc = this.parseEmailList(ccInput.value);
        const bcc = this.parseEmailList(bccInput.value);
        const subject = subjectInput.value.trim();

        // 验证输入
        if (recipients.length === 0) {
            alert('请至少输入一个收件人邮箱');
            recipientsInput.focus();
            return;
        }

        if (!subject) {
            alert('请输入邮件标题');
            subjectInput.focus();
            return;
        }

        if (!this.currentSummary) {
            alert('请先生成会议纪要');
            return;
        }

        // 验证所有邮箱格式
        const allEmails = [...recipients, ...cc, ...bcc];
        const invalidEmails = allEmails.filter(email => !this.validateEmail(email));
        if (invalidEmails.length > 0) {
            alert(`以下邮箱格式不正确:\n${invalidEmails.join('\n')}`);
            return;
        }

        // 确认发送
        const confirmMessage = `确认发送邮件给以下收件人吗?\n\n收件人 (${recipients.length}): ${recipients.join(', ')}${cc.length > 0 ? `\n\n抄送 (${cc.length}): ${cc.join(', ')}` : ''}${bcc.length > 0 ? `\n\n密送 (${bcc.length}): ${bcc.length} 人` : ''}`;

        if (!confirm(confirmMessage)) {
            return;
        }

        // 显示加载状态
        const sendBtn = document.getElementById('sendEmailBtn');
        const originalHTML = sendBtn.innerHTML;
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 发送中...';

        try {
            // 调用邮件发送API
            const response = await fetch(`${EMAIL_API_BASE_URL}/email/send-summary`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    recipients: recipients,
                    cc: cc.length > 0 ? cc : undefined,
                    bcc: bcc.length > 0 ? bcc : undefined,
                    subject: subject,
                    summary: this.currentSummary,
                    meetingDate: this.currentSummary.meetingDate || this.currentSummary.date || new Date().toLocaleDateString('zh-CN')
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ 邮件发送成功:', result);

            // 显示成功消息
            alert(`邮件发送成功!\n\n已发送给 ${result.data.recipientCount} 位收件人`);

        } catch (error) {
            console.error('❌ 邮件发送失败:', error);
            alert(`邮件发送失败:\n${error.message}\n\n请检查:\n1. 后端服务是否正常运行\n2. SMTP配置是否正确\n3. 网络连接是否正常`);

        } finally {
            // 恢复按钮状态
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalHTML;
        }
    }
}

// ==================== 初始化 ====================
let emailApp;

// 等待 DOM 加载完成
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        emailApp = new EmailApp();
        window.emailApp = emailApp; // 暴露到全局供调试
    });
} else {
    emailApp = new EmailApp();
    window.emailApp = emailApp;
}

console.log('✅ 邮件发送模块加载完成');
