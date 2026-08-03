/**
 * 一次性脚本：清洗论坛数据库中已有的 XSS 脏数据
 *
 * 运行方式：
 *   npm run sanitize-forum   （项目根目录）
 *   或   cd server && npx tsx src/scripts/sanitize-forum-data.ts
 *
 * 该脚本：
 *   1. 将 forum_posts.title 和 forum_posts.content 中已存在的恶意内容处理掉
 *   2. 将 forum_comments.content 中已存在的恶意内容处理掉
 *   3. 输出处理结果摘要
 *
 * 安全说明：
 *   - 只处理 XSS 向量（script、事件处理器、危险协议），保留正常格式
 *   - 更新前会先查询并展示可疑记录的数量
 *   - 所有操作仅影响历史数据，新增数据由写入侧的 sanitize.ts 保护
 */
import 'dotenv/config';
import { initDatabase, getDatabaseClient, getForumDatabaseClient, initMySqlDatabaseClientFromEnv } from '../database/index.js';
import { sanitizeHtml, escapeHtmlContent } from '../utils/sanitize.js';

async function main() {
  console.log('🔍 论坛数据 XSS 清洗脚本');
  console.log('='.repeat(50));

  initMySqlDatabaseClientFromEnv();
  await initDatabase(getDatabaseClient(), getForumDatabaseClient());

  const forumDb = getForumDatabaseClient();

  // ── 1. 清洗 forum_posts.title ──────────────────────────────────────────────────
  console.log('\n[1/3] 检查 forum_posts.title...');
  const posts = await forumDb.queryMany<{ id: number; title: string }>(
    'SELECT id, title FROM forum_posts'
  );

  const dangerousTitles = posts.filter(p =>
    /<script|on\w+=|javascript:|data:/i.test(p.title)
  );
  console.log(`   可疑帖子标题: ${dangerousTitles.length} 条`);

  if (dangerousTitles.length > 0) {
    for (const p of dangerousTitles) {
      const cleaned = escapeHtmlContent(p.title);
      await forumDb.execute(
        'UPDATE forum_posts SET title = ? WHERE id = ?',
        [cleaned, p.id]
      );
    }
    console.log(`   ✅ 已清洗 ${dangerousTitles.length} 条`);
  } else {
    console.log('   ✅ 无需清洗');
  }

  // ── 2. 清洗 forum_posts.content ───────────────────────────────────────────────
  console.log('\n[2/3] 检查 forum_posts.content...');
  const postsWithContent = await forumDb.queryMany<{ id: number; content: string }>(
    'SELECT id, content FROM forum_posts'
  );

  const dangerousContent = postsWithContent.filter(p =>
    /<script|on\w+=|javascript:|vbscript:/i.test(p.content ?? '')
  );
  console.log(`   可疑帖子正文: ${dangerousContent.length} 条`);

  if (dangerousContent.length > 0) {
    for (const p of dangerousContent) {
      const cleaned = sanitizeHtml(p.content);
      await forumDb.execute(
        'UPDATE forum_posts SET content = ? WHERE id = ?',
        [cleaned, p.id]
      );
    }
    console.log(`   ✅ 已清洗 ${dangerousContent.length} 条`);
  } else {
    console.log('   ✅ 无需清洗');
  }

  // ── 3. 清洗 forum_comments.content ───────────────────────────────────────────
  console.log('\n[3/3] 检查 forum_comments.content...');
  const comments = await forumDb.queryMany<{ id: number; content: string }>(
    'SELECT id, content FROM forum_comments'
  );

  const dangerousComments = comments.filter(c =>
    /<[^>]*>/.test(c.content ?? '') // 包含任何 HTML 标签的评论都应清洗
  );
  console.log(`   含 HTML 标签的评论: ${dangerousComments.length} 条`);

  if (dangerousComments.length > 0) {
    for (const c of dangerousComments) {
      const cleaned = escapeHtmlContent(c.content);
      await forumDb.execute(
        'UPDATE forum_comments SET content = ? WHERE id = ?',
        [cleaned, c.id]
      );
    }
    console.log(`   ✅ 已清洗 ${dangerousComments.length} 条`);
  } else {
    console.log('   ✅ 无需清洗');
  }

  const total = dangerousTitles.length + dangerousContent.length + dangerousComments.length;
  console.log('\n' + '='.repeat(50));
  if (total > 0) {
    console.log(`✅ 清洗完成！共处理 ${total} 条记录。`);
  } else {
    console.log('✅ 数据库中未发现 XSS 脏数据，无需清洗。');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
