import { request } from './request';

export interface SystemNotification {
  id: number;
  type: string;
  title: string;
  content: string | null;
  is_read: number;
  actor_id: number | null;
  actor_username: string | null;
  target_type: string | null;
  target_id: number | null;
  created_at: string;
}

export async function fetchSystemNotifications() {
  return request<{ notifications: SystemNotification[] }>('/api/system-notifications');
}

export async function fetchSystemUnreadCount() {
  return request<{ unread_count: number }>('/api/system-notifications/unread-count');
}

export async function markSystemNotificationRead(id: number) {
  return request<{ message: string }>(`/api/system-notifications/${id}/read`, {
    method: 'PUT',
  });
}

export async function markAllSystemNotificationsRead() {
  return request<{ message: string }>('/api/system-notifications/read-all', {
    method: 'PUT',
  });
}

export async function deleteSystemNotification(id: number) {
  return request<{ message: string }>(`/api/system-notifications/${id}`, {
    method: 'DELETE',
  });
}

export async function clearSystemNotifications() {
  return request<{ message: string }>('/api/system-notifications/clear', {
    method: 'DELETE',
  });
}
