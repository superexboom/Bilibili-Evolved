import { OptionsOfMetadata } from '@/components/define'
import { addComponentListener, getComponentSettings } from '@/core/settings'
import { liveFreshHomeOptionsMetadata } from './types'

export const componentName = 'liveFreshHome'

export const liveOptions =
  getComponentSettings<OptionsOfMetadata<typeof liveFreshHomeOptionsMetadata>>(
    componentName,
  ).options

/**
 * 组件设置是普通 Proxy, 不是 Vue 响应式对象.
 * 需要在界面上实时生效的设置放进这里, 并监听设置面板里的改动.
 */
export const liveStore = Vue.observable({
  followLayout: liveOptions.followLayout as string,
  hoverKeyframe: liveOptions.hoverKeyframe as boolean,
  /** 当前是否在直播首页 (直播站是单页应用, 可能在站内跳到其他页面) */
  isHome: true,
})

addComponentListener(`${componentName}.followLayout`, (value: string) => {
  liveStore.followLayout = value
})
addComponentListener(`${componentName}.hoverKeyframe`, (value: boolean) => {
  liveStore.hoverKeyframe = value
})
