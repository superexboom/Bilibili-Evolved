<template>
  <section class="lfh-section lfh-areas">
    <header class="lfh-section-header">
      <div class="lfh-section-heading">
        <h2 class="lfh-section-title">分区推荐</h2>
        <span v-if="parentId && total" class="lfh-section-meta">{{ total }} 个直播间</span>
      </div>
      <div class="lfh-section-actions">
        <div v-if="parentId" class="lfh-segmented" role="group" aria-label="排序">
          <button
            v-for="s of sorts"
            :key="s.value"
            class="lfh-segmented-item"
            :class="{ selected: s.value === sort }"
            @click="setSort(s.value)"
          >
            {{ s.label }}
          </button>
        </div>
        <button class="lfh-button is-icon" title="换一换" :disabled="loading" @click="reload">
          <VIcon
            icon="mdi-refresh"
            :size="18"
            :class="loading ? 'lfh-spinning' : 'lfh-spin-on-hover'"
          />
        </button>
      </div>
    </header>

    <!-- 父分区 -->
    <div ref="tabs" class="lfh-tabs" role="tablist">
      <button
        class="lfh-tab"
        :class="{ selected: parentId === 0 }"
        role="tab"
        @click="selectParent(0)"
      >
        总览
      </button>
      <button
        v-for="parent of tree"
        :key="parent.id"
        class="lfh-tab"
        :class="{ selected: parentId === parent.id }"
        role="tab"
        @click="selectParent(parent.id)"
      >
        {{ parent.name }}
      </button>
    </div>

    <!-- 子分区 -->
    <div v-if="parentId" class="lfh-chips">
      <button class="lfh-chip" :class="{ selected: areaId === 0 }" @click="selectArea(0)">
        全部
      </button>
      <button
        v-for="area of chipAreas"
        :key="area.id"
        class="lfh-chip"
        :class="{ selected: areaId === area.id }"
        @click="selectArea(area.id)"
      >
        <img v-if="area.pic" class="lfh-chip-icon" :src="area.pic" alt="" loading="lazy" />
        {{ area.name }}
      </button>
      <button
        v-if="currentParent && currentParent.areas.length > chipAreas.length"
        class="lfh-chip is-ghost"
        :class="{ selected: panelOpen }"
        @click="togglePanel"
      >
        <VIcon icon="mdi-dots-grid" :size="15" />
        全部 {{ currentParent.areas.length }} 个分区
      </button>
    </div>
    <transition name="lfh-panel">
      <div v-if="parentId && panelOpen && currentParent" class="lfh-area-panel">
        <div class="lfh-area-panel-search">
          <VIcon icon="search" :size="15" />
          <input
            ref="search"
            v-model="keyword"
            class="lfh-area-panel-input"
            placeholder="搜索分区"
            @keydown.esc="panelOpen = false"
          />
        </div>
        <div class="lfh-area-panel-list">
          <button
            v-for="area of panelAreas"
            :key="area.id"
            class="lfh-area-panel-item"
            :class="{ selected: areaId === area.id }"
            @click="selectArea(area.id, true)"
          >
            <img v-if="area.pic" :src="area.pic" alt="" loading="lazy" />
            <span>{{ area.name }}</span>
          </button>
          <div v-if="!panelAreas.length" class="lfh-end-note">没有找到相关分区</div>
        </div>
      </div>
    </transition>

    <!-- 总览: 旧版首页的分区模块, 每个模块一行 -->
    <template v-if="parentId === 0">
      <div v-if="loading && !modules.length" class="lfh-module">
        <div class="lfh-grid is-single-row">
          <LiveSkeleton v-for="i of 8" :key="i" :index="i" />
        </div>
      </div>
      <div v-else-if="error && !modules.length" class="lfh-placeholder">
        <span>{{ error }}</span>
        <button class="lfh-button" @click="reload">重试</button>
      </div>
      <div v-for="module of modules" :key="module.id" class="lfh-module">
        <div class="lfh-module-header">
          <img v-if="module.icon" class="lfh-module-icon" :src="module.icon" alt="" />
          <span class="lfh-module-title">{{ module.title }}</span>
          <button
            v-if="module.parentAreaId"
            class="lfh-module-more"
            @click="selectParent(module.parentAreaId, module.areaId)"
          >
            查看更多
            <VIcon icon="mdi-chevron-right" :size="16" />
          </button>
        </div>
        <div class="lfh-grid is-single-row">
          <LiveCard
            v-for="(room, index) of module.rooms"
            :key="room.roomId"
            :room="room"
            :index="index"
          />
        </div>
      </div>
    </template>

    <!-- 单个分区: 网格 + 加载更多 -->
    <template v-else>
      <div v-if="rooms.length === 0 && loading" class="lfh-grid">
        <LiveSkeleton v-for="i of 16" :key="i" :index="i" />
      </div>
      <div v-else-if="rooms.length === 0" class="lfh-placeholder">
        <span>{{ error || '这个分区现在没有人在直播' }}</span>
        <button v-if="error" class="lfh-button" @click="reload">重试</button>
      </div>
      <template v-else>
        <div class="lfh-grid">
          <LiveCard
            v-for="(room, index) of rooms"
            :key="room.roomId"
            :room="room"
            :index="index % 30"
          />
          <template v-if="loading">
            <LiveSkeleton v-for="i of 8" :key="`skeleton-${i}`" :index="i" />
          </template>
        </div>
        <footer class="lfh-section-footer">
          <span v-if="error" class="lfh-end-note">{{ error }}</span>
          <button v-if="hasMore" class="lfh-button is-wide" :disabled="loading" @click="loadMore">
            <span v-if="loading" class="lfh-spinner" />
            <VIcon v-else icon="mdi-chevron-down" :size="18" />
            {{ loading ? '加载中' : '加载更多' }}
          </button>
          <span v-else class="lfh-end-note">已经到底了</span>
        </footer>
      </template>
    </template>
  </section>
