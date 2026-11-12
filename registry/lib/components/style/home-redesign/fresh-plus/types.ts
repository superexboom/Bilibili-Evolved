import { defineOptionsMetadata } from '@/components/define'
import { getNumberValidator } from '@/core/utils'
import type { FreshLayoutItemSettings } from './layouts/fresh-layout-item'
import { areaPrimaryTitleColorEnum } from './init-dropdown-options/area-primary-title-color'
import type { TrendingSortKey } from './sort'

export enum RankListMode {
  Default = 'default',
  Compact = 'compact',
}

export const freshHomeOptionsMetadata = defineOptionsMetadata({
  layoutOptions: {
    displayName: '版块设置',
    defaultValue: {
      blackboard: {
        linebreak: false,
        order: 1,
        // as boolean 一下, 不然 TS 会推断为只能 false
        hidden: false as boolean,
      },
      trending: {
        linebreak: true,
        order: 2,
        hidden: false,
      },
      feeds: {
        linebreak: true,
        order: 3,
        hidden: false,
      },
      areas: {
        linebreak: true,
        order: 4,
        hidden: false,
      },
      categories: {
        linebreak: false,
        order: 5,
        hidden: false,
      },
    } satisfies Record<string, FreshLayoutItemSettings>,
    hidden: true,
  },
  personalized: {
    displayName: '个性化推荐',
    defaultValue: true,
  },
  hoverPreview: {
    displayName: '悬停预览画面',
    defaultValue: true,
  },
  showBlockButton: {
    displayName: '推荐卡片显示屏蔽按钮',
    defaultValue: true,
  },
  autoMarkFeedsRead: {
    displayName: '浏览后自动标记动态已读',
    defaultValue: true,
  },
  horizontalWheelScroll: {
    displayName: '启用横向滚动',
    defaultValue: false,
  },
  areaPrimaryTitleColor: {
    displayName: '栏目主标题颜色',
    dropdownEnum: areaPrimaryTitleColorEnum,
    defaultValue: areaPrimaryTitleColorEnum.Dark,
  },
  maxWidth: {
    displayName: '最大宽度 (px)',
    defaultValue: 1440,
    validator: getNumberValidator(1000, 3000),
  },
  rankListMode: {
    displayName: '',
    defaultValue: RankListMode.Default,
    hidden: true,
  },
  /** 推荐视频的排序方式, 在版块标题旁切换 */
  trendingSort: {
    displayName: '',
    defaultValue: 'default' as TrendingSortKey,
    hidden: true,
  },
  trendingSortDescending: {
    displayName: '',
    defaultValue: true,
    hidden: true,
  },
  /** 已读到的最新一条视频动态 ID (id_str) */
  lastReadFeedId: {
    displayName: '',
    defaultValue: '',
    hidden: true,
  },
  /** 未安装「屏蔽黑名单up主」时使用的本地屏蔽名单 */
  fallbackBlockedUps: {
    displayName: '',
    defaultValue: [] as string[],
    hidden: true,
  },
  /** 是否已从原版「清爽首页」迁移过设置 */
  migrated: {
    displayName: '',
    defaultValue: false,
    hidden: true,
  },
})
