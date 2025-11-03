/**
 * MFCC 声纹特征提取器 (高准确率版本)
 * 使用真正的 Mel-frequency cepstral coefficients
 */

class MFCCVoiceprintExtractor {
    constructor() {
        this.audioContext = null;
        this.sampleRate = 16000;

        // MFCC 参数
        this.numMFCC = 13;          // MFCC 系数数量
        this.numFilters = 40;       // Mel 滤波器数量
        this.fftSize = 512;         // FFT 大小
        this.hopLength = 160;       // 帧移 (10ms @ 16kHz)
        this.numFrames = 50;        // 使用的帧数
    }

    /**
     * 从音频文件提取 MFCC 特征
     */
    async extractFromFile(audioFile) {
        console.log('🎤 开始提取 MFCC 声纹特征 (高准确率版)...');
        console.log('文件:', audioFile.name, (audioFile.size / 1024).toFixed(2) + 'KB');

        try {
            // 1. 初始化音频上下文
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // 2. 读取并解码音频
            const arrayBuffer = await audioFile.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            console.log('✅ 解码成功:', audioBuffer.duration.toFixed(2) + 's');

            // 3. 获取音频数据并预处理
            let audioData = this.getMonoChannel(audioBuffer);

            // 重采样到 16kHz
            if (audioBuffer.sampleRate !== this.sampleRate) {
                audioData = this.resample(audioData, audioBuffer.sampleRate, this.sampleRate);
            }

            // 🎯 音频归一化 (减少音量差异影响)
            audioData = this.normalize(audioData);

            // 预加重
            audioData = this.preEmphasis(audioData);

            // 4. 提取 MFCC 特征
            const mfccFrames = this.extractMFCC(audioData);

            // 5. 聚合特征 (取统计量)
            const features = this.aggregateFeatures(mfccFrames);

            console.log('✅ MFCC 特征提取完成! 向量:', features.length, '维');

            return {
                vector: features,
                duration: audioBuffer.duration,
                sampleRate: this.sampleRate,
                extractedAt: new Date().toISOString(),
                metadata: {
                    method: 'MFCC',
                    numMFCC: this.numMFCC,
                    numFrames: mfccFrames.length,
                    originalSampleRate: audioBuffer.sampleRate,
                    fileSize: audioFile.size,
                    fileType: audioFile.type,
                    fileName: audioFile.name
                }
            };

        } catch (error) {
            console.error('❌ MFCC 提取失败:', error);
            throw error;
        }
    }

