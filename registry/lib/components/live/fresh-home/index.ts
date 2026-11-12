import { defineComponentMetadata } from '@/components/define'
import { addComponentListener } from '@/core/settings'
import { select } from '@/core/spin-query'
import { mountVueComponent } from '@/core/utils'
import { liveFreshHomeOptionsMetadata } from './types'

const name = 'liveFreshHome'
const liveHome = /^https:\/\/live\.bilibili\.com\/(index\.html)?([?#].*)?$/
const isLiveHome = () => liveHome.test(window.location.href)
const root = document.documentElement

/** 本组件生效中 (在直播首页, 且没有被关闭 / 跳到站内其他页面) */
const isActive = () => isLiveHome() && !root.classList.contains('lfh-off')
/** 原页面播放器的拉流请求: 取流地址接口 + 直播流本身 */
const streamPattern = /\/getRoomPlayInfo\?|\/live-bvc\/|\.m3u8(\?|$)|\.flv(\?|$)/
const isStreamUrl = (input: unknown) => {
  if (typeof input === 'string') {
    return streamPattern.test(input)
  }
  if (input instanceof URL) {
    return streamPattern.test(input.href)
  }
  const url = (input as Request | null)?.url
  return typeof url === 'string' && streamPattern.test(url)
}

/**
 * 新版首页即使隐藏了主体, 原页面的大屏播放器 (main-player) 仍会在后台取流并带声音播放.
 * 这里从源头拦截: 不让它拿到直播流地址 (省带宽), 再兜底拦住任何不属于本组件的播放.
 * 取代原来的「直播首页静音」/「直播首页暂停」组件.
 */
const blockOriginalPlayer = () => {
  const pageWindow = unsafeWindow
  const blockedResponse = () =>
    new pageWindow.Response(
      JSON.stringify({ code: -1, message: '清爽直播首页: 已拦截首页预览拉流', data: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

  const originalFetch = pageWindow.fetch
  pageWindow.fetch = function fetch(input: RequestInfo | URL, init?: RequestInit) {
    if (isActive() && isStreamUrl(input)) {
      return pageWindow.Promise.resolve(blockedResponse())
    }
    return originalFetch.call(pageWindow, input, init)
  }

  const xhrProto = pageWindow.XMLHttpRequest.prototype
  const originalOpen = xhrProto.open
  const originalSend = xhrProto.send
  const blockedXhrs = new WeakSet<XMLHttpRequest>()
  xhrProto.open = function open(this: XMLHttpRequest, ...args: unknown[]) {
    if (isActive() && isStreamUrl(args[1])) {
      blockedXhrs.add(this)
    } else {
      blockedXhrs.delete(this)
    }
    return (originalOpen as (...a: unknown[]) => void).apply(this, args)
  } as typeof xhrProto.open
  xhrProto.send = function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit) {
    if (blockedXhrs.has(this)) {
      this.abort()
      return
    }
    originalSend.call(this, body)
  }

  // 兜底: 首页上本组件自身不含视频, 任何其他视频的播放都静音并拒绝
  const isOwn = (el: Element) => Boolean(el.closest('.lfh'))
  const mediaProto = pageWindow.HTMLMediaElement.prototype
  const originalPlay = mediaProto.play
  mediaProto.play = function play(this: HTMLMediaElement) {
    if (isActive() && !isOwn(this)) {
      this.muted = true
      this.autoplay = false
      return pageWindow.Promise.resolve()
    }
    return originalPlay.call(this)
  }
  document.addEventListener(
    'play',
    e => {
      const media = e.target
      if (media instanceof HTMLMediaElement && isActive() && !isOwn(media)) {
        media.muted = true
        media.pause()
      }
    },
    true,
  )
  document.querySelectorAll('video, audio').forEach((media: HTMLMediaElement) => {
    if (!isOwn(media)) {
      media.muted = true
      media.pause()
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
    // 必须最先执行: 赶在原页面播放器取流之前装好拦截
    blockOriginalPlayer()
    addComponentListener(
      `${name}.hideAreaNav`,
      (hide: boolean) => {
        root.classList.toggle('lfh-show-area-nav', !hide)
      },
      true,
    )
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
