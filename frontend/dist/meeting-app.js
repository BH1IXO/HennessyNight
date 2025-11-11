/**
 * 会议纪要生成模块
 * 与 realtime-speech-app.js 协同工作，不重复初始化语音识别
 * 只负责会议纪要的生成和展示功能
 */

console.log('🚀 加载会议纪要生成模块');

// ==================== 全局配置 ====================
const API_BASE_URL = '/api/v1';

// ==================== 会议纪要管理器 ====================
class SummaryManager {
    constructor() {
        this.currentSummary = null;
    }

    /**
     * 生成会议纪要（调用DeepSeek API）
     */
    async generateSummary(transcript) {
        return this.generateSummaryWithMeetingInfo(transcript, null);
    }

    /**
     * 🎯 生成会议纪要（带会议信息）
     */
    async generateSummaryWithMeetingInfo(transcript, meetingInfo) {
        if (!transcript || transcript.trim().length === 0) {
            alert('没有转录内容，无法生成纪要');
            return;
        }

        console.log('📝 开始生成会议纪要...');
        console.log('转录内容长度:', transcript.length);

        try {
            // 显示加载状态
            this.showLoading();

            // 🎯 准备请求数据
            const requestData = {
                transcript: transcript,
                language: 'zh',
                style: 'formal'
            };

            // 🎯 如果有会议信息，添加到请求中
            if (meetingInfo) {
                requestData.meetingDate = meetingInfo.startTime;
                requestData.duration = meetingInfo.duration;
                requestData.attendees = meetingInfo.attendees.map(a => a.name);
                console.log('📅 会议日期:', meetingInfo.startTime);
                console.log('⏱️ 会议时长:', meetingInfo.duration);
                console.log('👥 参会人员:', requestData.attendees.join(', '));
            }

            // 调用后端API
            const response = await fetch(`${API_BASE_URL}/summaries/generate-from-text`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.data) {
                this.currentSummary = result.data;
                this.displaySummary(result.data);
                console.log('✅ 会议纪要生成成功');
            } else {
                throw new Error(result.message || '生成纪要失败');
            }

        } catch (error) {
            console.error('❌ 生成纪要失败:', error);
            this.showError('生成纪要失败: ' + error.message);
        }
    }

    /**
     * 显示加载状态
     */
    showLoading() {
        const container = document.getElementById('summaryDisplay');
        container.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>正在使用 DeepSeek AI 生成会议纪要...</p>
                <small style="color: #666;">这可能需要几秒钟</small>
            </div>
        `;

        // 切换到纪要标签页
        this.switchToSummaryTab();
    }

    /**
     * 显示会议纪要
     */
    displaySummary(summary) {
        const container = document.getElementById('summaryDisplay');

        // 构建美观的HTML
        const html = `
            <div class="summary-content">
                <div class="summary-header">
                    <h2 style="margin: 0 0 10px 0; color: var(--primary);">
                        <i class="fas fa-file-alt"></i> 会议纪要
                    </h2>
                    <div style="color: #666; font-size: 14px;">
                        <i class="fas fa-clock"></i> 生成时间: ${this.formatDateTime(new Date())}
                    </div>
                </div>

                ${summary.title ? `
                    <div class="summary-section">
                        <h3><i class="fas fa-heading"></i> 会议主题</h3>
                        <p>${this.escapeHtml(summary.title)}</p>
                    </div>
                ` : ''}

                ${summary.summary ? `
                    <div class="summary-section">
                        <h3><i class="fas fa-align-left"></i> 会议摘要</h3>
                        <p>${this.formatText(summary.summary)}</p>
                    </div>
                ` : ''}

                ${summary.keyPoints && summary.keyPoints.length > 0 ? `
                    <div class="summary-section">
                        <h3><i class="fas fa-list-ul"></i> 关键要点</h3>
                        <ul class="key-points-list">
                            ${summary.keyPoints.map(point => `
                                <li>${this.escapeHtml(point)}</li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}

                ${summary.actionItems && summary.actionItems.length > 0 ? `
                    <div class="summary-section">
                        <h3><i class="fas fa-tasks"></i> 行动项</h3>
                        <ul class="action-items-list">
                            ${summary.actionItems.map(item => `
                                <li>
                                    <i class="fas fa-check-circle"></i>
                                    ${this.escapeHtml(item)}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}

                ${summary.decisions && summary.decisions.length > 0 ? `
                    <div class="summary-section">
                        <h3><i class="fas fa-gavel"></i> 决策事项</h3>
                        <ul class="decisions-list">
                            ${summary.decisions.map(decision => `
                                <li>${this.escapeHtml(decision)}</li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}

                <div class="summary-footer">
                    <button class="btn btn-info" onclick="summaryManager.copySummary()">
                        <i class="fas fa-copy"></i> 复制纪要
                    </button>
                    <button class="btn btn-success" onclick="summaryManager.exportSummary()">
                        <i class="fas fa-download"></i> 导出纪要
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // 🎯 为知识库术语附加tooltip
        this.attachTermEvents();
    }

