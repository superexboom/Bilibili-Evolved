import { defineComponentMetadata, defineOptionsMetadata } from '@/components/define'
import { addComponentListener, removeComponentListener } from '@/core/settings'
import { liveUrls } from '@/core/utils/urls'

const name = 'liveChatListLite'
const root = document.documentElement
const listSelector = '.chat-history-list'

export enum ChatListLimit {
  Fifty = '最近 50 条',
  Hundred = '最近 100 条',
}
const limitClasses: Record<ChatListLimit, string> = {
  [ChatListLimit.Fifty]: 'be-live-chat-limit-50',
  [ChatListLimit.Hundred]: 'be-live-chat-limit-100',
}
const readingClass = 'be-live-chat-reading'

const options = defineOptionsMetadata({
  limit: {
    displayName: '弹幕列表平时只渲染',
    dropdownEnum: ChatListLimit,
    defaultValue: ChatListLimit.Fifty,
  },
})

const applyLimit = (limit: ChatListLimit) => {
  for (const className of Object.values(limitClasses)) {
    root.classList.remove(className)
  }
  root.classList.add(limitClasses[limit] ?? limitClasses[ChatListLimit.Fifty])
}

/**
 * 判断用户是不是在往上翻看历史弹幕, 翻看时显示完整列表.
 *
 * 直播间自己的规则 (app.js 里弹幕列表的 scroll 监听): 滚轮事件后 200 ms 内, 滚动位置比上次靠上就锁定自动滚动,
 * 滚回底部再解锁. 这里按同样的规则判断, 并且等下一帧 (直播间已经锁定之后) 再展开列表.
 * 如果在滚轮事件里立刻展开, 上方多出来的消息会让浏览器把滚动位置往下挪 (保持画面不动),
 * 直播间看到"位置变大了"就不会锁定, 列表会被立刻拉回底部.
 */
let lastWheel = 0
let lastTop = 0
let reading = false
const setReading = (value: boolean, list: HTMLElement) => {
  reading = value
  requestAnimationFrame(() => {
    if (!reading) {
      root.classList.remove(readingClass)
      return
    }
    // 展开后上方多出约 250 条消息. 浏览器的滚动锚定一般能保持画面不动, 但如果滚轮的平滑滚动还在进行,
    // 动画会按展开前的坐标继续滚, 画面会跳到很早的消息. 这里按"离内容底部的距离"把位置设回去.
    const fromBottom = list.scrollHeight - list.scrollTop
    root.classList.add(readingClass)
    list.scrollTop = list.scrollHeight - fromBottom
  })
}
const isChatList = (target: EventTarget | null): target is HTMLElement =>
  target instanceof HTMLElement && target.matches(listSelector)
const onWheel = (e: WheelEvent) => {
  if (e.deltaY < 0 && e.target instanceof Element && e.target.closest(listSelector)) {
    lastWheel = Date.now()
  }
}
const onScroll = (e: Event) => {
  const list = e.target
  if (!isChatList(list)) {
    return
  }
  const top = list.scrollTop
  if (!reading) {
    if (Date.now() - lastWheel <= 200 && top < lastTop) {
      setReading(true, list)
    } else {
      lastTop = top
    }
    return
  }
  if (top + 1 + list.offsetHeight >= list.scrollHeight) {
    setReading(false, list)
    lastTop = top
  }
}
// 列表元素可能被直播间重建, 在 document 上捕获滚动事件就不用跟踪具体元素
const listenerOptions: AddEventListenerOptions = { capture: true, passive: true }

const start = () => {
  root.classList.add('be-live-chat-lite')
  addComponentListener(`${name}.limit`, applyLimit, true)
  document.addEventListener('wheel', onWheel, listenerOptions)
  document.addEventListener('scroll', onScroll, listenerOptions)
}

export const component = defineComponentMetadata({
  name,
  displayName: '直播间弹幕列表减负',
  tags: [componentsTags.live],
  urlInclude: liveUrls,
  author: {
    name: 'superexboom',
    link: 'https://github.com/superexboom',
  },
  entry: start,
  reload: start,
  unload: () => {
    removeComponentListener(`${name}.limit`, applyLimit)
    document.removeEventListener('wheel', onWheel, listenerOptions)
    document.removeEventListener('scroll', onScroll, listenerOptions)
    reading = false
    root.classList.remove('be-live-chat-lite', readingClass, ...Object.values(limitClasses))
  },
  options,
  instantStyles: [
    {
      name: 'live-chat-list-lite',
      style: () => import('./chat-list-lite.scss'),
    },
  ],
})
