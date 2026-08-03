<script setup lang="ts">
defineProps<{
  closable?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const plans = [
  {
    label: '访客体验',
    icon: '👤',
    tag: '',
    items: [
      { text: '每天免费试听 3 首', sub: '每首 40 秒' },
      { text: '浏览论坛帖子', sub: '阅读与发现' },
      { text: '浏览 rapper 列表', sub: '' },
    ],
    cta: '登录解锁更多',
    ctaLink: '/login',
    highlight: false,
  },
  {
    label: '免费用户',
    icon: '🎤',
    tag: '已登录',
    items: [
      { text: '完整试听所有伴奏', sub: '不限时长' },
      { text: '每天 3 次免费下载', sub: '积分可兑换更多' },
      { text: '论坛发帖 / 点赞 / 评论', sub: '赚取积分' },
      { text: '每日签到 / 抽奖', sub: '积分换 VIP' },
    ],
    cta: '开通 VIP',
    ctaLink: '/vip',
    highlight: false,
  },
  {
    label: 'VIP 会员',
    icon: '👑',
    tag: '推荐',
    items: [
      { text: '完整试听 + 无限制下载', sub: 'basic 10次 / premium 30次' },
      { text: 'VIP 专属伴奏库', sub: 'premium / ultimate 专享' },
      { text: '高品质音频下载', sub: 'premium / ultimate 专享' },
      { text: '积分任务双倍奖励', sub: '炸场及以上等级' },
    ],
    cta: '查看套餐',
    ctaLink: '/vip',
    highlight: true,
  },
]
</script>

<template>
  <div class="banner-wrap" :class="{ modal: true }">
    <div class="modal-overlay" @click.self="emit('close')"></div>
    <div class="modal-box">
      <div class="modal-head">
        <div>
          <h2 class="modal-title">会员权益一览</h2>
          <p class="modal-sub">登录即享完整试听 / 开通 VIP 解锁全部优质内容</p>
        </div>
        <button class="close-btn" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="plans-grid">
        <div
          v-for="plan in plans"
          :key="plan.label"
          class="plan-card"
          :class="{ highlight: plan.highlight }"
        >
          <div v-if="plan.tag" class="plan-tag">{{ plan.tag }}</div>
          <div class="plan-icon">{{ plan.icon }}</div>
          <h3 class="plan-label">{{ plan.label }}</h3>
          <ul class="plan-items">
            <li v-for="item in plan.items" :key="item.text" class="plan-item">
              <span class="item-main">{{ item.text }}</span>
              <span v-if="item.sub" class="item-sub">{{ item.sub }}</span>
            </li>
          </ul>
          <router-link
            :to="plan.ctaLink"
            class="plan-cta"
            :class="{ 'cta-highlight': plan.highlight }"
            @click="emit('close')"
          >
            {{ plan.cta }}
          </router-link>
        </div>
      </div>

      <div class="notice-block">
        <div class="notice-head">
          <span class="notice-icon">⚠️</span>
          <h3 class="notice-title">使用须知 &amp; 平台协议</h3>
        </div>
        <div class="notice-body">

          <div class="notice-row">
            <span class="notice-badge allowed">✅ 允许</span>
            <p class="notice-text">以下场景属于个人非商业使用范围：</p>
          </div>
          <div class="notice-list">
            <div class="notice-list-item">
              <strong>1. 个人练习</strong> — 私下跟唱、练习演唱、自娱自乐录音（仅个人保存，不对外发布、不传播）
            </div>
            <div class="notice-list-item">
              <strong>2. 鉴赏学习</strong> — 鉴赏beat品质、扒谱学习、音乐理论分析、创作灵感参考
            </div>
            <div class="notice-list-item">
              <strong>3. 非商业分享</strong> — 在封闭的无商业性质社群（如家族群、粉丝群、朋友群）中分享翻唱作品；参加平台内举办的非营利性翻唱活动
            </div>
            <div class="notice-list-item">
              <strong>4. 社交记录</strong> — 将翻唱作品作为个人社交动态（如朋友圈、微博）发布，且不以此获取任何经济收益或商业回报
            </div>
          </div>

          <div class="notice-divider"></div>

          <div class="notice-row">
            <span class="notice-badge forbidden">❌ 严禁</span>
            <p class="notice-text">以下行为一经发现，平台有权立即封禁账号并保留追诉权利：</p>
          </div>
          <div class="notice-list">
            <div class="notice-list-item">
              <strong>1. 商演使用</strong> — 酒吧/音乐节/演唱会等收费演出、票价分成演出、商业品牌活动/年会演出、直播间打赏演出、付费驻唱、商业路演等任何形式的有偿演出
            </div>
            <div class="notice-list-item">
              <strong>2. 流媒体平台发布</strong> — 上传至 Spotify / Apple Music / YouTube Music / 网易云音乐 / QQ音乐 / 酷狗音乐 / 喜马拉雅 / 抖音 / 快手 / B站 / 小红书等任何音视频平台，通过播放量、广告分成、会员内容等任何方式获取收益或流量变现（含"免费发布但接受粉丝打赏"模式）
            </div>
            <div class="notice-list-item">
              <strong>3. 商业发行</strong> — 将beat用于录制专辑、单曲、EP、Mixtape并通过 iTunes / Apple Music / Bandcamp / 网易云店铺等任何渠道发售（含付费与免费换量）；用于影视配乐、广告配乐、游戏配乐、有声读物及播客商业化
            </div>
            <div class="notice-list-item">
              <strong>4. 综艺/选秀/比赛</strong> — 以翻唱作品参加《中国新说唱》《明日之子》《我是歌手》等任何选秀综艺或有奖金/奖品/签约机会的音乐比赛；参与以"出道""成团"为目的的偶像/练习生活动；将作品用于综艺即兴表演、Battle 等任何商业娱乐场景
            </div>
            <div class="notice-list-item">
              <strong>5. License 转让与传播</strong> — 将beat文件或License复制、转让、出售、出借给任何第三方；将beat文件本身（而非翻唱作品）上传至百度网盘、夸克网盘、Discord、GitHub 等任何第三方平台供他人下载；将beat用于制作他人作品
            </div>
            <div class="notice-list-item">
              <strong>6. 擅自改编</strong> — 对beat进行未经授权的 remix、重新编曲、加长/缩短、添加人声素材等二次创作并用于商业目的；制作衍生作品或合辑/Mixtape 并公开发布
            </div>
            <div class="notice-list-item">
              <strong>7. 恶意规避与欺骗</strong> — 通过去水印、修改文件信息等技术手段掩盖beat来源；虚假声称自己为制作人或版权持有者；在收到版权方通知后继续传播；批量下载beat后打包销售等任何商业变现行为
            </div>
          </div>

          <div class="notice-divider"></div>

          <div class="notice-row">
            <span class="notice-badge risk">⚠️ 违规风险</span>
            <p class="notice-text">违规使用后果由用户自行承担，平台概不负责：</p>
          </div>
          <div class="notice-list">
            <div class="notice-list-item"><strong>平台层面</strong> — 账号永久封禁，下载权限、积分、VIP资格全部作废，不予退款</div>
            <div class="notice-list-item"><strong>作品层面</strong> — 流媒体平台收到版权投诉后强制下架，播放记录和收益全部清零</div>
            <div class="notice-list-item"><strong>法律层面</strong> — 版权方可依据《著作权法》提起民事诉讼，追讨实际损失及惩罚性赔偿（单次侵权最高可达50万元）；情节严重构成犯罪的，依法追究刑事责任</div>
            <div class="notice-list-item"><strong>个人声誉</strong> — 侵权记录可能影响后续音乐事业发展，平台有权公示违规行为</div>
          </div>

          <div class="notice-divider"></div>

          <div class="notice-row">
            <span class="notice-badge platform">🏢 平台声明</span>
            <p class="notice-text">请在使用前仔细阅读以下平台条款：</p>
          </div>
          <div class="notice-list">
            <div class="notice-list-item">平台仅提供beat的展示、试听与下载服务，所有beat版权归对应制作人或合法授权方所有</div>
            <div class="notice-list-item">用户下载beat即视为同意本协议全部条款，并承诺仅将内容用于<strong>个人非商业用途</strong></div>
            <div class="notice-list-item">如需商用（包括但不限于：流媒体发布、商演、综艺、影视配乐、广告），须自行联系beat制作人单独购买商业License，平台不提供也不代理任何商业授权</div>
            <div class="notice-list-item">用户在使用beat过程中与其他用户或第三方产生的任何纠纷，与平台无关，平台保留协助权利人维权的义务</div>
            <div class="notice-list-item">平台有权随时更新本协议，并通过站内公告或弹窗形式通知用户，继续使用即视为接受更新</div>
          </div>

          <div class="notice-divider"></div>

          <div class="notice-row">
            <span class="notice-badge safe">🔒 商用建议</span>
            <p class="notice-text">
              如有商用需求，建议通过正规渠道联系beat制作人购买独家或非独家License；
              部分制作人支持在平台内私信联系，商用授权费用由双方自行协商，平台不承担任何交易风险。
            </p>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.banner-wrap {
  position: relative;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 999;
  animation: fadeIn 0.2s;
}
.modal-box {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  background: #0e0e1c;
  border: 1px solid #1e1e35;
  border-radius: 20px;
  width: 780px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  padding: 32px;
  animation: slideUp 0.25s ease;
  box-sizing: border-box;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
  gap: 16px;
}
.modal-title {
  font-size: 22px;
  font-weight: 700;
  color: #e8e8f0;
  margin: 0 0 6px;
  letter-spacing: 1px;
}
.modal-sub {
  font-size: 14px;
  color: #6b6b8a;
  margin: 0;
}
.close-btn {
  background: none;
  border: none;
  color: #6b6b8a;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: color 0.2s;
  flex-shrink: 0;
}
.close-btn:hover { color: #e8e8f0; }

.plans-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.plan-card {
  position: relative;
  background: #14142a;
  border: 1px solid #1e1e3a;
  border-radius: 16px;
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.plan-card:hover {
  border-color: #2e2e55;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
.plan-card.highlight {
  background: linear-gradient(145deg, #1a0f3c 0%, #1e1048 100%);
  border-color: #6d28d9;
  box-shadow: 0 4px 30px rgba(109, 40, 217, 0.25);
}
.plan-card.highlight:hover {
  border-color: #7c3aed;
  box-shadow: 0 6px 35px rgba(109, 40, 217, 0.4);
}
.plan-tag {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: #7c3aed;
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 12px;
  border-radius: 20px;
  white-space: nowrap;
}
.plan-icon { font-size: 28px; line-height: 1; }
.plan-label { font-size: 15px; font-weight: 600; color: #e0e0ee; margin: 0; }

.plan-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.plan-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.item-main { font-size: 13px; color: #c0c0d8; line-height: 1.4; }
.item-sub { font-size: 11px; color: #55556a; line-height: 1.4; }

.plan-cta {
  display: block;
  text-align: center;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
  border: 1px solid #2e2e55;
  color: #9090b0;
  background: transparent;
  margin-top: auto;
}
.plan-cta:hover { border-color: #7c3aed; color: #c4b5fd; }
.plan-cta.cta-highlight { background: #7c3aed; border-color: #7c3aed; color: white; }
.plan-cta.cta-highlight:hover { background: #6d28d9; border-color: #6d28d9; }

/* 使用须知 */
.notice-block {
  margin-top: 28px;
  background: #14142a;
  border: 1px solid #2a2a45;
  border-radius: 14px;
  padding: 20px 24px;
}
.notice-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.notice-icon { font-size: 18px; }
.notice-title {
  font-size: 15px;
  font-weight: 700;
  color: #e8e8f0;
  margin: 0;
}
.notice-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.notice-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.notice-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 6px;
  white-space: nowrap;
  margin-top: 1px;
}
.notice-badge.allowed { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.notice-badge.forbidden { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.notice-badge.risk { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.notice-badge.platform { background: rgba(109, 40, 217, 0.15); color: #a78bfa; }
.notice-text {
  font-size: 13px;
  color: #9090b0;
  line-height: 1.6;
  margin: 0;
}
.notice-text strong { color: #f87171; font-weight: 600; }

.notice-divider {
  height: 1px;
  background: #2a2a45;
  margin: 4px 0;
}

.notice-list {
  padding-left: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: -6px;
}
.notice-list-item {
  font-size: 13px;
  color: #9090b0;
  line-height: 1.6;
  padding-left: 16px;
  position: relative;
}
.notice-list-item::before {
  content: '•';
  position: absolute;
  left: 4px;
  color: #55556a;
}
.notice-list-item strong { color: #e8e8f0; font-weight: 600; }

.notice-badge.safe { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }

@media (max-width: 600px) {
  .plans-grid { grid-template-columns: 1fr; }
  .modal-box { padding: 20px; }
}
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes slideUp { from { opacity: 0; transform: translate(-50%, calc(-50% + 16px)) } to { opacity: 1; transform: translate(-50%, -50%) } }
</style>

