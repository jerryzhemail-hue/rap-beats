#!/bin/bash
# 通知功能测试脚本

BASE_URL="http://localhost:3000"
SERVER_PID=""

cleanup() {
  echo ""
  echo "=== 清理: 停止服务器 ==="
  [ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null
}

trap cleanup EXIT

# 启动服务器
echo "=== 启动服务器 ==="
cd /Users/wangzhe/Documents/work/rap-beats/server
node --import tsx/esm src/index.ts &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# 等待服务器启动
for i in {1..30}; do
  if curl -s "$BASE_URL/api/health" > /dev/null 2>&1; then
    echo "服务器已启动 ✓"
    break
  fi
  sleep 1
done

if ! curl -s "$BASE_URL/api/health" > /dev/null 2>&1; then
  echo "服务器启动失败 ✗"
  exit 1
fi

echo ""
echo "========================================="
echo "开始通知功能测试"
echo "========================================="
echo ""

# 1. 用户 A 登录或注册
echo "=== 测试 1: 用户 A 登录/注册 ==="
USER_A=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"notif_a6","email":"notif_a6@test.com","password":"TestPass123"}')
if echo "$USER_A" | grep -q "token"; then
  echo "用户 A 注册成功 ✓"
else
  echo "用户 A 已存在，尝试登录..."
  USER_A=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"notif_a6@test.com","password":"TestPass123"}')
  echo "用户 A 登录成功 ✓"
fi
echo "结果: $USER_A" | head -c 200
TOKEN_A=$(echo "$USER_A" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
USER_ID_A=$(echo "$USER_A" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
echo ""
echo "Token: ${TOKEN_A:0:50}..."
echo "用户 ID: $USER_ID_A"

if [ -z "$TOKEN_A" ]; then
  echo "用户 A 获取 Token 失败 ✗"
  exit 1
fi
echo ""

# 2. 用户 B 登录或注册
echo "=== 测试 2: 用户 B 登录/注册 ==="
USER_B=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"notif_b6","email":"notif_b6@test.com","password":"TestPass123"}')
if echo "$USER_B" | grep -q "token"; then
  echo "用户 B 注册成功 ✓"
else
  echo "用户 B 已存在，尝试登录..."
  USER_B=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"notif_b6@test.com","password":"TestPass123"}')
  echo "用户 B 登录成功 ✓"
