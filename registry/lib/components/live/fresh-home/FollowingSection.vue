<template>
  <section class="lfh-section lfh-following">
    <header class="lfh-section-header">
      <div class="lfh-section-heading">
        <h2 class="lfh-section-title">关注的直播</h2>
        <span v-if="loaded" class="lfh-section-meta">
          <template v-if="rooms.length">
            <span class="lfh-live-count">{{ rooms.length }}</span> 人正在直播
          </template>
          <template v-else>暂无</template>
        </span>
      </div>
      <div class="lfh-section-actions">
        <div class="lfh-segmented" role="group" aria-label="布局">
          <button
            v-for="layout of layouts"
            :key="layout"
            class="lfh-segmented-item"
            :class="{ selected: layout === currentLayout }"
            :title="`每行 ${parse(layout).columns} 个, 最多 ${parse(layout).rows} 行`"
            @click="setLayout(layout)"
          >
            {{ layout }}
          </button>
        </div>
        <button class="lfh-button is-icon" title="刷新" :disabled="loading" @click="load">
          <VIcon
            icon="mdi-refresh"
            :size="18"
            :class="loading ? 'lfh-spinning' : 'lfh-spin-on-hover'"
          />
        </button>
        <a
          class="lfh-button"
          href="https://link.bilibili.com/p/center/index#/user-center/follow/1"
          target="_blank"
        >
          <VIcon icon="mdi-heart-outline" :size="16" />
          全部关注
        </a>
      </div>
    </header>

    <div v-if="!loaded && loading" class="lfh-grid is-fixed" :style="gridStyle">
      <LiveSkeleton v-for="i of columns" :key="i" :index="i" />
    </div>
    <div v-else-if="error && !rooms.length" class="lfh-placeholder">
      <span>{{ error }}</span>
      <button class="lfh-button" @click="load">重试</button>
    </div>
    <div v-else-if="!rooms.length" class="lfh-placeholder is-compact">
      <VIcon icon="mdi-sleep" :size="20" />
      <span>{{ loggedIn ? '关注的主播都还没开播' : '登录后可以在这里看到关注的主播' }}</span>
    </div>
    <div v-else class="lfh-grid is-fixed" :style="gridStyle">
      <LiveCard
        v-for="(room, index) of visibleRooms"
        :key="room.roomId"
        :room="room"
        :index="index"
        following
      />
    </div>

    <footer v-if="rooms.length > capacity" class="lfh-section-footer">
      <button class="lfh-button is-wide" @click="expanded = !expanded">
        <VIcon :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" :size="18" />
        {{ expanded ? '收起' : `展开全部 ${rooms.length} 位主播` }}
      </button>
    </footer>
  </section>
</template>
<script lang="ts">
import { VIcon } from '@/ui'
import { getUID } from '@/core/utils'
import { getFollowingLive, LiveRoom } from './api'
import { liveOptions, liveStore } from './options'
import { FollowLayout, parseFollowLayout } from './types'
import LiveCard from './LiveCard.vue'
import LiveSkeleton from './LiveSkeleton.vue'

/** 页面重新可见时, 距上次刷新超过这个时间就自动刷新 */
const staleTime = 3 * 60 * 1000

export default Vue.extend({
  components: { VIcon, LiveCard, LiveSkeleton },
  data() {
    return {
      rooms: [] as LiveRoom[],
      loading: false,
      loaded: false,
      error: '',
      expanded: false,
      lastLoad: 0,
      layouts: Object.values(FollowLayout),
      loggedIn: Boolean(getUID()),
    }
  },
  computed: {
    currentLayout(): string {
      return liveStore.followLayout
    },
    columns(): number {
      return parseFollowLayout(this.currentLayout).columns
    },
    capacity(): number {
      const { columns, rows } = parseFollowLayout(this.currentLayout)
      return columns * rows
    },
    visibleRooms(): LiveRoom[] {
      return this.expanded ? this.rooms : this.rooms.slice(0, this.capacity)
    },
    gridStyle(): Record<string, string> {
      return { '--lfh-columns': String(this.columns) }
    },
  },
  created() {
    this.load()
  },
  mounted() {
    this.onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastLoad > staleTime) {
        this.load()
      }
    }
    document.addEventListener('visibilitychange', this.onVisible)
  },
  beforeDestroy() {
    document.removeEventListener('visibilitychange', this.onVisible)
  },
  methods: {
    parse: parseFollowLayout,
    setLayout(layout: string) {
      liveStore.followLayout = layout
      liveOptions.followLayout = layout as FollowLayout
    },
    async load() {
      if (this.loading) {
        return
      }
      this.loading = true
      this.error = ''
      try {
        // 开播久的排后面, 刚开播的排前面
        const rooms = await getFollowingLive()
        this.rooms = lodash.orderBy(rooms, [r => r.liveStart ?? 0], ['desc'])
        this.loaded = true
        this.lastLoad = Date.now()
      } catch (error) {
        console.error(error)
        this.error = (error as Error).message || '加载失败'
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
  },
})
</script>