    /**
     * 显示错误
     */
    showError(message) {
        const container = document.getElementById('summaryDisplay');
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${this.escapeHtml(message)}</p>
                <button class="btn" onclick="location.reload()">
                    <i class="fas fa-redo"></i> 重新加载
                </button>
            </div>
        `;
    }

    /**
     * 切换到纪要标签页
     */
    switchToSummaryTab() {
        const tabs = document.querySelectorAll('.tab');
        const panes = document.querySelectorAll('.tab-pane');

        tabs.forEach(tab => tab.classList.remove('active'));
        panes.forEach(pane => pane.classList.remove('active'));

        document.querySelector('[data-tab="summary"]')?.classList.add('active');
        document.getElementById('summary-tab')?.classList.add('active');
    }

    /**
     * 复制纪要到剪贴板
     */
    async copySummary() {
        if (!this.currentSummary) {
            alert('没有可复制的纪要');
            return;
        }

        const text = this.summaryToText(this.currentSummary);

        try {
            await navigator.clipboard.writeText(text);
            alert('✅ 会议纪要已复制到剪贴板');
        } catch (error) {
            console.error('复制失败:', error);
            alert('复制失败，请手动选择复制');
        }
    }

    /**
     * 导出纪要为文本文件
     */
    exportSummary() {
        if (!this.currentSummary) {
            alert('没有可导出的纪要');
            return;
        }

        const text = this.summaryToText(this.currentSummary);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `会议纪要_${this.formatFileName(new Date())}.txt`;
        a.click();

        URL.revokeObjectURL(url);
        console.log('✅ 会议纪要已导出');
    }

    /**
     * 将纪要对象转为文本格式
     */
    summaryToText(summary) {
        let text = '======== 会议纪要 ========\n\n';

        if (summary.title) {
            text += `会议主题: ${summary.title}\n\n`;
        }

        text += `生成时间: ${this.formatDateTime(new Date())}\n\n`;

        if (summary.summary) {
            text += `会议摘要:\n${summary.summary}\n\n`;
        }

        if (summary.keyPoints && summary.keyPoints.length > 0) {
            text += '关键要点:\n';
            summary.keyPoints.forEach((point, i) => {
                text += `${i + 1}. ${point}\n`;
            });
            text += '\n';
        }

        if (summary.actionItems && summary.actionItems.length > 0) {
            text += '行动项:\n';
            summary.actionItems.forEach((item, i) => {
                text += `${i + 1}. ${item}\n`;
            });
            text += '\n';
        }

        if (summary.decisions && summary.decisions.length > 0) {
            text += '决策事项:\n';
            summary.decisions.forEach((decision, i) => {
                text += `${i + 1}. ${decision}\n`;
            });
            text += '\n';
        }

        text += '========================\n';

        return text;
    }

    /**
     * 获取与会人员
     */
    getAttendees() {
        const select = document.getElementById('currentSpeakerSelect');
        const attendees = [];

        if (select) {
            for (let option of select.options) {
                if (option.value && option.value !== '') {
                    attendees.push(option.value);
                }
            }
        }

        return attendees;
    }

    /**
     * 格式化文本（保留换行）
     */
    formatText(text) {
        return this.highlightKnowledgeTerms(this.escapeHtml(text)).replace(/\n/g, '<br>');
    }

    /**
     * 🎯 高亮知识库术语 - 将[[术语]]标记转换为高亮HTML
     */
    highlightKnowledgeTerms(text) {
        // 匹配 [[术语]] 格式的标记
        return text.replace(/\[\[([^\]]+)\]\]/g, (match, term) => {
            return `<span class="knowledge-term" data-term="${term}" title="点击查看术语详情">${term}</span>`;
        });
    }

    /**
     * 🎯 为高亮的知识库术语添加点击事件和tooltip
     */
    async attachTermEvents() {
        const terms = document.querySelectorAll('.knowledge-term[data-term]');

        for (const termElement of terms) {
            const termName = termElement.dataset.term;

            // 异步获取术语详情
            try {
                const response = await fetch(`${API_BASE_URL}/terms?search=${encodeURIComponent(termName)}`);
                if (response.ok) {
                    const result = await response.json();
                    const termData = result.data.find(t => t.term === termName);

                    if (termData) {
                        termElement.title = `${termData.category ? `[${termData.category}] ` : ''}${termData.definition}`;
                        termElement.dataset.definition = termData.definition;
                        if (termData.category) {
                            termElement.dataset.category = termData.category;
                        }
                    }
                }
            } catch (error) {
                console.warn(`获取术语"${termName}"详情失败:`, error);
            }
        }
    }

    /**
     * 格式化日期时间
     */
    formatDateTime(date) {
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * 格式化文件名
     */
    formatFileName(date) {
        return date.toISOString().slice(0, 19).replace(/:/g, '-');
    }

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ==================== 导入录音管理器 ====================
class ImportAudioManager {
    constructor(summaryManager) {
        this.summaryManager = summaryManager;
        this.importedAudioFile = null;  // 保存导入的音频文件
        this.isTranscribed = false;      // 标记是否已转录
    }

    /**
     * 处理导入的音频文件（只保存文件，不立即转录）
     */
    async handleImportedAudio(file) {
        console.log('📂 已选择音频文件:', file.name);

        // 保存文件引用
        this.importedAudioFile = file;
        this.isTranscribed = false;

        // 启用生成纪要按钮
        const generateBtn = document.getElementById('generateSummary');
        if (generateBtn) {
            generateBtn.disabled = false;
        }

        console.log('✅ 音频文件已准备，请点击"生成会议纪要"按钮开始处理');
    }

    /**
     * 转录音频文件
     */
    async transcribeAudio() {
        if (!this.importedAudioFile) {
            throw new Error('没有导入的音频文件');
        }

        if (this.isTranscribed) {
            console.log('⚠️ 音频已转录，跳过重复转录');
            return;
        }

        console.log('📝 开始转录音频文件:', this.importedAudioFile.name);

        try {
            // 显示加载状态
            this.showProcessing();

            // 创建FormData
            const formData = new FormData();
            formData.append('audio', this.importedAudioFile);

            // 调用后端API进行转录和声纹识别
            const response = await fetch(`${API_BASE_URL}/audio/transcribe-file`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`转录失败: HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.data && result.data.segments) {
                // 优化文本：去除多余空格并添加标点符号
                const optimizedSegments = await this.optimizeTranscriptText(result.data.segments);

                // 显示优化后的转录结果
                this.displayTranscript(optimizedSegments);

                // 标记已转录
                this.isTranscribed = true;

                console.log('✅ 音频转录完成');

            } else {
                throw new Error('转录结果为空');
            }

        } catch (error) {
            console.error('❌ 转录音频失败:', error);
            throw error;
        }
    }

    /**
     * 优化转录文本：去除多余空格并添加标点符号
     */
    async optimizeTranscriptText(segments) {
        console.log('🔧 开始优化转录文本...');

        try {
            // 对每个片段的文本进行批量优化
            const optimizedSegments = await Promise.all(
                segments.map(async (segment) => {
                    const originalText = segment.text;

                    // 调用DeepSeek进行文本优化
                    const optimizedText = await this.optimizeTextWithAI(originalText);

                    return {
                        ...segment,
                        text: optimizedText
                    };
                })
            );

            console.log('✅ 文本优化完成');
            return optimizedSegments;

        } catch (error) {
            console.error('⚠️ 文本优化失败，使用原始文本:', error);
            // 如果优化失败，返回原始文本
            return segments;
        }
    }

    /**
     * 使用AI优化单个文本片段
     */
    async optimizeTextWithAI(text) {
        try {
            // 先做基本清理：去除多余空格
            const cleanedText = text.replace(/\s+/g, '');

            // 调用DeepSeek添加标点符号
            const response = await fetch(`${API_BASE_URL}/summaries/optimize-text`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: cleanedText
                })
            });

            if (!response.ok) {
                throw new Error(`优化文本失败: HTTP ${response.status}`);
            }

            const result = await response.json();
            return result.data?.optimizedText || cleanedText;

        } catch (error) {
            console.error('AI优化失败，返回清理后的文本:', error);
            // 如果AI调用失败，至少返回去除空格后的文本
            return text.replace(/\s+/g, '');
        }
    }

    /**
     * 显示处理中状态
     */
    showProcessing() {
        const container = document.getElementById('transcriptDisplay');
        container.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>正在转录音频并识别说话人...</p>
                <small style="color: #666;">这可能需要一些时间</small>
            </div>
        `;
    }

    /**
     * 显示转录结果
     */
    displayTranscript(segments) {
        const container = document.getElementById('transcriptDisplay');
        container.innerHTML = '';

        segments.forEach(segment => {
            const segmentElement = document.createElement('div');
            segmentElement.className = 'transcript-segment';
            segmentElement.innerHTML = `
                <div class="segment-header">
                    <span class="speaker-tag">${this.escapeHtml(segment.speaker?.name || '未知说话人')}</span>
                    <span class="timestamp">${this.formatTime(new Date(segment.timestamp))}</span>
                </div>
                <div class="segment-text">
                    ${this.escapeHtml(segment.text)}
                </div>
            `;
            container.appendChild(segmentElement);
        });

        // 滚动到顶部
        container.scrollTop = 0;
    }

    /**
     * 清空转录显示
     */
    clearTranscript() {
        const container = document.getElementById('transcriptDisplay');
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-microphone-slash"></i>
                <p>点击"开始录音"或"导入已有录音"开始</p>
            </div>
        `;
        this.importedTranscript = '';
    }

    /**
     * 格式化时间
     */
    formatTime(date) {
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ==================== 初始化会议纪要模块 ====================
let summaryManager = null;
let importAudioManager = null;

// 等待 realtime-speech-app.js 加载完成后再初始化
window.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化，确保 realtime-speech-app.js 先加载
    setTimeout(() => {
        console.log('🎬 初始化会议纪要生成模块...');

        // 创建纪要管理器实例
        summaryManager = new SummaryManager();
        importAudioManager = new ImportAudioManager(summaryManager);

        // 将 summaryManager 暴露到全局，供邮件模块使用
        window.summaryManager = summaryManager;
        console.log('📧 [Meeting] window.summaryManager 已暴露到全局:', window.summaryManager);
        console.log('📧 [Meeting] 验证 window.summaryManager 是否可访问:', !!window.summaryManager);

        // 监听开始录音按钮
        const startBtn = document.getElementById('startRecording');
        if (startBtn) {
            // 不需要修改开始录音逻辑，保持原有的语音转文字 + 声纹识别
            console.log('✅ 开始录音按钮保持原有功能（语音转文字 + 声纹识别）');
        }

        // 监听停止录音按钮，自动生成纪要
        const stopBtn = document.getElementById('stopRecording');
        if (stopBtn) {
            // 克隆按钮以移除所有旧的事件监听器
            const newStopBtn = stopBtn.cloneNode(true);
            stopBtn.parentNode.replaceChild(newStopBtn, stopBtn);

            newStopBtn.addEventListener('click', () => {
                console.log('⏹️ 点击停止录音按钮');

                // 先执行停止录音（调用原有的 speechManager）
                if (window.realtimeApp && window.realtimeApp.speechManager && typeof window.realtimeApp.speechManager.stopRecording === 'function') {
                    window.realtimeApp.speechManager.stopRecording();
                }

                // 🎯 不再使用固定延迟，而是等待 identification:completed 事件
                console.log('⏸️ 等待所有声纹识别任务完成后再生成会议纪要...');
            });

            console.log('✅ 停止录音按钮事件已重新绑定（等待识别完成后自动生成纪要）');
        }

        // 🎯 监听识别完成事件，自动生成会议纪要
        if (window.eventBus) {
            window.eventBus.on('identification:completed', () => {
                console.log('✅ 所有识别任务已完成，自动生成会议纪要...');
                autoGenerateSummaryFromRecording();
            });
            console.log('✅ 已绑定 identification:completed 事件监听器');
        } else {
            console.warn('⚠️ window.eventBus 不可用，无法监听识别完成事件');
        }

        // 绑定生成纪要按钮
        const generateBtn = document.getElementById('generateSummary');
        if (generateBtn) {
            // 初始状态：禁用
            generateBtn.disabled = true;

            // 移除原有的事件监听器，添加新的
            const newGenerateBtn = generateBtn.cloneNode(true);
            generateBtn.parentNode.replaceChild(newGenerateBtn, generateBtn);

            newGenerateBtn.addEventListener('click', async () => {
                console.log('🔘 点击生成纪要按钮');

                try {
                    // 如果有导入的音频文件且未转录，先进行转录
                    if (importAudioManager.importedAudioFile && !importAudioManager.isTranscribed) {
                        console.log('📝 检测到导入的音频，开始转录...');
                        await importAudioManager.transcribeAudio();
                        console.log('✅ 转录完成，开始生成会议纪要...');
                    }

                    // 从实时转录tab页面的DOM中提取文本内容
                    let transcript = '';

                    // 方法1: 从DOM中提取所有转录片段
                    const segments = document.querySelectorAll('#transcriptDisplay .transcript-segment:not(.interim-text) .segment-text');
                    if (segments.length > 0) {
                        transcript = Array.from(segments).map(seg => seg.textContent.trim()).filter(t => t).join(' ');
                        console.log('✅ 从实时转录tab的DOM提取文本');
                    }

                    // 方法2: 如果DOM中没有，尝试从实时语音识别获取
                    if (!transcript && window.realtimeApp && window.realtimeApp.speechManager) {
                        if (typeof window.realtimeApp.speechManager.getFullTranscript === 'function') {
                            transcript = window.realtimeApp.speechManager.getFullTranscript();
                            console.log('✅ 从实时语音识别获取文本');
                        } else if (window.realtimeApp.speechManager.transcriptBuffer) {
                            transcript = window.realtimeApp.speechManager.transcriptBuffer.trim();
                            console.log('✅ 从语音识别缓冲区获取文本');
                        }
                    }

                    console.log('📝 获取到转录文本长度:', transcript.length);

                    if (transcript && transcript.length > 0) {
                        await summaryManager.generateSummary(transcript);
                    } else {
                        alert('没有转录内容，请先录音或导入音频');
                    }
                } catch (error) {
                    console.error('❌ 生成会议纪要失败:', error);
                    alert('生成会议纪要失败: ' + error.message);
                }
            });
        }

        // 绑定导入录音按钮
        const importBtn = document.getElementById('importRecording');
        const fileInput = document.getElementById('recordingFileInput');

        if (importBtn && fileInput) {
            importBtn.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    importAudioManager.handleImportedAudio(file);
                }
                // 清空input，允许重复选择同一文件
                fileInput.value = '';
            });
        }

        // 绑定标签页切换事件
        initTabSwitching();

        console.log('✅ 会议纪要生成模块初始化完成');
    }, 500);
});

