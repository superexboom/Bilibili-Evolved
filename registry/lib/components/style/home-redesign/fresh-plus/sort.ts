import { parseCount } from '@/core/utils/formatters'
import type { PlusCard } from './api'

export type TrendingSortKey = 'default' | 'play' | 'danmaku' | 'duration' | 'pubdate'

export const trendingSorts: { key: TrendingSortKey; label: string; title: string }[] = [
  { key: 'default', label: '推荐', title: '按推荐顺序' },
  { key: 'play', label: '播放', title: '按播放数排序' },
  { key: 'danmaku', label: '弹幕', title: '按弹幕数排序' },
  { key: 'duration', label: '时长', title: '按视频时长排序' },
  { key: 'pubdate', label: '发布', title: '按发布时间排序' },
]

const sortValue: Record<Exclude<TrendingSortKey, 'default'>, (card: PlusCard) => number> = {
  // 旧的历史快照里没有原始数值, 从格式化后的文字 (如 "16.5万") 反推
  play: card => card.playNum ?? parseCount(card.playCount ?? '0'),
  danmaku: card => card.danmakuNum ?? parseCount(card.danmakuCount ?? '0'),
  duration: card => card.duration ?? 0,
  pubdate: card => card.timestamp ?? 0,
}

/** 返回排序后的新数组; 'default' 保持推荐接口给出的顺序 */
export const sortCards = (cards: PlusCard[], key: TrendingSortKey, descending: boolean) => {
  if (key === 'default' || !sortValue[key]) {
    return cards
  }
  const getValue = sortValue[key]
  const direction = descending ? -1 : 1
  return [...cards].sort((a, b) => (getValue(a) - getValue(b)) * direction)
}