</template>
<script lang="ts">
import { VIcon } from '@/ui'
import { enableHorizontalScroll } from '@/core/horizontal-scroll'
import {
  AreaModule,
  areaPageSize,
  getAreaModules,
  getAreaRooms,
  getAreaTree,
  LiveRoom,
  ParentArea,
  SubArea,
} from './api'
import { liveOptions } from './options'
import { AreaSort } from './types'
import LiveCard from './LiveCard.vue'
import LiveSkeleton from './LiveSkeleton.vue'

/** 子分区快捷标签的数量上限, 其余放在 "全部分区" 面板里 */
const maxChips = 14

export default Vue.extend({
  components: { VIcon, LiveCard, LiveSkeleton },
  data() {
    return {
      tree: [] as ParentArea[],
      parentId: Number(liveOptions.areaParentId) || 0,
      areaId: Number(liveOptions.areaId) || 0,
      sort: (liveOptions.areaSort || 'online') as AreaSort,
      sorts: [
        { value: 'online' as AreaSort, label: '人气' },
        { value: 'live_time' as AreaSort, label: '最新开播' },
      ],
      modules: [] as AreaModule[],
      rooms: [] as LiveRoom[],
      page: 0,
      total: 0,
      hasMore: false,
      loading: false,
      error: '',
      requestId: 0,
      /** 当前父分区下出现过的子分区及直播间数量, 用来挑选快捷标签 */
      seenAreas: {} as Record<number, number>,
      panelOpen: false,
      keyword: '',
    }
  },
  computed: {
    currentParent(): ParentArea | undefined {
      return this.tree.find((p: ParentArea) => p.id === this.parentId)
    },
    chipAreas(): SubArea[] {
      const parent = this.currentParent as ParentArea | undefined
      if (!parent) {
        return []
      }
      const seen = this.seenAreas as Record<number, number>
      const popular = lodash
        .orderBy(
          parent.areas.filter(a => seen[a.id]),
          [a => seen[a.id]],
          ['desc'],
        )
        .slice(0, maxChips)
      // 选中的子分区不在快捷标签里时, 补在最前面
      const selected = parent.areas.find(a => a.id === this.areaId)
      if (selected && !popular.includes(selected)) {
        return [selected, ...popular.slice(0, maxChips - 1)]
      }
      return popular
    },
    panelAreas(): SubArea[] {
      const parent = this.currentParent as ParentArea | undefined
      if (!parent) {
        return []
      }
      const keyword = this.keyword.trim().toLowerCase()
      return keyword
        ? parent.areas.filter(a => a.name.toLowerCase().includes(keyword))
        : parent.areas
    },
  },
  async created() {
    getAreaTree()
      .then(tree => {
        this.tree = tree
        if (this.parentId && !tree.some(p => p.id === this.parentId)) {
          this.selectParent(0)
        }
      })
      .catch(error => console.error(error))
    this.reload()
  },
  mounted() {
    this.cancelTabScroll = enableHorizontalScroll(this.$refs.tabs as HTMLElement)
  },
  beforeDestroy() {
    this.cancelTabScroll?.()
  },
  methods: {
    persist() {
      liveOptions.areaParentId = this.parentId
      liveOptions.areaId = this.areaId
      liveOptions.areaSort = this.sort
    },
    selectParent(parentId: number, areaId = 0) {
      if (parentId === this.parentId && areaId === this.areaId) {
        return
      }
      if (parentId !== this.parentId) {
        this.seenAreas = {}
        this.panelOpen = false
        this.keyword = ''
      }
      this.parentId = parentId
      this.areaId = areaId
      this.persist()
      this.reload()
      // 从总览的 "查看更多" 进入时, 把版块滚到视野里
      this.$nextTick(() => {
        const el = this.$el as HTMLElement
        if (el.getBoundingClientRect().top < 0) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
    },
    selectArea(areaId: number, fromPanel = false) {
      if (fromPanel) {
        this.panelOpen = false
        this.keyword = ''
      }
      if (areaId === this.areaId) {
        return
      }
      this.areaId = areaId
      this.persist()
      this.reload()
    },
    setSort(sort: AreaSort) {
      if (sort === this.sort) {
        return
      }
      this.sort = sort
      this.persist()
      this.reload()
    },
    togglePanel() {
      this.panelOpen = !this.panelOpen
      if (this.panelOpen) {
        this.$nextTick(() => (this.$refs.search as HTMLInputElement | undefined)?.focus())
      }
    },
    reload() {
      this.requestId++
      this.rooms = []
      this.page = 0
      this.total = 0
      this.hasMore = false
      this.error = ''
      this.loading = false
      if (this.parentId === 0) {
        this.loadModules()
      } else {
        this.loadMore()
      }
    },
    async loadModules() {
      const { requestId } = this
      this.loading = true
      try {
        const modules = await getAreaModules()
        if (requestId === this.requestId) {
          this.modules = modules
        }
      } catch (error) {
        console.error(error)
        if (requestId === this.requestId) {
          this.error = (error as Error).message || '加载失败'
        }
      } finally {
        if (requestId === this.requestId) {
          this.loading = false
        }
      }
    },
    async loadMore() {
      if (this.loading) {
        return
      }
      const { requestId } = this
      this.loading = true
      this.error = ''
      try {
        const page = this.page + 1
        const result = await getAreaRooms(this.parentId, this.areaId, this.sort, page)
        if (requestId !== this.requestId) {
          return
        }
        const existing = new Set(this.rooms.map((r: LiveRoom) => r.roomId))
        const fresh = result.rooms.filter(r => !existing.has(r.roomId))
        this.rooms = [...this.rooms, ...fresh]
        this.page = page
        this.total = result.total
        this.hasMore = result.rooms.length >= areaPageSize && this.rooms.length < result.total
        if (this.areaId === 0) {
          const seen = { ...this.seenAreas }
          fresh.forEach(r => {
            seen[r.areaId] = (seen[r.areaId] ?? 0) + 1
          })
          this.seenAreas = seen
        }
      } catch (error) {
        console.error(error)
        if (requestId === this.requestId) {
          this.error = (error as Error).message || '加载失败'
        }
      } finally {
        if (requestId === this.requestId) {
          this.loading = false
        }
      }
    },
  },
})
</script>
