import { getJsonWithCredentials } from '@/core/ajax'
import { getUID } from '@/core/utils'
import type { AreaSort } from './types'

export interface LiveRoom {
  roomId: number
  uid: number
  title: string
  uname: string
  face: string
  cover: string
  /** 直播画面截图 */
  keyframe: string
  /** 人气 / 在线数值 */
  online: number
  /** 接口给出的观看文字, 如 "1.1万" / "60人看过" */
  watchedText: string
  areaId: number
  areaName: string
  parentAreaId: number
  parentAreaName: string
  /** 开播时间 (秒), 仅关注列表有 */
  liveStart?: number
}
export interface AreaModule {
  id: number
  title: string
  icon: string
  parentAreaId: number
  areaId: number
  rooms: LiveRoom[]
}
export interface SubArea {
  id: number
  name: string
  pic: string
}
export interface ParentArea {
  id: number
  name: string
  areas: SubArea[]
}

const https = (url: string) => (url ?? '').replace(/^http:/, 'https:').replace(/^\/\//, 'https://')
const num = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** hdslb 图片按需缩放, 减少流量 */
export const thumb = (url: string, width: number, height: number) => {
  if (!url || !/hdslb\.com\/bfs\//.test(url) || url.includes('@')) {
    return url
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  return `${url}@${Math.round(width * dpr)}w_${Math.round(height * dpr)}h_1c.webp`
}
export const roomUrl = (roomId: number) => `https://live.bilibili.com/${roomId}`

const request = async (url: string) => {
  const json = await getJsonWithCredentials(url)
  if (json?.code !== 0) {
    throw new Error(json?.message || json?.msg || `请求失败 (${json?.code})`)
  }
  return json.data
}

/** 正在直播的关注主播 */
export const getFollowingLive = async (): Promise<LiveRoom[]> => {
  if (!getUID()) {
    return []
  }
  const pageSize = 50
  const rooms: LiveRoom[] = []
  for (let page = 1; page <= 6; page++) {
    const data = await request(
      `https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/GetWebList?page=${page}&page_size=${pageSize}`,
    )
    const list = (data?.list ?? data?.rooms ?? []) as any[]
    list.forEach(it => {
      rooms.push({
        roomId: num(it.room_id ?? it.roomid),
        uid: num(it.uid),
        title: it.title ?? it.roomname ?? '',
        uname: it.uname ?? it.nickname ?? '',
        face: https(it.face),
        cover: https(it.cover_from_user || it.keyframe),
        keyframe: https(it.keyframe),
        online: num(it.online),
        watchedText: '',
        areaId: num(it.area_v2_id),
        areaName: it.area_v2_name ?? '',
        parentAreaId: num(it.area_v2_parent_id),
        parentAreaName: it.area_v2_parent_name ?? '',
        liveStart: num(it.liveTime) || undefined,
      })
    })
    const total = num(data?.count)
    if (list.length < pageSize || rooms.length >= total) {
      break
    }
  }
  return lodash.uniqBy(rooms, it => it.roomId)
}

const mapIndexRoom = (it: any): LiveRoom => ({
  roomId: num(it.roomid),
  uid: num(it.uid),
  title: it.title ?? '',
  uname: it.uname ?? '',
  face: https(it.face),
  cover: https(it.cover || it.keyframe),
  keyframe: https(it.keyframe),
  online: num(it.online),
  watchedText: it.watched_show?.text_small ?? '',
  areaId: num(it.area_v2_id),
  areaName: it.area_v2_name ?? '',
  parentAreaId: num(it.area_v2_parent_id),
  parentAreaName: it.area_v2_parent_name ?? '',
})

/** 旧版直播首页的分区推荐模块 (娱乐 / 网游 / 手游 ... 各 10 个直播间) */
export const getAreaModules = async (): Promise<AreaModule[]> => {
  const data = await request(
    'https://api.live.bilibili.com/xlive/web-interface/v1/index/getList?platform=web',
  )
  const modules = (data?.room_list ?? []) as any[]
  return modules
    .filter(m => {
      const info = m.module_info ?? {}
      // 我的关注 (type 8) 在上方单独展示; 推荐直播就是新版首页的大卡片推荐流, 不再展示
      return info.type !== 8 && !String(info.link ?? '').endsWith('/all') && m.list?.length
    })
    .map(m => {
      const info = m.module_info
      const link = new URL(info.link ?? '', 'https://live.bilibili.com')
      return {
        id: num(info.id),
        title: info.title ?? '',
        icon: https(info.pic),
        parentAreaId: num(link.searchParams.get('parentAreaId')),
        areaId: num(link.searchParams.get('areaId')),
        rooms: (m.list as any[]).filter(it => !it.is_ad).map(mapIndexRoom),
      }
    })
}

let areaTreeCache: Promise<ParentArea[]> | null = null
/** 全部分区 (父分区及其子分区) */
export const getAreaTree = () => {
  if (!areaTreeCache) {
    areaTreeCache = request('https://api.live.bilibili.com/room/v1/Area/getList')
      .then((data: any[]) =>
        (data ?? []).map(parent => ({
          id: num(parent.id),
          name: parent.name,
          areas: ((parent.list ?? []) as any[]).map(it => ({
            id: num(it.id),
            name: it.name,
            pic: https(it.pic),
          })),
        })),
      )
      .catch(error => {
        areaTreeCache = null
        throw error
      })
  }
  return areaTreeCache
}

export const areaPageSize = 30
export interface AreaRoomsPage {
  rooms: LiveRoom[]
  total: number
}
/** 分区下的直播间, 可按人气或开播时间排序 */
export const getAreaRooms = async (
  parentAreaId: number,
  areaId: number,
  sort: AreaSort,
  page: number,
): Promise<AreaRoomsPage> => {
  const params = new URLSearchParams({
    platform: 'web',
    parent_area_id: String(parentAreaId),
    cate_id: '0',
    area_id: String(areaId),
    sort_type: sort,
    page: String(page),
    page_size: String(areaPageSize),
  })
  const data = await request(`https://api.live.bilibili.com/room/v3/area/getRoomList?${params}`)
  const rooms = ((data?.list ?? []) as any[]).map(
    (it): LiveRoom => ({
      roomId: num(it.roomid),
      uid: num(it.uid),
      title: it.title ?? '',
      uname: it.uname ?? '',
      face: https(it.face),
      cover: https(it.user_cover || it.cover || it.system_cover),
      keyframe: https(it.system_cover),
      online: num(it.online),
      watchedText: it.watched_show?.text_small ?? '',
      areaId: num(it.area_v2_id),
      areaName: it.area_v2_name ?? '',
      parentAreaId: num(it.area_v2_parent_id),
      parentAreaName: it.area_v2_parent_name ?? '',
    }),
  )
  return { rooms, total: num(data?.count) }
}