/**
 * 初始化标签页切换功能
 */
function initTabSwitching() {
    const tabs = document.querySelectorAll('.tab');
    const tabPanes = document.querySelectorAll('.tab-pane');

    console.log(`🔖 初始化标签页切换，找到 ${tabs.length} 个标签`);

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            console.log(`🔄 切换到标签页: ${tabName}`);

            // 移除所有active类
            tabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // 添加active类到当前标签
            tab.classList.add('active');
            const targetPane = document.getElementById(`${tabName}-tab`);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });

    console.log('✅ 标签页切换功能已绑定');
}

/**
 * 从实时录音自动生成会议纪要
 */
function autoGenerateSummaryFromRecording() {
    // 🎯 从UI获取带说话人的转录内容
    let transcriptWithSpeakers = [];

    if (window.realtimeApp && window.realtimeApp.uiManager && typeof window.realtimeApp.uiManager.getTranscriptWithSpeakers === 'function') {
        transcriptWithSpeakers = window.realtimeApp.uiManager.getTranscriptWithSpeakers();
        console.log('✅ 从 uiManager.getTranscriptWithSpeakers() 获取带说话人的转录');
    } else {
        // 备用方案：从DOM中提取
        const container = document.getElementById('transcriptDisplay');
        if (container) {
            const messages = container.querySelectorAll('.speaker-message');
            messages.forEach(msg => {
                const speakerName = msg.querySelector('.speaker-name')?.textContent || '未知';
                const content = msg.querySelector('.message-content')?.textContent || '';
                if (content.trim()) {
                    transcriptWithSpeakers.push({
                        speaker: speakerName,
                        content: content.trim()
                    });
                }
            });
            console.log('✅ 从DOM提取带说话人的转录');
        }
    }

    // 🎯 获取会议信息
    let meetingInfo = null;
    if (window.realtimeApp && window.realtimeApp.speechManager && typeof window.realtimeApp.speechManager.getMeetingInfo === 'function') {
        meetingInfo = window.realtimeApp.speechManager.getMeetingInfo();
        console.log('✅ 获取会议信息:', meetingInfo);
    }

    // 🎯 格式化转录文本为 "说话人：内容" 格式
    const formattedTranscript = transcriptWithSpeakers
        .map(item => `${item.speaker}：${item.content}`)
        .join('\n');

    console.log('📝 从录音自动生成纪要');
    console.log('📝 转录条目数:', transcriptWithSpeakers.length);
    console.log('📝 格式化转录预览:\n', formattedTranscript.substring(0, 200));

    if (meetingInfo) {
        console.log('📅 会议开始时间:', meetingInfo.startTime);
        console.log('⏱️ 会议时长:', meetingInfo.duration);
        console.log('👥 参会人员:', meetingInfo.attendees.map(a => a.name).join(', '));
    }

    if (formattedTranscript && formattedTranscript.length > 0) {
        // 🎯 调用生成纪要，传递会议信息
        summaryManager.generateSummaryWithMeetingInfo(formattedTranscript, meetingInfo);
    } else {
        console.warn('⚠️ 没有转录内容，跳过自动生成纪要');
        alert('没有录音内容，无法生成会议纪要。请确保说话时间超过3秒。');
    }
}

