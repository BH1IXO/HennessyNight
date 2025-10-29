#!/bin/bash

# 快速测试脚本
# 测试主要API端点

BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api/v1"

echo "======================================================"
echo "🧪 Meeting System Backend - 快速测试"
echo "======================================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4

    echo -n "测试 ${name}... "

    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✅ 通过${NC} (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}❌ 失败${NC} (HTTP $http_code)"
        echo "$body"
    fi

    echo ""
}

# 1. 测试健康检查
echo "1️⃣  测试健康检查"
test_endpoint "Health Check" "GET" "$BASE_URL/health"

# 2. 测试API文档
echo "2️⃣  测试API文档"
test_endpoint "API Docs" "GET" "$API_URL/docs"

# 3. 创建说话人
echo "3️⃣  创建说话人"
SPEAKER_DATA='{
  "name": "测试用户",
  "email": "test@example.com"
}'
speaker_response=$(test_endpoint "Create Speaker" "POST" "$API_URL/speakers" "$SPEAKER_DATA")
SPEAKER_ID=$(echo "$speaker_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "   说话人ID: $SPEAKER_ID"
echo ""

# 4. 获取说话人列表
echo "4️⃣  获取说话人列表"
test_endpoint "List Speakers" "GET" "$API_URL/speakers"

# 5. 创建会议
echo "5️⃣  创建会议"
MEETING_DATA='{
  "title": "快速测试会议",
  "description": "这是一个自动化测试会议",
  "scheduledAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
}'
meeting_response=$(test_endpoint "Create Meeting" "POST" "$API_URL/meetings" "$MEETING_DATA")
MEETING_ID=$(echo "$meeting_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "   会议ID: $MEETING_ID"
echo ""

# 6. 获取会议列表
echo "6️⃣  获取会议列表"
test_endpoint "List Meetings" "GET" "$API_URL/meetings"

# 7. 获取会议详情
if [ ! -z "$MEETING_ID" ]; then
    echo "7️⃣  获取会议详情"
    test_endpoint "Get Meeting" "GET" "$API_URL/meetings/$MEETING_ID"
fi

# 8. 开始会议
if [ ! -z "$MEETING_ID" ]; then
    echo "8️⃣  开始会议"
    test_endpoint "Start Meeting" "POST" "$API_URL/meetings/$MEETING_ID/start"
fi

# 9. 获取会话统计
echo "9️⃣  获取会话统计"
test_endpoint "Session Stats" "GET" "$API_URL/sessions/stats"

# 10. 结束会议
if [ ! -z "$MEETING_ID" ]; then
    echo "🔟 结束会议"
    FINISH_DATA='{"generateSummary": false}'
    test_endpoint "Finish Meeting" "POST" "$API_URL/meetings/$MEETING_ID/finish" "$FINISH_DATA"
fi

echo "======================================================"
echo "✅ 测试完成！"
echo "======================================================"
echo ""
echo "创建的测试数据："
echo "  - 说话人ID: $SPEAKER_ID"
echo "  - 会议ID: $MEETING_ID"
echo ""
echo "清理测试数据："
echo "  curl -X DELETE $API_URL/speakers/$SPEAKER_ID"
echo "  curl -X DELETE $API_URL/meetings/$MEETING_ID"
echo ""
