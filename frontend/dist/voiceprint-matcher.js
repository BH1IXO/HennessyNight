/**
 * 声纹匹配器
 * 用于比对两个声纹特征向量的相似度
 */

class VoiceprintMatcher {
    constructor() {
        this.similarityThreshold = 0.70; // 🎯 降低阈值以提高识别率 (webm格式差异补偿)
    }

    /**
     * 计算两个特征向量的相似度
     * @param {Array<number>} vector1 - 第一个特征向量
     * @param {Array<number>} vector2 - 第二个特征向量
     * @returns {number} 相似度 (0-1)
     */
    computeSimilarity(vector1, vector2) {
        if (!vector1 || !vector2) {
            return 0;
        }

        if (vector1.length !== vector2.length) {
            console.warn('特征向量维度不匹配:', vector1.length, 'vs', vector2.length);
            // 截取到最短长度
            const minLength = Math.min(vector1.length, vector2.length);
            vector1 = vector1.slice(0, minLength);
            vector2 = vector2.slice(0, minLength);
        }

        // 使用余弦相似度
        const cosineSim = this.cosineSimilarity(vector1, vector2);

        // 使用欧氏距离
        const euclideanDist = this.euclideanDistance(vector1, vector2);
        const euclideanSim = 1 / (1 + euclideanDist); // 转换为相似度

        // 综合评分 (余弦相似度权重更高)
        const finalSimilarity = 0.7 * cosineSim + 0.3 * euclideanSim;

        return finalSimilarity;
    }

    /**
     * 余弦相似度
     */
    cosineSimilarity(vector1, vector2) {
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vector1.length; i++) {
            dotProduct += vector1[i] * vector2[i];
            norm1 += vector1[i] * vector1[i];
            norm2 += vector2[i] * vector2[i];
        }

        const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
        if (denominator === 0) return 0;

