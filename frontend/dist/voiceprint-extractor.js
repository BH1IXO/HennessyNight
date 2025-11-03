/**
 * 声纹特征提取器
 * 使用 Web Audio API 提取 MFCC 特征
 * 用于说话人识别
 */

class VoiceprintExtractor {
    constructor() {
        this.audioContext = null;
        this.sampleRate = 16000; // 16kHz 标准采样率
        this.frameSize = 512;    // 帧大小
        this.hopSize = 256;      // 跳跃大小
        this.numMFCC = 13;       // MFCC 系数数量
        this.numFilters = 26;    // Mel滤波器数量
    }

    /**
     * 从音频文件提取声纹特征向量
     * @param {File} audioFile - 音频文件
     * @returns {Promise<Object>} 特征向量和元数据
     */
    async extractFromFile(audioFile) {
        console.log('🎤 开始提取声纹特征...');
        console.log('文件信息:', {
            name: audioFile.name,
            size: (audioFile.size / 1024).toFixed(2) + 'KB',
            type: audioFile.type
        });

        try {
            // 1. 初始化音频上下文
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: this.sampleRate
                });
            }

            // 2. 读取并解码音频文件
            const arrayBuffer = await audioFile.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            console.log('✅ 音频解码成功:', {
                duration: audioBuffer.duration.toFixed(2) + 's',
                sampleRate: audioBuffer.sampleRate + 'Hz',
                channels: audioBuffer.numberOfChannels
            });

            // 3. 获取音频数据 (单声道)
            const channelData = this.getMonoChannel(audioBuffer);

            // 4. 重采样到标准采样率 (如果需要)
            const resampledData = await this.resample(channelData, audioBuffer.sampleRate, this.sampleRate);

            // 5. 提取 MFCC 特征
            const mfccFeatures = this.computeMFCC(resampledData);

            // 6. 计算统计特征 (均值、方差)
            const featureVector = this.computeStatistics(mfccFeatures);

            // 7. 计算其他特征
            const spectralFeatures = this.computeSpectralFeatures(resampledData);
            const energyFeatures = this.computeEnergyFeatures(resampledData);

            // 8. 合并所有特征
            const finalVector = [
                ...featureVector.mean,      // MFCC均值 (13维)
                ...featureVector.std,       // MFCC方差 (13维)
                ...spectralFeatures,        // 频谱特征 (5维)
                ...energyFeatures           // 能量特征 (3维)
            ];

            console.log('✅ 特征提取完成!');
            console.log('特征向量维度:', finalVector.length);

            return {
                vector: finalVector,              // 特征向量 (34维)
                duration: audioBuffer.duration,   // 音频时长
                sampleRate: this.sampleRate,      // 采样率
                mfccFrames: mfccFeatures.length,  // MFCC帧数
                extractedAt: new Date().toISOString(),
                metadata: {
                    originalSampleRate: audioBuffer.sampleRate,
                    fileSize: audioFile.size,
                    fileType: audioFile.type,
                    fileName: audioFile.name
                }
            };

        } catch (error) {
            console.error('❌ 特征提取失败:', error);
            throw new Error('声纹特征提取失败: ' + error.message);
        }
    }

    /**
     * 从音频数据提取声纹 (实时识别用)
     * @param {Float32Array} audioData - 音频数据
     * @param {number} sampleRate - 采样率
     * @returns {Array<number>} 特征向量
     */
    extractFromAudioData(audioData, sampleRate = 16000) {
        try {
            // 重采样
            const resampledData = this.resampleSync(audioData, sampleRate, this.sampleRate);

            // 提取MFCC
            const mfccFeatures = this.computeMFCC(resampledData);

            // 计算统计特征
            const stats = this.computeStatistics(mfccFeatures);

            // 返回简化向量 (均值)
            return stats.mean;

        } catch (error) {
            console.error('实时特征提取失败:', error);
            return null;
        }
    }

    /**
     * 获取单声道数据
     */
    getMonoChannel(audioBuffer) {
        if (audioBuffer.numberOfChannels === 1) {
            return audioBuffer.getChannelData(0);
        }

        // 多声道混合为单声道
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
     * 重采样 (异步)
     */
    async resample(audioData, fromSampleRate, toSampleRate) {
        if (fromSampleRate === toSampleRate) {
            return audioData;
        }

        const ratio = toSampleRate / fromSampleRate;
        const newLength = Math.round(audioData.length * ratio);
        const resampled = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const srcIndex = i / ratio;
            const index = Math.floor(srcIndex);
            const fraction = srcIndex - index;

            if (index + 1 < audioData.length) {
                // 线性插值
                resampled[i] = audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
            } else {
                resampled[i] = audioData[index];
            }
        }

        return resampled;
    }

    /**
     * 重采样 (同步)
     */
    resampleSync(audioData, fromSampleRate, toSampleRate) {
        if (fromSampleRate === toSampleRate) {
            return audioData;
        }

        const ratio = toSampleRate / fromSampleRate;
        const newLength = Math.round(audioData.length * ratio);
        const resampled = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const srcIndex = i / ratio;
            const index = Math.floor(srcIndex);
            resampled[i] = audioData[Math.min(index, audioData.length - 1)];
        }

        return resampled;
    }

    /**
     * 计算 MFCC 特征
     */
    computeMFCC(audioData) {
        const frames = this.splitFrames(audioData, this.frameSize, this.hopSize);
        const mfccFeatures = [];

        for (let frame of frames) {
            // 1. 预加重
            const preemphasized = this.preemphasis(frame);

            // 2. 加窗 (汉明窗)
            const windowed = this.applyWindow(preemphasized);

            // 3. FFT
            const spectrum = this.computeFFT(windowed);

            // 4. 功率谱
            const powerSpectrum = this.computePowerSpectrum(spectrum);

            // 5. Mel滤波器组
            const melSpectrum = this.applyMelFilterbank(powerSpectrum);

            // 6. 对数
            const logMel = melSpectrum.map(x => Math.log(Math.max(x, 1e-10)));

            // 7. DCT -> MFCC
            const mfcc = this.computeDCT(logMel, this.numMFCC);

            mfccFeatures.push(mfcc);
        }

        return mfccFeatures;
    }

    /**
     * 分帧
     */
    splitFrames(audioData, frameSize, hopSize) {
        const frames = [];
        for (let i = 0; i + frameSize <= audioData.length; i += hopSize) {
            frames.push(audioData.slice(i, i + frameSize));
        }
        return frames;
    }

    /**
     * 预加重
     */
    preemphasis(frame, alpha = 0.97) {
        const output = new Float32Array(frame.length);
        output[0] = frame[0];
        for (let i = 1; i < frame.length; i++) {
            output[i] = frame[i] - alpha * frame[i - 1];
        }
        return output;
    }

    /**
     * 应用汉明窗
     */
    applyWindow(frame) {
        const windowed = new Float32Array(frame.length);
        for (let i = 0; i < frame.length; i++) {
            windowed[i] = frame[i] * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (frame.length - 1)));
        }
        return windowed;
    }

    /**
     * FFT (使用简化的DFT实现)
     */
    computeFFT(frame) {
        const N = frame.length;
        const real = new Float32Array(N / 2 + 1);
        const imag = new Float32Array(N / 2 + 1);

        for (let k = 0; k <= N / 2; k++) {
            let sumReal = 0;
            let sumImag = 0;
            for (let n = 0; n < N; n++) {
                const angle = -2 * Math.PI * k * n / N;
                sumReal += frame[n] * Math.cos(angle);
                sumImag += frame[n] * Math.sin(angle);
            }
            real[k] = sumReal;
            imag[k] = sumImag;
        }

        return { real, imag };
    }

    /**
     * 计算功率谱
     */
    computePowerSpectrum(spectrum) {
        const power = new Float32Array(spectrum.real.length);
        for (let i = 0; i < power.length; i++) {
            power[i] = spectrum.real[i] * spectrum.real[i] + spectrum.imag[i] * spectrum.imag[i];
        }
        return power;
    }

    /**
     * Mel滤波器组
     */
    applyMelFilterbank(powerSpectrum) {
        const melFilters = this.getMelFilterbank(powerSpectrum.length, this.numFilters);
        const melSpectrum = new Float32Array(this.numFilters);

        for (let i = 0; i < this.numFilters; i++) {
            let sum = 0;
            for (let j = 0; j < powerSpectrum.length; j++) {
                sum += powerSpectrum[j] * melFilters[i][j];
            }
            melSpectrum[i] = sum;
        }

        return melSpectrum;
    }

    /**
     * 生成Mel滤波器组
     */
    getMelFilterbank(nfft, numFilters) {
        const lowFreq = 0;
        const highFreq = this.sampleRate / 2;

        // Hz to Mel
        const melLow = this.hzToMel(lowFreq);
        const melHigh = this.hzToMel(highFreq);

        // Mel points
        const melPoints = [];
        for (let i = 0; i < numFilters + 2; i++) {
            melPoints.push(melLow + (melHigh - melLow) * i / (numFilters + 1));
        }

        // Mel to Hz
        const hzPoints = melPoints.map(mel => this.melToHz(mel));

        // Bin points
        const binPoints = hzPoints.map(hz => Math.floor((nfft + 1) * hz / this.sampleRate));

        // Create filterbank
        const filterbank = [];
        for (let i = 1; i <= numFilters; i++) {
            const filter = new Float32Array(nfft);
            for (let j = binPoints[i - 1]; j < binPoints[i]; j++) {
                filter[j] = (j - binPoints[i - 1]) / (binPoints[i] - binPoints[i - 1]);
            }
            for (let j = binPoints[i]; j < binPoints[i + 1]; j++) {
                filter[j] = (binPoints[i + 1] - j) / (binPoints[i + 1] - binPoints[i]);
            }
            filterbank.push(filter);
        }

        return filterbank;
    }

    /**
     * Hz to Mel
     */
    hzToMel(hz) {
        return 2595 * Math.log10(1 + hz / 700);
    }

    /**
     * Mel to Hz
     */
    melToHz(mel) {
        return 700 * (Math.pow(10, mel / 2595) - 1);
    }

    /**
     * DCT (离散余弦变换)
     */
    computeDCT(input, numCoeffs) {
        const N = input.length;
        const output = new Float32Array(numCoeffs);

        for (let k = 0; k < numCoeffs; k++) {
            let sum = 0;
            for (let n = 0; n < N; n++) {
                sum += input[n] * Math.cos(Math.PI * k * (n + 0.5) / N);
            }
            output[k] = sum;
        }

        return output;
    }

    /**
     * 计算统计特征
     */
    computeStatistics(mfccFeatures) {
        const numCoeffs = mfccFeatures[0].length;
        const mean = new Float32Array(numCoeffs);
        const std = new Float32Array(numCoeffs);

        // 计算均值
        for (let i = 0; i < numCoeffs; i++) {
            let sum = 0;
            for (let frame of mfccFeatures) {
                sum += frame[i];
            }
            mean[i] = sum / mfccFeatures.length;
        }

        // 计算方差
        for (let i = 0; i < numCoeffs; i++) {
            let sumSq = 0;
            for (let frame of mfccFeatures) {
                const diff = frame[i] - mean[i];
                sumSq += diff * diff;
            }
            std[i] = Math.sqrt(sumSq / mfccFeatures.length);
        }

        return {
            mean: Array.from(mean),
            std: Array.from(std)
        };
    }

    /**
     * 计算频谱特征
     */
    computeSpectralFeatures(audioData) {
        const spectrum = this.computeFFT(audioData);
        const powerSpectrum = this.computePowerSpectrum(spectrum);

        // 1. 频谱质心
        let numerator = 0;
        let denominator = 0;
        for (let i = 0; i < powerSpectrum.length; i++) {
            numerator += i * powerSpectrum[i];
            denominator += powerSpectrum[i];
        }
        const spectralCentroid = numerator / Math.max(denominator, 1e-10);

        // 2. 频谱带宽
        let bandwidthSum = 0;
        for (let i = 0; i < powerSpectrum.length; i++) {
            bandwidthSum += Math.pow(i - spectralCentroid, 2) * powerSpectrum[i];
        }
        const spectralBandwidth = Math.sqrt(bandwidthSum / Math.max(denominator, 1e-10));

        // 3. 频谱滚降
        const rolloffThreshold = 0.85 * denominator;
        let rolloffSum = 0;
        let spectralRolloff = 0;
        for (let i = 0; i < powerSpectrum.length; i++) {
            rolloffSum += powerSpectrum[i];
            if (rolloffSum >= rolloffThreshold) {
                spectralRolloff = i;
                break;
            }
        }

        // 4. 过零率
        let zeroCrossings = 0;
        for (let i = 1; i < audioData.length; i++) {
            if ((audioData[i] >= 0 && audioData[i - 1] < 0) || (audioData[i] < 0 && audioData[i - 1] >= 0)) {
                zeroCrossings++;
            }
        }
        const zeroCrossingRate = zeroCrossings / audioData.length;

        // 5. 频谱通量
        const spectralFlux = Math.sqrt(powerSpectrum.reduce((sum, val) => sum + val * val, 0));

        return [
            spectralCentroid / powerSpectrum.length,  // 归一化
            spectralBandwidth / powerSpectrum.length,
            spectralRolloff / powerSpectrum.length,
            zeroCrossingRate,
            spectralFlux / powerSpectrum.length
        ];
    }

    /**
     * 计算能量特征
     */
    computeEnergyFeatures(audioData) {
        // 1. RMS能量
        const rmsEnergy = Math.sqrt(audioData.reduce((sum, val) => sum + val * val, 0) / audioData.length);

        // 2. 最大幅度
        const maxAmplitude = Math.max(...audioData.map(Math.abs));

        // 3. 动态范围
        const minAmplitude = Math.min(...audioData.map(Math.abs).filter(x => x > 0));
        const dynamicRange = maxAmplitude / Math.max(minAmplitude, 1e-10);

        return [
            rmsEnergy,
            maxAmplitude,
            Math.log(dynamicRange + 1)  // 对数缩放
        ];
    }
}

// 导出
window.VoiceprintExtractor = VoiceprintExtractor;
