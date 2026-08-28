/**
 * 管理员通知 API
 */
import apiClient from './client.js';

export interface AdminNotification {
  id: number;
  type: string;
  title: string;
  content: string | null;
  data: Record<string, unknown> | null;
  is_read: number;
  created_at: string;
}

export async function fetchAdminNotifications(): Promise<{ notifications: AdminNotification[] }> {
  const res = await apiClient.get<{ notifications: AdminNotification[] }>('/admin/notifications');
  return res.data;
}

export async function fetchAdminUnreadCount(): Promise<{ unreadCount: number }> {
  const res = await apiClient.get<{ unreadCount: number }>('/admin/notifications/unread');
  return res.data;
}

export async function markAdminNotificationRead(id: number): Promise<void> {
  await apiClient.patch(`/admin/notifications/${id}/read`);
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  await apiClient.post('/admin/notifications/read-all');
}

export async function deleteAdminNotification(id: number): Promise<void> {
  await apiClient.delete(`/admin/notifications/${id}`);
}

export async function clearAdminNotifications(): Promise<void> {
  await apiClient.delete('/admin/notifications');
}
