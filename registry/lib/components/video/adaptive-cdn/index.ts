import { defineComponentMetadata, defineOptionsMetadata } from '@/components/define'
import { getComponentSettings } from '@/core/settings'
import { NAME, SLOT, boot, playbackPages } from './core'

const settingsApi = { settings: { getComponentSettings } }
const startCore = () => boot(settingsApi)

// 必须在组件代码被解析时就挂钩, 否则会错过页面内联脚本里 __playinfo__ 的赋值
try {
  startCore()
} catch (error) {
  console.warn('[CDN 自动优选] 延后启动:', error)
}

const options = defineOptionsMetadata({
  autoVideo: {
    displayName: '自动优选视频',
    defaultValue: true,
  },
  autoLive: {
    displayName: '自动优选直播',
    defaultValue: true,
  },
  autoRecover: {
    displayName: '直播断流时自动切换备用节点',
    defaultValue: true,
  },
  refreshMinutes: {
    displayName: '自动刷新测速间隔 (分钟, 0 为仅手动)',
    defaultValue: 60,
  },
  videoHosts: {
    displayName: '视频候选域名',
    defaultValue: '',
  },
  liveHosts: {
    displayName: '直播偏好域名',
    defaultValue: '',
  },
  listSources: {
    displayName: 'HTTPS JSON 节点列表订阅',
    defaultValue: '',
  },
  /** 面板上次被拖到的位置, left 为负表示还没拖过 (BE 设置不能存 null) */
  panelPosition: {
    displayName: '',
    defaultValue: { left: -1, top: -1 },
    hidden: true,
  },
})

export const component = defineComponentMetadata({
  name: NAME,
  displayName: '视频与直播 CDN 自动优选',
  tags: [componentsTags.video, componentsTags.live],
  urlInclude: playbackPages,
  author: {
    name: 'superexboom',
    link: 'https://github.com/superexboom',
  },
  entry: () => {
    startCore()
  },
  unload: () => {
    unsafeWindow[SLOT]?.stop()
  },
  reload: () => {
    startCore()
  },
  options,
  widget: {
    component: () => import('./Widget.vue').then(m => m.default),
    condition: () => Boolean(unsafeWindow[SLOT]),
  },
})
