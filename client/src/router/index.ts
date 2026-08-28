import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useHomepageConfigStore } from '@/stores/homepage-config'
import HomeView from '@/views/HomeView.vue'
import BeatsView from '@/views/BeatsView.vue'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView, meta: { public: true } },
    { path: '/login', component: LoginView, meta: { guest: true } },
    { path: '/register', component: RegisterView, meta: { guest: true } },
    { path: '/beats', component: BeatsView, meta: { requiresAuth: true, moduleKey: 'nav_beats' } },
    { path: '/beats/:id', component: () => import('@/views/BeatDetailView.vue'), meta: { requiresAuth: true, moduleKey: 'nav_beats' } },
    { path: '/rapper/:id', component: () => import('../views/RapperDetailView.vue') },
    {
      path: '/upload',
      name: 'Upload',
      component: () => import('../views/UploadView.vue'),
      meta: { requiresAuth: true, requiresUploader: true, moduleKey: 'nav_upload' }
    },
    {
      path: '/profile',
      name: 'Profile',
      component: () => import('../views/ProfileView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/vip',
      name: 'Vip',
      component: () => import('../views/VipView.vue'),
      meta: { public: true }
    },
    {
      path: '/payment/success',
      name: 'PaymentSuccess',
      component: () => import('../views/payment/SuccessView.vue'),
      meta: { public: true }
    },
    {
      path: '/payment/cancel',
      name: 'PaymentCancel',
      component: () => import('../views/payment/CancelView.vue'),
      meta: { public: true }
    },
    {
      path: '/admin',
      component: () => import('../components/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
      children: [
        { path: '', name: 'AdminDashboard', component: () => import('../views/admin/DashboardView.vue') },
        { path: 'hot-data', name: 'AdminHotData', component: () => import('../views/admin/HotDataView.vue') },
        { path: 'users', name: 'AdminUsers', component: () => import('../views/admin/UsersView.vue') },
        { path: 'beats', name: 'AdminBeats', component: () => import('../views/admin/BeatsView.vue') },
        { path: 'rappers', name: 'AdminRappers', component: () => import('../views/admin/RappersView.vue') },
        { path: 'banners', name: 'AdminBanners', component: () => import('../views/admin/BannersView.vue') },
        { path: 'forum', name: 'AdminForum', component: () => import('../views/admin/ForumManageView.vue') },
        { path: 'feedback', name: 'AdminFeedback', component: () => import('../views/admin/FeedbackView.vue') },
        { path: 'license', name: 'AdminLicense', component: () => import('../views/admin/LicenseView.vue') },
        { path: 'home-footer', name: 'AdminHomeFooter', component: () => import('../views/admin/HomeFooterManageView.vue') },
        { path: 'homepage-config', name: 'AdminHomepageConfig', component: () => import('../views/admin/HomepageConfigView.vue') },
        { path: 'beatmaker-approvals', name: 'AdminBeatmakerApprovals', component: () => import('../views/admin/BeatmakerManageView.vue') }
      ]
    },
    {
      path: '/forum',
      name: 'Forum',
      component: () => import('../views/ForumView.vue'),
      meta: { public: true, moduleKey: 'nav_forum' }
    },
    {
      path: '/forum/post/:id',
      name: 'ForumPost',
      component: () => import('../views/ForumPostView.vue'),
      meta: { public: true }
    },
    {
      path: '/forum/new',
      name: 'ForumNew',
      component: () => import('../views/ForumNewView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/points',
      name: 'Points',
      component: () => import('../views/PointsCenterView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/forum/messages',
      name: 'ForumMessages',
      component: () => import('../views/MessagesHubView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/forum/notifications',
      name: 'ForumNotifications',
      component: () => import('../views/NotificationsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/forum/user/:userId',
      name: 'ForumUser',
      component: () => import('../views/ForumUserView.vue'),
      meta: { public: true }
    },
    {
      path: '/forum/blocked',
      name: 'ForumBlocked',
      component: () => import('../views/BlockedUsersView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/forum/messages/:conversationId',
      name: 'ForumChat',
      component: () => import('../views/MessagesHubView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/beatmaker/apply',
      name: 'BeatmakerApply',
      component: () => import('../views/BeatmakerApplyView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/beatmakers',
      name: 'BeatmakerList',
      component: () => import('../views/BeatmakerListView.vue'),
      meta: { public: true, moduleKey: 'nav_beatmakers' }
    },
    {
      path: '/beatmaker/profile/:userId',
      name: 'BeatmakerProfile',
      component: () => import('../views/BeatmakerProfileView.vue'),
      meta: { public: true }
    }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach((to) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath, requireAuth: '1' } }
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { path: '/' }
  }

  if (to.meta.requiresUploader && !authStore.canUpload) {
    return { path: '/beatmaker/apply', query: { redirect: to.fullPath } }
  }

  if (to.meta.guest && authStore.isAuthenticated) {
    return { path: '/' }
  }

  // 首页头部模块可见性拦截：管理员始终放行；其他角色被隐藏时跳回首页
  const moduleKey = to.meta.moduleKey as string | undefined
  if (moduleKey) {
    const homepageConfig = useHomepageConfigStore()
    if (!homepageConfig.isVisible(moduleKey)) {
      return { path: '/' }
    }
  }
})

export default router
