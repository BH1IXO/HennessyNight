/**
 * 邮件发送模块
 * 负责会议纪要邮件发送功能
 */

console.log('📧 加载邮件发送模块');

// ==================== 全局配置 ====================
const API_BASE_URL = '/api/v1';

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
        console.log('📧 初始化邮件发送模块');

        // 绑定事件监听器
        this.bindEvents();

        // 监听会议纪要生成事件
        this.listenForSummaryUpdates();
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
        // 监听全局的 summaryManager 更新
        const checkSummary = () => {
            if (window.summaryManager && window.summaryManager.currentSummary) {
                this.currentSummary = window.summaryManager.currentSummary;
                this.updateEmailContent();
            }
        };

        // 定期检查
        setInterval(checkSummary, 1000);
    }

    /**
     * 从声纹库获取参会人员邮箱
     */
    async getAttendeesFromVoiceprint() {
        try {
            // 从 localStorage 获取声纹数据
            const voiceprintsData = localStorage.getItem('voiceprints');
            if (!voiceprintsData) {
                console.log('📧 没有找到声纹数据');
                return [];
            }

            const voiceprints = JSON.parse(voiceprintsData);
            const attendees = [];

            // 提取所有声纹的邮箱
            for (const [name, data] of Object.entries(voiceprints)) {
                if (data.email) {
                    attendees.push({
                        name: name,
                        email: data.email
                    });
                }
            }

            console.log(`📧 从声纹库获取到 ${attendees.length} 个参会人员`, attendees);
            return attendees;

        } catch (error) {
            console.error('❌ 获取参会人员失败:', error);
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
     * 更新邮件内容（标题、收件人、预览）
     */
    async updateEmailContent() {
        if (!this.currentSummary) {
            console.log('📧 没有会议纪要，跳过更新');
            return;
        }

        console.log('📧 更新邮件内容');

        // 获取参会人员
        const voiceprintAttendees = await this.getAttendeesFromVoiceprint();
        const summaryAttendees = this.extractAttendeesFromSummary(this.currentSummary);

        // 合并参会人员（优先使用声纹库的邮箱）
        const attendeesMap = new Map();

        // 先添加纪要中的参会人员
        summaryAttendees.forEach(attendee => {
            attendeesMap.set(attendee.name, attendee);
        });

        // 用声纹库的数据更新邮箱
        voiceprintAttendees.forEach(attendee => {
            if (attendeesMap.has(attendee.name)) {
                attendeesMap.get(attendee.name).email = attendee.email;
            } else {
                attendeesMap.set(attendee.name, attendee);
            }
        });

        this.attendees = Array.from(attendeesMap.values());

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
     * 更新邮件标题
     */
    updateEmailSubject() {
        const subjectInput = document.getElementById('emailSubject');
        if (!subjectInput || subjectInput.value.trim()) return; // 如果用户已填写，不覆盖

        const summary = this.currentSummary;
        let subject = '会议纪要';

        // 从 summary 中获取标题
        if (summary.title) {
            subject = summary.title;
        } else if (summary.metadata && summary.metadata.title) {
            subject = summary.metadata.title;
        }

        // 添加日期
        const date = summary.meetingDate || summary.date || new Date().toLocaleDateString('zh-CN');
        subject = `${subject} - ${date}`;

        subjectInput.value = subject;
        console.log(`📧 自动填充邮件标题: ${subject}`);
    }

    /**
     * 更新邮件内容预览
     */
    updateEmailPreview() {
        const previewBox = document.getElementById('emailContentPreview');
        if (!previewBox) return;

        const summary = this.currentSummary;
        if (!summary) {
            previewBox.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>生成会议纪要后，邮件内容将在此预览</p>
                </div>
            `;
            return;
        }

        // 构建邮件HTML内容
        const emailHTML = this.buildEmailHTML(summary);
        previewBox.innerHTML = emailHTML;

        console.log('📧 邮件预览已更新');
    }

    /**
     * 构建邮件HTML内容
     */
    buildEmailHTML(summary) {
        const date = summary.meetingDate || summary.date || new Date().toLocaleDateString('zh-CN');

        let html = `
            <div style="font-family: 'Microsoft YaHei', Arial, sans-serif; line-height: 1.8; color: #333;">
                <div style="background: linear-gradient(135deg, #4361ee, #6c63ff); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">
                        <i class="fas fa-file-alt"></i> ${summary.title || '会议纪要'}
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
                    <p style="margin: 15px 0; line-height: 1.8;">${summary.summary}</p>
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
                html += `<li style="margin: 10px 0; line-height: 1.8;">${point}</li>`;
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
                html += `<li style="margin: 10px 0; padding: 12px; background: #fff3cd; border-left: 4px solid #ffd166; border-radius: 5px; line-height: 1.8;">${item}</li>`;
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
                html += `<li style="margin: 10px 0; padding: 12px; background: #e3f2fd; border-left: 4px solid #4cc9f0; border-radius: 5px; line-height: 1.8;">${decision}</li>`;
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
            const response = await fetch(`${API_BASE_URL}/email/send-summary`, {
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
