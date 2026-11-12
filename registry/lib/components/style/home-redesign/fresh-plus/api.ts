import {
  applyContentFilter,
  feedsCardTypes,
  getFeedsUrl,
  groupVideoFeeds,
  isPreOrderedVideo,
} from '@/components/feeds/api'
import { VideoCard } from '@/components/feeds/video-card'
import { watchlaterList } from '@/components/video/watchlater'
import { getJson, getJsonWithCredentials } from '@/core/ajax'
import { getUID } from '@/core/utils'
import { formatCount, formatDuration, parseCount, parseDuration } from '@/core/utils/formatters'
import { filterBlockedUps } from './blacklist'

export interface PlusCard extends VideoCard {
  cid?: number
  /** 原始播放数 / 弹幕数, 用于排序 */
  playNum?: number
  danmakuNum?: number
  /** 推荐理由, 如 "1万点赞" */
  reason?: string
  /** 推荐里出现的已关注 UP */
  followed?: boolean
  /** 比上次已读位置更新的动态 */
  isNew?: boolean
  /** 在所属批次中的序号, 用于入场动画错峰 */
  order?: number
}

const https = (url: string) => (url ?? '').replace(/^http:/, 'https:').replace(/^\/\//, 'https://')

let freshIndex = 0
/** 获取一批推荐视频 (一次约 30 条), 每次调用都会拿到新的一批 */
export const getRecommendBatch = async (isPersonalized: boolean): Promise<PlusCard[]> => {
  freshIndex++
  const personalized = Boolean(getUID()) && isPersonalized
  const params = new URLSearchParams({
    ps: '30',
    fresh_type: '4',
    fresh_idx: String(freshIndex),
    fresh_idx_1h: String(freshIndex),
    brush: String(freshIndex),
  })
  const api = `https://api.bilibili.com/x/web-interface/index/top/feed/rcmd?${params}`
  const { code, message, data } = await (personalized ? getJsonWithCredentials : getJson)(api)
  if (code !== 0) {
    throw new Error(`获取${personalized ? '推荐' : '热门'}视频失败: ${message}`)
  }
  const list = ((data?.item ?? []) as any[]).filter(it => it.goto === 'av' && it.bvid)
  const cards = list.map((it): PlusCard => {
    const reason: string = it.rcmd_reason?.content ?? ''
    return {
      id: String(it.id),
      aid: it.id,
      bvid: it.bvid,
      cid: it.cid,
      coverUrl: https(it.pic),
      title: it.title,
      description: '',
      dynamic: '',
      duration: it.duration,
      durationText: formatDuration(it.duration),
      timestamp: it.pubdate * 1000,
      upName: it.owner.name,
      upID: it.owner.mid,
      upFaceUrl: https(it.owner.face),
      like: formatCount(it.stat.like),
      playCount: formatCount(it.stat.view),
      danmakuCount: formatCount(it.stat.danmaku),
      playNum: it.stat.view ?? 0,
      danmakuNum: it.stat.danmaku ?? 0,
      watchlater: watchlaterList.includes(it.id),
      followed: it.is_followed === 1,
      reason: it.is_followed === 1 ? '' : reason,
    }
  })
  return filterBlockedUps(applyContentFilter(cards))
}

export interface FeedsPage {
  cards: PlusCard[]
  offset: string
  hasMore: boolean
}
const mapVideoFeed = (card: any): PlusCard | null => {
  const archive = lodash.get(card, 'modules.module_dynamic.major.archive')
  if (!archive) {
    return null
  }
  const author = lodash.get(card, 'modules.module_author')
  const stat = lodash.get(card, 'modules.module_stat')
  const duration = parseDuration(archive.duration_text)
  return {
    id: card.id_str,
    aid: parseInt(archive.aid),
    bvid: archive.bvid,
    title: archive.title,
    upFaceUrl: https(author.face),
    upName: author.name,
    upID: author.mid,
    coverUrl: https(archive.cover),
    description: archive.desc,
    dynamic: lodash.get(card, 'modules.module_dynamic.desc.text', ''),
    timestamp: author.pub_ts * 1000,
    like: formatCount(stat?.like?.count ?? 0),
    duration,
    durationText: formatDuration(duration),
    playCount: formatCount(parseCount(archive.stat.play)),
    danmakuCount: formatCount(parseCount(archive.stat.danmaku)),
    watchlater: watchlaterList.includes(parseInt(archive.aid)),
  }
}
const mapBangumiFeed = (card: any): PlusCard | null => {
  const pgc = lodash.get(card, 'modules.module_dynamic.major.pgc')
  if (!pgc) {
    return null
  }
  const author = lodash.get(card, 'modules.module_author')
  return {
    id: card.id_str,
    epID: pgc.epid,
    title: pgc.title.replace(new RegExp(`^${lodash.escapeRegExp(author.name)}：`), ''),
    upName: author.name,
    upFaceUrl: https(author.face),
    coverUrl: https(pgc.cover),
    description: '',
    timestamp: author.pub_ts * 1000,
    durationText: '',
    playCount: formatCount(parseCount(pgc.stat.play)),
    danmakuCount: formatCount(parseCount(pgc.stat.danmaku)),
  }
}

/** 获取一页关注动态, 返回 offset 供下一页使用 */
export const getFeedsPage = async (
  type: 'video' | 'bangumi',
  offset?: string,
): Promise<FeedsPage> => {
  if (!getUID()) {
    return { cards: [], offset: '', hasMore: false }
  }
  const json = await getJsonWithCredentials(
    getFeedsUrl(type === 'video' ? feedsCardTypes.video : feedsCardTypes.bangumi, offset),
  )
  if (json.code !== 0) {
    throw new Error(json.message)
  }
  const items = ((json.data?.items ?? []) as any[]).filter(it => !isPreOrderedVideo(it))
  const mapped = items
    .map(type === 'video' ? mapVideoFeed : mapBangumiFeed)
    .filter((it): it is PlusCard => it !== null)
  const cards = (type === 'video' ? groupVideoFeeds(mapped) : mapped) as PlusCard[]
  return {
    cards: applyContentFilter(cards),
    offset: String(json.data?.offset ?? ''),
    hasMore: Boolean(json.data?.has_more),
  }
}

/** 动态 ID 是 64 位整数字符串, 用 BigInt 比较新旧 */
export const isNewerId = (id: string, than: string) => {
  if (!than) {
    return false
  }
  try {
    return BigInt(id) > BigInt(than)
  } catch {
    return false
  }
}
export const maxId = (ids: string[]) =>
  ids.reduce((max, id) => (!max || isNewerId(id, max) ? id : max), '')
