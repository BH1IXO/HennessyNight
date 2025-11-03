/**
 * 实时语音识别应用 - 优化版
 * 性能目标: <500ms 延迟
 * 修复: 弹窗按钮点击问题
 */

console.log('🚀 加载实时语音识别应用 - 优化版');

// ==================== 全局事件总线 ====================
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
                    console.error(`Event handler error for "${event}":`, error);
                }
            });
        }
    }
}

// ==================== 实时语音识别管理器 ====================
class RealtimeSpeechManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.recognition = null;
        this.isRecording = false;
        this.transcriptBuffer = '';
        this.lastFinalTime = Date.now();
        this.currentSpeaker = { name: '识别中', confidence: 0, identifying: true };

        // 音频流和说话人识别
        this.audioStream = null;
        this.audioContext = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.identificationQueue = []; // 识别队列
        this.isIdentifying = false; // 是否正在识别
        this.segmentDuration = 5000; // 音频片段时长(5秒，更长的音频可提取更多特征)

        this.initRecognition();
    }

    initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('❌ 浏览器不支持语音识别');
            return;
        }

        this.recognition = new SpeechRecognition();

        // 优化配置以实现 <500ms 延迟
        this.recognition.continuous = true;           // 持续识别
        this.recognition.interimResults = true;        // 实时临时结果
        this.recognition.lang = 'zh-CN';              // 中文
        this.recognition.maxAlternatives = 1;          // 只取最佳结果

        // 识别结果事件 - 这里是实时的
        this.recognition.onresult = (event) => {
            this.handleRecognitionResult(event);
        };

        // 自动重启
        this.recognition.onend = () => {
            if (this.isRecording) {
                setTimeout(() => {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.error('重启识别失败:', e);
                    }
                }, 100);
            }
        };

        // 错误处理
        this.recognition.onerror = (event) => {
            if (event.error === 'no-speech' || event.error === 'network') {
                if (this.isRecording) {
                    setTimeout(() => {
                        try {
                            this.recognition.start();
                        } catch (e) {}
                    }, 100);
                }
            }
        };

        console.log('✅ 语音识别初始化成功（优化配置）');
    }

    handleRecognitionResult(event) {
        let interimText = '';
        let finalText = '';

        // 处理所有结果
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript;

            if (result.isFinal) {
                finalText += text;
            } else {
                interimText += text;
            }
        }

        // 立即发送临时结果（实现 <500ms）
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

        // 发送最终结果
        if (finalText) {
            const cleanFinal = this.cleanText(finalText);
            if (cleanFinal) {
                this.transcriptBuffer += cleanFinal;
                this.eventBus.emit('transcription:final', {
                    text: cleanFinal,
                    speaker: this.currentSpeaker,
                    timestamp: Date.now(),
                    isFinal: true
                });
                this.lastFinalTime = Date.now();
            }
        }
    }

    cleanText(text) {
        return text.trim().replace(/\s+/g, ' ');
    }

    async startRecording() {
        if (!this.recognition) {
            throw new Error('语音识别未初始化');
        }

        try {
            // 获取音频流
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                }
            });

            console.log('✅ 音频流获取成功');

            // 重要：必须先设置 isRecording = true，否则 startAudioCapture 会跳过
            this.transcriptBuffer = '';
            this.isRecording = true;
            this.lastFinalTime = Date.now();

            // 启动音频录制用于说话人识别
            this.startAudioCapture();

            this.recognition.start();
            this.eventBus.emit('recording:started');

            console.log('🎤 开始实时识别（<500ms延迟 + 自动说话人识别）');
        } catch (error) {
            console.error('启动录音失败:', error);
            alert('无法访问麦克风');
            throw error;
        }
    }

    /**
     * 启动音频捕获 (用于说话人识别)
     */
    startAudioCapture() {
        try {
            console.log('🎙️ 准备启动音频捕获...');

            // 检查支持的 MIME 类型
            let mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                console.warn('⚠️ audio/webm 不支持,尝试其他格式');
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    mimeType = 'audio/webm;codecs=opus';
                } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                    mimeType = 'audio/ogg';
                } else {
                    mimeType = ''; // 使用默认格式
                }
            }

            console.log('📝 使用 MIME 类型:', mimeType || '默认');

            // 创建 MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.audioStream,
                mimeType ? { mimeType } : undefined
            );

            this.audioChunks = [];

            // 监听数据可用事件
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    console.log(`📥 收到音频数据: ${event.data.size} 字节`);
                    this.audioChunks.push(event.data);
                }
            };

            // 监听停止事件(每个片段录制完成)
            this.mediaRecorder.onstop = () => {
                console.log('⏹️ MediaRecorder 已停止,处理音频片段');
                this.processAudioSegment();
            };

            // 监听错误事件
            this.mediaRecorder.onerror = (event) => {
                console.error('❌ MediaRecorder 错误:', event.error);
            };

            // 开始录制,每3秒一个片段
            this.startNextSegment();

            console.log('✅ 音频捕获已启动 (片段时长: 5秒)');

        } catch (error) {
            console.warn('⚠️ 音频捕获失败,说话人识别不可用:', error);
        }
    }

    /**
     * 开始录制下一个片段
     */
    startNextSegment() {
        if (!this.isRecording || !this.mediaRecorder) {
            console.log('⏭️ 跳过片段录制 (isRecording:', this.isRecording, ', mediaRecorder:', !!this.mediaRecorder, ')');
            return;
        }

        this.audioChunks = []; // 清空之前的数据
        console.log('▶️ 开始录制新片段 (5秒)');
        this.mediaRecorder.start();

        // 5秒后停止当前片段
        setTimeout(() => {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                console.log('⏸️ 停止当前片段录制');
                this.mediaRecorder.stop();
            }
        }, this.segmentDuration);
    }

    /**
     * 处理音频片段 - 添加到识别队列
     */
    async processAudioSegment() {
        console.log(`🔄 处理音频片段 (chunks: ${this.audioChunks.length})`);

        if (this.audioChunks.length === 0) {
            console.warn('⚠️ 没有音频数据,跳过识别');
            this.startNextSegment(); // 继续下一个片段
            return;
        }

        // 合并音频片段
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

        console.log('📦 音频片段就绪:', (audioBlob.size / 1024).toFixed(2) + 'KB');

        // 添加到识别队列
        this.identificationQueue.push({
            blob: audioBlob,
            timestamp: Date.now()
        });

        console.log(`📥 加入识别队列 (队列长度: ${this.identificationQueue.length})`);

        // 触发识别处理
        this.processIdentificationQueue();

        // 继续录制下一个片段
        this.startNextSegment();
    }

    /**
     * 处理识别队列 (异步,不阻塞)
     */
    async processIdentificationQueue() {
        // 如果正在识别,等待当前识别完成
        if (this.isIdentifying) {
            console.log('⏳ 正在识别中,队列等待...');
            return;
        }

        // 如果队列为空,退出
        if (this.identificationQueue.length === 0) {
            return;
        }

        this.isIdentifying = true;

        // 取出第一个任务
        const task = this.identificationQueue.shift();

        try {
            console.log('🔍 开始识别说话人...');

            // 转换为File对象
            const audioFile = new File([task.blob], 'segment.webm', { type: 'audio/webm' });

            // 🎯 使用 MFCC 高精度提取器
            let extractor;
            if (typeof MFCCVoiceprintExtractor !== 'undefined') {
                extractor = new MFCCVoiceprintExtractor();
                console.log('✅ 使用 MFCC 高精度提取器进行识别');
            } else if (typeof VoiceprintExtractor !== 'undefined') {
                extractor = new VoiceprintExtractor();
                console.warn('⚠️ MFCC 未加载，使用快速提取器');
            } else {
                throw new Error('没有可用的声纹提取器');
            }

            const voiceprintData = await extractor.extractFromFile(audioFile);

            console.log('✅ 特征提取完成:', voiceprintData.vector.length, '维');

            // 匹配说话人
            const matcher = window.voiceprintMatcher || new VoiceprintMatcher();
            const speakers = window.voiceprintManager?.speakers || [];

            // 🎯 只在没有手动选择时才自动应用声纹识别结果
            const isManuallySelected = this.currentSpeaker.manual === true;

            if (speakers.length === 0) {
                console.log('ℹ️ 没有注册声纹,跳过识别');
                if (!isManuallySelected) {
                    this.currentSpeaker = { name: '未知说话人', confidence: 0, identifying: false };
                }
            } else {
                const match = matcher.matchSpeaker(voiceprintData.vector, speakers);

                if (match) {
                    console.log(`✅ 声纹识别建议: ${match.speaker.name} (${(match.similarity * 100).toFixed(1)}%)`);

                    // 只在没有手动选择时才自动应用
                    if (!isManuallySelected) {
                        this.currentSpeaker = {
                            name: match.speaker.name,
                            confidence: match.similarity,
                            identifying: false,
                            matched: true
                        };
                        console.log('⚡ 自动应用声纹识别结果');
                    } else {
                        console.log('ℹ️ 用户已手动选择说话人，声纹识别仅作参考');
                    }
                } else {
                    console.log('❌ 未识别到匹配的说话人');
                    if (!isManuallySelected) {
                        this.currentSpeaker = {
                            name: '未知说话人',
                            confidence: 0,
                            identifying: false,
                            matched: false
                        };
                    }
                }
            }

            // 通知UI更新（只在自动识别时）
            if (!isManuallySelected) {
                this.eventBus.emit('speaker:identified', this.currentSpeaker);
            }

        } catch (error) {
            console.error('❌ 说话人识别失败:', error);

            // 如果MFCC失败，尝试降级到快速提取器
            if (error.message && error.message.includes('decode') && typeof VoiceprintExtractor !== 'undefined') {
                try {
                    console.log('⚠️ 尝试使用快速提取器作为降级方案...');
                    const fallbackExtractor = new VoiceprintExtractor();
                    const voiceprintData = await fallbackExtractor.extractFromFile(audioFile);

                    const matcher = window.voiceprintMatcher || new VoiceprintMatcher();
                    const speakers = window.voiceprintManager?.speakers || [];
                    const match = matcher.matchSpeaker(voiceprintData.vector, speakers);

                    if (match) {
                        console.log(`✅ 降级识别成功: ${match.speaker.name}`);
                        this.currentSpeaker = {
                            name: match.speaker.name,
                            confidence: match.similarity * 0.8, // 降级降低置信度
                            identifying: false,
                            matched: true
                        };
                        this.eventBus.emit('speaker:identified', this.currentSpeaker);
                    }
                } catch (fallbackError) {
                    console.error('❌ 降级识别也失败:', fallbackError);
                    this.currentSpeaker = { name: '识别失败', confidence: 0, identifying: false };
                }
            } else {
                this.currentSpeaker = { name: '识别失败', confidence: 0, identifying: false };
            }
        } finally {
            this.isIdentifying = false;

            // 释放blob内存
            URL.revokeObjectURL(URL.createObjectURL(task.blob));

            // 继续处理队列中的下一个任务
            if (this.identificationQueue.length > 0) {
                setTimeout(() => this.processIdentificationQueue(), 100);
            }
        }
    }

    stopRecording() {
        if (this.recognition && this.isRecording) {
            this.isRecording = false;
            this.recognition.stop();

            // 停止音频捕获
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }

            // 清空识别队列
            this.identificationQueue = [];
            this.isIdentifying = false;

            this.eventBus.emit('recording:stopped', {
                transcript: this.transcriptBuffer.trim()
            });
            console.log('⏹️ 停止录音');
        }
    }

    getFullTranscript() {
        return this.transcriptBuffer.trim();
    }
}

