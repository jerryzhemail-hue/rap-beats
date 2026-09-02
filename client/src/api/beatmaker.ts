import { request } from './request';
import { useAuthStore } from '@/stores/auth';

// ─── 类型 ──────────────────────────────────────────────────────────────────

export interface BeatmakerProfile {
  user_id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  portfolio_url: string | null;
  sample_audio_url: string | null;
  certified_at: string;
  total_beats: number;
  total_likes: number;
  total_downloads: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_followed_by: boolean;
  is_self: boolean;
}

export interface BeatmakerListItem {
  user_id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  portfolio_url: string | null;
  certified_at: string;
  total_beats: number;
  total_likes: number;
  total_downloads: number;
}

export interface BeatmakerApplication {
  id: number;
  real_name: string;
  id_card_masked: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason: string | null;
  portfolio_url: string | null;
  sample_work_url: string | null;
  sample_audio_url: string | null;
  bio: string | null;
  created_at: string;
  reviewed_at: string | null;
  last_rejected_at: string | null;
  cooldown_end: string | null;
}

// ─── 用户侧接口 ────────────────────────────────────────────────────────────

export async function submitBeatmakerApplication(data: {
  real_name: string;
  id_card_no: string;
  portfolio_url: string;
  sample_work_url: string;
  bio: string;
  sample_audio_url?: string;
}) {
  return request<{ message: string; application_id: number }>('/api/beatmaker/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function uploadBeatmakerAudio(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{
  message: string;
  audio_url: string;
  stored_value: string;
  original_name: string;
  size: number;
}> {
  const formData = new FormData();
  formData.append('audio', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/beatmaker/upload-audio');

    const authStore = useAuthStore();
    if (authStore.token) {
      xhr.setRequestHeader('Authorization', `Bearer ${authStore.token}`);
    }

    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else if (xhr.status === 401) {
          reject(new Error('未授权，请重新登录'));
        } else {
          reject(new Error(data.error || data.message || `请求失败: ${xhr.status}`));
        }
      } catch {
        reject(new Error('音频上传失败，请重试'));
      }
    };

    xhr.onerror = () => reject(new Error('网络错误，音频上传失败'));
    xhr.send(formData);
  });
}

export async function fetchMyBeatmakerApplication() {
  return request<{ application: BeatmakerApplication | null }>('/api/beatmaker/application/me');
}

export async function fetchBeatmakerList() {
  return request<{ beatmakers: BeatmakerListItem[] }>('/api/beatmaker/list');
}

export async function fetchBeatmakerProfile(userId: number) {
  return request<{ profile: BeatmakerProfile }>(`/api/beatmaker/profile/${userId}`);
}

export async function fetchBeatmakerBeats(userId: number, page = 1, limit = 12) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request<{ beats: Array<any>; total: number; page: number; totalPages: number }>(
    `/api/beatmaker/profile/${userId}/beats?${query.toString()}`
  );
}

export async function updateMyBeatmakerProfile(data: {
  display_name?: string;
  bio?: string;
  portfolio_url?: string;
  sample_audio_url?: string;
}) {
  return request<{ message: string; profile: BeatmakerProfile }>('/api/beatmaker/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ─── 管理员侧接口 ──────────────────────────────────────────────────────────

export async function fetchAdminApplications(params: {
  status?: 'pending' | 'approved' | 'rejected';
  page?: number;
  limit?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit ?? 20));
  return request<{
    total: number;
    page: number;
    limit: number;
    items: Array<BeatmakerApplication & {
      user_id: number;
      username: string;
      email: string;
      reviewer_name: string | null;
    }>;
  }>(`/api/admin/beatmaker-applications?${query.toString()}`);
}

export async function fetchAdminApplicationDetail(id: number) {
  return request<{
    application: BeatmakerApplication & {
      user_id: number;
      username: string;
      email: string;
      reviewer_name: string | null;
    };
  }>(`/api/admin/beatmaker-applications/${id}`);
}

export async function approveBeatmakerApplication(id: number) {
  return request<{ message: string }>(`/api/admin/beatmaker-applications/${id}/approve`, {
    method: 'POST',
  });
}

export async function rejectBeatmakerApplication(id: number, reason: string) {
  return request<{ message: string }>(`/api/admin/beatmaker-applications/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

// ─── 管理员侧 — Beatmaker 管理接口 ────────────────────────────────

export interface AdminBeatmakerStats {
  total_beatmakers: number;
  pending_applications: number;
  total_beats: number;
  total_downloads: number;
}

export interface AdminBeatmakerItem {
  user_id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  portfolio_url: string | null;
  certified_at: string;
  beat_count: number;
  dl_sum: number;
  like_sum: number;
}

export async function fetchAdminBeatmakerStats() {
  return request<AdminBeatmakerStats>('/api/admin/beatmaker-applications/stats');
}

export async function fetchAdminBeatmakers(params: {
  search?: string;
  sort?: 'certified_at' | 'total_beats' | 'total_downloads';
  page?: number;
  limit?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit ?? 20));
  return request<{
    total: number;
    page: number;
    limit: number;
    items: AdminBeatmakerItem[];
  }>(`/api/admin/beatmaker-applications/beatmakers?${query.toString()}`);
}

export async function revokeBeatmaker(userId: number) {
  return request<{ message: string }>(
    `/api/admin/beatmaker-applications/beatmakers/${userId}/revoke`,
    { method: 'POST' }
  );
}