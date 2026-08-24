import {
  createForumRouter,
  getForumDatabaseClient,
  getDatabaseClient,
  requireAuth,
  type AuthRequest,
  type ForumConversationRow,
  messageLimiter,
  type ForumMessage,
} from './forum-common.js';
import { addClient, removeClient, pushToUser } from '../services/messageEvents.js';

const router = createForumRouter();

function generateConversationId(userId1: number, userId2: number): string {
  const a = Math.min(userId1, userId2);
  const b = Math.max(userId1, userId2);
  return `${a}_${b}`;
}

// 获取会话的另一个参与者信息
async function getOtherParticipant(conversation: ForumConversationRow, currentUserId: number, mainDb: ReturnType<typeof getDatabaseClient>): Promise<{ id: number; username: string; avatar_url: string } | null> {
  const otherId = conversation.participant_a === currentUserId ? conversation.participant_b : conversation.participant_a;
  return (await mainDb.queryOne<{ id: number; username: string; avatar_url: string }>(
    'SELECT id, username, avatar_url FROM users WHERE id = ?',
    [otherId]
  )) ?? null;
}

// 获取会话列表
router.get('/forum/messages/conversations', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const userId = req.user!.id;

  const conversations = await db.queryMany<ForumConversationRow>(
    `SELECT * FROM forum_conversations
     WHERE participant_a = ? OR participant_b = ?
     ORDER BY last_message_at DESC`,
    [userId, userId]
  );

  const result = await Promise.all(conversations.map(async (conv) => {
    const other = await getOtherParticipant(conv, userId, mainDb);
    const unreadCount = conv.participant_a === userId ? conv.unread_count_a : conv.unread_count_b;
    return {
      id: conv.id,
      other_user: other,
      last_message_content: conv.last_message_content,
      last_message_at: conv.last_message_at,
      unread_count: unreadCount,
    };
  }));

  res.json({ conversations: result });
});

// 创建/确保会话存在（不发送消息，用于从外部跳转私信时预创建会话）
router.post('/forum/messages/conversations', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const currentUserId = req.user!.id;
  const { receiver_id } = req.body as { receiver_id?: number };

  if (!receiver_id || !Number.isInteger(receiver_id) || receiver_id <= 0) {
    return res.status(400).json({ error: '无效的 receiver_id' });
  }

  if (receiver_id === currentUserId) {
    return res.status(400).json({ error: '不能和自己私信' });
  }

  // 检查对方是否存在
  const receiver = await mainDb.queryOne<{ id: number; username: string }>(
    'SELECT id, username FROM users WHERE id = ?',
    [receiver_id]
  );
  if (!receiver) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 检查拉黑关系
  const blockCheck = await db.queryOne<{ blocked_by_me: number; blocked_me: number }>(
    `SELECT
       (SELECT 1 FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ? LIMIT 1) AS blocked_by_me,
       (SELECT 1 FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ? LIMIT 1) AS blocked_me`,
    [currentUserId, receiver_id, receiver_id, currentUserId]
  );

  if (blockCheck?.blocked_by_me) {
    return res.status(403).json({ error: '你已拉黑该用户，无法发起私信' });
  }
  if (blockCheck?.blocked_me) {
    return res.status(403).json({ error: '你已被对方拉黑，无法发起私信' });
  }

  // 确保会话存在
  const conversationId = generateConversationId(currentUserId, receiver_id);
  let conversation = await db.queryOne<ForumConversationRow>(
    'SELECT * FROM forum_conversations WHERE id = ?',
    [conversationId]
  );

  if (!conversation) {
    await db.execute(
      'INSERT INTO forum_conversations (id, participant_a, participant_b, last_message_content, last_message_at) VALUES (?, ?, ?, ?, NOW())',
      [conversationId, Math.min(currentUserId, receiver_id), Math.max(currentUserId, receiver_id), '']
    );
    conversation = await db.queryOne<ForumConversationRow>(
      'SELECT * FROM forum_conversations WHERE id = ?',
      [conversationId]
    );
  }

  const unreadCount = conversation!.participant_a === currentUserId
    ? conversation!.unread_count_a
    : conversation!.unread_count_b;

  res.json({
    id: conversation!.id,
    other_user: { id: receiver.id, username: receiver.username, avatar_url: null },
    last_message_content: conversation!.last_message_content || '',
    last_message_at: conversation!.last_message_at,
    unread_count: unreadCount,
  });
});

// 获取未读消息总数（必须在 /:conversationId 之前）
router.get('/forum/messages/unread-count', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;

  const result = await db.queryOne<{ total: number }>(
    `SELECT CAST(COALESCE(SUM(
      CASE WHEN participant_a = ? THEN unread_count_a ELSE unread_count_b END
    ), 0) AS SIGNED) as total
    FROM forum_conversations
    WHERE participant_a = ? OR participant_b = ?`,
    [userId, userId, userId]
  );

  res.json({ unread_count: Number(result?.total ?? 0) });
});