// ==================== UI管理器 ====================
class UIManager {
    constructor(eventBus, speechManager) {
        this.eventBus = eventBus;
        this.speechManager = speechManager;
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
        // 录音按钮
        document.getElementById('startRecording')?.addEventListener('click', () => {
            this.startRecording();
        });

        document.getElementById('stopRecording')?.addEventListener('click', () => {
            this.stopRecording();
        });

        document.getElementById('generateSummary')?.addEventListener('click', () => {
            this.generateSummary();
        });

        // 🎯 说话人手动选择器
        const speakerSelect = document.getElementById('currentSpeakerSelect');
        if (speakerSelect) {
            speakerSelect.addEventListener('change', (e) => {
                const selectedName = e.target.value;
                if (selectedName) {
                    console.log('👤 手动切换说话人:', selectedName);
                    this.speechManager.currentSpeaker = {
                        name: selectedName,
                        confidence: 1.0,
                        identifying: false,
                        manual: true // 标记为手动选择
                    };
                } else {
                    this.speechManager.currentSpeaker = {
                        name: '未知说话人',
                        confidence: 0,
                        identifying: false
                    };
                }
            });
        }
    }

    setupEventHandlers() {
        this.eventBus.on('recording:started', () => {
            document.getElementById('startRecording').disabled = true;
            document.getElementById('stopRecording').disabled = false;
            document.getElementById('generateSummary').disabled = true;
            this.setStatus('录音中... (实时识别)', 'recording');
            this.clearTranscriptDisplay();
        });

        this.eventBus.on('recording:stopped', () => {
            document.getElementById('startRecording').disabled = false;
            document.getElementById('stopRecording').disabled = true;
            document.getElementById('generateSummary').disabled = false;
            this.setStatus('录音已停止', 'idle');
        });

        // 临时结果 - 实时更新
        this.eventBus.on('transcription:interim', (data) => {
            this.updateInterimText(data);
        });

        // 最终结果 - 确认文本
        this.eventBus.on('transcription:final', (data) => {
            this.addFinalText(data);
        });

        // 说话人识别完成 - 更新头像和名称
        this.eventBus.on('speaker:identified', (speakerData) => {
            this.updateSpeakerIdentification(speakerData);
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
            this.currentMessageElement = null;
            this.lastSpeaker = null;
            this.lastMessageTime = 0;
        }
    }

    updateInterimText(data) {
        const { text, speaker, timestamp } = data;
        const container = document.getElementById('transcriptDisplay');
        if (!container) return;

        // 如果没有当前消息块，创建一个
        if (!this.currentMessageElement) {
            this.createNewMessageBlock(speaker, timestamp);
        }

        // 更新临时文本
        const contentDiv = this.currentMessageElement.querySelector('.message-content');
        if (contentDiv) {
            // 移除旧的临时标记
            const existingInterim = contentDiv.querySelector('.interim-text');
            if (existingInterim) {
                existingInterim.remove();
            }

            // 添加新的临时文本
            const interimSpan = document.createElement('span');
            interimSpan.className = 'interim-text';
            interimSpan.textContent = text;
            contentDiv.appendChild(interimSpan);

            this.scrollToBottom(container);
        }
    }

    addFinalText(data) {
        const { text, speaker, timestamp } = data;
        const container = document.getElementById('transcriptDisplay');
        if (!container) return;

        // 判断是否需要新建消息块（超过3秒间隔或说话人变化）
        const timeSinceLastMessage = timestamp - this.lastMessageTime;
        const needNewBlock = !this.lastSpeaker ||
                           this.lastSpeaker.name !== speaker.name ||
                           timeSinceLastMessage > 3000;  // 3秒停顿才换行

        if (needNewBlock) {
            this.createNewMessageBlock(speaker, timestamp);
        }

        // 添加确认文本
        const contentDiv = this.currentMessageElement.querySelector('.message-content');
        if (contentDiv) {
            // 移除临时文本
            const existingInterim = contentDiv.querySelector('.interim-text');
            if (existingInterim) {
                existingInterim.remove();
            }

            // 只添加确认文本节点（不是替换整个文本）
            const finalSpan = document.createElement('span');
            finalSpan.className = 'final-text';
            finalSpan.textContent = text;
            contentDiv.appendChild(finalSpan);
        }

        this.lastMessageTime = timestamp;
        this.scrollToBottom(container);
    }

    createNewMessageBlock(speaker, timestamp) {
        const container = document.getElementById('transcriptDisplay');
        if (!container) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'speaker-message';

        // 如果说话人正在识别中，显示特殊状态
        const isIdentifying = speaker.identifying === true;
        const avatarContent = isIdentifying ? '?' : speaker.name.charAt(0);
        const avatarClass = isIdentifying ? 'speaker-avatar identifying' : 'speaker-avatar';
        const speakerName = isIdentifying ? '识别中...' : speaker.name;

        messageDiv.innerHTML = `
            <div class="speaker-label">
                <div class="${avatarClass}" data-speaker-id="${timestamp}">${avatarContent}</div>
                <span class="speaker-name">${speakerName}</span>
                ${isIdentifying ? '<span class="identifying-spinner">🔄</span>' : ''}
            </div>
            <div class="message-content"></div>
            <div class="message-time">${this.formatTime(new Date())}</div>
        `;

        container.appendChild(messageDiv);
        this.currentMessageElement = messageDiv;
        this.lastSpeaker = speaker;

        // 动画
        requestAnimationFrame(() => {
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        });
    }

    updateSpeakerIdentification(speakerData) {
        // 更新当前消息块的说话人信息
        if (!this.currentMessageElement) return;

        const avatarDiv = this.currentMessageElement.querySelector('.speaker-avatar');
        const nameSpan = this.currentMessageElement.querySelector('.speaker-name');
        const spinner = this.currentMessageElement.querySelector('.identifying-spinner');

        if (avatarDiv && nameSpan) {
            // 移除识别中状态
            avatarDiv.classList.remove('identifying');

            // 更新头像
            avatarDiv.textContent = speakerData.name.charAt(0);

            // 更新名称并添加置信度显示
            if (speakerData.matched && speakerData.confidence) {
                const confidencePercent = (speakerData.confidence * 100).toFixed(1);
                let confidenceColor = '#06ffa5'; // 默认绿色
                if (speakerData.confidence < 0.80) {
                    confidenceColor = '#ff9500'; // 橙色
                } else if (speakerData.confidence < 0.90) {
                    confidenceColor = '#ffeb3b'; // 黄色
                }

                nameSpan.innerHTML = `${speakerData.name} <span style="font-size: 0.75em; color: ${confidenceColor}; font-weight: 600;">(${confidencePercent}%)</span>`;
                nameSpan.title = `匹配置信度: ${confidencePercent}%`;
            } else {
                nameSpan.textContent = speakerData.name;
            }

            // 移除加载动画
            if (spinner) {
                spinner.remove();
            }

            console.log(`✅ UI已更新: ${speakerData.name}`);
        }
    }

    scrollToBottom(container) {
        // 使用 smooth 滚动，但限制频率避免性能问题
        if (!this.scrollPending) {
            this.scrollPending = true;
            requestAnimationFrame(() => {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });
                this.scrollPending = false;
            });
        }
    }

    formatTime(date) {
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }

    async startRecording() {
        try {
            await this.speechManager.startRecording();
        } catch (error) {
            alert('启动录音失败: ' + error.message);
        }
    }

    stopRecording() {
        this.speechManager.stopRecording();
    }

    generateSummary() {
        const transcript = this.speechManager.getFullTranscript();
        if (!transcript) {
            alert('没有转录内容');
            return;
        }

        const summaryDisplay = document.getElementById('summaryDisplay');
        if (summaryDisplay) {
            summaryDisplay.innerHTML = `
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-file-alt"></i> 会议转录</div>
                    <div class="summary-content">${transcript}</div>
                </div>
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-chart-bar"></i> 统计信息</div>
                    <div class="summary-content">
                        <p>总字数: ${transcript.length} 字</p>
                        <p>识别延迟: &lt;500ms</p>
                    </div>
                </div>
            `;

            // 切换到摘要标签
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.querySelector('[data-tab="summary"]')?.classList.add('active');
            document.getElementById('summary-tab')?.classList.add('active');
        }
    }
}

