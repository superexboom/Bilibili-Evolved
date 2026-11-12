import { defineComponentMetadata } from '@/components/define'
import { addComponentListener } from '@/core/settings'
import { select } from '@/core/spin-query'
import { mountVueComponent } from '@/core/utils'
import { liveFreshHomeOptionsMetadata } from './types'

const name = 'liveFreshHome'
const liveHome = /^https:\/\/live\.bilibili\.com\/(index\.html)?([?#].*)?$/
const isLiveHome = () => liveHome.test(window.location.href)
const root = document.documentElement

/**
 * 原页面已被隐藏, 但其中的直播间预览仍可能自动播放 (旧版首页大屏 / 新版卡片悬停预览).
 * 这里一律静音并暂停, 取代原来的「直播首页静音」/「直播首页暂停」组件.
 */
const silenceOriginal = () => {
  const isOriginal = (el: Element) => Boolean(el.closest('.v2-main-scroll > main'))
  const silence = (video: HTMLVideoElement) => {
    video.muted = true
    video.pause()
  }
  document.addEventListener(
    'play',
    e => {
      const video = e.target as HTMLVideoElement
      if (video instanceof HTMLVideoElement && isOriginal(video) && isLiveHome()) {
        silence(video)
      }
    },
    true,
  )
  document.querySelectorAll('video').forEach(video => {
    if (isOriginal(video)) {
      silence(video)
    }
  })
}

/** 直播站是单页应用, 在站内跳到其他页面时收起本组件 */
const watchRoute = async () => {
  const { liveStore } = await import('./options')
  let lastUrl = ''
  const check = () => {
    if (window.location.href === lastUrl) {
      return
    }
    lastUrl = window.location.href
    const home = isLiveHome()
    liveStore.isHome = home
    root.classList.toggle('lfh-off', !home)
  }
  check()
  window.addEventListener('popstate', check)
  window.setInterval(check, 1000)
}

export const component = defineComponentMetadata({
  name,
  displayName: '清爽直播首页',
  tags: [componentsTags.live, componentsTags.style],
  urlInclude: [liveHome],
  author: {
    name: 'superexboom',
    link: 'https://github.com/superexboom',
  },
  entry: async () => {
    addComponentListener(
      `${name}.hideAreaNav`,
      (hide: boolean) => {
        root.classList.toggle('lfh-show-area-nav', !hide)
      },
      true,
    )
    silenceOriginal()
    const scroll = await select<HTMLElement>('.v2-main-scroll')
    if (!scroll) {
      // 页面结构变了: 放弃替换, 恢复原页面
      root.classList.add('lfh-failed')
      console.warn('[清爽直播首页] 未找到页面主体 .v2-main-scroll, 已恢复原页面')
      return
    }
    try {
      const LiveFreshHome = await import('./LiveFreshHome.vue')
      const instance = mountVueComponent(LiveFreshHome)
      scroll.prepend(instance.$el)
      await watchRoute()
    } catch (error) {
      root.classList.add('lfh-failed')
      throw error
    }
  },
  unload: () => root.classList.add('lfh-off'),
  reload: () => {
    root.classList.toggle('lfh-off', !isLiveHome())
  },
  options: liveFreshHomeOptionsMetadata,
  instantStyles: [
    {
      name: 'live-fresh-home-hide-original',
      style: () => import('./hide-original.scss'),
    },
  ],
})
