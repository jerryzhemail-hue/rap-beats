<template>
  <div class="points-center">
    <!-- 顶部导航 -->
    <div class="header-bar">
      <button class="back-btn" @click="$router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h1>积分中心</h1>
      <div class="points-display">
        <span class="points-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
          </svg>
        </span>
        <span class="points-num">{{ userPoints.toLocaleString() }}</span>
      </div>
    </div>

    <div class="main-container">
      <!-- 左侧边栏 -->
      <div class="sidebar">
        <div class="user-card">
          <div class="user-avatar">
            <img v-if="avatarSrc" :src="avatarSrc" alt="头像" />
            <span v-else>{{ avatarLetter }}</span>
          </div>
          <div class="user-info">
            <span class="user-name">{{ username }}</span>
            <div class="user-level">
              <span class="level-icon" v-html="levelConfig.icon"></span>
              <span class="level-text">{{ levelConfig.name }}</span>
            </div>
          </div>
        </div>

        <nav class="nav-menu">
          <button 
            v-for="item in navItems" 
            :key="item.key"
            :class="['nav-item', { active: activeTab === item.key }]"
            @click="activeTab = item.key"
          >
            <span class="nav-icon" v-html="item.icon"></span>
            <span class="nav-text">{{ item.label }}</span>
            <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          </button>
        </nav>
      </div>

      <!-- 右侧内容区 -->
      <div class="content-area">
        <!-- 等级页 -->
        <div v-if="activeTab === 'level'" class="page-content">
          <div class="page-header">
            <h2>我的等级</h2>
          </div>

          <div class="level-card" :style="{ background: `linear-gradient(135deg, ${levelConfig.color}22, ${levelConfig.color}11)` }">
            <div class="level-badge-large">
              <span class="level-icon-large" v-html="levelConfig.icon"></span>
            </div>
            <div class="level-info">
              <div class="level-name-large">{{ levelConfig.name }}</div>
              <div class="level-tip">{{ levelConfig.tip }}</div>
            </div>
            <div class="level-points">
              <span class="points-label">积分</span>
              <span class="points-value">{{ userPoints.toLocaleString() }}</span>
            </div>
          </div>

          <div class="progress-section">
            <div class="progress-header">
              <span>距离 {{ nextLevelConfig?.name || '满级' }}</span>
              <span>{{ userPoints }} / {{ levelConfig.nextThreshold || '∞' }}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: progressPercent + '%', background: levelConfig.color }"></div>
            </div>
          </div>

          <div class="privileges-section">
            <h3>等级特权</h3>
            <div class="privileges-grid">
              <div v-for="priv in levelConfig.privileges" :key="priv" class="privilege-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <span>{{ priv }}</span>
              </div>
            </div>
          </div>

          <div class="level-list">
            <h3>等级一览</h3>
            <div class="level-items">
              <div 
                v-for="lv in levelConfigs" 
                :key="lv.name"
                :class="['level-item', { current: lv.name === levelConfig.name, locked: userPoints < lv.min }]"
              >
                <div class="level-item-icon" :style="{ color: lv.color }">
                  <span v-html="lv.icon"></span>
                </div>
                <div class="level-item-info">
                  <span class="level-item-name">{{ lv.name }}</span>
                  <span class="level-item-range">{{ lv.min }}+ 积分</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 签到页 -->
        <div v-if="activeTab === 'signin'" class="page-content">
          <div class="page-header">
            <h2>每日签到</h2>
            <span class="streak-badge" v-if="signInStatus.consecutive_days > 0">
              连续 {{ signInStatus.consecutive_days }} 天
            </span>
          </div>

          <div class="calendar-card">
            <div class="calendar-header">
              <button class="cal-nav" @click="changeMonth(-1)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
              <span class="cal-title">{{ currentYear }} 年 {{ currentMonth + 1 }} 月</span>
              <button class="cal-nav" @click="changeMonth(1)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            </div>
            <div class="calendar-grid">
              <div class="cal-weekday" v-for="day in ['日', '一', '二', '三', '四', '五', '六']" :key="day">{{ day }}</div>
              <div 
                v-for="(day, idx) in calendarDays" 
                :key="idx"
                :class="['cal-day', { 
                  empty: !day, 
                  signed: day?.signed, 
                  today: day?.isToday,
                  future: day?.isFuture 
                }]"
              >
                <span v-if="day">{{ day.date }}</span>
                <span v-if="day?.signed" class="signed-mark">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                </span>
              </div>
            </div>
          </div>

          <div class="signin-action">
            <div class="signin-reward">
              <span class="reward-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                </svg>
              </span>
              <div class="reward-text">
                <span class="reward-amount">{{ signInPrimaryReward }}</span>
                <span class="reward-desc">{{ signInDescription }}</span>
              </div>
            </div>
            <button 
              class="signin-btn"
              :class="{ disabled: signInStatus.signed_today }"
              :disabled="signInStatus.signed_today || signInLoading"
              @click="handleSignIn"
            >
              <span v-if="signInLoading">签到中...</span>
              <span v-else-if="signInStatus.signed_today">已签到</span>
              <span v-else>立即签到</span>
            </button>
          </div>

          <div class="signin-tips">
            <h4>签到里程碑奖励</h4>
            <div class="streak-rewards">
              <div
                v-for="milestone in signInMilestones"
                :key="milestone.days"
                class="streak-item"
                :class="{ active: signInStatus.consecutive_days >= milestone.days }"
              >
                <span class="streak-days">{{ milestone.days }} 天</span>
                <span class="streak-points">+{{ milestone.points }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 抽奖页 -->
        <div v-if="activeTab === 'lottery'" class="page-content">
          <div class="page-header">
            <h2>积分抽奖</h2>
            <span class="chance-info">
              今日剩余 <strong>{{ computedLotteryChances }}</strong> 次 · 每次消耗 5 积分
            </span>
          </div>

          <div class="lottery-card">
            <div class="wheel-container">
              <div class="wheel-glow"></div>
              <div 
                class="wheel" 
                :class="{ spinning: isSpinning }"
                :style="{ transform: `rotate(${wheelAngle}deg)` }"
              >
                <div v-for="(prize, idx) in wheelPrizes" :key="idx" class="wheel-prize" :style="getWheelPrizeStyle(idx)">
                  <span class="prize-text">{{ prize.name }}</span>
                </div>
              </div>
              <button class="wheel-btn" @click="spinWheel" :disabled="isSpinning || lotteryChances <= 0">
                <span v-if="isSpinning">抽奖中</span>
                <span v-else>立即抽奖</span>
              </button>
            </div>
          </div>

          <div class="lottery-history">
            <h4>中奖记录</h4>
            <div v-if="lotteryRecords.length === 0" class="empty-hint">
              暂无中奖记录
            </div>
            <div v-else class="records-list">
              <div v-for="record in lotteryRecords" :key="record.id" class="record-item">
                <span class="record-prize">{{ record.prizeName }}</span>
                <span class="record-time">{{ formatTime(record.created_at) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 福利页 -->
        <div v-if="activeTab === 'benefits'" class="page-content">
          <div class="page-header">
            <h2>积分福利</h2>
          </div>

          <div class="benefits-intro">
            <p>使用积分可兑换各种会员特权，更多福利持续更新中...</p>
          </div>

          <!-- 积分兑换下载权限 -->
          <div class="download-exchange-section">
            <div class="section-header-row">
              <h3>积分兑换下载权限</h3>
              <span class="permission-badge" v-if="downloadPermission.remaining_permissions > 0">
                剩余 {{ downloadPermission.remaining_permissions }} 次
              </span>
            </div>
            <div class="download-exchange-card">
              <div class="exchange-points-cost">
                <span class="cost-num">{{ downloadPermission.exchange_cost }}</span>
                <span class="cost-unit">积分</span>
              </div>
              <div class="exchange-desc">
                <span class="exchange-desc-title">兑换内容</span>
                <span class="exchange-desc-content">{{ downloadPermission.description }}</span>
                <span class="exchange-desc-hint">兑换后可在任意伴奏详情页直接下载</span>
              </div>
              <button
                class="exchange-download-btn"
                :disabled="userPoints < downloadPermission.exchange_cost || exchangingDownload"
                @click="handleExchangeDownload"
              >
                <span v-if="exchangingDownload">兑换中...</span>
                <span v-else-if="userPoints < downloadPermission.exchange_cost">积分不足</span>
                <span v-else>立即兑换</span>
              </button>
            </div>
          </div>

          <div class="benefits-list">
            <div v-for="plan in exchangePlans" :key="plan.level" class="benefit-card" :class="{ featured: plan.featured }">
              <div v-if="plan.featured" class="featured-tag">推荐</div>
              <div class="benefit-header">
                <span class="benefit-name">{{ plan.name }}</span>
                <div class="benefit-price">
                  <span class="price-num">{{ plan.pointsCost.toLocaleString() }}</span>
                  <span class="price-unit">积分/月</span>
                </div>
              </div>
              <div class="benefit-features">
                <div v-for="feat in plan.benefits" :key="feat" class="feature-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  <span>{{ feat }}</span>
                </div>
              </div>
              <button 
                class="benefit-btn"
                :disabled="userPoints < plan.pointsCost || exchanging === plan.level"
                @click="handleExchange(plan)"
              >
                <span v-if="exchanging === plan.level">兑换中...</span>
                <span v-else-if="userPoints < plan.pointsCost">积分不足</span>
                <span v-else>立即兑换</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 记录页 -->
        <div v-if="activeTab === 'records'" class="page-content">
          <div class="page-header">
            <h2>积分记录</h2>
            <div class="filter-tabs">
              <button 
                v-for="f in filters" 
                :key="f.key"
                :class="['filter-btn', { active: currentFilter === f.key }]"
                @click="currentFilter = f.key"
              >
                {{ f.label }}
              </button>
            </div>
          </div>

          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
          </div>
          <div v-else-if="filteredRecords.length === 0" class="empty-state">
            <p>暂无记录</p>
          </div>
          <div v-else class="records-list-full">
            <div v-for="record in filteredRecords" :key="record.id" class="record-row">
              <div class="record-icon" :class="record.change > 0 ? 'income' : 'expense'">
                <svg v-if="record.change > 0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>
              </div>
              <div class="record-info">
                <span class="record-reason">{{ getReasonLabel(record.reason) }}</span>
                <span class="record-date">{{ formatTime(record.created_at) }}</span>
              </div>
              <div class="record-amount" :class="record.change > 0 ? 'income' : 'expense'">
                {{ record.change > 0 ? '+' : '' }}{{ record.change }}
              </div>
            </div>
            <button v-if="hasMore" class="load-more" @click="loadMore" :disabled="loadingMore">
              {{ loadingMore ? '加载中...' : '加载更多' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 抽奖结果弹窗 -->
    <div v-if="showLotteryResult" class="modal-overlay" @click.self="showLotteryResult = false">
      <div class="result-modal" :class="{ 'is-win': currentPrize?.points > 0 || currentPrize?.vip_days > 0 }">
        <div class="result-glow"></div>
        <div class="result-icon" :style="{ background: currentPrize.bgColor }">
          <span v-html="currentPrize.icon"></span>
        </div>
        <h3 class="result-title" :class="{ 'win-text': currentPrize?.points > 0 || currentPrize?.vip_days > 0 }">
          {{ currentPrize.name }}
        </h3>
        <p class="result-desc">{{ currentPrize.desc }}</p>
        <div v-if="currentPrize?.points > 0" class="result-points">
          <span class="result-points-label">净得</span>
          <span class="result-points-value">+{{ currentPrize.points - 5 }}</span>
        </div>
        <p v-if="currentPrize.vip_days > 0" class="vip-hint">
          VIP 天数已发放，请到个人中心查看
        </p>
        <button class="result-confirm" @click="showLotteryResult = false">确定</button>
      </div>
    </div>

        <!-- 使用协议页 -->
        <div v-if="activeTab === 'agreement'" class="page-content">
          <div class="page-header">
            <h2>使用协议</h2>
          </div>

          <div class="agreement-block">
            <div class="agreement-section">
              <div class="agreement-row">
                <span class="agreement-badge allowed">✅ 允许</span>
                <p class="agreement-text">以下场景属于个人非商业使用范围：</p>
              </div>
              <div class="agreement-list">
                <div class="agreement-list-item">
                  <strong>1. 个人练习</strong> — 私下跟唱、练习演唱、自娱自乐录音（仅个人保存，不对外发布、不传播）
                </div>
                <div class="agreement-list-item">
                  <strong>2. 鉴赏学习</strong> — 鉴赏beat品质、扒谱学习、音乐理论分析、创作灵感参考
                </div>
                <div class="agreement-list-item">
                  <strong>3. 非商业分享</strong> — 在封闭的无商业性质社群（如家族群、粉丝群、朋友群）中分享翻唱作品；参加平台内举办的非营利性翻唱活动
                </div>
                <div class="agreement-list-item">
                  <strong>4. 社交记录</strong> — 将翻唱作品作为个人社交动态（如朋友圈、微博）发布，且不以此获取任何经济收益或商业回报
                </div>
              </div>
            </div>

            <div class="agreement-divider"></div>

            <div class="agreement-section">
              <div class="agreement-row">
                <span class="agreement-badge forbidden">❌ 严禁</span>
                <p class="agreement-text">以下行为一经发现，平台有权立即封禁账号并保留追诉权利：</p>
              </div>
              <div class="agreement-list">
                <div class="agreement-list-item">
                  <strong>1. 商演使用</strong> — 酒吧/音乐节/演唱会等收费演出、票价分成演出、商业品牌活动/年会演出、直播间打赏演出、付费驻唱、商业路演等任何形式的有偿演出
                </div>
                <div class="agreement-list-item">
                  <strong>2. 流媒体平台发布</strong> — 上传至 Spotify / Apple Music / YouTube Music / 网易云音乐 / QQ音乐 / 酷狗音乐 / 喜马拉雅 / 抖音 / 快手 / B站 / 小红书等任何音视频平台，通过播放量、广告分成、会员内容等任何方式获取收益或流量变现（含"免费发布但接受粉丝打赏"模式）
                </div>
                <div class="agreement-list-item">
                  <strong>3. 商业发行</strong> — 将beat用于录制专辑、单曲、EP、Mixtape并通过 iTunes / Apple Music / Bandcamp / 网易云店铺等任何渠道发售（含付费与免费换量）；用于影视配乐、广告配乐、游戏配乐、有声读物及播客商业化
                </div>
                <div class="agreement-list-item">
                  <strong>4. 综艺/选秀/比赛</strong> — 以翻唱作品参加《中国新说唱》《明日之子》《我是歌手》等任何选秀综艺或有奖金/奖品/签约机会的音乐比赛；参与以"出道""成团"为目的的偶像/练习生活动；将作品用于综艺即兴表演、Battle 等任何商业娱乐场景
                </div>
                <div class="agreement-list-item">
                  <strong>5. License 转让与传播</strong> — 将beat文件或License复制、转让、出售、出借给任何第三方；将beat文件本身（而非翻唱作品）上传至百度网盘、夸克网盘、Discord、GitHub 等任何第三方平台供他人下载；将beat用于制作他人作品
                </div>
                <div class="agreement-list-item">
                  <strong>6. 擅自改编</strong> — 对beat进行未经授权的 remix、重新编曲、加长/缩短、添加人声素材等二次创作并用于商业目的；制作衍生作品或合辑/Mixtape 并公开发布
                </div>
                <div class="agreement-list-item">
                  <strong>7. 恶意规避与欺骗</strong> — 通过去水印、修改文件信息等技术手段掩盖beat来源；虚假声称自己为制作人或版权持有者；在收到版权方通知后继续传播；批量下载beat后打包销售等任何商业变现行为
                </div>
              </div>
            </div>

            <div class="agreement-divider"></div>

            <div class="agreement-section">
              <div class="agreement-row">
                <span class="agreement-badge risk">⚠️ 违规风险</span>
                <p class="agreement-text">违规使用后果由用户自行承担，平台概不负责：</p>
              </div>
              <div class="agreement-list">
                <div class="agreement-list-item"><strong>平台层面</strong> — 账号永久封禁，下载权限、积分、VIP资格全部作废，不予退款</div>
                <div class="agreement-list-item"><strong>作品层面</strong> — 流媒体平台收到版权投诉后强制下架，播放记录和收益全部清零</div>
                <div class="agreement-list-item"><strong>法律层面</strong> — 版权方可依据《著作权法》提起民事诉讼，追讨实际损失及惩罚性赔偿（单次侵权最高可达50万元）；情节严重构成犯罪的，依法追究刑事责任</div>
                <div class="agreement-list-item"><strong>个人声誉</strong> — 侵权记录可能影响后续音乐事业发展，平台有权公示违规行为</div>
              </div>
            </div>

            <div class="agreement-divider"></div>

            <div class="agreement-section">
              <div class="agreement-row">
                <span class="agreement-badge platform">🏢 平台声明</span>
                <p class="agreement-text">请在使用前仔细阅读以下平台条款：</p>
              </div>
              <div class="agreement-list">
                <div class="agreement-list-item">平台仅提供beat的展示、试听与下载服务，所有beat版权归对应制作人或合法授权方所有</div>
                <div class="agreement-list-item">用户下载beat即视为同意本协议全部条款，并承诺仅将内容用于<strong>个人非商业用途</strong></div>
                <div class="agreement-list-item">如需商用（包括但不限于：流媒体发布、商演、综艺、影视配乐、广告），须自行联系beat制作人单独购买商业License，平台不提供也不代理任何商业授权</div>
                <div class="agreement-list-item">用户在使用beat过程中与其他用户或第三方产生的任何纠纷，与平台无关，平台保留协助权利人维权的义务</div>
                <div class="agreement-list-item">平台有权随时更新本协议，并通过站内公告或弹窗形式通知用户，继续使用即视为接受更新</div>
              </div>
            </div>

            <div class="agreement-divider"></div>

            <div class="agreement-section">
              <div class="agreement-row">
                <span class="agreement-badge safe">🔒 商用建议</span>
                <p class="agreement-text">
                  如有商用需求，建议通过正规渠道联系beat制作人购买独家或非独家License；
                  部分制作人支持在平台内私信联系，商用授权费用由双方自行协商，平台不承担任何交易风险。
                </p>
              </div>
            </div>
          </div>
        </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { resolveAvatarUrl } from '@/utils/assets'
import {
  fetchSignInStatus,
  doSignIn,
  fetchPointTransactions,
  fetchLotteryStatus,
  doLottery,
  exchangeVipWithPoints,
  fetchDownloadPermission,
  exchangeDownloadWithPoints,
  fetchPointsCenterConfig,
  type PointTransaction,
  type PointsCenterConfig
} from '@/api/forum'

const route = useRoute()
const authStore = useAuthStore()

const defaultPointsConfig: PointsCenterConfig = {
  sign_in: {
    base_points: 1,
    repeated_day_base_points: 2,
    consecutive_bonus_max: 3,
    max_points_per_day: 5,
    milestones: [
      { days: 7, points: 50 },
      { days: 30, points: 200 },
      { days: 100, points: 500 },
    ],
    description: '首日签到 1 积分；连续签到次日起额外加分，单日最高可得 5 积分'
  },
  lottery: {
    daily_chances: 1,
    prizes: [
      { id: 1, name: '谢谢参与', points: 0, vip_days: 0, rate: 40 },
      { id: 2, name: '5 积分', points: 5, vip_days: 0, rate: 30 },
      { id: 3, name: '20 积分', points: 20, vip_days: 0, rate: 15 },
      { id: 4, name: '50 积分', points: 50, vip_days: 0, rate: 8 },
      { id: 5, name: '100 积分', points: 100, vip_days: 0, rate: 5 },
      { id: 6, name: 'VIP 1天', points: 0, vip_days: 1, rate: 2 },
    ]
  },
  exchange: {
    vip_plans: [
      { level: 'basic', points: 500, vip_level: 'basic', duration_days: 30 },
      { level: 'premium', points: 1200, vip_level: 'premium', duration_days: 30 },
      { level: 'ultimate', points: 3000, vip_level: 'ultimate', duration_days: 30 },
    ],
    download_permission: {
      cost: 10,
      description: '任意伴奏单次下载权限（可累积）'
    }
  }
}

const prizeVisualMap: Record<number, { bgColor: string; icon: string }> = {
  1: { bgColor: '#f1f5f9', icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>' },
  2: { bgColor: 'rgba(245, 158, 11, 0.15)', icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="#f59e0b"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>' },
  3: { bgColor: 'rgba(139, 92, 246, 0.15)', icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="#8b5cf6"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>' },
  4: { bgColor: 'rgba(34, 197, 94, 0.15)', icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="#22c55e"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>' },
  5: { bgColor: 'rgba(59, 130, 246, 0.15)', icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="#3b82f6"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>' },
  6: { bgColor: 'rgba(236, 72, 153, 0.15)', icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="#ec4899"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' }
}

// 用户信息
const username = computed(() => authStore.user?.username || '用户')
const avatarLetter = computed(() => username.value[0]?.toUpperCase() || '?')
const avatarSrc = computed(() => authStore.user?.avatar_url ? resolveAvatarUrl(authStore.user.avatar_url) : '')

// 状态
const userPoints = ref(0)
const signInStatus = ref({ signed_today: false, consecutive_days: 0, total_points: 0 })
const signInLoading = ref(false)
const activeTab = ref('level')
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const currentPage = ref(1)
const currentFilter = ref('all')
const transactions = ref<PointTransaction[]>([])
const pointsConfig = ref<PointsCenterConfig>(defaultPointsConfig)
const isSpinning = ref(false)
const wheelAngle = ref(0)
const showLotteryResult = ref(false)
const currentPrize = ref<any>(null)
const exchanging = ref<string | null>(null)
const downloadPermission = ref({
  remaining_permissions: 0,
  exchange_cost: defaultPointsConfig.exchange.download_permission.cost,
  description: defaultPointsConfig.exchange.download_permission.description
})
const exchangingDownload = ref(false)

// 日历
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())
const signedDates = ref<Set<string>>(new Set())

// 筛选
const filters = [
  { key: 'all', label: '全部' },
  { key: 'income', label: '收入' },
  { key: 'expense', label: '支出' },
]

const filteredRecords = computed(() => {
  if (currentFilter.value === 'income') return transactions.value.filter(r => r.change > 0)
  if (currentFilter.value === 'expense') return transactions.value.filter(r => r.change < 0)
  return transactions.value
})

// 导航
const navItems = computed(() => [
  { key: 'level', label: '我的等级', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15l-2 5-2-2-2 2m14-5l-2-5-2 2-2-2-2 2"/></svg>' },
  { key: 'signin', label: '每日签到', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', badge: signInStatus.value.signed_today ? '已签' : null },
  { key: 'lottery', label: '积分抽奖', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>', badge: computedLotteryChances.value > 0 ? computedLotteryChances.value : null },
  { key: 'benefits', label: '积分福利', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' },
  { key: 'records', label: '积分记录', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
  { key: 'agreement', label: '使用协议', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' },
])

// 等级配置
const levelConfigs = [
  { min: 0, max: 99, name: '毛胚', color: '#6366f1', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>', tip: '再获取 100 积分升级', privileges: ['每日签到', '基础发帖/评论'], multiplier: 1, nextThreshold: 100 },
  { min: 100, max: 499, name: '出道', color: '#22c55e', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>', tip: '再获取 100 积分升级', privileges: ['每日签到', '基础发帖/评论', '每日抽奖 1 次'], multiplier: 1, nextThreshold: 500 },
  { min: 500, max: 999, name: '炸场', color: '#3b82f6', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', tip: '再获取 500 积分升级', privileges: ['每日签到', '发帖/评论积分翻倍', '每日抽奖 2 次', '专属标识'], multiplier: 2, nextThreshold: 1000 },
  { min: 1000, max: 4999, name: '厂牌', color: '#a855f7', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>', tip: '再获取 1000 积分升级', privileges: ['每日签到', '发帖/评论积分翻倍', '每日抽奖 3 次', '专属标识', '优先客服'], multiplier: 2, nextThreshold: 5000 },
  { min: 5000, max: Infinity, name: 'GOAT', color: '#f59e0b', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>', tip: '已满级！', privileges: ['全部特权', '专属金色标识', 'VIP专属客服', '新功能优先体验', '每日抽奖 5 次'], multiplier: 2, nextThreshold: null },
]

const levelConfig = computed(() => levelConfigs.find(c => userPoints.value >= c.min && userPoints.value <= c.max) || levelConfigs[0])
const nextLevelConfig = computed(() => {
  const idx = levelConfigs.findIndex(c => userPoints.value >= c.min && userPoints.value <= c.max)
  return idx < levelConfigs.length - 1 ? levelConfigs[idx + 1] : null
})
const progressPercent = computed(() => {
  if (!levelConfig.value.nextThreshold) return 100
  const current = userPoints.value - levelConfig.value.min
  const total = levelConfig.value.nextThreshold - levelConfig.value.min
  return Math.min(100, (current / total) * 100)
})

const signInPrimaryReward = computed(() => `首日 +${pointsConfig.value.sign_in.base_points} 积分`)
const signInDescription = computed(() => pointsConfig.value.sign_in.description)
const signInMilestones = computed(() => pointsConfig.value.sign_in.milestones)

const wheelPrizes = computed(() =>
  pointsConfig.value.lottery.prizes.map((prize) => {
    const visual = prizeVisualMap[prize.id] || prizeVisualMap[1]
    const desc = prize.points > 0
      ? `恭喜获得 ${prize.points} 积分`
      : prize.vip_days > 0
        ? `恭喜获得 VIP ${prize.vip_days} 天`
        : '再接再厉'

    return {
      ...prize,
      bgColor: visual.bgColor,
      icon: visual.icon,
      desc,
    }
  })
)

// 根据用户积分动态计算可抽奖次数（仅作参考显示）
const computedLotteryChances = computed(() => {
  const cost = 5
  return Math.floor(userPoints.value / cost)
})

// 实际剩余次数以服务端返回为准（考虑已消耗）
const lotteryChances = ref(0)

const exchangeBenefitsMap: Record<'basic' | 'premium' | 'ultimate', string[]> = {
  basic: ['每日下载 3 次', '会员专属标签', '优先客服支持'],
  premium: ['每日下载 10 次', '专属头像框', '高级客服支持', '新功能优先体验'],
  ultimate: ['无限下载', '金色专属标识', 'VIP 专属客服', '全站功能开放'],
}

const exchangeNameMap: Record<'basic' | 'premium' | 'ultimate', string> = {
  basic: '基础会员',
  premium: '高级会员',
  ultimate: '至尊会员',
}

const exchangePlans = computed(() =>
  pointsConfig.value.exchange.vip_plans.map((plan) => ({
    level: plan.level,
    name: exchangeNameMap[plan.level],
    pointsCost: plan.points,
    featured: plan.level === 'premium',
    benefits: exchangeBenefitsMap[plan.level],
  }))
)

// 中奖记录
const lotteryRecords = ref<any[]>([])

// 日历数据
const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: Array<{ date: number; signed: boolean; isToday: boolean; isFuture: boolean } | null> = []
  
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${month}-${d}`
    days.push({
      date: d,
      signed: signedDates.value.has(dateStr),
      isToday: dateStr === todayStr,
      isFuture: new Date(year, month, d) > today,
    })
  }
  return days
})

// 工具函数
const reasonLabels: Record<string, string> = {
  sign_in: '每日签到',
  sign_in_streak: '连续签到奖励',
  sign_in_milestone: '签到里程碑',
  lottery_cost: '抽奖消耗',
  lottery_participation: '积分抽奖',
  lottery_reward: '抽奖奖励',
  post_created: '发布帖子',
  comment_created: '发布评论',
  post_liked: '帖子被点赞',
  comment_liked: '评论被点赞',
  post_favorited: '帖子被收藏',
  task_reward: '任务奖励',
  exchange: '积分兑换',
  admin_adjust: '管理员调整',
}

function getReasonLabel(reason: string): string {
  return reasonLabels[reason] || reason
}

function formatTime(timeStr: string): string {
  const date = new Date(timeStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60))
      return minutes <= 1 ? '刚刚' : `${minutes} 分钟前`
    }
    return `${hours} 小时前`
  } else if (days === 1) return '昨天'
  else if (days < 7) return `${days} 天前`
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function changeMonth(delta: number) {
  const d = new Date(currentYear.value, currentMonth.value + delta, 1)
  currentYear.value = d.getFullYear()
  currentMonth.value = d.getMonth()
}

// 加载数据
async function loadSignInStatus() {
  try {
    const status = await fetchSignInStatus()
    signInStatus.value = status
    userPoints.value = status.total_points
    
    // 加载已签到日期
    const month = new Date().getMonth()
    const year = new Date().getFullYear()
    if (currentYear.value === year && currentMonth.value === month) {
      signedDates.value.add(`${year}-${month}-${new Date().getDate()}`)
    }
  } catch (e) {
    console.error('Failed to load sign-in status:', e)
  }
}

async function loadPointsConfig() {
  try {
    const config = await fetchPointsCenterConfig()
    pointsConfig.value = config
    downloadPermission.value = {
      ...downloadPermission.value,
      exchange_cost: config.exchange.download_permission.cost,
      description: config.exchange.download_permission.description,
    }
  } catch (e) {
    console.error('Failed to load points config:', e)
  }
}

async function loadTransactions(page = 1, append = false) {
  if (page === 1) loading.value = true
  else loadingMore.value = true
  
  try {
    const res = await fetchPointTransactions({ page, limit: 20 })
    if (append) {
      transactions.value = [...transactions.value, ...res.records]
    } else {
      transactions.value = res.records
    }
    userPoints.value = res.total_points
    hasMore.value = transactions.value.length < res.total
    currentPage.value = page
  } catch (e) {
    console.error('Failed to load transactions:', e)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value) return
  await loadTransactions(currentPage.value + 1, true)
}

async function loadLotteryStatus() {
  try {
    const status = await fetchLotteryStatus()
    lotteryChances.value = status.remaining_chances
    pointsConfig.value = {
      ...pointsConfig.value,
      lottery: {
        ...pointsConfig.value.lottery,
        prizes: status.prizes,
      }
    }
    lotteryRecords.value = status.records.map(r => ({
      id: r.id,
      prizeName: r.prize_name,
      created_at: r.created_at,
    }))
  } catch (e) {
    console.error('Failed to load lottery status:', e)
  }
}

// 签到
async function handleSignIn() {
  if (signInStatus.value.signed_today || signInLoading.value) return
  signInLoading.value = true
  try {
    const result = await doSignIn()
    signInStatus.value = {
      signed_today: true,
      consecutive_days: result.consecutive_days,
      total_points: result.total_points,
    }
    userPoints.value = result.total_points
    signedDates.value.add(`${currentYear.value}-${currentMonth.value}-${new Date().getDate()}`)
    alert(`签到成功！获得 ${result.points_earned} 积分`)
    loadTransactions(1)
  } catch (e: any) {
    alert(e?.message || '签到失败')
  } finally {
    signInLoading.value = false
  }
}

// 兑换
async function handleExchange(plan: any) {
  if (userPoints.value < plan.pointsCost) {
    alert('积分不足')
    return
  }
  if (!confirm(`确定使用 ${plan.pointsCost.toLocaleString()} 积分兑换 ${plan.name}？`)) return
  
  exchanging.value = plan.level
  try {
    const result = await exchangeVipWithPoints(plan.level)
    userPoints.value = result.total_points
    alert(result.message)
  } catch (e: any) {
    alert(e?.message || '兑换失败')
  } finally {
    exchanging.value = null
  }
}

// 转盘样式
function getWheelPrizeStyle(index: number) {
  const angle = (360 / wheelPrizes.value.length) * index
  return { transform: `rotate(${angle}deg)` }
}

// 抽奖
async function spinWheel() {
  if (isSpinning.value || lotteryChances.value <= 0) return
  isSpinning.value = true
  
  try {
    const result = await doLottery()
    const prize = wheelPrizes.value.find(p => p.id === result.prize.id) || wheelPrizes.value[0]
    currentPrize.value = prize
    
    const prizeIndex = wheelPrizes.value.findIndex(p => p.id === result.prize.id)
    const itemAngle = 360 / wheelPrizes.value.length
    const targetAngle = 360 * (5 + Math.floor(Math.random() * 3)) + (360 - prizeIndex * itemAngle - itemAngle / 2)
    wheelAngle.value += targetAngle
    
    setTimeout(() => {
      isSpinning.value = false
      userPoints.value = result.total_points
      showLotteryResult.value = true
      loadLotteryStatus()
    }, 4000)
  } catch (e: any) {
    isSpinning.value = false
    alert(e?.message || '抽奖失败')
  }
}

onMounted(() => {
  // 从 URL 参数读取默认 tab
  const tab = route.query.tab as string
  if (tab && ['level', 'signin', 'benefits', 'records', 'lottery'].includes(tab)) {
    activeTab.value = tab
  }
  loadPointsConfig()
  loadSignInStatus()
  loadTransactions(1)
  loadLotteryStatus()
  loadDownloadPermission()
})

watch(activeTab, (tab) => {
  if (tab === 'records' && transactions.value.length === 0) {
    loadTransactions(1)
  }
})

async function loadDownloadPermission() {
  try {
    const perm = await fetchDownloadPermission()
    downloadPermission.value = {
      ...downloadPermission.value,
      ...perm,
    }
  } catch {
    // ignore
  }
}

async function handleExchangeDownload() {
  if (!confirm(`确定使用 ${downloadPermission.value.exchange_cost} 积分兑换 1 次下载权限？`)) return
  exchangingDownload.value = true
  try {
    const result = await exchangeDownloadWithPoints()
    alert('兑换成功！已获得 1 次下载权限')
    downloadPermission.value.remaining_permissions = result.remaining_permissions
    userPoints.value = result.remaining_points
  } catch (e: any) {
    alert(e?.message || '兑换失败')
  } finally {
    exchangingDownload.value = false
  }
}
</script>

<style scoped>
.points-center {
  min-height: 100vh;
  background: var(--bg-primary);
  padding-top: 64px;
}

/* 顶部导航 */
.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  position: absolute;
  top: 64px;
  left: 0;
  right: 0;
  z-index: 99;
}

.back-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--bg-card);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
}

.back-btn:hover {
  color: var(--text-primary);
  background: var(--accent-light);
}

.header-bar h1 {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.points-display {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--accent-light);
  border-radius: 20px;
}

.points-icon {
  color: var(--accent);
  display: flex;
}

.points-num {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
}

/* 主容器 */
.main-container {
  display: flex;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 16px;
  gap: 20px;
}

/* 侧边栏 */
.sidebar {
  width: 200px;
  flex-shrink: 0;
}

.user-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  text-align: center;
}

.user-avatar {
  width: 64px;
  height: 64px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar span {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

.user-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  display: block;
  margin-bottom: 8px;
}

.user-level {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: var(--accent-light);
  border-radius: 12px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.nav-menu {
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.nav-item:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}

.nav-icon {
  display: flex;
  align-items: center;
}

.nav-badge {
  margin-left: auto;
  padding: 2px 8px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
}

/* 内容区 */
.content-area {
  flex: 1;
  min-width: 0;
}

.page-content {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

/* 等级卡 */
.level-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  border-radius: 16px;
  margin-bottom: 20px;
}

.level-badge-large {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.level-icon-large {
  color: #fff;
  display: flex;
}

.level-info {
  flex: 1;
}

.level-name-large {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.level-tip {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.level-points {
  text-align: right;
}

.level-points .points-label {
  font-size: 12px;
  color: var(--text-secondary);
  display: block;
}

.level-points .points-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
}

/* 进度条 */
.progress-section {
  margin-bottom: 20px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.progress-track {
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* 特权 */
.privileges-section {
  margin-bottom: 20px;
}

.privileges-section h3,
.level-list h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.privileges-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.privilege-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.privilege-item svg {
  color: #22c55e;
  flex-shrink: 0;
}

/* 等级列表 */
.level-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.level-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 10px;
  opacity: 0.5;
}

.level-item.current {
  background: var(--accent-light);
  opacity: 1;
  border: 1px solid var(--accent);
}

.level-item.locked {
  opacity: 0.4;
}

.level-item-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.level-item-info {
  flex: 1;
}

.level-item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: block;
}

.level-item-range {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 日历 */
.streak-badge {
  padding: 4px 12px;
  background: var(--accent-light);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.calendar-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.cal-nav {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--bg-card);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
}

.cal-nav:hover {
  color: var(--text-primary);
}

.cal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.cal-weekday {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 8px 0;
}

.cal-day {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary);
  position: relative;
  background: var(--bg-card);
}

.cal-day.today {
  border: 2px solid var(--accent);
}

.cal-day.signed {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: #fff;
}

.cal-day.signed .signed-mark {
  position: absolute;
  bottom: 2px;
}

.cal-day.future {
  color: var(--text-secondary);
  opacity: 0.5;
}

/* 签到操作 */
.signin-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 12px;
  margin-bottom: 20px;
}

.signin-reward {
  display: flex;
  align-items: center;
  gap: 12px;
}

.reward-icon {
  width: 48px;
  height: 48px;
  background: var(--accent-light);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.reward-text {
  display: flex;
  flex-direction: column;
}

.reward-amount {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.reward-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.signin-btn {
  padding: 12px 32px;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.signin-btn.disabled {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: not-allowed;
}

/* 连续签到 */
.signin-tips h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.streak-rewards {
  display: flex;
  gap: 12px;
}

.streak-item {
  flex: 1;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 10px;
  text-align: center;
  opacity: 0.5;
}

.streak-item.active {
  background: var(--accent-light);
  opacity: 1;
}

.streak-days {
  font-size: 13px;
  color: var(--text-secondary);
  display: block;
  margin-bottom: 4px;
}

.streak-points {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
}

/* 抽奖 */
.chance-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.chance-info strong {
  color: var(--accent);
  font-size: 16px;
}

.lottery-card {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.wheel-container {
  position: relative;
  width: 280px;
  height: 280px;
}

.wheel-glow {
  position: absolute;
  inset: -20px;
  background: radial-gradient(circle, rgba(102, 126, 234, 0.2) 0%, transparent 70%);
  border-radius: 50%;
}

.wheel {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    var(--bg-card) 0deg 60deg,
    rgba(124, 58, 237, 0.2) 60deg 120deg,
    rgba(34, 197, 94, 0.2) 120deg 180deg,
    rgba(59, 130, 246, 0.2) 180deg 240deg,
    rgba(236, 72, 153, 0.2) 240deg 300deg,
    rgba(245, 158, 11, 0.2) 300deg 360deg
  );
  border: 6px solid var(--bg-card);
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.3);
  transition: transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99);
  position: relative;
  overflow: hidden;
}

.wheel.spinning {
  transition: transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99);
}

.wheel-prize {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 2px;
  transform-origin: left center;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 24px;
}

.prize-text {
  font-size: 10px;
  color: var(--text-primary);
  white-space: nowrap;
  transform: rotate(180deg);
}

.wheel-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: 4px solid var(--bg-card);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.wheel-btn:disabled {
  background: var(--bg-secondary);
  opacity: 0.5;
}

/* 中奖记录 */
.lottery-history h4,
.empty-hint {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.empty-hint {
  color: var(--text-secondary);
  font-weight: 400;
  text-align: center;
  padding: 20px;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-card);
  border-radius: 8px;
}

.record-prize {
  font-size: 13px;
  color: var(--text-primary);
}

.record-time {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 福利 */
.benefits-intro {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 10px;
  margin-bottom: 20px;
}

.download-exchange-section {
  margin-bottom: 24px;
}

.section-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.section-header-row h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.permission-badge {
  padding: 2px 10px;
  background: #10b98120;
  border: 1px solid #10b981;
  border-radius: 12px;
  color: #10b981;
  font-size: 12px;
  font-weight: 500;
}

.download-exchange-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.download-exchange-card {
  display: flex;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, #667eea20, #764ba220);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 12px;
  gap: 16px;
}

.exchange-points-cost {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 60px;
}

.cost-num {
  font-size: 28px;
  font-weight: 700;
  color: #667eea;
  line-height: 1;
}

.cost-unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.exchange-desc {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exchange-desc-title {
  font-size: 12px;
  color: var(--text-secondary);
}

.exchange-desc-content {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.exchange-desc-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.exchange-download-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.exchange-download-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.exchange-download-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.benefits-intro p {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.benefits-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.benefit-card {
  position: relative;
  padding: 20px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.benefit-card.featured {
  background: linear-gradient(135deg, var(--accent-light), rgba(139, 92, 246, 0.2));
  border-color: var(--accent);
}

.featured-tag {
  position: absolute;
  top: -10px;
  left: 20px;
  padding: 2px 12px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 10px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.benefit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.benefit-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.benefit-price {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.price-num {
  font-size: 20px;
  font-weight: 700;
  color: #667eea;
}

.price-unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.benefit-features {
  margin-bottom: 16px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.feature-item svg {
  color: #22c55e;
}

.benefit-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.benefit-btn:disabled {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: not-allowed;
}

/* 记录 */
.filter-tabs {
  display: flex;
  gap: 8px;
}

.filter-btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.filter-btn.active {
  background: #667eea;
  border-color: var(--accent);
  color: #fff;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.records-list-full {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 10px;
}

.record-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.record-icon.income {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.record-icon.expense {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.record-info {
  flex: 1;
}

.record-reason {
  font-size: 14px;
  color: var(--text-primary);
  display: block;
  margin-bottom: 2px;
}

.record-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.record-amount {
  font-size: 15px;
  font-weight: 700;
}

.record-amount.income {
  color: #22c55e;
}

.record-amount.expense {
  color: #ef4444;
}

.load-more {
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  margin-top: 8px;
}

.load-more:disabled {
  opacity: 0.5;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.result-modal {
  position: relative;
  background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 24px;
  padding: 40px 32px;
  text-align: center;
  max-width: 340px;
  width: 90%;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: modalIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}

.result-modal.is-win {
  border: 2px solid rgba(102, 126, 234, 0.5);
  box-shadow: 0 25px 50px -12px rgba(102, 126, 234, 0.3);
}

.result-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(102, 126, 234, 0.15) 0%, transparent 60%);
  animation: rotate 8s linear infinite;
  pointer-events: none;
}

.result-modal:not(.is-win) .result-glow {
  display: none;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes modalIn {
  0% { 
    transform: scale(0.5) translateY(20px);
    opacity: 0;
  }
  100% { 
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

.result-icon {
  width: 100px;
  height: 100px;
  margin: 0 auto 24px;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  animation: iconBounce 0.6s ease 0.3s both;
  position: relative;
  z-index: 1;
}

.result-modal.is-win .result-icon {
  animation: iconBounce 0.6s ease 0.3s both, iconGlow 1.5s ease-in-out infinite 0.9s;
}

@keyframes iconBounce {
  0% { transform: scale(0) rotate(-20deg); }
  60% { transform: scale(1.2) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); }
}

@keyframes iconGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.5); }
  50% { box-shadow: 0 0 40px rgba(102, 126, 234, 0.8), 0 0 60px rgba(118, 75, 162, 0.4); }
}

.result-title {
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  margin: 0 0 12px 0;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 1;
}

.result-title.win-text {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #ffd89b 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: textShine 2s ease-in-out infinite;
}

@keyframes textShine {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
}

.result-desc {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0 0 20px 0;
  position: relative;
  z-index: 1;
}

.result-points {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
  padding: 12px 24px;
  border-radius: 50px;
  margin-bottom: 20px;
  animation: pointsIn 0.5s ease 0.5s both;
  position: relative;
  z-index: 1;
}

@keyframes pointsIn {
  0% { 
    transform: scale(0);
    opacity: 0;
  }
  100% { 
    transform: scale(1);
    opacity: 1;
  }
}

.result-points-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.result-points-value {
  font-size: 28px;
  font-weight: 800;
  color: #4ade80;
  text-shadow: 0 0 20px rgba(74, 222, 128, 0.5);
}

.vip-hint {
  color: #f472b6;
  font-weight: 600;
  font-size: 14px;
  margin: 0 0 16px 0;
  text-shadow: 0 0 10px rgba(244, 114, 182, 0.3);
}

.result-confirm {
  padding: 12px 48px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

/* 使用协议 */
.agreement-block {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.agreement-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agreement-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 20px 0;
}

.agreement-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.agreement-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.agreement-badge.allowed {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.agreement-badge.forbidden {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.agreement-badge.risk {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.agreement-badge.platform {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.agreement-badge.safe {
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
}

.agreement-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  line-height: 1.5;
}

.agreement-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 8px;
}

.agreement-list-item {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.6;
  padding-left: 12px;
  position: relative;
}

.agreement-list-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
}

.agreement-list-item strong {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}

/* 响应式 */
@media (max-width: 768px) {
  .main-container {
    flex-direction: column;
  }
  
  .sidebar {
    width: 100%;
  }
  
  .user-card {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 16px;
  }
  
  .user-avatar {
    margin: 0;
    width: 48px;
    height: 48px;
  }
  
  .nav-menu {
    display: flex;
    overflow-x: auto;
    border-radius: 10px;
  }
  
  .nav-item {
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
    white-space: nowrap;
  }
  
  .nav-item.active::before {
    display: none;
  }
  
  .nav-text {
    font-size: 12px;
  }
  
  .privileges-grid {
    grid-template-columns: 1fr;
  }
}
</style>
