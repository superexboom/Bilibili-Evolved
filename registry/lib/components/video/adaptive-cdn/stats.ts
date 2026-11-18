/**
 * 播放统计: 记录每次卡顿前后媒体数据有没有在到、页面主线程忙不忙、CPU 压力和解码方式,
 * 用来区分卡顿是节点断流、播放器重连、测速抢带宽还是 CPU 繁忙造成的.
 * 结果按视频 / 直播分别存进脚本存储, 换标签页或刷新后仍能读到最近的记录.
 */

export type StallCause = 'cdn-reload' | 'player-reload' | 'network' | 'cpu' | 'probe' | 'unknown'

export const causeLabels: Record<StallCause, string> = {
  'cdn-reload': '插件切换节点',
  'player-reload': '播放器重连',
  network: '网络断流',
  cpu: '页面繁忙',
  probe: '测速占用带宽',
  unknown: '原因不明',
}

export interface StallRecord {
  /** 卡顿开始时间 */
  at: number
  /** 卡顿时长 (毫秒) */
  duration: number
  /** 卡顿时正在送数据的节点 */
  host: string
  cause: StallCause
  /** 卡顿开始时已经多久没收到媒体数据 (毫秒) */
  noData: number
  /** 卡顿前 3 秒的媒体下载速率 (kbps) */
  kbpsBefore: number
  /** 之前一分钟的正常下载速率 (kbps) */
  kbpsNormal: number
  /** 卡顿期间收到的媒体数据 (KB) */
  kbDuring: number
  /** 卡顿开始前 2 秒的缓冲 (秒) */
  buffer: number
  /** 卡顿前 5 秒里占用主线程最多的脚本 */
  script: string
  /** 卡顿前 5 秒内主线程长任务总时长 (毫秒) */
  longTask: number
  pressure: string
  probing: boolean
}

interface HostTotals {
  /** 正常播放时长 (毫秒) */
  watch: number
  stalls: number
  stallMs: number
  network: number
  at: number
}

interface SessionSummary {
  id: string
  page: string
  start: number
  last: number
  watch: number
  stalls: number
  stallMs: number
  causes: Partial<Record<StallCause, number>>
  errors: number
  reloads: { cdn: number; player: number }
  frames: number
  dropped: number
  video: string
  decoder: string
}

interface StoredStats {
  sessions: SessionSummary[]
  stalls: (StallRecord & { session: string })[]
  hosts: Record<string, HostTotals>
}

interface Storage {
  GM_getValue: (key: string, defaultValue: unknown) => any
  GM_setValue: (key: string, value: unknown) => void
}

interface DecoderInfo {
  label: string
  hardware: boolean
  smooth: boolean
  supported: boolean
}

const STALL_MIN = 300
const RELOAD_WINDOW = 10000
const BYTE_WINDOW = 180
const KEEP_STALLS = 300
const KEEP_SESSIONS = 40
const KEEP_HOST_DAYS = 14

const pressureLabels: Record<string, string> = {
  nominal: '正常',
  fair: '一般',
  serious: '偏高',
  critical: '严重',
}

