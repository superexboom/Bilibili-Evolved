const day = 24 * 60 * 60 * 1000
const startOfDay = (time: number) => {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 卡片上的相对时间: 刚刚 / 5分钟前 / 3小时前 / 昨天 / 4天前 / 11-02 / 2024-11-02 */
export const relativeTime = (timestamp: number, now = Date.now()) => {
  if (!timestamp) {
    return ''
  }
  const diff = now - timestamp
  if (diff < 60 * 1000) {
    return '刚刚'
  }
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / 60000)}分钟前`
  }
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / day)
  if (days === 0) {
    return `${Math.floor(diff / 3600000)}小时前`
  }
  if (days === 1) {
    return '昨天'
  }
  if (days < 7) {
    return `${days}天前`
  }
  const date = new Date(timestamp)
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(
    2,
    '0',
  )}`
  return date.getFullYear() === new Date(now).getFullYear() ? md : `${date.getFullYear()}-${md}`
}

/** 动态时间线的分组标题: 今天 / 昨天 / 周三 / 11月2日 / 2024年11月2日 */
export const dayGroupLabel = (timestamp: number, now = Date.now()) => {
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / day)
  if (days <= 0) {
    return '今天'
  }
  if (days === 1) {
    return '昨天'
  }
  const date = new Date(timestamp)
  if (days < 7) {
    return weekdays[date.getDay()]
  }
  const md = `${date.getMonth() + 1}月${date.getDate()}日`
  return date.getFullYear() === new Date(now).getFullYear() ? md : `${date.getFullYear()}年${md}`
}
export const dayKey = (timestamp: number) => String(startOfDay(timestamp))

export const fullTime = (timestamp: number) => {
  if (!timestamp) {
    return ''
  }
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}
