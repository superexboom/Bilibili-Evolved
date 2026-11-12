import { settings } from '@/core/settings'
import { getData } from '@/plugins/data'
import { freshHomeOptions } from './options'

/**
 * 与「屏蔽黑名单up主」(blackList) 共用同一份名单:
 * - 已安装 blackList: 读写它的 `up` / `upRegex`, 在它的设置面板里也能看到和删除
 * - 未安装: 退回到本组件自己的 `fallbackBlockedUps`
 * 只修改本地脚本设置, 不调用 B 站账号的拉黑接口.
 */
const blackListDataKey = 'blackList.data'

interface BlackListOptions {
  up: string[]
  upRegex: string[]
}
const getBlackListOptions = (): BlackListOptions | undefined =>
  settings.userComponents.blackList?.settings?.options as unknown as BlackListOptions | undefined

/** blackList 在原版首页运行时会把名单注册成 plugin data, 一并同步 */
const syncBlackListData = (options: BlackListOptions) => {
  const [data] = getData(blackListDataKey) as [BlackListOptions | undefined]
  if (data && Array.isArray(data.up)) {
    data.up = [...options.up]
  }
}

const regexCache = new Map<string, RegExp | null>()
const toRegex = (pattern: string) => {
  if (!regexCache.has(pattern)) {
    try {
      regexCache.set(pattern, new RegExp(pattern))
    } catch {
      regexCache.set(pattern, null)
    }
  }
  return regexCache.get(pattern)
}

export const usesSharedBlackList = () => Boolean(getBlackListOptions())

export const isUpBlocked = (name: string) => {
  if (!name) {
    return false
  }
  const options = getBlackListOptions()
  if (!options) {
    return (freshHomeOptions.fallbackBlockedUps ?? []).includes(name)
  }
  return (
    (options.up ?? []).includes(name) ||
    (options.upRegex ?? []).some(pattern => toRegex(pattern)?.test(name))
  )
}

export const filterBlockedUps = <T extends { upName: string }>(items: T[]) =>
  items.filter(it => !isUpBlocked(it.upName))

export const blockUp = (name: string) => {
  const options = getBlackListOptions()
  if (options) {
    options.up = lodash.uniq([...(options.up ?? []), name])
    syncBlackListData(options)
    return
  }
  freshHomeOptions.fallbackBlockedUps = lodash.uniq([
    ...(freshHomeOptions.fallbackBlockedUps ?? []),
    name,
  ])
}

export const unblockUp = (name: string) => {
  const options = getBlackListOptions()
  if (options) {
    options.up = (options.up ?? []).filter(it => it !== name)
    syncBlackListData(options)
    return
  }
  freshHomeOptions.fallbackBlockedUps = (freshHomeOptions.fallbackBlockedUps ?? []).filter(
    it => it !== name,
  )
}