const codecLabel = (codec: string) => {
  if (/^avc|^avc1/i.test(codec)) {
    return 'AVC'
  }
  if (/^hevc|^hev1|^hvc1/i.test(codec)) {
    return 'HEVC'
  }
  if (/^av1|^av01/i.test(codec)) {
    return 'AV1'
  }
  return codec.toUpperCase()
}
/** 直播接口只给出 avc / hevc / av1, 查询解码能力时需要完整的 codecs 字符串 */
const fullCodec = (codec: string) => {
  if (codec.includes('.')) {
    return codec
  }
  return { AVC: 'avc1.640032', HEVC: 'hvc1.1.6.L153.90', AV1: 'av01.0.09M.08' }[codecLabel(codec)]
}
const clock = (time: number) => new Date(time).toLocaleTimeString()
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} 秒`

export function createPlaybackStats({
  W,
  kind,
  name,
  storage,
}: {
  W: Window & typeof globalThis
  kind: 'live' | 'video'
  name: string
  storage: Storage
}) {
  const storageKey = `${name}.stats.${kind}`
  const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const session: SessionSummary = {
    id: sessionId,
    page: W.location.origin + W.location.pathname,
    start: Date.now(),
    last: Date.now(),
    watch: 0,
    stalls: 0,
    stallMs: 0,
    causes: {},
    errors: 0,
    reloads: { cdn: 0, player: 0 },
    frames: 0,
    dropped: 0,
    video: '',
    decoder: '',
  }
  const stalls: StallRecord[] = []
  const errors: { at: number; code: number; message: string }[] = []
  const reloads: { at: number; by: 'cdn' | 'player'; reason: string }[] = []
  const hostSession: Record<string, HostTotals> = {}
  const hostPending: Record<string, HostTotals> = {}
  /** 每秒收到的媒体字节数, 键是秒级时间戳 */
  const bytes = new Map<number, number>()
  const longTasks: { at: number; duration: number; script: string }[] = []
  const bufferHistory: { at: number; buffer: number }[] = []
  const cleanups: (() => void)[] = []
  let persistedStalls = 0
  let lastChunkAt = 0
  let activeHost = ''
  let activeAt = 0
  let codec = ''
  let probing = 0
  let probeEndAt = 0
  let pressure = ''
  let open: { at: number; noData: number; host: string; buffer: number; probing: boolean } | null =
    null
  let lastWaitAt = 0
  let lastSeekAt = 0
  let hasPlayed = false
  let video: HTMLVideoElement | null = null
  let lastSrc = ''
  let lastTick = 0
  let lastTime = 0
  let lastFrames: { at: number; frames: number } | null = null
  let baseFrames: { frames: number; dropped: number } | null = null
  let fps = 0
  let resolution = ''
  let storedHosts = { at: 0, hosts: {} as Record<string, HostTotals> }
  let decoder: DecoderInfo | null = null
  let decoderKey = ''
  let dirty = false
  let lastPersist = 0

  const totals = (table: Record<string, HostTotals>, host: string) => {
    table[host] ??= { watch: 0, stalls: 0, stallMs: 0, network: 0, at: Date.now() }
    table[host].at = Date.now()
    return table[host]
  }
  const addHost = (host: string, change: Partial<HostTotals>) => {
    if (!host) {
      return
    }
    for (const table of [hostSession, hostPending]) {
      const target = totals(table, host)
      target.watch += change.watch ?? 0
      target.stalls += change.stalls ?? 0
      target.stallMs += change.stallMs ?? 0
      target.network += change.network ?? 0
    }
  }
  const bytesBetween = (from: number, to: number) => {
    let sum = 0
    for (let second = Math.floor(from / 1000); second < Math.ceil(to / 1000); second++) {
      sum += bytes.get(second) ?? 0
    }
    return sum
  }
  const kbps = (from: number, to: number) =>
    Math.round((bytesBetween(from, to) * 8) / Math.max(1, to - from))
  /** 之前一分钟里每秒下载量的中位数, 作为"正常速率" */
  const normalKbps = (before: number) => {
    const values: number[] = []
    for (
      let second = Math.floor((before - 60000) / 1000);
      second < Math.floor(before / 1000);
      second++
    ) {
      if (bytes.has(second)) {
        values.push(bytes.get(second) ?? 0)
      }
    }
    if (values.length < 10) {
      return 0
    }
    values.sort((a, b) => a - b)
    return Math.round((values[Math.floor(values.length / 2)] * 8) / 1000)
  }
  const longTaskWithin = (from: number, to: number) =>
    Math.round(
      longTasks
        .filter(task => task.at + task.duration > from && task.at < to)
        .reduce((sum, task) => sum + task.duration, 0),
    )
  /** 一段时间里占用主线程最多的脚本 */
  const busiestScript = (from: number, to: number) => {
    const byScript: Record<string, number> = {}
    for (const task of longTasks) {
      if (task.script && task.at + task.duration > from && task.at < to) {
        byScript[task.script] = (byScript[task.script] ?? 0) + task.duration
      }
    }
    return Object.entries(byScript).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }
  const lastReload = () => reloads.at(-1)

  /** 由插件的 fetch / XHR 钩子在每块媒体数据到达时调用 */
  function noteBytes(count: number, host: string, mediaCodec?: string) {
    if (!(count > 0)) {
      return
    }
    const now = Date.now()
    const second = Math.floor(now / 1000)
    bytes.set(second, (bytes.get(second) ?? 0) + count)
    if (bytes.size > BYTE_WINDOW) {
      for (const key of bytes.keys()) {
        if (key < second - BYTE_WINDOW) {
          bytes.delete(key)
        }
      }
    }
    lastChunkAt = now
    if (host) {
      activeHost = host
      activeAt = now
    }
    if (mediaCodec) {
      codec = mediaCodec
    }
  }
  function probeStart() {
    probing++
  }
  function probeEnd() {
    probing = Math.max(0, probing - 1)
    probeEndAt = Date.now()
  }
  function noteReload(by: 'cdn' | 'player', reason: string) {
    const previous = lastReload()
    // 插件触发的重载紧接着会让播放器换源, 不要再记一次播放器重连
    if (by === 'player' && previous?.by === 'cdn' && Date.now() - previous.at < 5000) {
      return
    }
    reloads.push({ at: Date.now(), by, reason })
    if (reloads.length > 50) {
      reloads.shift()
    }
    session.reloads[by]++
    dirty = true
  }

  function classify(
    start: number,
    noData: number,
    kbpsBefore: number,
    kbpsNormal: number,
    probeActive: boolean,
  ): StallCause {
    const reload = lastReload()
    if (reload && start - reload.at < RELOAD_WINDOW) {
      return reload.by === 'cdn' ? 'cdn-reload' : 'player-reload'
    }
    // 媒体数据也是在主线程上交给脚本的: 主线程被长任务占住时, 数据其实已经到了只是排在队列里,
    // 看起来像"没收到数据". 这段时间里主线程有一半以上被占着, 就算作页面繁忙而不是断流.
    const blocked = longTaskWithin(start - Math.max(noData, 1000) - 1000, start)
    if (blocked >= 250 && blocked >= noData * 0.5) {
      return 'cpu'
    }
    // 直播是一条持续的流, 数据停了或者明显变慢就是断流; 点播分片之间本来就有空档, 只看长时间没数据
    const starving =
      kind === 'live'
        ? noData >= 500 || (kbpsNormal > 0 && kbpsBefore < kbpsNormal * 0.6)
        : noData >= 1500
    if (starving) {
      return 'network'
    }
    if (
      longTaskWithin(start - 5000, start) >= 250 ||
      pressure === 'serious' ||
      pressure === 'critical'
    ) {
      return 'cpu'
    }
    if (probeActive) {
      return 'probe'
    }
    return 'unknown'
  }

  function openStall() {
    // 页面打开时的起播缓冲不算卡顿; 播放过之后播放器重载造成的停顿仍然记 (原因会归到重载上)
    if (open || W.document.hidden || !hasPlayed) {
      return
    }
    const now = Date.now()
    const before = bufferHistory.find(item => now - item.at <= 2500)
    open = {
      at: now,
      noData: lastChunkAt ? now - lastChunkAt : 0,
      host: activeHost,
      buffer: before?.buffer ?? 0,
      probing: probing > 0 || now - probeEndAt < 3000,
    }
  }
  function closeStall() {
    if (!open) {
      return
    }
    const { at, noData, host, buffer } = open
    const probeActive = open.probing
    open = null
    const duration = Date.now() - at
    if (duration < STALL_MIN) {
      return
    }
    const kbpsBefore = kbps(at - 3000, at)
    const kbpsNormal = normalKbps(at - 5000)
    const record: StallRecord = {
      at,
      duration,
      host,
      cause: classify(at, noData, kbpsBefore, kbpsNormal, probeActive),
      noData,
      kbpsBefore,
      kbpsNormal,
      kbDuring: Math.round(bytesBetween(at, at + duration) / 1024),
      buffer: Number(buffer.toFixed(2)),
      longTask: longTaskWithin(at - 5000, at),
      script: busiestScript(at - 5000, at),
      pressure,
      probing: probeActive,
    }
    stalls.push(record)
    if (stalls.length > 200) {
      stalls.shift()
      persistedStalls = Math.max(0, persistedStalls - 1)
    }
    session.stalls++
    session.stallMs += duration
    session.causes[record.cause] = (session.causes[record.cause] ?? 0) + 1
    addHost(host, { stalls: 1, stallMs: duration, network: record.cause === 'network' ? 1 : 0 })
    dirty = true
  }

  function attach(element: HTMLVideoElement) {
    if (video === element) {
      return
    }
    if (video) {
      noteReload('player', '播放器换了新的 video 元素')
    }
    video = element
    lastSrc = element.currentSrc
    const listeners: [string, () => void][] = [
      [
        'waiting',
        () => {
          lastWaitAt = Date.now()
          // 拖动进度条后的缓冲是正常的, 不算卡顿
          if (!element.seeking && Date.now() - lastSeekAt > 1500) {
            openStall()
          }
        },
      ],
      [
        'seeking',
        () => {
          lastSeekAt = Date.now()
          open = null
        },
      ],
      [
        'seeked',
        () => {
          lastSeekAt = Date.now()
        },
      ],
      [
        'playing',
        () => {
          closeStall()
          hasPlayed = true
        },
      ],
      [
        'pause',
        () => {
          // 直播播放器在缓冲耗尽时会自己暂停, 这种暂停算在卡顿里; 用户手动暂停则结束统计
          if (Date.now() - lastWaitAt > 1600) {
            closeStall()
          }
        },
      ],
      [
        'error',
        () => {
          const { error } = element
          errors.push({ at: Date.now(), code: error?.code ?? 0, message: error?.message ?? '' })
          if (errors.length > 50) {
            errors.shift()
          }
          session.errors++
          dirty = true
        },
      ],
    ]
    for (const [type, listener] of listeners) {
      element.addEventListener(type, listener)
      cleanups.push(() => element.removeEventListener(type, listener))
    }
  }

  function read(): StoredStats {
    try {
      const stored = storage.GM_getValue(storageKey, null)
      if (stored && Array.isArray(stored.sessions) && Array.isArray(stored.stalls)) {
        return { hosts: {}, ...stored }
      }
    } catch {
      // 存储不可用时只保留本页统计
    }
    return { sessions: [], stalls: [], hosts: {} }
  }
  function persist() {
    lastPersist = Date.now()
    if (!dirty && session.watch === 0) {
      return
    }
    const stored = read()
    stored.sessions = [...stored.sessions.filter(item => item.id !== sessionId), { ...session }]
      .sort((a, b) => a.start - b.start)
      .slice(-KEEP_SESSIONS)
    stored.stalls = [
      ...stored.stalls,
      ...stalls.slice(persistedStalls).map(stall => ({ ...stall, session: sessionId })),
    ].slice(-KEEP_STALLS)
    persistedStalls = stalls.length
    const expire = Date.now() - KEEP_HOST_DAYS * 86400000
    for (const [host, change] of Object.entries(hostPending)) {
      const target = stored.hosts[host] ?? { watch: 0, stalls: 0, stallMs: 0, network: 0, at: 0 }
      target.watch += change.watch
      target.stalls += change.stalls
      target.stallMs += change.stallMs
      target.network += change.network
      target.at = change.at
      stored.hosts[host] = target
      delete hostPending[host]
    }
    for (const [host, value] of Object.entries(stored.hosts)) {
      if (value.at < expire) {
        delete stored.hosts[host]
      }
    }
    storage.GM_setValue(storageKey, stored)
    dirty = false
  }

  async function detectDecoder(width: number, height: number) {
    const full = codec && fullCodec(codec)
    const key = `${full}|${width}x${height}|${Math.round(fps / 10)}`
    if (!full || !width || key === decoderKey || !W.navigator.mediaCapabilities) {
      return
    }
    decoderKey = key
    try {
      const result = await W.navigator.mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: {
          contentType: `video/mp4; codecs="${full}"`,
          width,
          height,
          bitrate: 8_000_000,
          framerate: Math.max(24, Math.round(fps) || 30),
        },
      })
      decoder = {
        label: codecLabel(codec),
        hardware: result.powerEfficient,
        smooth: result.smooth,
        supported: result.supported,
      }
      session.decoder = `${decoder.label} ${decoder.hardware ? '显卡解码' : 'CPU 软解'}`
    } catch {
      decoder = null
    }
  }

  /** 每秒由插件的采样调用一次 */
  function tick(element: HTMLVideoElement, buffer: number) {
    const now = Date.now()
    attach(element)
    if (element.currentSrc && lastSrc && element.currentSrc !== lastSrc) {
      noteReload('player', '播放器重新加载了媒体源')
    }
    lastSrc = element.currentSrc || lastSrc
    bufferHistory.push({ at: now, buffer })
    while (bufferHistory.length > 5) {
      bufferHistory.shift()
    }
    const dt = lastTick ? Math.min(5000, now - lastTick) : 0
    lastTick = now
    const advanced = element.currentTime - lastTime
    lastTime = element.currentTime
    const playing = !element.paused && element.readyState >= 3 && !W.document.hidden
    // 插件可能在视频已经开始播放后才启动, 这时收不到第一次 playing 事件
    if (playing && advanced > 0.1) {
      hasPlayed = true
    }
    const host = activeHost && now - activeAt < 15000 ? activeHost : ''
    if (playing && !open) {
      session.watch += dt
      addHost(host, { watch: dt })
    }
    // 有些卡顿不会触发 waiting 事件, 这里按画面不动、缓冲见底补记
    if (
      !open &&
      !element.paused &&
      !element.seeking &&
      now - lastSeekAt > 1500 &&
      advanced < 0.05 &&
      buffer < 0.3 &&
      element.readyState < 3
    ) {
      openStall()
    } else if (open && !element.paused && advanced > 0.15 && element.readyState >= 3) {
      closeStall()
    }
    const quality = element.getVideoPlaybackQuality?.()
    if (quality) {
      baseFrames ??= { frames: quality.totalVideoFrames, dropped: quality.droppedVideoFrames }
      session.frames = quality.totalVideoFrames - baseFrames.frames
      session.dropped = quality.droppedVideoFrames - baseFrames.dropped
      if (session.frames < 0) {
        // 换了 video 元素, 帧数重新计
        baseFrames = { frames: quality.totalVideoFrames, dropped: quality.droppedVideoFrames }
      }
      if (lastFrames && playing && now > lastFrames.at) {
        const current =
          ((quality.totalVideoFrames - lastFrames.frames) * 1000) / (now - lastFrames.at)
        if (current >= 0 && current < 300) {
          fps = fps ? fps * 0.8 + current * 0.2 : current
        }
      }
      lastFrames = { at: now, frames: quality.totalVideoFrames }
    }
    if (element.videoWidth) {
      resolution = `${element.videoWidth}×${element.videoHeight}`
      session.video = `${codec ? `${codecLabel(codec)} ` : ''}${resolution}`
      detectDecoder(element.videoWidth, element.videoHeight)
    }
    session.last = now
    if (now - lastPersist > (dirty ? 10000 : 60000)) {
      persist()
    }
  }

  function ongoing() {
    if (!open) {
      return null
    }
    const now = Date.now()
    return { elapsed: now - open.at, noData: lastChunkAt ? now - lastChunkAt : 0 }
  }
  /** since 之后结束的、由网络断流造成的卡顿次数 */
  function networkStallsSince(since: number) {
    return stalls.filter(stall => stall.at >= since && stall.cause === 'network').length
  }

  function stallReason(stall: StallRecord) {
    if (stall.cause === 'network') {
      return stall.noData >= 500
        ? `${seconds(stall.noData)}没收到数据`
        : `下载降到 ${stall.kbpsBefore} kbps`
    }
    if (stall.cause === 'cpu') {
      const cpu = stall.pressure ? ` · CPU ${pressureLabels[stall.pressure] ?? stall.pressure}` : ''
      return `主线程阻塞 ${stall.longTask} ms${stall.script ? `, 主要是${stall.script}` : ''}${cpu}`
    }
    return ''
  }
  function describeStall(stall: StallRecord) {
    const reason = stallReason(stall)
    return `${clock(stall.at)} · ${seconds(stall.duration)} · ${causeLabels[stall.cause]}${
      reason ? ` (${reason})` : ''
    }${stall.host ? ` · ${stall.host}` : ''}`
  }

  /** 给面板显示的几行统计 */
  function view() {
    const now = Date.now()
    const minutes = Math.max(1, Math.round(session.watch / 60000))
    const dropped = session.frames > 0 ? (session.dropped / session.frames) * 100 : 0
    let decode = codec ? codecLabel(codec) : '等待播放'
    if (decoder) {
      decode = `${decoder.label} · ${decoder.hardware ? '显卡解码' : 'CPU 软解'}${
        decoder.smooth ? '' : ' (不流畅)'
      }`
    }
    const causes = Object.entries(session.causes)
      .sort((a, b) => b[1] - a[1])
      .map(([cause, count]) => `${causeLabels[cause as StallCause]} ${count}`)
      .join(' · ')
    const longTaskPerMinute = longTaskWithin(now - 60000, now)
    const busiest = longTaskPerMinute >= 1000 ? busiestScript(now - 60000, now) : ''
    // 面板打开时每秒都会刷新, 历史统计不必每次都从存储里读
    if (now - storedHosts.at > 10000) {
      storedHosts = { at: now, hosts: read().hosts }
    }
    const hosts = Object.entries(storedHosts.hosts)
      .map(([host, value]) => {
        const pending = hostPending[host]
        const watch = value.watch + (pending?.watch ?? 0)
        const count = value.stalls + (pending?.stalls ?? 0)
        return { host, watch, count }
      })
      .filter(item => item.watch >= 60000)
      .sort((a, b) => b.watch - a.watch)
      .slice(0, 5)
      .map(
        ({ host, watch, count }) =>
          `${host} · 看了 ${Math.round(watch / 60000)} 分钟 · 每小时卡 ${(
            count /
            (watch / 3600000)
          ).toFixed(1)} 次`,
      )
    return {
      decode: `${decode}${resolution ? ` · ${resolution}` : ''}${
        fps ? ` · ${fps.toFixed(1)} fps` : ''
      } · 掉帧 ${dropped.toFixed(2)}%`,
      // 浏览器只在标签页处于前台时报告 CPU 压力
      load: `${
        pressure ? `CPU 压力 ${pressureLabels[pressure] ?? pressure} · ` : ''
      }主线程长任务 ${longTaskPerMinute} ms/分钟${
        busiest ? ` (主要是${busiest})` : ''
      } · 下载 ${kbps(now - 5000, now)} kbps`,
      summary: session.stalls
        ? `本页看了 ${minutes} 分钟, 卡顿 ${session.stalls} 次共 ${seconds(session.stallMs)}${
            causes ? ` (${causes})` : ''
          }`
        : `本页看了 ${minutes} 分钟, 没有卡顿`,
      recent: stalls.slice(-5).reverse().map(describeStall),
      hosts,
      reloads: reloads
        .slice(-3)
        .reverse()
        .map(
          item => `${clock(item.at)} ${item.by === 'cdn' ? '插件' : '播放器'}重载: ${item.reason}`,
        ),
      errors: errors
        .slice(-3)
        .reverse()
        .map(
          item =>
            `${clock(item.at)} 媒体错误 ${item.code}${item.message ? `: ${item.message}` : ''}`,
        ),
    }
  }

  /** 导出诊断用的完整数据 */
  function summary() {
    const now = Date.now()
    return {
      session: { ...session },
      decoder,
      fps: Number(fps.toFixed(1)),
      pressure,
      longTaskPerMinute: longTaskWithin(now - 60000, now),
      busiestScript: busiestScript(now - 60000, now),
      network: {
        kbps5s: kbps(now - 5000, now),
        noData: lastChunkAt ? now - lastChunkAt : null,
        activeHost,
      },
      stalls: stalls.slice(-50),
      reloads: [...reloads],
      errors: [...errors],
      hosts: hostSession,
    }
  }

  /** 长动画帧里耗时最多的脚本, 换成看得懂的说法 */
  const scriptLabel = (entry: any) => {
    const top = [...(entry.scripts ?? [])].sort((a, b) => b.duration - a.duration)[0]
    if (!top) {
      return ''
    }
    const source = String(top.sourceURL ?? '')
    const invoker = String(top.invoker ?? '')
    if (/^chrome-extension:|userscript\.html/.test(source)) {
      return '油猴脚本 (含 Bilibili Evolved)'
    }
    let file = source
    try {
      file = new URL(source).pathname.split('/').pop() ?? source
    } catch {
      // sourceURL 为空或不是完整地址
    }
    if (kind === 'live' && /room-player/.test(file) && /WebSocket/.test(invoker)) {
      return '直播间弹幕 / 礼物消息处理'
    }
    // invoker 有时就是一个地址, 对判断没有帮助
    return `${file || '页面脚本'}${/:\/\//.test(invoker) ? '' : ` ${invoker}`}`.trim().slice(0, 80)
  }
  try {
    // 长动画帧 (long-animation-frame) 能说清是哪个脚本占住了主线程; 旧浏览器退回 longtask
    const type = W.PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
      ? 'long-animation-frame'
      : 'longtask'
    const observer = new W.PerformanceObserver(list => {
      const origin = W.performance.timeOrigin
      for (const entry of list.getEntries()) {
        longTasks.push({
          at: origin + entry.startTime,
          duration: entry.duration,
          script: type === 'long-animation-frame' ? scriptLabel(entry) : '',
        })
      }
      const expire = Date.now() - 120000
      while (longTasks.length && longTasks[0].at < expire) {
        longTasks.shift()
      }
    })
    observer.observe({ type, buffered: true })
    cleanups.push(() => observer.disconnect())
  } catch {
    // 不支持时只是少一项统计
  }
  const { PressureObserver } = W as any
  if (PressureObserver) {
    try {
      const observer = new PressureObserver((records: { state: string }[]) => {
        pressure = records.at(-1)?.state ?? pressure
      })
      observer.observe('cpu', { sampleInterval: 2000 }).catch(() => undefined)
      cleanups.push(() => observer.disconnect())
    } catch {
      // Compute Pressure API 不可用
    }
  }
  const onHide = () => persist()
  W.addEventListener('pagehide', onHide)
  cleanups.push(() => W.removeEventListener('pagehide', onHide))

  return {
    noteBytes,
    probeStart,
    probeEnd,
    noteReload,
    tick,
    ongoing,
    networkStallsSince,
    activeHost: () => (activeHost && Date.now() - activeAt < 15000 ? activeHost : ''),
    view,
    summary,
    history: read,
    persist,
    stop() {
      closeStall()
      persist()
      for (const cleanup of cleanups) {
        cleanup()
      }
      cleanups.length = 0
    },
  }
}

export type PlaybackStats = ReturnType<typeof createPlaybackStats>
