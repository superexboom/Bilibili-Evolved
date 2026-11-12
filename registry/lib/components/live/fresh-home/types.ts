import { defineOptionsMetadata } from '@/components/define'

export enum FollowLayout {
  SixByTwo = '6 × 2',
  FiveByTwo = '5 × 2',
  FourByTwo = '4 × 2',
  SixByOne = '6 × 1',
}
export const parseFollowLayout = (layout: string) => {
  const [columns, rows] = (layout ?? '').split('×').map(it => parseInt(it))
  return {
    columns: columns > 0 ? columns : 6,
    rows: rows > 0 ? rows : 2,
  }
}

export type AreaSort = 'online' | 'live_time'

export const liveFreshHomeOptionsMetadata = defineOptionsMetadata({
  followLayout: {
    displayName: '关注直播布局 (列 × 行)',
    dropdownEnum: FollowLayout,
    defaultValue: FollowLayout.SixByTwo,
  },
  hideAreaNav: {
    displayName: '隐藏顶栏下方的分区导航',
    defaultValue: true,
  },
  hoverKeyframe: {
    displayName: '悬停显示实时画面',
    defaultValue: true,
  },
  /** 分区推荐当前选中的父分区, 0 表示总览 */
  areaParentId: {
    displayName: '',
    defaultValue: 0,
    hidden: true,
  },
  /** 子分区, 0 表示父分区下的全部 */
  areaId: {
    displayName: '',
    defaultValue: 0,
    hidden: true,
  },
  areaSort: {
    displayName: '',
    defaultValue: 'online' as AreaSort,
    hidden: true,
  },
})
