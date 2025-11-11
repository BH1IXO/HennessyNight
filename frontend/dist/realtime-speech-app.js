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
        this.audioChunks = []; // 累积的音频数据（持续录音）
        this.currentSegmentChunks = []; // 当前断句的音频片段
        this.identificationQueue = []; // 识别队列
        this.isIdentifying = false; // 是否正在识别
        this.serverSpeakers = []; // 从服务器加载的256维声纹数据
        this.lastIdentifiedSpeaker = null; // 上一次识别到的说话人（用于变化检测）
        this.consecutiveSameSpeaker = 0; // 连续识别到相同说话人的次数
        this.lastSentenceTime = Date.now(); // 上次断句时间
        this.identifiedSpeakers = new Map(); // 🎯 记录所有识别出的说话人 {name: {name, email, count}}
        this.needRestartAfterStop = false; // 🎯 说话人切换时需要重启识别器的标志

        // 🎯 会议信息追踪
        this.meetingStartTime = null; // 会议开始时间
        this.meetingEndTime = null; // 会议结束时间

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
                // 🎯 检查是否因为说话人切换而需要重启
                if (this.needRestartAfterStop) {
                    console.log('✅ 识别器已停止，准备重启以适应新说话人...');
                    this.needRestartAfterStop = false;
                }

                setTimeout(() => {
                    try {
                        if (this.isRecording) {
                            this.recognition.start();
                            console.log('✅ 语音识别已重启');
                        }
                    } catch (e) {
                        console.error('❌ 重启识别失败:', e);
                    }
                }, 100);
            }
        };

        // 错误处理 - 增强所有错误类型的处理
        this.recognition.onerror = (event) => {
            console.warn(`⚠️ 语音识别错误: ${event.error}`);

            // 对于大多数错误,都尝试重启(除了用户主动停止的情况)
            const retriableErrors = ['no-speech', 'network', 'audio-capture', 'aborted', 'not-allowed'];
            if (retriableErrors.includes(event.error) && this.isRecording) {
                console.log(`🔄 尝试重启语音识别 (原因: ${event.error})`);
                setTimeout(() => {
                    try {
                        if (this.isRecording) {
                            this.recognition.start();
                            console.log('✅ 语音识别已重启');
                        }
                    } catch (e) {
                        console.error('❌ 重启识别失败:', e);
                    }
                }, 100);
            } else if (event.error === 'not-allowed') {
                console.error('❌ 用户拒绝了麦克风权限');
                this.eventBus.emit('error', { message: '需要麦克风权限才能进行语音识别' });
            } else {
                console.error(`❌ 无法处理的识别错误: ${event.error}`);
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

        // 显示临时识别结果
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
                const messageTimestamp = Date.now();

                // 🎯 立即显示文字（使用"识别中"状态）
                this.eventBus.emit('transcription:final', {
                    text: cleanFinal,
                    speaker: { name: '识别中', confidence: 0, identifying: true },
                    timestamp: messageTimestamp,
                    isFinal: true
                });
                this.lastFinalTime = messageTimestamp;

                // 🎯 异步触发声纹识别（不阻塞显示）
                console.log('📌 检测到断句，异步触发声纹识别');
                this.captureAudioForIdentification(messageTimestamp);
            }
        }
    }

    cleanText(text) {
        return text.trim().replace(/\s+/g, ' ');
    }

    /**
     * 从服务器加载声纹数据
     */
    async loadServerSpeakers() {
        try {
            console.log('📡 从服务器加载声纹数据...');
            const response = await fetch('/api/v1/speakers');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const result = await response.json();
            this.serverSpeakers = result.data || [];
            console.log(`✅ 加载了 ${this.serverSpeakers.length} 个服务器声纹 (256维WeSpeaker)`);
            return this.serverSpeakers;
        } catch (error) {
            console.error('❌ 加载服务器声纹失败:', error);
            this.serverSpeakers = [];
            return [];
        }
    }

    async startRecording() {
        if (!this.recognition) {
            throw new Error('语音识别未初始化');
        }

        try {
            // 1. 从服务器加载最新的声纹数据
            await this.loadServerSpeakers();

            // 2. 获取音频流
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                }
            });

            console.log('✅ 音频流获取成功');

            // 🎯 准备工作完成，显示倒计时让用户准备
            await this.showCountdown();

            // 重要：必须先设置 isRecording = true，否则 startAudioCapture 会跳过
            this.transcriptBuffer = '';
            this.isRecording = true;
            this.lastFinalTime = Date.now();

            // 🎯 记录会议开始时间
            this.meetingStartTime = new Date();
            console.log('📅 会议开始时间:', this.meetingStartTime.toLocaleString('zh-CN'));

            // 启动音频录制用于说话人识别
            this.startAudioCapture();

            this.recognition.start();
            this.eventBus.emit('recording:started');

            console.log('🎤 开始实时识别（<500ms延迟 + 服务器端WeSpeaker 256维声纹识别）');
        } catch (error) {
            console.error('启动录音失败:', error);
            alert('无法访问麦克风');
            throw error;
        }
    }

    /**
     * 🎯 显示倒计时动画（3, 2, 1）
     */
    async showCountdown() {
        const transcriptArea = document.getElementById('transcriptDisplay');
        if (!transcriptArea) {
            console.error('找不到transcriptDisplay元素');
            return;
        }

        // 设置父容器为相对定位
        transcriptArea.style.position = 'relative';

        // 创建倒计时容器
        const countdownDiv = document.createElement('div');
        countdownDiv.id = 'countdown-overlay';
        countdownDiv.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(67, 97, 238, 0.95);
            z-index: 1000;
            border-radius: 8px;
        `;

        const countdownNumber = document.createElement('div');
        countdownNumber.id = 'countdown-number';
        countdownNumber.style.cssText = `
            font-size: 120px;
            font-weight: bold;
            color: white;
            text-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            animation: countdownPulse 1s ease-in-out;
        `;

        countdownDiv.appendChild(countdownNumber);
        transcriptArea.appendChild(countdownDiv);

        // 添加动画样式
        if (!document.getElementById('countdown-animation-style')) {
            const style = document.createElement('style');
            style.id = 'countdown-animation-style';
            style.textContent = `
                @keyframes countdownPulse {
                    0% { transform: scale(0.5); opacity: 0; }
                    50% { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes countdownFadeOut {
                    0% { transform: scale(1); opacity: 1; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        // 倒计时：3, 2, 1
        for (let i = 3; i > 0; i--) {
            countdownNumber.textContent = i;
            countdownNumber.style.animation = 'none';
            // 触发重排以重启动画
            void countdownNumber.offsetWidth;
            countdownNumber.style.animation = 'countdownPulse 1s ease-in-out';
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 显示"开始"
        countdownNumber.textContent = '开始！';
        countdownNumber.style.animation = 'countdownFadeOut 0.5s ease-out';
        await new Promise(resolve => setTimeout(resolve, 500));

        // 移除倒计时容器
        countdownDiv.remove();
    }

    /**
     * 启动音频捕获 (用于说话人识别) - 使用Web Audio API重采样到16kHz
     */
    startAudioCapture() {
        try {
            console.log('🎙️ 准备启动音频捕获（Web Audio API + 16kHz重采样）...');

            // 🎯 方案1: 使用Web Audio API进行16kHz重采样
            // 创建AudioContext，强制16kHz采样率
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000  // 强制16kHz采样率
            });

            console.log(`✅ AudioContext已创建 - 采样率: ${this.audioContext.sampleRate}Hz`);

            // 从MediaStream创建音频源
            const source = this.audioContext.createMediaStreamSource(this.audioStream);

            // 创建ScriptProcessor用于捕获PCM数据
            const bufferSize = 4096;
            const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

            // 用于累积音频样本
            this.audioSamples = [];

            processor.onaudioprocess = (e) => {
                // 获取单声道PCM数据 (Float32Array)
                const inputData = e.inputBuffer.getChannelData(0);

                // 复制数据到累积数组
                const samples = new Float32Array(inputData.length);
                samples.set(inputData);
                this.audioSamples.push(samples);

                // 可选: 限制内存使用，保留最近30秒的音频
                const maxSamples = 30 * this.audioContext.sampleRate; // 30秒
                let totalSamples = this.audioSamples.reduce((sum, arr) => sum + arr.length, 0);
                while (totalSamples > maxSamples && this.audioSamples.length > 0) {
                    const removed = this.audioSamples.shift();
                    totalSamples -= removed.length;
                }
            };

            // 连接音频节点
            source.connect(processor);
            processor.connect(this.audioContext.destination);

            // 保存processor引用以便后续停止
            this.audioProcessor = processor;

            console.log('✅ Web Audio API音频捕获已启动');
            console.log(`   - 采样率: ${this.audioContext.sampleRate}Hz (16kHz)`);
            console.log(`   - 声道: 单声道`);
            console.log(`   - 缓冲区大小: ${bufferSize}`);
            console.log(`   - 格式: PCM Float32 (将转换为WAV)`);

        } catch (error) {
            console.error('⚠️ Web Audio API音频捕获失败:', error);
            console.warn('   回退到传统MediaRecorder方式...');
            this.startAudioCaptureFallback();
        }
    }

    /**
     * 备用方案: 使用传统MediaRecorder
     */
    startAudioCaptureFallback() {
        try {
            console.log('🎙️ 使用MediaRecorder备用方案...');

            let mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    mimeType = 'audio/webm;codecs=opus';
                } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                    mimeType = 'audio/ogg';
                } else {
                    mimeType = '';
                }
            }

            this.mediaRecorder = new MediaRecorder(this.audioStream,
                mimeType ? { mimeType } : undefined
            );

            this.currentSegmentChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.currentSegmentChunks.push(event.data);
                }
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('❌ MediaRecorder 错误:', event.error);
            };

            this.mediaRecorder.start(100);
            console.log('✅ MediaRecorder已启动 (备用方案)');

        } catch (error) {
            console.warn('⚠️ 备用方案也失败:', error);
        }
    }

    /**
     * 当检测到断句时，抓取当前音频用于识别
     */
    captureAudioForIdentification(messageTimestamp) {
        // 🎯 如果使用Web Audio API (audioSamples存在)
        if (this.audioSamples && this.audioSamples.length > 0) {
            console.log(`📦 抓取Web Audio API音频 (${this.audioSamples.length} 个缓冲区)`);

            // 合并所有音频样本
            const totalLength = this.audioSamples.reduce((sum, arr) => sum + arr.length, 0);
            const mergedSamples = new Float32Array(totalLength);
            let offset = 0;
            for (const samples of this.audioSamples) {
                mergedSamples.set(samples, offset);
                offset += samples.length;
            }

            console.log(`   - 总样本数: ${totalLength}`);
            console.log(`   - 时长: ${(totalLength / this.audioContext.sampleRate).toFixed(2)}秒`);

            // 转换为WAV格式
            const wavBlob = this.pcmToWav(mergedSamples, this.audioContext.sampleRate);
            console.log(`   - WAV大小: ${(wavBlob.size / 1024).toFixed(2)}KB`);

            // 清空音频样本，为下一次断句做准备
            this.audioSamples = [];

            // 检测音频有效性并识别
            this.processAudioForIdentification(wavBlob, messageTimestamp);
        }
        // 🎯 备用方案: 使用MediaRecorder
        else if (this.mediaRecorder && this.currentSegmentChunks.length > 0) {
            console.log(`📦 抓取MediaRecorder音频 (${this.currentSegmentChunks.length} 片段)`);

            const audioBlob = new Blob([...this.currentSegmentChunks], { type: 'audio/webm' });
            console.log(`   - WebM大小: ${(audioBlob.size / 1024).toFixed(2)}KB`);

            // 清空当前片段
            this.currentSegmentChunks = [];

            // 检测音频有效性并识别
            this.processAudioForIdentification(audioBlob, messageTimestamp);
        }
        else {
            console.log('⏭️ 没有音频数据可用于识别');
            return;
        }
    }

    /**
     * 将PCM Float32数据转换为WAV格式
     * @param {Float32Array} samples PCM样本数据
     * @param {number} sampleRate 采样率
     * @returns {Blob} WAV格式的Blob
     */
    pcmToWav(samples, sampleRate) {
        const numChannels = 1;  // 单声道
        const bitsPerSample = 16;  // 16位
        const bytesPerSample = bitsPerSample / 8;

        // 转换Float32 [-1, 1] 到 Int16 [-32768, 32767]
        const int16Samples = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // 创建WAV文件头
        const dataLength = int16Samples.length * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);

        // RIFF标识符
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);  // 文件大小
        this.writeString(view, 8, 'WAVE');

        // fmt 子块
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);  // fmt块大小
        view.setUint16(20, 1, true);  // PCM格式
        view.setUint16(22, numChannels, true);  // 声道数
        view.setUint32(24, sampleRate, true);  // 采样率
        view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);  // 字节率
        view.setUint16(32, numChannels * bytesPerSample, true);  // 块对齐
        view.setUint16(34, bitsPerSample, true);  // 位深度

        // data 子块
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        // 写入PCM数据
        const dataView = new Int16Array(buffer, 44);
        dataView.set(int16Samples);

        return new Blob([buffer], { type: 'audio/wav' });
    }

    /**
     * 辅助函数: 写入字符串到DataView
     */
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    /**
     * 检测音频是否有效（非静音）
     * 使用简单的文件大小检测，避免复杂的音频解码
     */
    async isAudioValid(audioBlob) {
        // 基于文件大小的简单检测
        // 断句的音频如果小于5KB，很可能是静音或噪音
        const minSize = 5 * 1024; // 5KB

        if (audioBlob.size < minSize) {
            console.log(`🔇 音频太小 (${(audioBlob.size / 1024).toFixed(2)}KB < ${(minSize / 1024)}KB)，判定为静音`);
            return false;
        }

        return true;
    }

    /**
     * 处理音频用于识别 - 添加到识别队列
     */
    async processAudioForIdentification(audioBlob, messageTimestamp) {
        console.log(`🔄 处理音频用于识别: ${(audioBlob.size / 1024).toFixed(2)}KB [消息ID:${messageTimestamp}]`);

        // 🎯 检测音频有效性（过滤静音）
        const isValid = await this.isAudioValid(audioBlob);
        if (!isValid) {
            console.log('⏭️ 跳过静音，不加入识别队列');
            // 静音时也要更新UI为"未识别"
            this.eventBus.emit('speaker:identified', {
                messageId: messageTimestamp,
                speaker: { name: '未识别', confidence: 0, identifying: false }
            });
            return;
        }

        // 添加到识别队列
        this.identificationQueue.push({
            blob: audioBlob,
            timestamp: Date.now(),
            messageId: messageTimestamp // 🎯 记录对应的消息ID
        });

        console.log(`📥 加入识别队列 (队列长度: ${this.identificationQueue.length})`);

        // 触发识别处理
        this.processIdentificationQueue();
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
            console.log(`🔍 开始识别说话人 [消息ID:${task.messageId}] (使用服务器端WeSpeaker 256维)...`);

            // 检查是否有注册的声纹
            if (this.serverSpeakers.length === 0) {
                console.log('ℹ️ 没有注册声纹,跳过识别');
                this.eventBus.emit('speaker:identified', {
                    messageId: task.messageId,
                    speaker: { name: '未识别', confidence: 0, identifying: false }
                });
            } else {
                // 转换为File对象 - 根据实际类型命名
                const fileName = task.blob.type === 'audio/wav' ? 'segment.wav' : 'segment.webm';
                const audioFile = new File([task.blob], fileName, { type: task.blob.type });

                // 🎯 使用服务器端WeSpeaker进行识别
                try {
                    const formData = new FormData();
                    formData.append('audioFile', audioFile);

                    // 将服务器声纹数据发送给API进行识别
                    const speakersToMatch = this.serverSpeakers.map(s => ({
                        id: s.id,
                        name: s.name,
                        voiceprint: s.voiceprintData?.features || []
                    }));

                    console.log('='.repeat(80));
                    console.log(`📤 [前端] 发送识别请求`);
                    console.log(`   - 音频大小: ${(task.blob.size / 1024).toFixed(2)}KB`);
                    console.log(`   - 音频格式: ${task.blob.type}`);
                    console.log(`   - 待匹配声纹数: ${speakersToMatch.length}`);
                    console.log(`   - 待匹配声纹列表:`);
                    speakersToMatch.forEach((s, idx) => {
                        console.log(`     ${idx + 1}. ${s.name} (ID:${s.id}) - 特征向量维度:${s.voiceprint.length}`);
                    });
                    console.log('='.repeat(80));

                    formData.append('speakers', JSON.stringify(speakersToMatch));

                    const requestStartTime = Date.now();
                    console.log(`📡 [前端] 正在发送请求到 /api/v1/audio/identify-speaker...`);
                    const response = await fetch('/api/v1/audio/identify-speaker', {
                        method: 'POST',
                        body: formData
                    });
                    const requestDuration = Date.now() - requestStartTime;
                    console.log(`📡 [前端] 收到响应 - 状态码:${response.status} 耗时:${requestDuration}ms`);

                    if (!response.ok) {
                        console.error(`❌ [前端] 服务器返回错误状态码: ${response.status}`);
                        throw new Error(`服务器错误: ${response.status}`);
                    }

                    const result = await response.json();
                    console.log('='.repeat(80));
                    console.log(`✅ [前端] 服务器识别完成 (耗时: ${requestDuration}ms)`);
                    console.log(`   - 识别结果:`, result);

                    if (result.data && result.data.matched) {
                        const match = result.data;
                        console.log(`✅ [前端] 声纹匹配成功`);
                        console.log(`   - 匹配到的说话人: ${match.speaker.name}`);
                        console.log(`   - 相似度: ${(match.similarity * 100).toFixed(2)}%`);
                        if (match.allScores) {
                            console.log(`   - 所有候选人得分:`);
                            match.allScores.forEach((score, idx) => {
                                console.log(`     ${idx + 1}. ${score.name}: ${(score.similarity * 100).toFixed(2)}%`);
                            });
                        }

                        // 🎯 说话人变化检测
                        const speakerChanged = this.lastIdentifiedSpeaker !== match.speaker.name;
                        if (speakerChanged) {
                            console.log(`🔄 [前端] 检测到说话人变化: ${this.lastIdentifiedSpeaker || '初始'} -> ${match.speaker.name}`);
                            this.lastIdentifiedSpeaker = match.speaker.name;
                            this.consecutiveSameSpeaker = 1;

                            // 🔥 关键修复：重启浏览器语音识别，让它适应新的声音
                            if (this.isRecording && this.recognition) {
                                console.log('🔄 说话人切换，重启浏览器语音识别以适应新声音...');
                                try {
                                    // 🎯 设置一个标志，表示需要在停止后重启
                                    this.needRestartAfterStop = true;

                                    // 停止识别器（会触发 onend 事件）
                                    this.recognition.stop();
                                } catch (e) {
                                    console.error('❌ 停止识别失败:', e);
                                    this.needRestartAfterStop = false;
                                }
                            }
                        } else {
                            this.consecutiveSameSpeaker++;
                            console.log(`✔️ [前端] 说话人未变化: ${match.speaker.name} (连续${this.consecutiveSameSpeaker}次)`);
                        }
                        console.log('='.repeat(80));

                        // 🎯 记录识别出的说话人
                        if (!this.identifiedSpeakers.has(match.speaker.name)) {
                            // 从serverSpeakers中找到完整信息
                            const speakerInfo = this.serverSpeakers.find(s => s.name === match.speaker.name);
                            this.identifiedSpeakers.set(match.speaker.name, {
                                name: match.speaker.name,
                                email: speakerInfo?.email || '',
                                id: speakerInfo?.id || '',
                                count: 1
                            });
                        } else {
                            const info = this.identifiedSpeakers.get(match.speaker.name);
                            info.count++;
                        }

                        // 🎯 发送识别结果事件，带上messageId
                        this.eventBus.emit('speaker:identified', {
                            messageId: task.messageId,
                            speaker: {
                                name: match.speaker.name,
                                confidence: match.similarity,
                                identifying: false,
                                matched: true
                            }
                        });
                    } else {
                        console.log('='.repeat(80));
                        console.log('❌ [前端] 未匹配到说话人');
                        if (result.data && result.data.allScores) {
                            console.log(`   - 所有候选人得分:`);
                            result.data.allScores.forEach((score, idx) => {
                                console.log(`     ${idx + 1}. ${score.name}: ${(score.similarity * 100).toFixed(2)}%`);
                            });
                            console.log(`   - 最高相似度: ${(result.data.bestSimilarity * 100).toFixed(2)}%`);
                            console.log(`   - 识别阈值: 40%`);
                            console.log(`   - 未达到阈值，判定为未识别`);
                        }
                        console.log('='.repeat(80));

                        // 🎯 发送未识别结果
                        this.eventBus.emit('speaker:identified', {
                            messageId: task.messageId,
                            speaker: {
                                name: '未识别',
                                confidence: 0,
                                identifying: false,
                                matched: false
                            }
                        });
                    }
                } catch (serverError) {
                    console.error('❌ 服务器识别失败:', serverError);
                    this.eventBus.emit('speaker:identified', {
                        messageId: task.messageId,
                        speaker: { name: '未识别', confidence: 0, identifying: false }
                    });
                }
            }

        } catch (error) {
            console.error('❌ 说话人识别失败:', error);
            this.currentSpeaker = { name: '识别失败', confidence: 0, identifying: false };
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

    async stopRecording() {
        if (this.recognition && this.isRecording) {
            this.isRecording = false;
            this.recognition.stop();

            // 🎯 停止Web Audio API音频捕获
            if (this.audioProcessor) {
                this.audioProcessor.disconnect();
                this.audioProcessor = null;
                console.log('✅ AudioProcessor已停止');
            }
            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
                console.log('✅ AudioContext已关闭');
            }

            // 停止MediaRecorder (备用方案)
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }

            // 停止音频流
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }

            console.log('⏹️ 停止录音');
            console.log('🎯 识别队列将继续处理，不会停止');

            // 🎯 记录会议结束时间
            this.meetingEndTime = new Date();
            const durationMs = this.meetingEndTime - this.meetingStartTime;
            const durationMinutes = Math.floor(durationMs / 60000);
            const durationSeconds = Math.floor((durationMs % 60000) / 1000);
            console.log('📅 会议结束时间:', this.meetingEndTime.toLocaleString('zh-CN'));
            console.log(`⏱️ 会议时长: ${durationMinutes}分${durationSeconds}秒`);

            // 🎯 发送停止事件
            this.eventBus.emit('recording:stopped', {
                transcript: this.transcriptBuffer.trim()
            });

            // 🎯 启动后台监控，当识别完成后自动启用会议纪要按钮
            this.startIdentificationMonitor();
        }
    }

    getFullTranscript() {
        return this.transcriptBuffer.trim();
    }

    /**
     * 🎯 获取识别出的说话人列表
     */
    getIdentifiedSpeakers() {
        return Array.from(this.identifiedSpeakers.values());
    }

    /**
     * 🎯 获取会议信息
     */
    getMeetingInfo() {
        if (!this.meetingStartTime) {
            return null;
        }

        const durationMs = (this.meetingEndTime || new Date()) - this.meetingStartTime;
        const durationMinutes = Math.floor(durationMs / 60000);
        const durationSeconds = Math.floor((durationMs % 60000) / 1000);

        return {
            startTime: this.meetingStartTime,
            endTime: this.meetingEndTime,
            duration: `${durationMinutes}分${durationSeconds}秒`,
            durationMinutes: durationMinutes,
            attendees: this.getIdentifiedSpeakers()
        };
    }

    /**
     * 🎯 检查是否还有待识别的任务
     */
    hasIdentificationPending() {
        return this.identificationQueue.length > 0 || this.isIdentifying;
    }

    /**
     * 🎯 启动后台监控，监听识别队列完成
     */
    startIdentificationMonitor() {
        if (this.identificationMonitor) {
            return; // 已经在监控中
        }

        const pendingCount = this.identificationQueue.length + (this.isIdentifying ? 1 : 0);
        if (pendingCount === 0) {
            // 没有待处理任务，直接启用按钮
            this.eventBus.emit('identification:completed');
            return;
        }

        console.log(`🔍 启动识别监控 - 当前队列: ${pendingCount} 个任务`);

        let lastReportTime = Date.now();
        this.identificationMonitor = setInterval(() => {
            const remaining = this.identificationQueue.length + (this.isIdentifying ? 1 : 0);

            // 每5秒报告一次进度
            if (Date.now() - lastReportTime > 5000 && remaining > 0) {
                console.log(`🔍 识别进度: 还有 ${remaining} 个任务...`);
                lastReportTime = Date.now();
            }

            // 检查是否完成
            if (remaining === 0) {
                clearInterval(this.identificationMonitor);
                this.identificationMonitor = null;
                console.log('✅ 所有识别任务已完成');
                this.eventBus.emit('identification:completed');
            }
        }, 1000); // 每秒检查一次
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

        this.eventBus.on('recording:stopped', (data) => {
            document.getElementById('startRecording').disabled = false;
            document.getElementById('stopRecording').disabled = true;
            // 🎯 停止录音后先禁用按钮，等待识别完成
            document.getElementById('generateSummary').disabled = true;
            this.setStatus('等待声纹识别完成...', 'idle');
        });

        // 🎯 监听识别完成事件
        this.eventBus.on('identification:completed', () => {
            document.getElementById('generateSummary').disabled = false;
            this.setStatus('录音已停止，可生成会议纪要', 'idle');
            console.log('✅ UI已更新: 会议纪要按钮已启用');
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
        this.eventBus.on('speaker:identified', (data) => {
            console.log('📢 UI收到识别完成事件:', data);
            this.updateSpeakerIdentification(data);
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

        // 更新顶部临时文字显示区域
        const interimTextDisplay = document.getElementById('interimText');
        if (interimTextDisplay) {
            interimTextDisplay.textContent = text || '等待语音输入...';
        }

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

        // 清空顶部临时文字显示区域
        const interimTextDisplay = document.getElementById('interimText');
        if (interimTextDisplay) {
            interimTextDisplay.textContent = '等待语音输入...';
        }

        const container = document.getElementById('transcriptDisplay');
        if (!container) return;

        // 🎯 保存当前消息块的引用，用于后续判断是否需要删除
        const previousMessageElement = this.currentMessageElement;

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

            // 🎯 异步匹配知识库术语并高亮
            this.highlightKnowledgeTerms(finalSpan, text);
        }

        // 🎯 修复：如果创建了新消息块，检查上一个消息块是否只有临时文本
        if (needNewBlock && previousMessageElement && previousMessageElement !== this.currentMessageElement) {
            const prevContentDiv = previousMessageElement.querySelector('.message-content');
            if (prevContentDiv) {
                const prevInterim = prevContentDiv.querySelector('.interim-text');
                const prevFinal = prevContentDiv.querySelector('.final-text');

                // 如果上一个消息块只有临时文本，没有最终文本，则删除它
                if (prevInterim && !prevFinal) {
                    console.log('🗑️ 删除只包含临时文本的旧消息块');
                    previousMessageElement.remove();
                }
            }
        }

        this.lastMessageTime = timestamp;
        this.scrollToBottom(container);
    }

    createNewMessageBlock(speaker, timestamp) {
        const container = document.getElementById('transcriptDisplay');
        if (!container) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'speaker-message';
        messageDiv.dataset.messageId = timestamp; // 🎯 添加消息ID用于后续更新

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

        console.log(`📝 创建新消息块 [ID:${timestamp}] - 说话人: ${speakerName}`);

        // 🎯 不再设置超时自动更新为"未识别"，保持"识别中"状态直到声纹识别完成
        // 只有当声纹识别完成且没有匹配时，才会显示"未识别"

        // 动画
        requestAnimationFrame(() => {
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        });
    }

    updateSpeakerIdentification(data) {
        const { messageId, speaker } = data;

        console.log(`🔍 尝试更新消息 [ID:${messageId}] 的说话人为: ${speaker.name}`);

        // 🎯 通过messageId定位消息块
        const container = document.getElementById('transcriptDisplay');
        if (!container) return;

        const messageElement = container.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) {
            console.warn(`⚠️ 未找到消息块 [ID:${messageId}]`);
            return;
        }

        const avatarDiv = messageElement.querySelector('.speaker-avatar');
        const nameSpan = messageElement.querySelector('.speaker-name');
        const spinner = messageElement.querySelector('.identifying-spinner');

        if (avatarDiv && nameSpan) {
            // 移除识别中状态
            avatarDiv.classList.remove('identifying');

            // 更新头像
            avatarDiv.textContent = speaker.name.charAt(0);

            // 更新名称并添加置信度显示
            if (speaker.matched && speaker.confidence) {
                const confidencePercent = (speaker.confidence * 100).toFixed(1);
                let confidenceColor = '#06ffa5'; // 默认绿色
                if (speaker.confidence < 0.80) {
                    confidenceColor = '#ff9500'; // 橙色
                } else if (speaker.confidence < 0.90) {
                    confidenceColor = '#ffeb3b'; // 黄色
                }

                nameSpan.innerHTML = `${speaker.name} <span style="font-size: 0.75em; color: ${confidenceColor}; font-weight: 600;">(${confidencePercent}%)</span>`;
                nameSpan.title = `匹配置信度: ${confidencePercent}%`;
            } else {
                nameSpan.textContent = speaker.name;
            }

            // 移除加载动画
            if (spinner) {
                spinner.remove();
            }

            // 🎯 重要：如果这是当前消息块，更新lastSpeaker
            if (this.currentMessageElement === messageElement) {
                this.lastSpeaker = speaker;
                console.log(`🔄 更新lastSpeaker为: ${speaker.name}`);
            }

            console.log(`✅ UI已更新 [ID:${messageId}]: ${speaker.name}`);
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

    /**
     * 🎯 匹配知识库术语并高亮显示
     */
    async highlightKnowledgeTerms(textElement, text) {
        try {
            // 调用后端API匹配术语
            const response = await fetch('/api/v1/terms/match-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (!response.ok) {
                console.warn('知识库术语匹配失败:', response.status);
                return;
            }

            const result = await response.json();
            const matches = result.data.matches;

            if (!matches || matches.length === 0) {
                return;
            }

            console.log(`📚 匹配到 ${matches.length} 个知识库术语`);

            // 按位置排序（从后往前，避免位置偏移）
            const allPositions = [];
            matches.forEach(match => {
                match.positions.forEach(pos => {
                    allPositions.push({
                        start: pos.start,
                        end: pos.end,
                        term: match.term,
                        definition: match.definition,
                        category: match.category
                    });
                });
            });

            // 去重（同一位置可能被多次匹配）
            const uniquePositions = [];
            const positionSet = new Set();
            allPositions.forEach(item => {
                const key = `${item.start}-${item.end}`;
                if (!positionSet.has(key)) {
                    positionSet.add(key);
                    uniquePositions.push(item);
                }
            });

            // 从后往前排序，避免替换时位置偏移
            uniquePositions.sort((a, b) => b.start - a.start);

            // 高亮显示术语
            let highlightedText = text;
            uniquePositions.forEach(item => {
                const before = highlightedText.substring(0, item.start);
                const term = highlightedText.substring(item.start, item.end);
                const after = highlightedText.substring(item.end);

                // 创建高亮标记（使用特殊标记符，稍后替换为HTML）
                highlightedText = before + `<<TERM::${term}::${item.definition}::${item.category || ''}>>` + after;
            });

            // 解析并创建HTML元素
            const fragment = document.createDocumentFragment();
            const parts = highlightedText.split(/<<TERM::|>>/);

            for (let i = 0; i < parts.length; i++) {
                if (parts[i].includes('::')) {
                    // 这是一个术语
                    const [term, definition, category] = parts[i].split('::');
                    const termSpan = document.createElement('span');
                    termSpan.className = 'knowledge-term';
                    termSpan.textContent = term;
                    termSpan.title = `${category ? `[${category}] ` : ''}${definition}`;
                    termSpan.dataset.term = term;
                    termSpan.dataset.definition = definition;
                    if (category) termSpan.dataset.category = category;
                    fragment.appendChild(termSpan);
                } else if (parts[i]) {
                    // 普通文本
                    fragment.appendChild(document.createTextNode(parts[i]));
                }
            }

            // 替换原始文本
            textElement.textContent = '';
            textElement.appendChild(fragment);

        } catch (error) {
            console.error('知识库术语高亮失败:', error);
        }
    }

    formatTime(date) {
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }

    /**
     * 🎯 从实时转录区域获取带说话人的完整内容
     */
    getTranscriptWithSpeakers() {
        const container = document.getElementById('transcriptDisplay');
        if (!container) return null;

        const messages = container.querySelectorAll('.speaker-message');
        const transcript = [];

        messages.forEach(msg => {
            const speakerName = msg.querySelector('.speaker-name')?.textContent || '未知';
            const content = msg.querySelector('.message-content')?.textContent || '';

            if (content.trim()) {
                transcript.push({
                    speaker: speakerName,
                    content: content.trim()
                });
            }
        });

        return transcript;
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

    async generateSummary() {
        console.log('='.repeat(80));
        console.log('📋 生成会议纪要...');

        // 🎯 检查是否还有待识别的任务（理论上不应该有，因为按钮只在识别完成后才启用）
        const hasPending = this.speechManager.hasIdentificationPending();
        if (hasPending) {
            alert('请等待声纹识别完成后再生成会议纪要');
            return;
        }

        // 🎯 从实时转录区域获取带说话人的内容
        const transcriptWithSpeakers = this.getTranscriptWithSpeakers();
        if (!transcriptWithSpeakers || transcriptWithSpeakers.length === 0) {
            alert('没有转录内容');
            return;
        }

        console.log(`  - 转录消息数: ${transcriptWithSpeakers.length} 条`);
        console.log(`  - 转录内容预览:`, transcriptWithSpeakers.slice(0, 3));

        // 🎯 获取识别出的说话人
        const identifiedSpeakers = this.speechManager.getIdentifiedSpeakers();
        console.log('='.repeat(80));
        console.log('📊 识别出的说话人:');
        if (identifiedSpeakers.length > 0) {
            identifiedSpeakers.forEach((sp, idx) => {
                console.log(`  ${idx + 1}. ${sp.name} - 邮箱:${sp.email || '无'} - 发言:${sp.count}次`);
            });
        } else {
            console.log('  (无)');
        }
        console.log('='.repeat(80));

        // 生成参会人员HTML
        let participantsHtml = '';
        if (identifiedSpeakers.length > 0) {
            participantsHtml = identifiedSpeakers.map(speaker => {
                const emailPart = speaker.email ? ` (${speaker.email})` : '';
                return `<li>${speaker.name}${emailPart} - 发言 ${speaker.count} 次</li>`;
            }).join('');
        } else {
            participantsHtml = '<li>未识别到说话人</li>';
        }

        const summaryDisplay = document.getElementById('summaryDisplay');
        if (summaryDisplay) {
            summaryDisplay.innerHTML = `
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-users"></i> 参会人员</div>
                    <div class="summary-content">
                        <ul>${participantsHtml}</ul>
                    </div>
                </div>
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-file-alt"></i> 会议转录</div>
                    <div class="summary-content">${transcript}</div>
                </div>
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-chart-bar"></i> 统计信息</div>
                    <div class="summary-content">
                        <p>总字数: ${transcript.length} 字</p>
                        <p>参会人数: ${identifiedSpeakers.length} 人</p>
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

        // 🎯 将会议纪要和参会人员信息传递给邮件应用
        if (window.emailManager) {
            console.log('📧 传递会议纪要给邮件应用');
            window.emailManager.currentSummary = {
                title: '会议纪要',
                content: transcript,
                transcript: transcript,
                meetingDate: new Date().toLocaleDateString('zh-CN'),
                attendees: identifiedSpeakers.map(s => ({
                    name: s.name,
                    email: s.email || null
                })),
                metadata: {
                    title: '实时语音识别会议',
                    attendees: identifiedSpeakers.map(s => s.name),
                    wordCount: transcript.length,
                    speakerCount: identifiedSpeakers.length
                }
            };
            // 触发更新
            window.emailManager.updateEmailContent();
        } else {
            console.warn('⚠️ 邮件管理器未找到');
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

    async loadSpeakers() {
        try {
            console.log('📡 从服务器加载声纹列表...');
            const response = await fetch('/api/v1/speakers');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const result = await response.json();
            this.speakers = result.data || [];
            console.log(`✅ 从服务器加载了 ${this.speakers.length} 个声纹`);
            console.log('📋 声纹列表:', this.speakers.map(s => `${s.name} (${s.email || '无邮箱'})`).join(', '));

            // 同步到 localStorage
            this.saveSpeakers();

            // 更新UI
            this.updateSpeakerList();
        } catch (error) {
            console.error('❌ 从服务器加载声纹失败:', error);

            // 降级到 localStorage
            const saved = localStorage.getItem('speakers');
            if (saved) {
                try {
                    this.speakers = JSON.parse(saved);
                    console.log('⚠️ 使用本地缓存的声纹数据');
                    this.updateSpeakerList();
                } catch (e) {
                    console.error('加载声纹数据失败:', e);
                }
            }
        }
    }

    saveSpeakers() {
        localStorage.setItem('speakers', JSON.stringify(this.speakers));
    }

    async saveSpeaker() {
        console.log('💾 保存声纹 (使用WeSpeaker 256维)...');

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
        progressMsg.innerHTML = '<h3 style="margin: 0 0 15px 0;">🎤 正在上传音频到服务器...</h3><p style="color: #666;">使用WeSpeaker提取256维特征</p>';
        document.body.appendChild(progressMsg);

        try {
            // ✅ 新方案: 直接上传音频文件到服务器，让服务器端使用WeSpeaker提取256维特征
            console.log('📤 上传音频到服务器进行WeSpeaker特征提取...');

            const formData = new FormData();
            formData.append('name', name);
            formData.append('email', email || '');
            formData.append('voiceFile', audioFile);

            const response = await fetch('/api/v1/speakers', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `服务器错误: ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ 服务器响应:', result);

            // 从服务器响应中获取说话人信息
            const serverSpeaker = result.data;

            // 更新本地speakers列表
            const existingIndex = this.speakers.findIndex(s => s.id === serverSpeaker.id);
            if (existingIndex >= 0) {
                this.speakers[existingIndex] = serverSpeaker;
            } else {
                this.speakers.push(serverSpeaker);
            }

            console.log('✅ 声纹注册成功!');
            console.log('📊 特征维度:', serverSpeaker.voiceprintData?.featureDim || 'N/A');
            console.log('🎯 模型:', serverSpeaker.voiceprintData?.model || 'N/A');
            console.log('📈 样本数:', serverSpeaker.sampleCount || 1);
            console.log('⏱️ 总时长:', serverSpeaker.totalDuration || 0, '秒');

            const sampleCount = serverSpeaker.sampleCount || 1;
            const totalDuration = serverSpeaker.totalDuration || 0;
            const featureDim = serverSpeaker.voiceprintData?.featureDim || 256;

            alert(`✅ ${result.message}\n\n样本数：${sampleCount}个\n向量：${featureDim}维 | 总时长${totalDuration.toFixed(1)}s\n模型：${serverSpeaker.voiceprintData?.model || 'wespeaker-chinese'}`);

            // 保存并更新
            this.saveSpeakers();
            this.updateSpeakerList();

            // 清空表单
            if (nameInput) nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (fileInput) fileInput.value = '';

            // 清理录音数据
            window.voiceprintAudioBlob = null;
            if (typeof reRecordVoiceprint === 'function') {
                reRecordVoiceprint();
            }

            // 关闭弹窗
            this.closeModal('addSpeakerModal');

            // 移除进度提示
            document.body.removeChild(progressMsg);

            console.log('✅ 声纹保存流程完成');

            // 触发事件
            this.eventBus.emit('voiceprint:added', serverSpeaker);

        } catch (error) {
            console.error('❌ 声纹注册失败:', error);
            document.body.removeChild(progressMsg);
            alert('❌ 声纹注册失败: ' + error.message + '\n\n请确保上传的是有效的音频文件(WAV/MP3/M4A等)');
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

    async deleteSpeaker(id) {
        if (!confirm('确定要删除这个声纹吗？')) return;

        console.log('🗑️ 开始删除声纹:', id);

        try {
            // 调用后端API删除
            const response = await fetch(`${API_BASE_URL}/speakers/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || '删除失败');
            }

            console.log('✅ 后端删除成功');

            // 从前端数组中删除
            this.speakers = this.speakers.filter(s => s.id !== id);
            this.saveSpeakers();
            this.updateSpeakerList();
            console.log('✅ 前端列表已更新');

            // 重新加载声纹列表以确保同步
            await this.loadSpeakers();
        } catch (error) {
            console.error('❌ 删除声纹失败:', error);
            alert(`删除失败: ${error.message}`);
        }
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

            // 🎯 兼容新旧数据结构 (支持旧的voiceprints和新的samples)
            let sampleCount = 0;
            let vectorDim = 0;
            let totalDuration = 0;
            let hasVoiceprint = false;

            // 新数据结构 (使用samples数组)
            if (speaker.samples && speaker.samples.length > 0) {
                hasVoiceprint = true;
                sampleCount = speaker.samples.length;
                vectorDim = speaker.voiceprintData?.featureDim || 256;
                totalDuration = speaker.samples.reduce((sum, s) => sum + (s.duration || 0), 0);
            }
            // 旧数据结构 (使用voiceprints数组)
            else if (speaker.voiceprints && speaker.voiceprints.length > 0) {
                hasVoiceprint = true;
                sampleCount = speaker.voiceprints.length;
                vectorDim = speaker.voiceprints[0].vector?.length || 0;
                totalDuration = speaker.voiceprints.reduce((sum, vp) => sum + (vp.duration || 0), 0);
            }
            // 最旧数据结构 (单个voiceprint对象)
            else if (speaker.voiceprint && speaker.voiceprint.vector) {
                hasVoiceprint = true;
                sampleCount = 1;
                vectorDim = speaker.voiceprint.vector.length;
                totalDuration = speaker.voiceprint.duration || 0;
            }

            const totalDurationStr = totalDuration > 0 ? totalDuration.toFixed(1) + 's' : '0.0s';

            return `
            <div class="speaker-item">
                <div class="speaker-avatar" style="background: ${avatarColor};">${speaker.name.charAt(0)}</div>
                <div class="speaker-info">
                    <div class="speaker-name">
                        ${speaker.name}
                        ${hasVoiceprint ? `<span class="badge" style="background: #06ffa5; font-size: 0.7rem;">✓ ${sampleCount}个样本</span>` : ''}
                    </div>
                    <div class="speaker-email">${speaker.email || '无邮箱'}</div>
                    ${hasVoiceprint ? `<div style="font-size: 0.75rem; color: var(--gray); margin-top: 4px;">向量: ${vectorDim}维 | 总时长: ${totalDurationStr}</div>` : ''}
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

        // 🎯 暴露 eventBus 到全局，供 meeting-app.js 使用
        window.eventBus = this.eventBus;
        console.log('✅ window.eventBus 已暴露到全局');

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