// 实时私信推送（SSE）—— 必须注册在 /:conversationId 之前，否则 stream 会被当作会话 ID
// 鉴权用 ?token= query（EventSource 不支持自定义请求头）
router.get('/forum/messages/stream', requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  addClient(userId, res);

  // 客户端断开连接时清理，避免内存泄漏与向已关闭的 res 写入
  req.on('close', () => {
    removeClient(userId, res);
  });
});

// 获取某个会话的消息列表
router.get('/forum/messages/:conversationId', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const { conversationId } = req.params;
  const userId = req.user!.id;
  const { page = '1', page_size = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(page_size)));
  const offset = (pageNum - 1) * pageSize;

  // 验证用户是该会话的参与者
  const conversation = await db.queryOne<ForumConversationRow>(
    'SELECT * FROM forum_conversations WHERE id = ? AND (participant_a = ? OR participant_b = ?)',
    [conversationId, userId, userId]
  );

  if (!conversation) {
    return res.status(404).json({ error: '会话不存在或无权访问' });
  }

  // 获取消息
  const messages = await db.queryMany<ForumMessage>(
    `SELECT * FROM forum_messages
     WHERE conversation_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [conversationId, pageSize, offset]
  );

  // 统计总消息数
  const [{ count }] = await db.queryMany<{ count: number }>(
    'SELECT COUNT(*) as count FROM forum_messages WHERE conversation_id = ?',
    [conversationId]
  );

  // 使用 mainDb 获取发送者信息
  const senderIds = [...new Set(messages.map(m => m.sender_id))];
  const senders = senderIds.length > 0
    ? await mainDb.queryMany<{ id: number; username: string; avatar_url: string }>(
        `SELECT id, username, avatar_url FROM users WHERE id IN (${senderIds.map(() => '?').join(',')})`,
        senderIds
      )
    : [];
  const senderMap = new Map(senders.map(s => [s.id, s]));

  const enrichedMessages = messages.map(m => ({
    ...m,
    sender_username: senderMap.get(m.sender_id)?.username,
    sender_avatar: senderMap.get(m.sender_id)?.avatar_url,
  }));

  res.json({
    messages: enrichedMessages.reverse(), // 按时间正序
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total: count,
      total_pages: Math.ceil(count / pageSize),
    },
  });
});

// 发送私信
router.post('/forum/messages', requireAuth, messageLimiter, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const senderId = req.user!.id;
  const { receiver_id, content, message_type = 'text' } = req.body as {
    receiver_id?: number;
    content?: string;
    message_type?: 'text' | 'image';
  };

  if (!receiver_id || !content?.trim()) {
    return res.status(400).json({ error: '请填写收件人和内容' });
  }

  if (senderId === receiver_id) {
    return res.status(400).json({ error: '不能给自己发私信' });
  }

  // 验证收件人存在
  const receiver = await mainDb.queryOne<{ id: number }>('SELECT id FROM users WHERE id = ?', [receiver_id]);
  if (!receiver) {
    return res.status(404).json({ error: '收件人不存在' });
  }

  // 黑名单检查：被对方拉黑或我已拉黑对方都不能发
  const blocked = await db.queryOne<{ user_id: number }>(
    'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
    [receiver_id, senderId]
  );
  if (blocked) {
    return res.status(403).json({ error: '你已被对方拉黑，无法发送消息' });
  }
  const blockedByMe = await db.queryOne<{ user_id: number }>(
    'SELECT user_id FROM forum_blocks WHERE user_id = ? AND blocked_user_id = ?',
    [senderId, receiver_id]
  );
  if (blockedByMe) {
    return res.status(403).json({ error: '你已拉黑该用户，无法发送消息' });
  }

  // 关注关系检查：互不关注时新消息最多 1 条
  const [iFollow, theyFollow] = await Promise.all([
    db.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [senderId, receiver_id]
    ),
    db.queryOne<{ follower_id: number }>(
      'SELECT follower_id FROM forum_follows WHERE follower_id = ? AND following_id = ?',
      [receiver_id, senderId]
    ),
  ]);

  if (!iFollow && !theyFollow) {
    const conversationId = generateConversationId(senderId, receiver_id);
    const theirReply = await db.queryOne<{ id: number }>(
      `SELECT id FROM forum_messages
       WHERE conversation_id = ? AND sender_id = ? AND message_type = 'text' LIMIT 1`,
      [conversationId, receiver_id]
    );
    const myTextCount = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM forum_messages
       WHERE conversation_id = ? AND sender_id = ? AND message_type = 'text'`,
      [conversationId, senderId]
    );
    if (!theirReply && (myTextCount?.c || 0) >= 1) {
      return res.status(429).json({
        error: '由于对方并未关注你，在收到对方回复之前，你最多只能发送 1 条文字消息',
      });
    }
  }

  const conversationId = generateConversationId(senderId, receiver_id);

  // 获取或创建会话
  let conversation = await db.queryOne<ForumConversationRow>(
    'SELECT * FROM forum_conversations WHERE id = ?',
    [conversationId]
  );

  if (!conversation) {
    await db.execute(
      'INSERT INTO forum_conversations (id, participant_a, participant_b, last_message_content, last_message_at) VALUES (?, ?, ?, ?, NOW())',
      [conversationId, Math.min(senderId, receiver_id), Math.max(senderId, receiver_id), content.slice(0, 200)]
    );
    conversation = await db.queryOne<ForumConversationRow>(
      'SELECT * FROM forum_conversations WHERE id = ?',
      [conversationId]
    );
  } else {
    // 更新会话
    await db.execute(
      'UPDATE forum_conversations SET last_message_content = ?, last_message_at = NOW() WHERE id = ?',
      [content.slice(0, 200), conversationId]
    );
  }

  // 插入消息
  const result = await db.execute(
    'INSERT INTO forum_messages (conversation_id, sender_id, receiver_id, content, message_type) VALUES (?, ?, ?, ?, ?)',
    [conversationId, senderId, receiver_id, content, message_type]
  );

  // 更新未读计数
  const isSenderA = conversation!.participant_a === senderId;
  const unreadField = isSenderA ? 'unread_count_b' : 'unread_count_a';
  await db.execute(
    `UPDATE forum_conversations SET ${unreadField} = ${unreadField} + 1 WHERE id = ?`,
    [conversationId]
  );

  const message = await db.queryOne<ForumMessage>(
    'SELECT * FROM forum_messages WHERE id = ?',
    [(result as any).insertId]
  );

  // 实时推送：向在线接收者推送新消息事件（SSE）
  // 附带发送者信息，便于前端直接渲染气泡，无需二次查询
  if (message) {
    const senderInfo = await mainDb.queryOne<{ username: string; avatar_url: string }>(
      'SELECT username, avatar_url FROM users WHERE id = ?',
      [senderId]
    );
    const enrichedMessage = {
      ...message,
      sender_username: senderInfo?.username,
      sender_avatar: senderInfo?.avatar_url,
    };
    pushToUser(receiver_id, 'message', {
      conversation_id: conversationId,
      sender_id: senderId,
      sender_username: senderInfo?.username,
      sender_avatar: senderInfo?.avatar_url,
      message: enrichedMessage,
    });
    res.status(201).json({ message: enrichedMessage });
  } else {
    res.status(201).json({ message });
  }
});

