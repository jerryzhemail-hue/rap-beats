import { request } from './request'

export interface DirectUploadTarget {
  kind: 'audio' | 'cover' | 'avatar' | 'banner' | 'forum_image' | 'forum_audio'
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  storedValue: string
  publicUrl: string
}

export async function uploadFileToTarget(
  target: DirectUploadTarget,
  file: File,
  onProgress?: (progress: number) => void
) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve()
      } else {
        reject(new Error(`文件上传失败: ${xhr.status}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('网络错误，文件上传失败'))
    })

    xhr.open(target.method, target.uploadUrl)
    Object.entries(target.headers || {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value)
    })
    xhr.send(file)
  })
}

export async function requestUploadTarget<T>(url: string, payload: object): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}