    /**
     * 获取单声道
     */
    getMonoChannel(audioBuffer) {
        if (audioBuffer.numberOfChannels === 1) {
            return audioBuffer.getChannelData(0);
        }

        const length = audioBuffer.length;
        const mono = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            let sum = 0;
            for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
                sum += audioBuffer.getChannelData(c)[i];
            }
            mono[i] = sum / audioBuffer.numberOfChannels;
        }
        return mono;
    }

    /**
     * 简单重采样 (线性插值)
     */
    resample(audioData, fromRate, toRate) {
        if (fromRate === toRate) return audioData;

        const ratio = fromRate / toRate;
        const newLength = Math.floor(audioData.length / ratio);
        const resampled = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const pos = i * ratio;
            const index = Math.floor(pos);
            const frac = pos - index;

            if (index + 1 < audioData.length) {
                resampled[i] = audioData[index] * (1 - frac) + audioData[index + 1] * frac;
            } else {
                resampled[i] = audioData[index];
            }
        }

        console.log(`✅ 重采样: ${fromRate}Hz -> ${toRate}Hz`);
        return resampled;
    }

    /**
     * 音频归一化 (标准化音量)
     */
    normalize(audioData) {
        // 找到最大绝对值
        let maxAbs = 0;
        for (let i = 0; i < audioData.length; i++) {
            const abs = Math.abs(audioData[i]);
            if (abs > maxAbs) {
                maxAbs = abs;
            }
        }

        // 归一化到 [-1, 1]
        if (maxAbs > 0) {
            const normalized = new Float32Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                normalized[i] = audioData[i] / maxAbs;
            }
            console.log('✅ 音频归一化完成 (peak:', maxAbs.toFixed(3), ')');
            return normalized;
        }

        return audioData;
    }

    /**
     * 预加重滤波器 (增强高频)
     */
    preEmphasis(audioData, alpha = 0.97) {
        const emphasized = new Float32Array(audioData.length);
        emphasized[0] = audioData[0];

        for (let i = 1; i < audioData.length; i++) {
            emphasized[i] = audioData[i] - alpha * audioData[i - 1];
        }

        return emphasized;
    }

    /**
     * 提取 MFCC 特征
     */
    extractMFCC(audioData) {
        const frames = this.frameSignal(audioData);
        const mfccFrames = [];

        for (const frame of frames) {
            // 加窗
            const windowedFrame = this.applyHammingWindow(frame);

            // FFT
            const powerSpectrum = this.computePowerSpectrum(windowedFrame);

            // Mel 滤波器组
            const melSpectrum = this.applyMelFilterbank(powerSpectrum);

            // DCT -> MFCC
            const mfcc = this.computeDCT(melSpectrum);

            mfccFrames.push(mfcc.slice(0, this.numMFCC));
        }

        return mfccFrames;
    }

    /**
     * 分帧
     */
    frameSignal(audioData) {
        const frames = [];
        const numFrames = Math.floor((audioData.length - this.fftSize) / this.hopLength) + 1;

        for (let i = 0; i < numFrames && i < this.numFrames; i++) {
            const start = i * this.hopLength;
            const end = start + this.fftSize;
            frames.push(audioData.slice(start, end));
        }

        return frames;
    }

    /**
     * 汉明窗
     */
    applyHammingWindow(frame) {
        const windowed = new Float32Array(frame.length);
        for (let i = 0; i < frame.length; i++) {
            const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame.length - 1));
            windowed[i] = frame[i] * window;
        }
        return windowed;
    }

    /**
     * 计算功率谱 (使用简化的 FFT)
     */
    computePowerSpectrum(frame) {
        // 使用实数 FFT (简化版)
        const N = frame.length;
        const halfN = Math.floor(N / 2);
        const powerSpectrum = new Float32Array(halfN);

        for (let k = 0; k < halfN; k++) {
            let real = 0;
            let imag = 0;

            for (let n = 0; n < N; n++) {
                const angle = (-2 * Math.PI * k * n) / N;
                real += frame[n] * Math.cos(angle);
                imag += frame[n] * Math.sin(angle);
            }

            powerSpectrum[k] = (real * real + imag * imag) / N;
        }

        return powerSpectrum;
    }

    /**
     * Mel 滤波器组
     */
    applyMelFilterbank(powerSpectrum) {
        const melSpectrum = new Float32Array(this.numFilters);
        const melFilters = this.createMelFilterbank();

        for (let i = 0; i < this.numFilters; i++) {
            let sum = 0;
            for (let j = 0; j < powerSpectrum.length; j++) {
                sum += powerSpectrum[j] * melFilters[i][j];
            }
            melSpectrum[i] = Math.log(sum + 1e-10); // 取对数
        }

        return melSpectrum;
    }

    /**
     * 创建 Mel 滤波器组
     */
    createMelFilterbank() {
        const filters = [];
        const fftBins = Math.floor(this.fftSize / 2);
        const melPoints = new Float32Array(this.numFilters + 2);

        // Mel 频率转换
        const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700);
        const melToHz = (mel) => 700 * (Math.pow(10, mel / 2595) - 1);

        const lowFreqMel = hzToMel(0);
        const highFreqMel = hzToMel(this.sampleRate / 2);

        for (let i = 0; i < this.numFilters + 2; i++) {
            melPoints[i] = melToHz(lowFreqMel + (i * (highFreqMel - lowFreqMel)) / (this.numFilters + 1));
        }

        const bin = new Float32Array(this.numFilters + 2);
        for (let i = 0; i < bin.length; i++) {
            bin[i] = Math.floor((this.fftSize + 1) * melPoints[i] / this.sampleRate);
        }

        for (let i = 0; i < this.numFilters; i++) {
            const filter = new Float32Array(fftBins);

            for (let j = Math.floor(bin[i]); j < Math.floor(bin[i + 1]); j++) {
                filter[j] = (j - bin[i]) / (bin[i + 1] - bin[i]);
            }
            for (let j = Math.floor(bin[i + 1]); j < Math.floor(bin[i + 2]); j++) {
                filter[j] = (bin[i + 2] - j) / (bin[i + 2] - bin[i + 1]);
            }

            filters.push(filter);
        }

        return filters;
    }

    /**
     * 离散余弦变换 (DCT)
     */
    computeDCT(spectrum) {
        const N = spectrum.length;
        const dct = new Float32Array(N);

        for (let k = 0; k < N; k++) {
            let sum = 0;
            for (let n = 0; n < N; n++) {
                sum += spectrum[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
            }
            dct[k] = sum;
        }

        return dct;
    }

    /**
     * 聚合 MFCC 帧特征 (计算统计量)
     */
    aggregateFeatures(mfccFrames) {
        const features = [];

        // 转置: 每个 MFCC 系数作为一个时间序列
        for (let coef = 0; coef < this.numMFCC; coef++) {
            const coefficients = mfccFrames.map(frame => frame[coef]);

            // 均值
            features.push(this.mean(coefficients));
            // 标准差
            features.push(this.std(coefficients));
            // 最大值
            features.push(Math.max(...coefficients));
            // 最小值
            features.push(Math.min(...coefficients));
        }

        return features;
    }

    /**
     * 计算均值
     */
    mean(arr) {
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }

    /**
     * 计算标准差
     */
    std(arr) {
        const m = this.mean(arr);
        const variance = arr.reduce((sum, val) => sum + (val - m) ** 2, 0) / arr.length;
        return Math.sqrt(variance);
    }
}

// 导出
window.MFCCVoiceprintExtractor = MFCCVoiceprintExtractor;
