import { request } from './request'
import { requestUploadTarget, uploadFileToTarget, type DirectUploadTarget } from './directUpload'
import type { Beat } from '@/types'

type UploadBeatInput = {
  title: string
  producer: string
  rapper?: string
  genre: string
  bpm: number
  key: string
  tags: string
  is_free: boolean
  duration: number
  audioFile: File
  coverFile?: File | null
}

type UploadBeatResponse = {
  message: string
  beat: Beat
}

type BeatUploadTargetsResponse = {
  direct_upload: boolean
  audio?: DirectUploadTarget | null
  cover?: DirectUploadTarget | null
}

function uploadBeatViaMultipart(
  input: UploadBeatInput,
  onProgress?: (progress: number) => void
): Promise<UploadBeatResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('audio', input.audioFile)
    if (input.coverFile) formData.append('cover', input.coverFile)
    formData.append('title', input.title)
    formData.append('producer', input.producer)
    if (input.rapper) formData.append('rapper', input.rapper)
    formData.append('genre', input.genre)
    formData.append('bpm', String(input.bpm))
    formData.append('key', input.key)
    formData.append('tags', input.tags)
    formData.append('is_free', input.is_free ? '1' : '0')
    formData.append('duration', String(input.duration))

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as UploadBeatResponse)
      } else {
        try {
          const data = JSON.parse(xhr.responseText)
          reject(new Error(data.error || '上传失败'))
        } catch {
          reject(new Error('上传失败'))
        }
      }
    })

    xhr.addEventListener('error', () => reject(new Error('网络错误，上传失败')))
    xhr.open('POST', '/api/beats/upload')
    const token = localStorage.getItem('rap-beats-token')
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }
    xhr.send(formData)
  })
}

export async function uploadBeatDirectly(
  input: UploadBeatInput,
  onProgress?: (progress: number) => void
): Promise<UploadBeatResponse> {
  const targets = await requestUploadTarget<BeatUploadTargetsResponse>('/api/beats/upload-targets', {
    audio: {
      name: input.audioFile.name,
      type: input.audioFile.type
    },
    cover: input.coverFile
      ? {
        name: input.coverFile.name,
        type: input.coverFile.type
      }
      : null
  })
  if (!targets.direct_upload || !targets.audio) {
    return uploadBeatViaMultipart(input, onProgress)
  }

  try {
    await uploadFileToTarget(targets.audio, input.audioFile, (progress) => {
      onProgress?.(Math.round(progress * 0.85))
    })

    if (input.coverFile && targets.cover) {
      await uploadFileToTarget(targets.cover, input.coverFile, (progress) => {
        onProgress?.(85 + Math.round(progress * 0.1))
      })
    } else {
      onProgress?.(95)
    }
  } catch (error) {
    // Browser-to-OSS uploads can be blocked by bucket CORS; retry through the backend.
    return uploadBeatViaMultipart(input, onProgress)
  }

  const result = await request<UploadBeatResponse>('/api/beats/upload-direct', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      producer: input.producer,
      rapper: input.rapper || undefined,
      genre: input.genre,
      bpm: input.bpm,
      key: input.key,
      tags: input.tags,
      is_free: input.is_free,
      duration: input.duration,
      audio_file_path: targets.audio.storedValue,
      cover_image: targets.cover?.storedValue || null
    })
  })

  onProgress?.(100)
  return result
}

// BPM + 调性检测（前端直接调用服务端识别）
export function detectBpmFromFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ bpm: number; duration: number; confidence: number; key: string | null; key_confidence: number | null }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('audio', file)

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          if (data.error) {
            reject(new Error(data.error))
          } else {
            resolve({
              bpm: data.bpm,
              duration: data.duration,
              confidence: data.confidence,
              key: data.key ?? null,
              key_confidence: data.key_confidence ?? null
            })
          }
        } catch {
          reject(new Error('识别失败'))
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText)
          reject(new Error(data.error || '识别失败'))
        } catch {
          reject(new Error('识别失败'))
        }
      }
    })

    xhr.addEventListener('error', () => reject(new Error('网络错误')))
    xhr.open('POST', '/api/beats/detect-bpm')
    const token = localStorage.getItem('rap-beats-token')
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }
    xhr.send(formData)
  })
}
