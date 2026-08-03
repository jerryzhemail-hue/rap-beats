export function resolveAssetUrl(
  value: string | null | undefined,
  basePath: '/covers' | '/avatars',
  fallback = ''
): string {
  if (!value) return fallback

  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('//') ||
    value.startsWith('data:') ||
    value.startsWith('blob:')
  ) {
    return value
  }

  if (value.startsWith('/')) {
    return value
  }

  return `${basePath}/${value}`
}

export function resolveCoverUrl(value: string | null | undefined, fallback = ''): string {
  return resolveAssetUrl(value, '/covers', fallback)
}

export function resolveAvatarUrl(value: string | null | undefined, fallback = ''): string {
  return resolveAssetUrl(value, '/avatars', fallback)
}
