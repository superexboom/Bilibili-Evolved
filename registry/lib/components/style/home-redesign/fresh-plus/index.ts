import { defineComponentMetadata } from '@/components/define'
import { contentLoaded } from '@/core/life-cycle'
import { addComponentListener, settings } from '@/core/settings'
import { Toast } from '@/core/toast'
import { mountVueComponent } from '@/core/utils'
import { homeUrls } from '../urls'
import { freshHomeOptionsMetadata } from './types'

const name = 'freshHomePlus'
const originalName = 'freshHome'
/** 迁移时不覆盖的键 (Plus 自有状态) */
const ownKeys = ['lastReadFeedId', 'fallbackBlockedUps', 'migrated']

/** 首次运行时, 把原版「清爽首页」的设置 (版块布局 / 栏目排序 / 宽度等) 复制过来 */
const migrateFromOriginal = (options: Record<string, unknown>) => {
  if (options.migrated) {
    return
  }
  const original = settings.userComponents[originalName]?.settings?.options
  if (original) {
    Object.entries(original).forEach(([key, value]) => {
      if (!ownKeys.includes(key)) {
        options[key] = lodash.cloneDeep(value)
      }
    })
    // 新版推荐与动态都是网格, 默认上下排列
    const layoutOptions = options.layoutOptions as Record<string, { linebreak: boolean }>
    if (layoutOptions?.trending) {
      layoutOptions.trending.linebreak = true
    }
    if (layoutOptions?.feeds) {
      layoutOptions.feeds.linebreak = true
    }
  }
  options.migrated = true
}

export const component = defineComponentMetadata({
  name,
  displayName: '清爽首页 Plus',
  urlInclude: homeUrls,
  tags: [componentsTags.style],
  author: {
    name: 'superexboom',
    link: 'https://github.com/superexboom',
  },
  entry: ({ settings: componentSettings }) => {
    if (settings.userComponents[originalName]?.settings?.enabled) {
      Toast.info('请先在设置中关闭原版「清爽首页」, 两者不能同时启用.', '清爽首页 Plus', 8000)
      return
    }
    migrateFromOriginal(componentSettings.options)
    addComponentListener(
      `${name}.maxWidth`,
      (width: number) => {
        document.documentElement.style.setProperty('--home-max-width-override', `${width}px`)
      },
      true,
    )
    contentLoaded(async () => {
      const FreshHome = await import('./FreshHome.vue')
      const freshHome = mountVueComponent(FreshHome)
      document.body.appendChild(freshHome.$el)
    })
  },
  options: freshHomeOptionsMetadata,
  extraOptions: () => import('./ExtraOptions.vue'),
  unload: () => document.body.classList.add('home-redesign-off'),
  reload: () => document.body.classList.remove('home-redesign-off'),
  instantStyles: [
    {
      name: 'fresh-home-plus-hide-original',
      style: () => import('../hide-original.scss'),
    },
  ],
})
