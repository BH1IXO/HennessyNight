/**
 * 基于浏览器 Web Speech API 的实时语音识别
 * 不需要后端支持，直接在浏览器中完成语音转文字
 */

console.log('🎤 加载 Web Speech API 实时识别版本');

// ==================== 工具类 ====================

class EventBus {
    constructor() {
        this.events = new Map();
    }

    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(handler);
    }

    emit(event, data) {
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for "${event}":`, error);
                }
            });
        }
    }
}

// ==================== Web Speech API 录音管理器 ====================

class WebSpeechRecordingManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.recognition = null;
        this.isRecording = false;
        this.transcriptBuffer = '';
        this.interimTranscript = '';
        this.lastFinalTime = Date.now();
        this.currentSpeaker = { name: '说话人', confidence: 1 };

        // 初始化语音识别
        this.initRecognition();
    }

    initRecognition() {
        // 检查浏览器支持
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('❌ 浏览器不支持语音识别');
            alert('您的浏览器不支持语音识别功能，请使用 Chrome 浏览器');
            return;
        }

        this.recognition = new SpeechRecognition();

        // 配置识别参数
        this.recognition.continuous = true;  // 持续识别
        this.recognition.interimResults = true;  // 返回临时结果
        this.recognition.lang = 'zh-CN';  // 中文识别
        this.recognition.maxAlternatives = 1;

        // 识别结果事件
        this.recognition.onresult = (event) => {
            this.handleRecognitionResult(event);
        };

        // 识别结束事件（自动重启）
        this.recognition.onend = () => {
            if (this.isRecording) {
                console.log('🔄 重新启动识别...');
                try {
                    this.recognition.start();
                } catch (error) {
                    console.error('重启识别失败:', error);
                }
            }
        };

        // 错误处理
        this.recognition.onerror = (event) => {
            console.error('识别错误:', event.error);

            // 如果是网络错误或no-speech，尝试重启
            if (event.error === 'no-speech' || event.error === 'network') {
                if (this.isRecording) {
                    setTimeout(() => {
                        try {
                            this.recognition.start();
                        } catch (e) {
                            console.error('重启失败:', e);
                        }
                    }, 100);
                }
            }
        };

        console.log('✅ 语音识别初始化成功');
    }

    handleRecognitionResult(event) {
        let interimText = '';
        let finalText = '';

        // 处理识别结果
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript;

            if (result.isFinal) {
                finalText += text;
            } else {
                interimText += text;
            }
        }

        // 更新临时文本
        this.interimTranscript = interimText;

        // 如果有最终识别结果
        if (finalText) {
            const cleanText = this.cleanText(finalText);

            if (cleanText) {
                console.log('✅ 识别结果:', cleanText);

                // 添加到缓冲区
                this.transcriptBuffer += cleanText;

                // 发送转录事件
                this.eventBus.emit('transcription:chunk', {
                    text: cleanText,
                    speaker: this.currentSpeaker,
                    timestamp: Date.now(),
                    isFinal: true
                });

                this.lastFinalTime = Date.now();
            }
        }

        // 显示临时结果（用于实时反馈）
        if (interimText) {
            const cleanInterim = this.cleanText(interimText);
            if (cleanInterim) {
                this.eventBus.emit('transcription:interim', {
                    text: cleanInterim,
                    speaker: this.currentSpeaker,
                    timestamp: Date.now(),
                    isFinal: false
                });
            }
        }
    }

    cleanText(text) {
        // 清理文本
        return text
            .trim()
            .replace(/\s+/g, ' ')  // 多个空格变一个
            .replace(/([。，！？、；：])\1+/g, '$1');  // 去除重复标点
    }

    async startRecording() {
        if (!this.recognition) {
            throw new Error('语音识别未初始化');
        }

        try {
            // 请求麦克风权限
            await navigator.mediaDevices.getUserMedia({ audio: true });

            this.transcriptBuffer = '';
            this.interimTranscript = '';
            this.isRecording = true;
            this.lastFinalTime = Date.now();

            // 启动识别
            this.recognition.start();

            this.eventBus.emit('recording:started');
            console.log('🎤 开始录音和实时识别');

        } catch (error) {
            console.error('启动录音失败:', error);
            alert('无法访问麦克风，请确保已授权麦克风权限');
            throw error;
        }
    }

    stopRecording() {
        if (this.recognition && this.isRecording) {
            this.isRecording = false;
            this.recognition.stop();

            this.eventBus.emit('recording:stopped', {
                transcript: this.transcriptBuffer.trim()
            });

            console.log('⏹️ 停止录音');
            console.log('📝 完整文本:', this.transcriptBuffer);
        }
    }

    getFullTranscript() {
        return this.transcriptBuffer.trim();
    }
}

// ==================== UI 管理器（简化版） ====================

class SimpleUIManager {
    constructor(eventBus, recordingManager) {
        this.eventBus = eventBus;
        this.recordingManager = recordingManager;
        this.transcriptMessages = [];
        this.currentMessageElement = null;
        this.lastSpeaker = null;
        this.lastMessageTime = 0;
    }

    init() {
        this.bindEvents();
        this.setupEventHandlers();
        console.log('✅ UI管理器初始化完成');
    }

    bindEvents() {
        // 录音控制按钮
        document.getElementById('startRecording')?.addEventListener('click', () => this.startRecording());
        document.getElementById('stopRecording')?.addEventListener('click', () => this.stopRecording());
        document.getElementById('generateSummary')?.addEventListener('click', () => this.generateSummary());
    }

    setupEventHandlers() {
        // 录音状态
        this.eventBus.on('recording:started', () => {
            document.getElementById('startRecording').disabled = true;
            document.getElementById('stopRecording').disabled = false;
            document.getElementById('generateSummary').disabled = true;
            this.setStatus('录音中...', 'recording');
            this.clearTranscriptDisplay();
        });

        this.eventBus.on('recording:stopped', () => {
            document.getElementById('startRecording').disabled = false;
            document.getElementById('stopRecording').disabled = true;
            document.getElementById('generateSummary').disabled = false;
            this.setStatus('录音已停止', 'idle');
        });

        // 转录结果（最终）
        this.eventBus.on('transcription:chunk', (data) => {
            this.addTranscriptMessage(data);
        });

        // 转录结果（临时）
        this.eventBus.on('transcription:interim', (data) => {
            this.updateInterimTranscript(data);
        });
    }

    setStatus(text, state = 'idle') {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');

        if (statusText) statusText.textContent = text;
        if (statusDot) {
            statusDot.classList.remove('recording');
            if (state === 'recording') {
                statusDot.classList.add('recording');
            }
        }
    }

    clearTranscriptDisplay() {
        const container = document.getElementById('transcriptDisplay');
        if (container) {
            container.innerHTML = '';
            this.transcriptMessages = [];
            this.currentMessageElement = null;
            this.lastSpeaker = null;
            this.lastMessageTime = 0;
        }
    }

    addTranscriptMessage(data) {
        const { text, speaker, timestamp } = data;
        const container = document.getElementById('transcriptDisplay');
        if (!container) return;

        // 判断是否需要新建消息块（说话人切换或超过2秒间隔）
        const timeSinceLastMessage = timestamp - this.lastMessageTime;
        const needNewBlock = !this.lastSpeaker ||
                           this.lastSpeaker.name !== speaker.name ||
                           timeSinceLastMessage > 2000;

        if (needNewBlock) {
            // 创建新消息块
            const messageDiv = document.createElement('div');
            messageDiv.className = 'speaker-message';
            messageDiv.innerHTML = `
                <div class="speaker-label">
                    <div class="speaker-avatar">${speaker.name.charAt(0)}</div>
                    <span>${speaker.name}</span>
                </div>
                <div class="message-content">${text}</div>
                <div class="message-time">${this.formatTime(new Date())}</div>
            `;

            container.appendChild(messageDiv);
            this.currentMessageElement = messageDiv;
            this.lastSpeaker = speaker;
            this.transcriptMessages.push({ speaker: speaker.name, text, timestamp });

            // 添加动画
            setTimeout(() => {
                messageDiv.style.opacity = '1';
                messageDiv.style.transform = 'translateY(0)';
            }, 10);

        } else {
            // 追加到当前消息块
            if (this.currentMessageElement) {
                const contentDiv = this.currentMessageElement.querySelector('.message-content');
                if (contentDiv) {
                    const currentText = contentDiv.textContent;
                    const needPunctuation = this.needsPunctuation(currentText);
                    contentDiv.textContent = currentText + (needPunctuation ? '' : '') + text;
                }
            }
        }

        this.lastMessageTime = timestamp;
        this.scrollToBottom(container);
    }

    updateInterimTranscript(data) {
        // 临时结果显示在当前消息块的末尾，用不同颜色标识
        const { text } = data;
        const container = document.getElementById('transcriptDisplay');
        if (!container || !this.currentMessageElement) return;

        const contentDiv = this.currentMessageElement.querySelector('.message-content');
        if (contentDiv) {
            // 移除旧的临时文本
            const existingInterim = contentDiv.querySelector('.interim-text');
            if (existingInterim) {
                existingInterim.remove();
            }

            // 添加新的临时文本
            if (text) {
                const interimSpan = document.createElement('span');
                interimSpan.className = 'interim-text';
                interimSpan.style.opacity = '0.5';
                interimSpan.style.fontStyle = 'italic';
                interimSpan.textContent = ' ' + text;
                contentDiv.appendChild(interimSpan);
            }
        }
    }

    needsPunctuation(text) {
        const lastChar = text.trim().slice(-1);
        return ['。', '，', '、', '！', '？', '；', '.', ',', '!', '?', ';'].includes(lastChar);
    }

    scrollToBottom(container) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    }

    formatTime(date) {
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }

    async startRecording() {
        try {
            await this.recordingManager.startRecording();
        } catch (error) {
            alert('启动录音失败: ' + error.message);
        }
    }

    stopRecording() {
        this.recordingManager.stopRecording();
    }

    generateSummary() {
        const transcript = this.recordingManager.getFullTranscript();
        if (!transcript) {
            alert('没有转录内容可生成纪要');
            return;
        }

        // 简单的纪要生成（显示转录文本）
        const summaryDisplay = document.getElementById('summaryDisplay');
        if (summaryDisplay) {
            summaryDisplay.innerHTML = `
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-file-alt"></i> 会议转录</div>
                    <div class="summary-content">${transcript}</div>
                </div>
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-info-circle"></i> 说明</div>
                    <div class="summary-content">
                        <p>AI纪要生成功能需要连接到 DeepSeek API。</p>
                        <p>当前显示的是完整转录文本。</p>
                        <p>字数统计: ${transcript.length} 字</p>
                    </div>
                </div>
            `;

            // 切换到摘要标签页
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.querySelector('[data-tab="summary"]')?.classList.add('active');
            document.getElementById('summary-tab')?.classList.add('active');
        }
    }
}

// ==================== 应用初始化 ====================

class SimpleApp {
    constructor() {
        this.eventBus = new EventBus();
        this.recordingManager = new WebSpeechRecordingManager(this.eventBus);
        this.uiManager = new SimpleUIManager(this.eventBus, this.recordingManager);
    }

    init() {
        console.log('🚀 初始化应用...');
        this.uiManager.init();
        console.log('✅ 应用初始化完成 - Web Speech API 实时识别已就绪');
        console.log('💡 提示: 请使用 Chrome 浏览器以获得最佳体验');
    }
}

// ==================== 全局函数（供 HTML 调用） ====================

// 关闭弹窗
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
};

// 打开弹窗
window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
};

// 保存说话人
window.saveSpeaker = function() {
    if (window.speechApp && window.speechApp.voiceprintManager) {
        window.speechApp.voiceprintManager.saveSpeaker();
    }
};

// 保存词条
window.saveTerm = function() {
    // 词条保存功能暂不实现（需要数据库）
    alert('词条保存功能需要数据库支持，当前版本暂不可用');
    closeModal('addTermModal');
};

// ==================== 声纹管理器 ====================

class VoiceprintManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.speakers = [];
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentRecordingElement = null;
    }

    init() {
        // 添加声纹按钮
        document.getElementById('addSpeaker')?.addEventListener('click', () => {
            openModal('addSpeakerModal');
        });

        // 点击遮罩关闭弹窗
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        this.loadSpeakers();
    }

    loadSpeakers() {
        // 从 localStorage 加载声纹数据
        const saved = localStorage.getItem('speakers');
        if (saved) {
            try {
                this.speakers = JSON.parse(saved);
                this.updateSpeakerList();
            } catch (e) {
                console.error('加载声纹数据失败:', e);
            }
        }
    }

    saveSpeakers() {
        localStorage.setItem('speakers', JSON.stringify(this.speakers));
    }

    async saveSpeaker() {
        const name = document.getElementById('speakerName')?.value.trim();
        const email = document.getElementById('speakerEmail')?.value.trim();
        const voiceFile = document.getElementById('speakerVoiceFile')?.files[0];

        if (!name) {
            alert('请输入姓名');
            return;
        }

        // 创建说话人对象
        const speaker = {
            id: Date.now().toString(),
            name: name,
            email: email || '',
            voiceprint: null,
            audioUrl: null,
            createdAt: new Date().toISOString()
        };

        // 如果上传了声纹文件
        if (voiceFile) {
            try {
                speaker.audioUrl = await this.processVoiceFile(voiceFile);
                speaker.voiceprint = await this.extractVoiceprint(voiceFile);
            } catch (error) {
                console.error('处理声纹文件失败:', error);
                alert('处理声纹文件失败，但已保存基本信息');
            }
        }

        // 添加到列表
        this.speakers.push(speaker);
        this.saveSpeakers();
        this.updateSpeakerList();

        // 关闭弹窗，清空表单
        closeModal('addSpeakerModal');
        document.getElementById('speakerName').value = '';
        document.getElementById('speakerEmail').value = '';
        document.getElementById('speakerVoiceFile').value = '';

        alert(`声纹已保存：${name}`);
    }

    async processVoiceFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async extractVoiceprint(file) {
        // 简化版：使用音频文件的基本特征作为"声纹"
        // 实际应用中应该使用专业的声纹提取算法
        return {
            size: file.size,
            type: file.type,
            duration: 0, // 实际应该计算音频时长
            hash: this.simpleHash(file.name + file.size + file.lastModified),
            features: [] // 实际应该提取音频特征向量
        };
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    deleteSpeaker(id) {
        if (!confirm('确定要删除这个声纹吗？')) return;

        this.speakers = this.speakers.filter(s => s.id !== id);
        this.saveSpeakers();
        this.updateSpeakerList();
    }

    updateSpeakerList() {
        const container = document.getElementById('speakerList');
        if (!container) return;

        if (this.speakers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>暂无声纹数据</p>
                    <p style="font-size: 0.9rem; color: var(--gray); margin-top: 10px;">
                        点击上方"添加声纹"按钮开始
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.speakers.map(speaker => `
            <div class="speaker-item">
                <div class="speaker-avatar">${speaker.name.charAt(0)}</div>
                <div class="speaker-info">
                    <div class="speaker-name">
                        ${speaker.name}
                        ${speaker.voiceprint ? '<span class="badge" style="background: var(--success); font-size: 0.7rem;">已录音</span>' : ''}
                    </div>
                    <div class="speaker-email">${speaker.email || '无邮箱'}</div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon delete" onclick="window.speechApp.voiceprintManager.deleteSpeaker('${speaker.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
}

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.speechApp = new SimpleApp();
    window.speechApp.voiceprintManager = new VoiceprintManager(window.speechApp.eventBus);

    window.speechApp.init();
    window.speechApp.voiceprintManager.init();
});

console.log('✅ Web Speech Recognition App 加载完成');
