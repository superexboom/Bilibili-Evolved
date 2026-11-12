/** 版块之间共享的轻量状态: 悬浮导航的版块注册, 未读数, 撤销提示条 */

export interface PlusSection {
  name: string
  title: string
  element: HTMLElement
}
export interface PlusSnackbar {
  key: number
  message: string
  actionText?: string
  action?: () => void
}

export const plusStore = Vue.observable({
  sections: [] as PlusSection[],
  feedsNewCount: 0,
  snackbar: null as PlusSnackbar | null,
})

export const registerSection = (section: PlusSection) => {
  const existing = plusStore.sections.findIndex(s => s.name === section.name)
  if (existing !== -1) {
    plusStore.sections.splice(existing, 1, section)
  } else {
    plusStore.sections.push(section)
  }
  const top = (s: PlusSection) => s.element.getBoundingClientRect().top
  plusStore.sections.sort((a, b) => top(a) - top(b))
}
export const unregisterSection = (name: string) => {
  const index = plusStore.sections.findIndex(s => s.name === name)
  if (index !== -1) {
    plusStore.sections.splice(index, 1)
  }
}

let snackbarTimer = 0
export const showSnackbar = (snackbar: Omit<PlusSnackbar, 'key'>, duration = 5000) => {
  window.clearTimeout(snackbarTimer)
  plusStore.snackbar = { ...snackbar, key: Date.now() }
  snackbarTimer = window.setTimeout(() => {
    plusStore.snackbar = null
  }, duration)
}
export const closeSnackbar = () => {
  window.clearTimeout(snackbarTimer)
  plusStore.snackbar = null
}