// 标记会话已读
router.put('/forum/messages/:conversationId/read', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const { conversationId } = req.params;
  const userId = req.user!.id;

  // 验证用户是该会话的参与者
  const conversation = await db.queryOne<ForumConversationRow>(
    'SELECT * FROM forum_conversations WHERE id = ? AND (participant_a = ? OR participant_b = ?)',
    [conversationId, userId, userId]
  );

  if (!conversation) {
    return res.status(404).json({ error: '会话不存在或无权访问' });
  }

  // 标记所有消息为已读
  await db.execute(
    'UPDATE forum_messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0',
    [conversationId, userId]
  );

  // 重置未读计数
  const isSenderA = conversation.participant_a === userId;
  const unreadField = isSenderA ? 'unread_count_a' : 'unread_count_b';
  await db.execute(
    `UPDATE forum_conversations SET ${unreadField} = 0 WHERE id = ?`,
    [conversationId]
  );

  res.json({ success: true });
});

// 删除会话（自己侧）
router.delete('/forum/messages/:conversationId', requireAuth, async (req: AuthRequest, res) => {
  const db = getForumDatabaseClient();
  const userId = req.user!.id;
  const raw = req.params.conversationId;
  const conversationId = decodeURIComponent(Array.isArray(raw) ? raw[0] : raw);

  const conversation = await db.queryOne<ForumConversationRow>(
    'SELECT * FROM forum_conversations WHERE id = ? AND (participant_a = ? OR participant_b = ?)',
    [conversationId, userId, userId]
  );

  if (!conversation) {
    return res.status(404).json({ error: '会话不存在或无权访问' });
  }

  // 删除会话（消息级联删除由 FK ON DELETE CASCADE 处理）
  await db.execute('DELETE FROM forum_conversations WHERE id = ?', [conversationId]);

  res.json({ success: true });
});

export default router;
