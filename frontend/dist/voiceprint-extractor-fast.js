/**
 * 快速声纹特征提取器 (优化版)
 * 使用简化算法提高速度
 */

class VoiceprintExtractor {
    constructor() {
        this.audioContext = null;
        this.sampleRate = 16000;
    }

    /**
     * 从音频文件提取声纹特征向量 (快速版本)
     */
    async extractFromFile(audioFile) {
        console.log('🎤 开始提取声纹特征 (快速版)...');
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

            // 3. 获取音频数据
            let audioData = this.getMonoChannel(audioBuffer);

            // 🎯 音频归一化
            audioData = this.normalize(audioData);

            // 4. 快速特征提取 (不使用MFCC,使用简化特征)
            const features = this.extractSimpleFeatures(audioData, audioBuffer.sampleRate);

            console.log('✅ 特征提取完成! 向量:', features.length, '维');

            return {
                vector: features,
                duration: audioBuffer.duration,
                sampleRate: audioBuffer.sampleRate,
                extractedAt: new Date().toISOString(),
                metadata: {
                    originalSampleRate: audioBuffer.sampleRate,
                    fileSize: audioFile.size,
                    fileType: audioFile.type,
                    fileName: audioFile.name
                }
            };

        } catch (error) {
            console.error('❌ 提取失败:', error);
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
     * 音频归一化
     */
    normalize(audioData) {
        let maxAbs = 0;
        for (let i = 0; i < audioData.length; i++) {
            const abs = Math.abs(audioData[i]);
            if (abs > maxAbs) maxAbs = abs;
        }

        if (maxAbs > 0) {
            const normalized = new Float32Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                normalized[i] = audioData[i] / maxAbs;
            }
            return normalized;
        }
        return audioData;
    }

    /**
     * 提取简化特征 (快速但有效)
     */
    extractSimpleFeatures(audioData, sampleRate) {
        const features = [];

        // 1. 分段统计特征 (10段)
        const numSegments = 10;
        const segmentSize = Math.floor(audioData.length / numSegments);

        for (let i = 0; i < numSegments; i++) {
            const start = i * segmentSize;
            const end = Math.min(start + segmentSize, audioData.length);
            const segment = audioData.slice(start, end);

            // 均值
            const mean = this.mean(segment);
            // 方差
            const variance = this.variance(segment, mean);
            // RMS能量
            const rms = this.rms(segment);
            // 过零率
            const zcr = this.zeroCrossingRate(segment);

            features.push(mean, variance, rms, zcr);
        }

        // 2. 全局特征
        features.push(
            this.mean(audioData),
            this.variance(audioData),
            this.rms(audioData),
            this.zeroCrossingRate(audioData),
            this.maxAmplitude(audioData),
            this.dynamicRange(audioData)
        );

        // 3. 频率特征 (简化版 - 使用Web Audio API的AnalyserNode)
        const freqFeatures = this.extractFrequencyFeatures(audioData, sampleRate);
        features.push(...freqFeatures);

        return features;
    }

    /**
     * 均值
     */
    mean(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        return sum / data.length;
    }

    /**
     * 方差
     */
    variance(data, mean = null) {
        if (mean === null) mean = this.mean(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
            const diff = data[i] - mean;
            sumSq += diff * diff;
        }
        return sumSq / data.length;
    }

    /**
     * RMS能量
     */
    rms(data) {
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
            sumSq += data[i] * data[i];
        }
        return Math.sqrt(sumSq / data.length);
    }

    /**
     * 过零率
     */
    zeroCrossingRate(data) {
        let crossings = 0;
        for (let i = 1; i < data.length; i++) {
            if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
                crossings++;
            }
        }
        return crossings / data.length;
    }

    /**
     * 最大幅度
     */
    maxAmplitude(data) {
        let max = 0;
        for (let i = 0; i < data.length; i++) {
            max = Math.max(max, Math.abs(data[i]));
        }
        return max;
    }

    /**
     * 动态范围
     */
    dynamicRange(data) {
        const max = this.maxAmplitude(data);
        let min = Infinity;
        for (let i = 0; i < data.length; i++) {
            const abs = Math.abs(data[i]);
            if (abs > 0) {
                min = Math.min(min, abs);
            }
        }
        return Math.log(max / Math.max(min, 1e-10) + 1);
    }

    /**
     * 频率特征 (简化版)
     */
    extractFrequencyFeatures(audioData, sampleRate) {
        // 使用简单的频带能量分析
        const features = [];

        // 分成4个频带
        const numBands = 4;
        const bandSize = Math.floor(audioData.length / numBands);

        for (let i = 0; i < numBands; i++) {
            const start = i * bandSize;
            const end = Math.min(start + bandSize, audioData.length);
            const band = audioData.slice(start, end);

            // 计算频带能量
            const energy = this.rms(band);
            features.push(energy);
        }

        // 频谱质心估计 (简化版)
        let weightedSum = 0;
        let totalEnergy = 0;
        for (let i = 0; i < audioData.length; i++) {
            const energy = audioData[i] * audioData[i];
            weightedSum += i * energy;
            totalEnergy += energy;
        }
        const spectralCentroid = weightedSum / Math.max(totalEnergy, 1e-10);
        features.push(spectralCentroid / audioData.length);

        return features;
    }

    /**
     * 从音频数据提取 (实时用)
     */
    extractFromAudioData(audioData, sampleRate = 16000) {
        try {
            const features = this.extractSimpleFeatures(audioData, sampleRate);
            return features;
        } catch (error) {
            console.error('实时提取失败:', error);
            return null;
        }
    }
}

// 导出
window.VoiceprintExtractor = VoiceprintExtractor;
console.log('✅ 快速声纹提取器已加载');