fi
echo "结果: $USER_B" | head -c 200
TOKEN_B=$(echo "$USER_B" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
USER_ID_B=$(echo "$USER_B" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
echo ""
echo "Token: ${TOKEN_B:0:50}..."
echo "用户 ID: $USER_ID_B"

if [ -z "$TOKEN_B" ]; then
  echo "用户 B 获取 Token 失败 ✗"
  exit 1
fi
echo ""

# 3. 用户 A 创建帖子
echo "=== 测试 3: 用户 A 创建帖子 ==="
POST_RESULT=$(curl -s -X POST "$BASE_URL/api/forum/posts" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"title":"通知测试帖","content":"测试通知推送功能","category_id":1}')
echo "结果: $POST_RESULT"
POST_ID=$(echo "$POST_RESULT" | grep -o '"post_id":[0-9]*' | cut -d':' -f2)
echo "帖子 ID: $POST_ID"

if [ -z "$POST_ID" ]; then
  echo "创建帖子失败 ✗"
  exit 1
fi
echo "创建帖子成功 ✓"
echo ""

# 4. 检查用户 A 未读通知（应为 0）
echo "=== 测试 4: 检查用户 A 初始未读通知数 ==="
UNREAD=$(curl -s "$BASE_URL/api/forum/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN_A")
echo "结果: $UNREAD"
echo "初始未读数为 0 ✓"
echo ""

# 5. 用户 B 点赞帖子
echo "=== 测试 5: 用户 B 点赞帖子 (应触发通知) ==="
LIKE_RESULT=$(curl -s -X POST "$BASE_URL/api/forum/posts/$POST_ID/like" \
  -H "Authorization: Bearer $TOKEN_B")
echo "结果: $LIKE_RESULT"
echo "点赞操作完成 ✓"
sleep 1
echo ""

# 6. 检查用户 A 未读通知（应为 1）
echo "=== 测试 6: 检查用户 A 未读通知数 (应为 1) ==="
UNREAD_AFTER_LIKE=$(curl -s "$BASE_URL/api/forum/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN_A")
echo "结果: $UNREAD_AFTER_LIKE"
EXPECTED='{"unread_count":1}'
if [ "$UNREAD_AFTER_LIKE" = "$EXPECTED" ]; then
  echo "点赞通知已产生 ✓"
else
  echo "点赞通知未产生 ✗ (期望: $EXPECTED, 实际: $UNREAD_AFTER_LIKE)"
fi
echo ""

# 7. 用户 B 评论帖子
echo "=== 测试 7: 用户 B 评论帖子 (应触发通知) ==="
COMMENT_RESULT=$(curl -s -X POST "$BASE_URL/api/forum/posts/$POST_ID/comments" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"content":"这是一条测试评论"}')
echo "结果: $COMMENT_RESULT"
echo "评论操作完成 ✓"
sleep 1
echo ""

# 8. 检查用户 A 未读通知（应为 2）
echo "=== 测试 8: 检查用户 A 未读通知数 (应为 2) ==="
UNREAD_AFTER_COMMENT=$(curl -s "$BASE_URL/api/forum/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN_A")
echo "结果: $UNREAD_AFTER_COMMENT"
EXPECTED_2='{"unread_count":2}'
if [ "$UNREAD_AFTER_COMMENT" = "$EXPECTED_2" ]; then
  echo "评论通知已产生 ✓"
else
  echo "评论通知未产生 ✗ (期望: $EXPECTED_2, 实际: $UNREAD_AFTER_COMMENT)"
fi
echo ""

# 9. 用户 B 关注用户 A
echo "=== 测试 9: 用户 B 关注用户 A (应触发通知) ==="
FOLLOW_RESULT=$(curl -s -X POST "$BASE_URL/api/forum/users/$USER_ID_A/follow" \
  -H "Authorization: Bearer $TOKEN_B")
echo "结果: $FOLLOW_RESULT"
echo "关注操作完成 ✓"
sleep 1
echo ""

# 10. 检查用户 A 未读通知（应为 3）
echo "=== 测试 10: 检查用户 A 未读通知数 (应为 3) ==="
UNREAD_AFTER_FOLLOW=$(curl -s "$BASE_URL/api/forum/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN_A")
echo "结果: $UNREAD_AFTER_FOLLOW"
EXPECTED_3='{"unread_count":3}'
if [ "$UNREAD_AFTER_FOLLOW" = "$EXPECTED_3" ]; then
  echo "关注通知已产生 ✓"
else
  echo "关注通知未产生 ✗ (期望: $EXPECTED_3, 实际: $UNREAD_AFTER_FOLLOW)"
fi
echo ""

# 11. 获取通知列表
echo "=== 测试 11: 获取通知列表 ==="
NOTIFICATIONS=$(curl -s "$BASE_URL/api/forum/notifications" \
  -H "Authorization: Bearer $TOKEN_A")
echo "通知列表:"
echo "$NOTIFICATIONS" | python3 -m json.tool 2>/dev/null || echo "$NOTIFICATIONS"
echo ""

# 12. 标记全部已读
echo "=== 测试 12: 标记全部已读 ==="
READ_ALL=$(curl -s -X PUT "$BASE_URL/api/forum/notifications/read-all" \
  -H "Authorization: Bearer $TOKEN_A")
echo "结果: $READ_ALL"
echo ""

# 13. 检查未读数归零
echo "=== 测试 13: 检查未读数归零 ==="
UNREAD_FINAL=$(curl -s "$BASE_URL/api/forum/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN_A")
echo "结果: $UNREAD_FINAL"
EXPECTED_0='{"unread_count":0}'
if [ "$UNREAD_FINAL" = "$EXPECTED_0" ]; then
  echo "全部已读操作成功 ✓"
else
  echo "全部已读操作失败 ✗"
fi
echo ""

echo "========================================="
echo "测试完成"
echo "========================================="
