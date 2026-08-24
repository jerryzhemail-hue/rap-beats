/**
 * 论坛模块聚合路由器
 *
 * 由以下子模块组成（均从 forum-common.ts 共享基础设施）：
 *   forum-categories.ts   — 分类 / 话题 / 话题推荐
 *   forum-posts.ts        — 帖子 / 评论 / 点赞 / 收藏
 *   forum-points.ts       — 签到 / 积分 / 抽奖 / 兑换
 *   forum-uploads.ts      — 个人中心(my-*) / 图片/音频/视频上传 / BPM分析
 *   forum-messages.ts     — 私信会话 / 消息 / SSE流
 *   forum-social.ts      — 黑名单 / 用户资料 / 关注 / 好友
 *
 * 所有子模块的路由路径统一以 /forum 为前缀，
 * 与原 forum.ts 保持完全兼容（零停机重构）。
 */

import { createForumRouter } from './forum-common.js';
import forumCategoriesRouter from './forum-categories.js';
import forumPostsRouter from './forum-posts.js';
import forumPointsRouter from './forum-points.js';
import forumUploadsRouter from './forum-uploads.js';
import forumMessagesRouter from './forum-messages.js';
import forumSocialRouter from './forum-social.js';
import forumNotificationsRouter from './forum-notifications.js';

const router = createForumRouter();

router.use(forumCategoriesRouter);
router.use(forumPostsRouter);
router.use(forumPointsRouter);
router.use(forumUploadsRouter);
router.use(forumMessagesRouter);
router.use(forumSocialRouter);
router.use(forumNotificationsRouter);

export default router;
