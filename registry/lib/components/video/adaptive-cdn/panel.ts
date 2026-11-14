import { mountVueComponent } from '@/core/utils'

let panel: (Vue & { visible: boolean }) | null = null

/** 打开 / 收起 CDN 优选面板; 面板在第一次打开时才创建 */
export const togglePanel = async () => {
  if (!panel) {
    const Panel = await import('./Panel.vue')
    panel = mountVueComponent(Panel)
    document.body.append(panel.$el)
  }
  panel.visible = !panel.visible
}
