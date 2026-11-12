<template>
  <section class="fresh-home-feeds fhp-section">
    <header class="fhp-section-header">
      <div class="fhp-section-heading">
        <h2 class="fhp-section-title">动态</h2>
        <div class="fhp-segmented">
          <button
            v-for="t of tabs"
            :key="t.name"
            class="fhp-segmented-item"
            :class="{ selected: t.name === selectedTab }"
            @click="selectTab(t.name)"
          >
            {{ t.displayName }}
          </button>
        </div>
        <button
          v-if="newCount > 0"
          class="fhp-new-pill"
          title="全部标为已读"
          @click="markAllRead(true)"
        >
          <span class="fhp-new-pill-dot" />{{ newCount }} 条新视频
          <VIcon icon="mdi-check-all" :size="15" />
        </button>
      </div>
      <div class="fhp-section-actions">
        <a
          class="fhp-button icon"
          href="https://www.bilibili.com/video/online.html"
          target="_blank"
          title="在线列表"
        >
          <VIcon icon="mdi-account-group-outline" :size="18" />
        </a>
        <button class="fhp-button icon" title="刷新" :disabled="loading" @click="reload">
          <VIcon icon="mdi-refresh" :size="18" class="fhp-spin-on-hover" />
        </button>
        <a class="fhp-button" :href="currentTab.href" target="_blank">
          <VIcon icon="feeds" :size="17" />
          全部动态
        </a>
      </div>
    </header>

    <div v-if="selectedTab === 'video' && ups.length > 1" ref="upStrip" class="fhp-up-strip">
      <button class="fhp-up-chip" :class="{ selected: upFilter === null }" @click="upFilter = null">
        <span class="fhp-up-chip-all"><VIcon icon="mdi-view-grid-outline" :size="15" /></span>
        全部
      </button>
      <button
        v-for="up of ups"
        :key="up.id"
        class="fhp-up-chip"
        :class="{ selected: upFilter === up.id }"
        :title="`${up.name} · ${up.count} 个视频`"
        @click="upFilter = upFilter === up.id ? null : up.id"
      >
        <span class="fhp-up-chip-face">
          <DpiImage :src="up.face" :size="24" />
          <span v-if="up.hasNew" class="fhp-up-chip-dot" />
        </span>
        <span class="fhp-up-chip-name">{{ up.name }}</span>
      </button>
    </div>

    <template v-if="visibleCards.length === 0">
      <SkeletonGrid v-if="loading" :count="initialSkeletonCount" />
      <div v-else class="fhp-placeholder">
        <template v-if="error">
          <span>{{ error }}</span>
          <button class="fhp-button" @click="reload">重试</button>
        </template>
        <VEmpty v-else />
      </div>
    </template>
    <div v-else class="fhp-timeline">
      <div v-for="group of groups" :key="group.key" class="fhp-timeline-group">
        <div class="fhp-timeline-label">
          <span>{{ group.label }}</span>
          <span class="fhp-timeline-count">{{ group.cards.length }}</span>
        </div>
        <VideoGrid :cards="group.cards" />
      </div>
      <SkeletonGrid v-if="loading" class="fhp-append-skeleton" :count="pageSkeletonCount" />
    </div>

    <footer v-if="cards.length" ref="sentinel" class="fhp-section-footer">
      <span v-if="error" class="fhp-end-note">{{ error }}</span>
      <button v-if="hasMore" class="fhp-button wide" :disabled="loading" @click="loadMore">
        <span v-if="loading" class="fhp-spinner" />
        <VIcon v-else icon="mdi-chevron-down" :size="18" />
        {{ loading ? '加载中' : '加载更早的动态' }}
      </button>
      <span v-else class="fhp-end-note">没有更早的动态了</span>
    </footer>
  </section>
</template>
<script lang="ts">
import { DpiImage, VEmpty, VIcon } from '@/ui'
import { enableHorizontalScroll } from '@/core/horizontal-scroll'
import { freshHomeOptions } from '../../options'
import { getFeedsPage, isNewerId, maxId, PlusCard } from '../../api'
import { dayGroupLabel, dayKey } from '../../time'
import { plusStore, registerSection, unregisterSection } from '../../store'
import VideoGrid from '../../VideoGrid.vue'
import SkeletonGrid from '../../SkeletonGrid.vue'