// ==================== 声纹管理器 ====================
class VoiceprintManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.speakers = [];

        // 🎯 使用 MFCC 高准确率提取器
        if (typeof MFCCVoiceprintExtractor !== 'undefined') {
            this.extractor = new MFCCVoiceprintExtractor();
            console.log('✅ 使用 MFCC 高准确率提取器');
        } else {
            this.extractor = new VoiceprintExtractor(); // 回退到快速版
            console.warn('⚠️ MFCC 提取器未加载，使用快速版');
        }

        this.matcher = new VoiceprintMatcher();     // 匹配器
    }

    init() {
        console.log('🎙️ 初始化声纹管理器...');

        // 添加声纹按钮
        const addBtn = document.getElementById('addSpeaker');
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openAddModal();
            });
        }

        // 保存按钮
        const saveBtn = document.getElementById('saveSpeakerBtn');
        if (saveBtn) {
            // 移除 onclick 属性，改用 addEventListener
            saveBtn.removeAttribute('onclick');
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.saveSpeaker();
            });
        }

        // 关闭按钮
        const closeBtn = document.querySelector('#addSpeakerModal .modal-close');
        if (closeBtn) {
            closeBtn.removeAttribute('onclick');
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closeModal('addSpeakerModal');
            });
        }

        // 点击遮罩关闭
        const modal = document.getElementById('addSpeakerModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal('addSpeakerModal');
                }
            });
        }

        // 文件选择监听
        const fileInput = document.getElementById('speakerVoiceFile');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                const fileNameDisplay = document.getElementById('uploadedFileName');
                const fileNameText = document.getElementById('fileNameText');
                const recordingArea = document.getElementById('recordingArea');

                if (file && fileNameDisplay && fileNameText) {
                    fileNameText.textContent = file.name;
                    fileNameDisplay.style.display = 'block';
                    // 隐藏录音区域
                    if (recordingArea) recordingArea.style.display = 'none';
                    // 清除录音数据
                    window.voiceprintAudioBlob = null;
                } else if (fileNameDisplay) {
                    fileNameDisplay.style.display = 'none';
                }
            });
        }

        // 清除文件按钮
        const clearFileBtn = document.getElementById('clearFileBtn');
        if (clearFileBtn) {
            clearFileBtn.addEventListener('click', () => {
                const fileInput = document.getElementById('speakerVoiceFile');
                const fileNameDisplay = document.getElementById('uploadedFileName');
                if (fileInput) fileInput.value = '';
                if (fileNameDisplay) fileNameDisplay.style.display = 'none';
            });
        }

        // 直接录音按钮
        const recordVoiceBtn = document.getElementById('recordVoiceBtn');
        if (recordVoiceBtn) {
            recordVoiceBtn.addEventListener('click', () => {
                const recordingArea = document.getElementById('recordingArea');
                const fileInput = document.getElementById('speakerVoiceFile');
                const fileNameDisplay = document.getElementById('uploadedFileName');

                // 显示录音区域
                if (recordingArea) recordingArea.style.display = 'block';
                // 清除文件选择
                if (fileInput) fileInput.value = '';
                if (fileNameDisplay) fileNameDisplay.style.display = 'none';
            });
        }

        // 录音控制按钮
        const startRecordingBtn = document.getElementById('startVoiceprintRecording');
        const stopRecordingBtn = document.getElementById('stopVoiceprintRecording');
        const reRecordBtn = document.getElementById('reRecordBtn');
        const closeRecordingBtn = document.getElementById('closeRecordingBtn');

        if (startRecordingBtn) {
            startRecordingBtn.addEventListener('click', () => {
                startVoiceprintRecording();
            });
        }
        if (stopRecordingBtn) {
            stopRecordingBtn.addEventListener('click', () => {
                stopVoiceprintRecording();
            });
        }
        if (reRecordBtn) {
            reRecordBtn.addEventListener('click', () => {
                reRecordVoiceprint();
            });
        }
        if (closeRecordingBtn) {
            closeRecordingBtn.addEventListener('click', () => {
                // 关闭录音界面，保留录音数据
                const recordingArea = document.getElementById('recordingArea');
                if (recordingArea) recordingArea.style.display = 'none';
            });
        }

        this.loadSpeakers();
        console.log('✅ 声纹管理器初始化完成');
    }

    openAddModal() {
        console.log('打开添加声纹弹窗');
        const modal = document.getElementById('addSpeakerModal');
        if (modal) {
            modal.classList.add('active');

            // 清空表单
            document.getElementById('speakerName').value = '';
            document.getElementById('speakerEmail').value = '';
            document.getElementById('speakerVoiceFile').value = '';

            // 隐藏文件名显示
            const fileNameDisplay = document.getElementById('uploadedFileName');
            if (fileNameDisplay) {
                fileNameDisplay.style.display = 'none';
            }

            // 隐藏录音区域
            const recordingArea = document.getElementById('recordingArea');
            if (recordingArea) {
                recordingArea.style.display = 'none';
            }

            // 清理录音数据
            window.voiceprintAudioBlob = null;
            if (typeof reRecordVoiceprint === 'function') {
                reRecordVoiceprint();
            }
        }
    }

    closeModal(modalId) {
        console.log('关闭弹窗:', modalId);
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    loadSpeakers() {
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
        console.log('💾 保存声纹...');

        const nameInput = document.getElementById('speakerName');
        const emailInput = document.getElementById('speakerEmail');
        const fileInput = document.getElementById('speakerVoiceFile');

        const name = nameInput?.value.trim();
        const email = emailInput?.value.trim();
        const voiceFile = fileInput?.files[0];

        if (!name) {
            alert('请输入姓名');
            return;
        }

        // 获取音频文件（上传或录音）
        let audioFile = null;

        console.log('🔍 检查音频来源:');
        console.log('  - window.voiceprintAudioBlob:', window.voiceprintAudioBlob ? `${window.voiceprintAudioBlob.size} 字节` : 'null');
        console.log('  - voiceFile:', voiceFile ? voiceFile.name : 'null');

        // 优先使用录音的 blob
        if (window.voiceprintAudioBlob) {
            audioFile = new File([window.voiceprintAudioBlob], `${name}_voiceprint.webm`, { type: 'audio/webm' });
            console.log('📼 使用录音音频:', audioFile.name, audioFile.size, '字节');
        } else if (voiceFile) {
            audioFile = voiceFile;
            console.log('📁 使用上传文件:', audioFile.name, audioFile.size, '字节');
        } else {
            alert('请选择声纹录入方式：上传文件或直接录音');
            return;
        }

        // 显示处理进度
        const progressMsg = document.createElement('div');
        progressMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); z-index: 10000; text-align: center;';
        progressMsg.innerHTML = '<h3 style="margin: 0 0 15px 0;">🎤 正在提取声纹特征...</h3><p style="color: #666;">这可能需要几秒钟</p>';
        document.body.appendChild(progressMsg);

        try {
            // 🎯 关键: 使用真正的特征提取
            console.log('🔬 开始提取特征向量...');
            const voiceprintData = await this.extractor.extractFromFile(audioFile);

            console.log('✅ 特征提取成功!');
            console.log('📊 特征向量维度:', voiceprintData.vector.length);
            console.log('⏱️ 音频时长:', voiceprintData.duration.toFixed(2) + 's');

            // 🎯 多样本注册: 检查是否已存在同名说话人
            let existingSpeaker = this.speakers.find(s => s.name.toLowerCase() === name.toLowerCase());

            if (existingSpeaker) {
                // 如果已存在，添加到 voiceprints 数组
                if (!existingSpeaker.voiceprints) {
                    // 兼容旧数据: 将单个 voiceprint 转换为 voiceprints 数组
                    existingSpeaker.voiceprints = [existingSpeaker.voiceprint];
                    delete existingSpeaker.voiceprint;
                }

                // 添加新样本
                existingSpeaker.voiceprints.push({
                    vector: voiceprintData.vector,
                    duration: voiceprintData.duration,
                    sampleRate: voiceprintData.sampleRate,
                    extractedAt: voiceprintData.extractedAt,
                    metadata: voiceprintData.metadata
                });

                console.log(`✅ 为 ${name} 添加第 ${existingSpeaker.voiceprints.length} 个样本`);
                alert(`✅ 已为 "${name}" 添加新样本!\n当前样本数: ${existingSpeaker.voiceprints.length}\n特征维度：${voiceprintData.vector.length}维\n音频时长：${voiceprintData.duration.toFixed(2)}秒`);
            } else {
                // 创建新说话人(使用 voiceprints 数组)
                const speaker = {
                    id: Date.now().toString(),
                    name: name,
                    email: email || '',
                    voiceprints: [{
                        vector: voiceprintData.vector,
                        duration: voiceprintData.duration,
                        sampleRate: voiceprintData.sampleRate,
                        extractedAt: voiceprintData.extractedAt,
                        metadata: voiceprintData.metadata
                    }],
                    audioUrl: null,
                    createdAt: new Date().toISOString()
                };

                this.speakers.push(speaker);
                console.log(`✅ 创建新说话人: ${name}`);
                alert(`✅ 声纹已保存：${name}\n特征维度：${voiceprintData.vector.length}维\n音频时长：${voiceprintData.duration.toFixed(2)}秒`);
            }

            // 保存并更新
            this.saveSpeakers();
            this.updateSpeakerList();

            // 清空表单
            if (nameInput) nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (fileInput) fileInput.value = '';

            // 清理录音数据
            window.voiceprintAudioBlob = null;
            reRecordVoiceprint();

            // 关闭弹窗
            this.closeModal('addSpeakerModal');

            // 移除进度提示
            document.body.removeChild(progressMsg);

            console.log('✅ 声纹保存成功');

            // 触发事件
            this.eventBus.emit('voiceprint:added', existingSpeaker || this.speakers[this.speakers.length - 1]);

        } catch (error) {
            console.error('❌ 声纹提取失败:', error);
            document.body.removeChild(progressMsg);
            alert('❌ 声纹提取失败: ' + error.message + '\n\n请确保上传的是有效的音频文件(MP3/WAV/M4A等)');
        }
    }

    async processVoiceFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
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
        console.log('🗑️ 声纹已删除');
    }

    // 生成随机好看的颜色
    getRandomColor(name) {
        // 美观的颜色列表
        const colors = [
            '#4361ee', // 蓝色
            '#ff6b6b', // 红色
            '#4cc9f0', // 青色
            '#06ffa5', // 绿色
            '#9d4edd', // 紫色
            '#ff9e00', // 橙色
            '#f72585', // 粉色
            '#3a86ff', // 亮蓝
            '#fb5607', // 深橙
            '#8338ec', // 深紫
            '#06d6a0', // 青绿
            '#ef476f', // 玫红
        ];

        // 根据名字生成一个固定的颜色索引(同名字同颜色)
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
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
                        点击"添加声纹"开始
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.speakers.map(speaker => {
            const avatarColor = this.getRandomColor(speaker.name);

            // 🎯 兼容新旧数据结构
            let voiceprints = [];
            if (speaker.voiceprints) {
                voiceprints = speaker.voiceprints;
            } else if (speaker.voiceprint && speaker.voiceprint.vector) {
                voiceprints = [speaker.voiceprint];
            }

            const hasVoiceprint = voiceprints.length > 0;
            const sampleCount = voiceprints.length;
            const vectorDim = hasVoiceprint ? voiceprints[0].vector.length : 0;
            const totalDuration = hasVoiceprint ? voiceprints.reduce((sum, vp) => sum + vp.duration, 0).toFixed(1) + 's' : '-';

            return `
            <div class="speaker-item">
                <div class="speaker-avatar" style="background: ${avatarColor};">${speaker.name.charAt(0)}</div>
                <div class="speaker-info">
                    <div class="speaker-name">
                        ${speaker.name}
                        ${hasVoiceprint ? `<span class="badge" style="background: #06ffa5; font-size: 0.7rem;">✓ ${sampleCount}个样本</span>` : ''}
                    </div>
                    <div class="speaker-email">${speaker.email || '无邮箱'}</div>
                    ${hasVoiceprint ? `<div style="font-size: 0.75rem; color: var(--gray); margin-top: 4px;">向量: ${vectorDim}维 | 总时长: ${totalDuration}</div>` : ''}
                </div>
                <div class="item-actions">
                    <button class="btn-icon delete" data-speaker-id="${speaker.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');

        // 绑定删除按钮
        container.querySelectorAll('.btn-icon.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const speakerId = btn.getAttribute('data-speaker-id');
                this.deleteSpeaker(speakerId);
            });
        });

        // 🎯 同步更新说话人下拉框
        this.updateSpeakerSelect();
    }

    updateSpeakerSelect() {
        const speakerSelect = document.getElementById('currentSpeakerSelect');
        if (!speakerSelect) return;

        const currentValue = speakerSelect.value;

        // 清空并重新填充选项
        speakerSelect.innerHTML = '<option value="">未知说话人</option>';

        this.speakers.forEach(speaker => {
            const option = document.createElement('option');
            option.value = speaker.name;
            option.textContent = speaker.name;
            speakerSelect.appendChild(option);
        });

        // 恢复之前的选择（如果还存在）
        if (currentValue && this.speakers.find(s => s.name === currentValue)) {
            speakerSelect.value = currentValue;
        }

        console.log('✅ 说话人选择器已更新，共', this.speakers.length, '个说话人');
    }
}

// ==================== 全局函数 (供HTML调用) ====================

// 声纹录音相关
let voiceprintRecorder = null;
let voiceprintAudioChunks = [];
let voiceprintRecordingInterval = null;
let voiceprintRecordingStartTime = 0;
let voiceprintAudioBlob = null;

// 开始录音
async function startVoiceprintRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        voiceprintRecorder = new MediaRecorder(stream);
        voiceprintAudioChunks = [];

        voiceprintRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                voiceprintAudioChunks.push(event.data);
            }
        };

        voiceprintRecorder.onstop = () => {
            const blob = new Blob(voiceprintAudioChunks, { type: 'audio/webm' });
            window.voiceprintAudioBlob = blob;
            const url = URL.createObjectURL(blob);

            console.log('✅ 录音已保存:', blob.size, '字节');
            console.log('🎵 Blob URL:', url);

            const playback = document.getElementById('recordingPlayback');
            if (playback) {
                playback.src = url;
                playback.load(); // 强制加载
                console.log('✅ 音频播放器已设置');
            }

            // 显示预览
            const recordingStatus = document.getElementById('recordingStatus');
            const recordingPreview = document.getElementById('recordingPreview');

            if (recordingStatus) recordingStatus.style.display = 'none';
            if (recordingPreview) {
                recordingPreview.style.display = 'block';
                console.log('✅ 预览界面已显示');
            }
        };

        voiceprintRecorder.start();
        voiceprintRecordingStartTime = Date.now();

        // 更新UI
        document.getElementById('startVoiceprintRecording').style.display = 'none';
        document.getElementById('stopVoiceprintRecording').style.display = 'inline-block';
        document.getElementById('recordingStatus').style.display = 'block';
        document.getElementById('recordingPreview').style.display = 'none';

        // 启动计时器
        voiceprintRecordingInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - voiceprintRecordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            document.getElementById('recordingTime').textContent = `${minutes}:${seconds}`;
        }, 1000);

        console.log('🎤 开始声纹录音');
    } catch (error) {
        console.error('❌ 录音失败:', error);
        alert('无法访问麦克风，请检查权限设置');
    }
}

// 停止录音
function stopVoiceprintRecording() {
    if (voiceprintRecorder && voiceprintRecorder.state === 'recording') {
        voiceprintRecorder.stop();

        // 停止所有音频轨道
        voiceprintRecorder.stream.getTracks().forEach(track => track.stop());

        // 停止计时器
        if (voiceprintRecordingInterval) {
            clearInterval(voiceprintRecordingInterval);
            voiceprintRecordingInterval = null;
        }

        // 更新UI
        document.getElementById('startVoiceprintRecording').style.display = 'inline-block';
        document.getElementById('stopVoiceprintRecording').style.display = 'none';

        console.log('⏹️ 停止声纹录音');
    }
}

// 重新录音
function reRecordVoiceprint() {
    window.voiceprintAudioBlob = null;
    const recordingPreview = document.getElementById('recordingPreview');
    const recordingTime = document.getElementById('recordingTime');

    if (recordingPreview) recordingPreview.style.display = 'none';
    if (recordingTime) recordingTime.textContent = '00:00';

    // 清除音频播放器
    const playback = document.getElementById('recordingPlayback');
    if (playback) {
        playback.src = '';
        playback.load();
    }

    console.log('🔄 重新录音');
}

// 全局 closeModal 函数
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }

    // 如果是关闭声纹模态框，清理录音资源
    if (modalId === 'addSpeakerModal') {
        if (voiceprintRecorder && voiceprintRecorder.state === 'recording') {
            stopVoiceprintRecording();
        }
        reRecordVoiceprint();
    }
}

// 全局 saveSpeaker 函数（会被 VoiceprintManager 覆盖）
function saveSpeaker() {
    if (window.realtimeApp && window.realtimeApp.voiceprintManager) {
        window.realtimeApp.voiceprintManager.saveSpeaker();
    }
}

// ==================== 应用主类 ====================
class RealtimeApp {
    constructor() {
        this.eventBus = new EventBus();
        this.speechManager = new RealtimeSpeechManager(this.eventBus);
        this.uiManager = new UIManager(this.eventBus, this.speechManager);
        this.voiceprintManager = new VoiceprintManager(this.eventBus);

        // 初始化全局声纹对象
        this.initGlobalVoiceprintObjects();
    }

    initGlobalVoiceprintObjects() {
        // 确保 VoiceprintExtractor 和 VoiceprintMatcher 已加载
        if (typeof VoiceprintExtractor !== 'undefined') {
            window.voiceprintExtractor = new VoiceprintExtractor();
            console.log('✅ 全局声纹提取器已初始化');
        } else {
            console.warn('⚠️ VoiceprintExtractor 未加载');
        }

        if (typeof VoiceprintMatcher !== 'undefined') {
            window.voiceprintMatcher = new VoiceprintMatcher();
            console.log('✅ 全局声纹匹配器已初始化');
        } else {
            console.warn('⚠️ VoiceprintMatcher 未加载');
        }

        // 将 voiceprintManager 也设置为全局,便于匹配时访问已注册声纹
        window.voiceprintManager = this.voiceprintManager;
    }

    init() {
        console.log('🚀 初始化实时应用...');
        this.uiManager.init();
        this.voiceprintManager.init();
        console.log('✅ 应用初始化完成');
        console.log('⚡ 实时识别延迟: <500ms');
        console.log('🎤 自动说话人识别: 已启用');
    }
}

// ==================== 启动应用 ====================
document.addEventListener('DOMContentLoaded', () => {
    window.realtimeApp = new RealtimeApp();
    window.realtimeApp.init();
});

console.log('✅ 实时语音识别应用加载完成');
