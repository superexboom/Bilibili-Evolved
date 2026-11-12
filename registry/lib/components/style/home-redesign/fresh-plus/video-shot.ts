import { getJsonWithCredentials } from '@/core/ajax'

/** B 站视频预览图 (videoshot) 雪碧图信息 */
export interface VideoShot {
  images: string[]
  columns: number
  rows: number
  frames: number
}

const cache = new Map<string, Promise<VideoShot | null>>()
const preloaded = new Set<string>()

const fetchShot = async (bvid: string, cid?: number): Promise<VideoShot | null> => {
  const cidParam = cid ? `&cid=${cid}` : ''
  const json = await getJsonWithCredentials(
    `https://api.bilibili.com/x/player/videoshot?index=1&bvid=${bvid}${cidParam}`,
  )
  const data = json?.data
  if (json?.code !== 0 || !data?.image?.length || !data.img_x_len || !data.img_y_len) {
    return null
  }
  const images = (data.image as string[]).map(url => (url.startsWith('//') ? `https:${url}` : url))
  const capacity = data.img_x_len * data.img_y_len * images.length
  const indexLength = Array.isArray(data.index) ? data.index.length - 1 : 0
  return {
    images,
    columns: data.img_x_len,
    rows: data.img_y_len,
    frames: Math.max(1, indexLength > 0 ? Math.min(indexLength, capacity) : capacity),
  }
}

export const getVideoShot = (bvid: string, cid?: number) => {
  const key = `${bvid}:${cid ?? ''}`
  if (!cache.has(key)) {
    cache.set(
      key,
      fetchShot(bvid, cid).catch(() => null),
    )
  }
  return cache.get(key)
}

/** 第一张雪碧图通常就够用, 提前加载避免拖动时闪烁 */
export const preloadShot = (shot: VideoShot) => {
  shot.images.forEach(url => {
    if (!preloaded.has(url)) {
      preloaded.add(url)
      new Image().src = url
    }
  })
}

/** 指定进度 (0~1) 对应的 CSS 背景样式 */
export const getShotFrameStyle = (shot: VideoShot, progress: number) => {
  const perImage = shot.columns * shot.rows
  const frame = Math.min(shot.frames - 1, Math.max(0, Math.floor(progress * shot.frames)))
  const image = shot.images[Math.floor(frame / perImage)] ?? shot.images[0]
  const tile = frame % perImage
  const x = tile % shot.columns
  const y = Math.floor(tile / shot.columns)
  return {
    backgroundImage: `url("${image}")`,
    backgroundSize: `${shot.columns * 100}% ${shot.rows * 100}%`,
    backgroundPosition: `${shot.columns > 1 ? (x / (shot.columns - 1)) * 100 : 0}% ${
      shot.rows > 1 ? (y / (shot.rows - 1)) * 100 : 0
    }%`,
  }
}