// ==================== 交互优化管理器 ====================
class ChatOptimizationManager {
    constructor(summaryManager) {
        this.summaryManager = summaryManager;
        this.chatHistory = [];
    }

    /**
     * 初始化交互优化功能
     */
    init() {
        const sendButton = document.getElementById('sendChat');
        const chatInput = document.getElementById('chatInput');

        if (sendButton && chatInput) {
            sendButton.addEventListener('click', () => this.handleSendMessage());

            // 支持回车发送（Ctrl+Enter换行）
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });

            console.log('✅ 交互优化功能已初始化');
        }
    }

    /**
     * 处理发送消息
     */
    async handleSendMessage() {
        const chatInput = document.getElementById('chatInput');
        const userMessage = chatInput.value.trim();

        if (!userMessage) {
            alert('请输入修改要求');
            return;
        }

        if (!this.summaryManager.currentSummary) {
            alert('请先生成会议纪要后再进行优化');
            return;
        }

        // 显示用户消息
        this.addMessage('user', userMessage);

        // 清空输入框
        chatInput.value = '';

        try {
            // 显示加载状态
            this.addMessage('loading', '正在处理您的要求...');

            // 调用后端API进行优化
            const response = await fetch(`${API_BASE_URL}/summaries/refine-summary`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentSummary: this.summaryManager.currentSummary,
                    userRequest: userMessage,
                    chatHistory: this.chatHistory
                })
            });

            // 移除加载消息
            this.removeLoadingMessage();

            if (!response.ok) {
                throw new Error(`优化失败: HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.data) {
                // 显示AI回复
                this.addMessage('assistant', result.data.reply || '已根据您的要求进行修改');

                // 更新会议纪要
                if (result.data.refinedSummary) {
                    this.summaryManager.currentSummary = result.data.refinedSummary;
                    this.summaryManager.displaySummary(result.data.refinedSummary);
                }

                // 保存到聊天历史
                this.chatHistory.push({
                    role: 'user',
                    content: userMessage
                }, {
                    role: 'assistant',
                    content: result.data.reply
                });

                console.log('✅ 会议纪要已优化');
            }

        } catch (error) {
            this.removeLoadingMessage();
            console.error('❌ 优化失败:', error);
            this.addMessage('error', '优化失败: ' + error.message);
        }
    }

    /**
     * 添加消息到聊天界面
     */
    addMessage(type, content) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        if (type === 'user') {
            messageDiv.innerHTML = `<strong>您:</strong> ${this.escapeHtml(content)}`;
        } else if (type === 'assistant') {
            messageDiv.innerHTML = `<strong>AI助手:</strong> ${this.escapeHtml(content)}`;
        } else if (type === 'loading') {
            messageDiv.innerHTML = `<div class="spinner"></div> ${content}`;
            messageDiv.id = 'loadingMessage';
        } else if (type === 'error') {
            messageDiv.innerHTML = `<strong>错误:</strong> ${this.escapeHtml(content)}`;
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * 移除加载消息
     */
    removeLoadingMessage() {
        const loadingMsg = document.getElementById('loadingMessage');
        if (loadingMsg) {
            loadingMsg.remove();
        }
    }

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ==================== 初始化交互优化 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 等待其他模块初始化完成
    setTimeout(() => {
        if (typeof summaryManager !== 'undefined') {
            window.chatOptimizationManager = new ChatOptimizationManager(summaryManager);
            window.chatOptimizationManager.init();
        }
    }, 600);
});
