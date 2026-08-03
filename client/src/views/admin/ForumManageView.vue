<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchForumPosts, deleteForumPost, adminTogglePin, adminToggleEssence, type ForumPost } from '@/api/forum'

const posts = ref<ForumPost[]>([])
const loading = ref(false)
const deleting = ref<number | null>(null)

const PAGE_SIZE = 20
const currentPage = ref(1)
const total = ref(0)
const hasMore = () => posts.value.length < total.value

async function load() {
  loading.value = true
  try {
    const data = await fetchForumPosts({ page: currentPage.value, limit: PAGE_SIZE })
    if (currentPage.value === 1) {
      posts.value = data.posts
    } else {
      posts.value.push(...data.posts)
    }
    total.value = data.total
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || !hasMore()) return
  currentPage.value++
  await load()
}

async function handlePin(post: ForumPost) {
  try {
    await adminTogglePin(post.id)
    post.is_pinned = post.is_pinned ? 0 : 1
  } catch (err: any) {
    alert(err.message || '操作失败')
  }
}

async function handleEssence(post: ForumPost) {
  try {
    await adminToggleEssence(post.id)
    post.is_essence = post.is_essence ? 0 : 1
  } catch (err: any) {
    alert(err.message || '操作失败')
  }
}

async function handleDelete(post: ForumPost) {
  if (!confirm(`确定删除帖子《${post.title}》？`)) return
  deleting.value = post.id
  try {
    await deleteForumPost(post.id)
    posts.value = posts.value.filter((p) => p.id !== post.id)
  } catch (err: any) {
    alert(err.message || '删除失败')
  } finally {
    deleting.value = null
  }
}

function getAvatarLetter(username: string) {
  return username?.charAt(0)?.toUpperCase() || 'U'
}

onMounted(load)
</script>

<template>
  <div class="forum-manage">
    <div class="manage-tip">
      管理所有论坛帖子 — 可执行置顶、加精、删除操作
    </div>

    <div v-if="loading && posts.length === 0" class="loading-state">加载中...</div>

    <table v-else class="posts-table">
      <thead>
        <tr>
          <th>标题</th>
          <th>作者</th>
          <th>分类</th>
          <th>浏览</th>
          <th>点赞</th>
          <th>评论</th>
          <th>状态</th>
          <th>发布时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="post in posts" :key="post.id">
          <td class="col-title">
            <span v-if="post.is_pinned" class="tag tag-pinned">置顶</span>
            <span v-if="post.is_essence" class="tag tag-essence">精华</span>
            <router-link :to="`/forum/post/${post.id}`" class="post-link">{{ post.title }}</router-link>
          </td>
          <td class="col-author">
            <div class="author-cell">
              <div class="mini-avatar">
                <img v-if="post.author_avatar" :src="post.author_avatar" :alt="post.author_username" />
                <span v-else>{{ getAvatarLetter(post.author_username) }}</span>
              </div>
              {{ post.author_username }}
            </div>
          </td>
          <td>{{ post.category_name }}</td>
          <td>{{ post.view_count }}</td>
          <td>{{ post.like_count }}</td>
          <td>{{ post.comment_count }}</td>
          <td>
            <span v-if="post.is_pinned" class="badge-green">置顶</span>
            <span v-else-if="post.is_essence" class="badge-red">精华</span>
            <span v-else class="badge-gray">普通</span>
          </td>
          <td class="col-time">{{ post.time_ago }}</td>
          <td>
            <div class="action-btns">
              <button
                class="btn-sm"
                :class="post.is_pinned ? 'btn-gold-active' : 'btn-gold'"
                @click="handlePin(post)"
              >
                {{ post.is_pinned ? '取消置顶' : '置顶' }}
              </button>
              <button
                class="btn-sm"
                :class="post.is_essence ? 'btn-red-active' : 'btn-red'"
                @click="handleEssence(post)"
              >
                {{ post.is_essence ? '取消加精' : '加精' }}
              </button>
              <button
                class="btn-sm btn-danger"
                :disabled="deleting === post.id"
                @click="handleDelete(post)"
              >
                {{ deleting === post.id ? '删除中' : '删除' }}
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="hasMore()" class="load-more">
      <button class="btn-load-more" :disabled="loading" @click="loadMore">
        {{ loading ? '加载中...' : '加载更多' }}
      </button>
    </div>

    <div v-if="!loading && posts.length === 0" class="empty-state">
      暂无帖子
    </div>
  </div>
</template>

<style scoped>
.forum-manage { padding: 0; }
.manage-tip {
  font-size: 13px;
  color: var(--text-secondary, #a0a0b0);
  margin-bottom: 16px;
}
.loading-state { text-align: center; color: #a0a0b0; padding: 40px; }
.empty-state { text-align: center; color: #a0a0b0; padding: 40px; }

.posts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: #e0e0e0;
}
.posts-table th {
  text-align: left;
  padding: 10px 12px;
  background: #1e1e2e;
  color: #a0a0b0;
  font-weight: 600;
  border-bottom: 1px solid #2a2a3e;
  white-space: nowrap;
}
.posts-table td {
  padding: 12px;
  border-bottom: 1px solid #2a2a3e;
  vertical-align: middle;
}
.posts-table tr:hover td { background: #1e1e2e; }

.col-title { max-width: 260px; }
.post-link {
  color: #e0e0e0;
  text-decoration: none;
  font-weight: 600;
}
.post-link:hover { color: #7c3aed; }
.tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  margin-right: 4px;
  vertical-align: middle;
}
.tag-pinned { background: #f59e0b33; color: #f59e0b; }
.tag-essence { background: #ef444433; color: #ef4444; }

.author-cell { display: flex; align-items: center; gap: 8px; }
.mini-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #7c3aed;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.mini-avatar img { width: 100%; height: 100%; object-fit: cover; }

.badge-green { font-size: 11px; background: #22c55e33; color: #22c55e; padding: 2px 7px; border-radius: 8px; }
.badge-red { font-size: 11px; background: #ef444433; color: #ef4444; padding: 2px 7px; border-radius: 8px; }
.badge-gray { font-size: 11px; background: #374151; color: #9ca3af; padding: 2px 7px; border-radius: 8px; }

.col-time { color: #6b7280; font-size: 12px; white-space: nowrap; }

.action-btns { display: flex; gap: 6px; }
.btn-sm {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;
}
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger { background: rgba(239,68,68,0.15); color: #ef4444; }
.btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.25); }
.btn-gold { background: rgba(245,158,11,0.15); color: #f59e0b; }
.btn-gold:hover { background: rgba(245,158,11,0.25); }
.btn-gold-active { background: rgba(245,158,11,0.3); color: #f59e0b; }
.btn-red { background: rgba(239,68,68,0.1); color: #ef4444; }
.btn-red:hover { background: rgba(239,68,68,0.2); }
.btn-red-active { background: rgba(239,68,68,0.2); color: #ef4444; }

.load-more { text-align: center; padding: 20px; }
.btn-load-more {
  padding: 9px 24px;
  background: #1e1e2e;
  color: #a0a0b0;
  border: 1px solid #2a2a3e;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-load-more:hover:not(:disabled) { background: #252540; }
.btn-load-more:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
