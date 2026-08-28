import { request } from './request';

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
  return request('/api/admin/notifications', { method: 'GET' });
}

export async function fetchAdminUnreadCount(): Promise<{ unreadCount: number }> {
  return request('/api/admin/notifications/unread', { method: 'GET' });
}

export async function markAdminNotificationRead(id: number): Promise<{ success: boolean }> {
  return request(`/api/admin/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllAdminNotificationsRead(): Promise<{ success: boolean }> {
  return request('/api/admin/notifications/read-all', { method: 'POST' });
}

export async function deleteAdminNotification(id: number): Promise<{ success: boolean }> {
  return request(`/api/admin/notifications/${id}`, { method: 'DELETE' });
}

export async function clearAdminNotifications(): Promise<{ success: boolean }> {
  return request('/api/admin/notifications', { method: 'DELETE' });
}