        return dotProduct / denominator;
    }

    /**
     * 欧氏距离
     */
    euclideanDistance(vector1, vector2) {
        let sum = 0;
        for (let i = 0; i < vector1.length; i++) {
            const diff = vector1[i] - vector2[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }

    /**
     * 曼哈顿距离
     */
    manhattanDistance(vector1, vector2) {
        let sum = 0;
        for (let i = 0; i < vector1.length; i++) {
            sum += Math.abs(vector1[i] - vector2[i]);
        }
        return sum;
    }

    /**
     * 匹配说话人 (支持多样本)
     * @param {Array<number>} queryVector - 待识别的特征向量
     * @param {Array<Object>} speakers - 已注册的说话人列表
     * @returns {Object|null} 匹配结果 {speaker, similarity}
     */
    matchSpeaker(queryVector, speakers) {
        if (!queryVector || !speakers || speakers.length === 0) {
            return null;
        }

        let bestMatch = null;
        let maxSimilarity = 0;

        for (const speaker of speakers) {
            // 🎯 兼容新旧数据结构
            let voiceprints = [];
            if (speaker.voiceprints) {
                voiceprints = speaker.voiceprints;
            } else if (speaker.voiceprint && speaker.voiceprint.vector) {
                voiceprints = [speaker.voiceprint];
            }

            if (voiceprints.length === 0) {
                continue;
            }

            // 🎯 多样本匹配: 计算与所有样本的相似度,取最大值
            let maxSampleSimilarity = 0;
            let allSimilarities = [];
            for (let i = 0; i < voiceprints.length; i++) {
                const similarity = this.computeSimilarity(queryVector, voiceprints[i].vector);
                allSimilarities.push(similarity);
                if (similarity > maxSampleSimilarity) {
                    maxSampleSimilarity = similarity;
                }
            }

            // 详细日志：显示每个样本的相似度
            const similarityDetails = allSimilarities.map((s, i) => `样本${i+1}: ${(s*100).toFixed(1)}%`).join(', ');
            console.log(`🎤 匹配 "${speaker.name}" (${voiceprints.length}个样本)`);
            console.log(`   ${similarityDetails}`);
            console.log(`   最高相似度: ${(maxSampleSimilarity * 100).toFixed(2)}% ${maxSampleSimilarity >= this.similarityThreshold ? '✅ 通过' : '❌ 未达阈值'}`);

            if (maxSampleSimilarity > maxSimilarity) {
                maxSimilarity = maxSampleSimilarity;
                bestMatch = speaker;
            }
        }

        // 检查是否超过阈值
        if (maxSimilarity >= this.similarityThreshold) {
            console.log(`✅ 识别为: ${bestMatch.name} (${(maxSimilarity * 100).toFixed(2)}%)`);
            return {
                speaker: bestMatch,
                similarity: maxSimilarity,
                confidence: this.getConfidenceLevel(maxSimilarity)
            };
        }

        console.log('❌ 未能识别 (相似度不足)');
        return null;
    }

    /**
     * 批量匹配 (返回Top N) - 支持多样本
     * @param {Array<number>} queryVector - 待识别的特征向量
     * @param {Array<Object>} speakers - 已注册的说话人列表
     * @param {number} topN - 返回前N个结果
     * @returns {Array<Object>} 匹配结果列表
     */
    matchTopN(queryVector, speakers, topN = 3) {
        if (!queryVector || !speakers || speakers.length === 0) {
            return [];
        }

        const results = [];

        for (const speaker of speakers) {
            // 🎯 兼容新旧数据结构
            let voiceprints = [];
            if (speaker.voiceprints) {
                voiceprints = speaker.voiceprints;
            } else if (speaker.voiceprint && speaker.voiceprint.vector) {
                voiceprints = [speaker.voiceprint];
            }

            if (voiceprints.length === 0) {
                continue;
            }

            // 多样本匹配: 取最大相似度
            let maxSampleSimilarity = 0;
            for (const voiceprint of voiceprints) {
                const similarity = this.computeSimilarity(queryVector, voiceprint.vector);
                if (similarity > maxSampleSimilarity) {
                    maxSampleSimilarity = similarity;
                }
            }

            results.push({
                speaker: speaker,
                similarity: maxSampleSimilarity,
                confidence: this.getConfidenceLevel(maxSampleSimilarity)
            });
        }

        // 按相似度排序
        results.sort((a, b) => b.similarity - a.similarity);

        // 返回前N个
        return results.slice(0, topN);
    }

    /**
     * 获取置信度等级
     */
    getConfidenceLevel(similarity) {
        if (similarity >= 0.90) return 'very_high';
        if (similarity >= 0.80) return 'high';
        if (similarity >= 0.70) return 'medium';
        if (similarity >= 0.60) return 'low';
        return 'very_low';
    }

    /**
     * 获取置信度描述
     */
    getConfidenceDescription(confidence) {
        const descriptions = {
            'very_high': '非常确定',
            'high': '很确定',
            'medium': '较确定',
            'low': '不太确定',
            'very_low': '很不确定'
        };
        return descriptions[confidence] || '未知';
    }

    /**
     * 设置相似度阈值
     */
    setThreshold(threshold) {
        if (threshold >= 0 && threshold <= 1) {
            this.similarityThreshold = threshold;
            console.log('✅ 相似度阈值已设置为:', threshold);
        } else {
            console.error('❌ 阈值必须在 0-1 之间');
        }
    }

    /**
     * 验证两个声纹是否来自同一人
     */
    verifySpeaker(vector1, vector2, threshold = null) {
        const similarity = this.computeSimilarity(vector1, vector2);
        const useThreshold = threshold !== null ? threshold : this.similarityThreshold;

        return {
            isMatch: similarity >= useThreshold,
            similarity: similarity,
            confidence: this.getConfidenceLevel(similarity)
        };
    }
}

// 导出
window.VoiceprintMatcher = VoiceprintMatcher;
