/**
 * 设备指纹生成工具
 * 生成一个稳定的设备唯一标识符
 */

const DEVICE_ID_KEY = 'rap-beats-device-id'

interface DeviceInfo {
  deviceId: string
  platform: string
  language: string
  screen: string
  timezone: string
}

function generateFingerprint(): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = "14px 'Arial'"
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('Rap Beats', 2, 15)
    ctx.fillStyle = 'rgba(200, 0, 0, 0.5)'
    ctx.fillText('Fingerprint', 2, 45)
  }

  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    canvas.toDataURL()
  ].join('|')

  let hash = 0
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }

  const absHash = Math.abs(hash).toString(36)
  return absHash
}

export function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY)
    if (!deviceId) {
      deviceId = generateFingerprint()
      localStorage.setItem(DEVICE_ID_KEY, deviceId)
    }
    return deviceId
  } catch {
    return generateFingerprint()
  }
}

export function getDeviceInfo(): DeviceInfo {
  return {
    deviceId: getDeviceId(),
    platform: navigator.platform,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }
}