type TabName = 'video' | 'bangumi'
const tabs = [
  { name: 'video' as TabName, displayName: '视频', href: 'https://t.bilibili.com/?tab=8' },
  { name: 'bangumi' as TabName, displayName: '番剧', href: 'https://t.bilibili.com/?tab=512' },
]
/** 筛选单个 UP 时, 自动向后翻页的上限, 避免无限请求 */
const maxAutoPagesWhileFiltering = 4
/** 动态版块在视口内停留多久算 "看过" */
const readDelay = 2000

export default Vue.extend({
  components: { DpiImage, VEmpty, VIcon, VideoGrid, SkeletonGrid },
  data() {
    return {
      tabs,
      selectedTab: 'video' as TabName,
      cards: [] as PlusCard[],
      offset: '',
      hasMore: true,
      loading: false,
      error: '',
      upFilter: null as number | null,
      /** 本次打开页面时的已读位置, 用来判断 NEW */
      readBaseline: freshHomeOptions.lastReadFeedId ?? '',
      autoPages: 0,
      requestId: 0,
    }
  },
  computed: {
    currentTab() {
      return tabs.find(t => t.name === this.selectedTab)
    },
    visibleCards(): PlusCard[] {
      if (this.upFilter === null) {
        return this.cards
      }
      return this.cards.filter((c: PlusCard) => c.upID === this.upFilter)
    },
    groups() {
      // 按日期归并 (而不是只合并相邻项), 接口偶尔返回乱序条目时也不会出现重复的分组 key
      const groups = new Map<string, { key: string; label: string; cards: PlusCard[] }>()
      this.visibleCards.forEach((card: PlusCard) => {
        const key = dayKey(card.timestamp)
        let group = groups.get(key)
        if (!group) {
          group = { key, label: dayGroupLabel(card.timestamp), cards: [] }
          groups.set(key, group)
        }
        group.cards.push(card)
      })
      return [...groups.values()].sort((a, b) => Number(b.key) - Number(a.key))
    },
    initialSkeletonCount(): number {
      return 16
    },
    pageSkeletonCount(): number {
      // 筛选单个 UP 时一页里命中的通常很少, 骨架屏少放一些
      return this.upFilter === null ? 12 : 4
    },
    ups() {
      const map = new Map<
        number,
        { id: number; name: string; face: string; count: number; hasNew: boolean }
      >()
      this.cards.forEach((card: PlusCard) => {
        if (!card.upID) {
          return
        }
        const up = map.get(card.upID) ?? {
          id: card.upID,
          name: card.upName,
          face: card.upFaceUrl,
          count: 0,
          hasNew: false,
        }
        up.count++
        up.hasNew = up.hasNew || Boolean(card.isNew)
        map.set(card.upID, up)
      })
      return [...map.values()]
    },
    newCount(): number {
      return this.cards.filter((c: PlusCard) => c.isNew).length
    },
  },
  watch: {
    newCount: {
      handler(count: number) {
        plusStore.feedsNewCount = count
      },
      immediate: true,
    },
    upFilter() {
      this.autoPages = 0
      this.$nextTick(() => this.checkSentinel())
    },
    ups() {
      this.$nextTick(() => this.setupUpStrip())
    },
  },
  created() {
    this.reload()
  },
  mounted() {
    registerSection({ name: 'feeds', title: '动态', element: this.$el as HTMLElement })
    this.sentinelObserver = new IntersectionObserver(
      records => {
        if (records.some(r => r.isIntersecting)) {
          this.autoLoad()
        }
      },
      { rootMargin: '0px 0px 600px 0px' },
    )
    this.readObserver = new IntersectionObserver(
      records => {
        const visible = records.some(r => r.isIntersecting)
        window.clearTimeout(this.readTimer)
        if (visible && freshHomeOptions.autoMarkFeedsRead) {
          this.readTimer = window.setTimeout(() => this.markAllRead(false), readDelay)
        }
      },
      { threshold: 0.15 },
    )
    this.readObserver.observe(this.$el)
  },
  updated() {
    const sentinel = this.$refs.sentinel as HTMLElement | undefined
    if (sentinel && sentinel !== this.observedSentinel) {
      this.sentinelObserver?.disconnect()
      this.sentinelObserver?.observe(sentinel)
      this.observedSentinel = sentinel
    }
  },
  beforeDestroy() {
    unregisterSection('feeds')
    this.sentinelObserver?.disconnect()
    this.readObserver?.disconnect()
    this.cancelStripScroll?.()
    window.clearTimeout(this.readTimer)
  },
  methods: {
    selectTab(name: TabName) {
      if (this.selectedTab === name) {
        return
      }
      this.selectedTab = name
      this.reload()
    },
    reload() {
      this.requestId++
      this.cards = []
      this.offset = ''
      this.hasMore = true
      this.upFilter = null
      this.error = ''
      this.loading = false
      this.loadMore()
    },
    async loadMore() {
      if (this.loading || !this.hasMore) {
        return
      }
      const { requestId } = this
      const type = this.selectedTab
      this.loading = true
      this.error = ''
      try {
        const page = await getFeedsPage(type, this.offset || undefined)
        if (requestId !== this.requestId) {
          return
        }
        const existing = new Set(this.cards.map((c: PlusCard) => c.id))
        const fresh = page.cards.filter(c => !existing.has(c.id))
        fresh.forEach((card, index) => {
          card.order = index
          card.isNew = type === 'video' && isNewerId(card.id, this.readBaseline)
        })
        this.cards = [...this.cards, ...fresh]
        this.offset = page.offset
        this.hasMore = page.hasMore && Boolean(page.offset)
        // 首次使用时没有已读位置, 直接以当前最新动态为起点
        if (type === 'video' && !freshHomeOptions.lastReadFeedId) {
          freshHomeOptions.lastReadFeedId = maxId(this.cards.map((c: PlusCard) => c.id))
        }
      } catch (error) {
        console.error(error)
        if (requestId === this.requestId) {
          this.error = (error as Error).message || '加载失败'
        }
      } finally {
        if (requestId === this.requestId) {
          this.loading = false
          this.$nextTick(() => this.checkSentinel())
        }
      }
    },
    autoLoad() {
      if (this.loading || !this.hasMore || this.error) {
        return
      }
      if (this.upFilter !== null) {
        if (this.autoPages >= maxAutoPagesWhileFiltering) {
          return
        }
        this.autoPages++
      }
      this.loadMore()
    },
    /** IntersectionObserver 只在状态变化时触发, 加载完成后若哨兵仍在视口附近就继续加载 */
    checkSentinel() {
      const sentinel = this.$refs.sentinel as HTMLElement | undefined
      if (!sentinel) {
        return
      }
      const { top } = sentinel.getBoundingClientRect()
      if (top < window.innerHeight + 600) {
        this.autoLoad()
      }
    },
    markAllRead(clearBadges: boolean) {
      if (this.selectedTab !== 'video') {
        return
      }
      const newest = maxId(this.cards.map((c: PlusCard) => c.id))
      if (newest && isNewerId(newest, freshHomeOptions.lastReadFeedId ?? '')) {
        freshHomeOptions.lastReadFeedId = newest
      }
      if (clearBadges) {
        const { lastReadFeedId } = freshHomeOptions
        this.readBaseline = lastReadFeedId
        this.cards.forEach((c: PlusCard) => {
          c.isNew = false
        })
      }
    },
    setupUpStrip() {
      const strip = this.$refs.upStrip as HTMLElement | undefined
      if (!strip || strip === this.scrollStrip) {
        return
      }
      this.cancelStripScroll?.()
      this.cancelStripScroll = enableHorizontalScroll(strip)
      this.scrollStrip = strip
    },
  },
})
</script>
