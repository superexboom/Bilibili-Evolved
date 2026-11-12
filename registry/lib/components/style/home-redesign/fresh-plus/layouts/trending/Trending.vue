<template>
  <section class="fresh-home-trending fhp-section">
    <header class="fhp-section-header">
      <div class="fhp-section-heading">
        <h2 class="fhp-section-title">{{ title }}</h2>
        <span v-if="cards.length" class="fhp-section-meta">
          {{ cards.length }} 个视频<template v-if="batchCount > 1"> · {{ batchCount }} 批</template>
        </span>
        <div class="fhp-segmented fhp-sort" role="group" aria-label="排序">
          <button
            v-for="s of sorts"
            :key="s.key"
            class="fhp-segmented-item"
            :class="{ selected: s.key === sortKey }"
            :title="s.key === sortKey && s.key !== 'default' ? '点击切换升序 / 降序' : s.title"
            @click="selectSort(s.key)"
          >
            {{ s.label }}
            <VIcon
              v-if="s.key === sortKey && s.key !== 'default'"
              class="fhp-sort-arrow"
              :class="{ ascending: !sortDescending }"
              icon="mdi-arrow-down"
              :size="13"
            />
          </button>
        </div>
      </div>
      <div class="fhp-section-actions">
        <button
          class="fhp-button icon"
          title="上一批"
          :disabled="history.length === 0 || loading"
          @click="previous"
        >
          <VIcon icon="mdi-undo-variant" :size="18" />
        </button>
        <button class="fhp-button primary" :disabled="loading" @click="refresh">
          <VIcon
            icon="mdi-refresh"
            :size="17"
            :class="loading && !appending ? 'fhp-spinning' : 'fhp-spin-on-hover'"
          />
          换一批
        </button>
      </div>
    </header>

    <template v-if="cards.length === 0">
      <SkeletonGrid v-if="loading" :count="skeletonCount" />
      <div v-else class="fhp-placeholder">
        <template v-if="error">
          <span>{{ error }}</span>
          <button class="fhp-button" @click="refresh">重试</button>
        </template>
        <VEmpty v-else />
      </div>
    </template>
    <template v-else>
      <VideoGrid :cards="sortedCards" :blockable="blockable" @block="block" />
      <SkeletonGrid
        v-if="loading && appending"
        class="fhp-append-skeleton"
        :count="skeletonCount"
      />
    </template>

    <footer v-if="cards.length" class="fhp-section-footer">
      <span v-if="error && appending" class="fhp-end-note">{{ error }}</span>
      <button class="fhp-button wide" :disabled="loading" @click="more">
        <span v-if="loading" class="fhp-spinner" />
        <VIcon v-else icon="mdi-plus" :size="18" />
        {{ loading ? '加载中' : '再来一批' }}
      </button>
    </footer>
  </section>
</template>
<script lang="ts">
import { VEmpty, VIcon } from '@/ui'
import { freshHomeOptions } from '../../options'
import { getRecommendBatch, PlusCard } from '../../api'
import { blockUp, filterBlockedUps, unblockUp } from '../../blacklist'
import { sortCards, trendingSorts, TrendingSortKey } from '../../sort'
import { registerSection, unregisterSection, showSnackbar } from '../../store'
import VideoGrid from '../../VideoGrid.vue'
import SkeletonGrid from '../../SkeletonGrid.vue'

const historyKey = 'fresh-home-plus.recommend-history'
const maxHistory = 5
/** 一批推荐的常见数量, 用作骨架屏的卡片数 */
const defaultBatchSize = 30

const readHistory = (): PlusCard[][] => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(historyKey) ?? '[]')
    return Array.isArray(saved) ? saved.filter(Array.isArray) : []
  } catch {
    return []
  }
}
const writeHistory = (history: PlusCard[][]) => {
  try {
    sessionStorage.setItem(historyKey, JSON.stringify(history.slice(-maxHistory)))
  } catch {
    // 存储不可用时, 历史只保留在内存里
  }
}

export default Vue.extend({
  components: { VEmpty, VIcon, VideoGrid, SkeletonGrid },
  data() {
    return {
      cards: [] as PlusCard[],
      /** 之前的批次快照, 最新的在末尾 */
      history: readHistory(),
      batchCount: 0,
      lastBatchSize: defaultBatchSize,
      loading: false,
      appending: false,
      error: '',
      sorts: trendingSorts,
      // 组件设置是普通 Proxy 而非 Vue 响应式对象, 排序状态放在本地, 改动时再写回设置
      sortKey: (freshHomeOptions.trendingSort ?? 'default') as TrendingSortKey,
      sortDescending: freshHomeOptions.trendingSortDescending ?? true,
    }
  },
  computed: {
    title(): string {
      return freshHomeOptions.personalized ? '推荐' : '热门'
    },
    blockable(): boolean {
      return freshHomeOptions.showBlockButton
    },
    sortedCards(): PlusCard[] {
      return sortCards(this.cards, this.sortKey, this.sortDescending)
    },
    skeletonCount(): number {
      return lodash.clamp(this.lastBatchSize || defaultBatchSize, 12, defaultBatchSize)
    },
  },
  watch: {
    cards() {
      this.persist()
    },
  },
  created() {
    this.load(false)
  },
  mounted() {
    registerSection({ name: 'trending', title: this.title, element: this.$el as HTMLElement })
  },
  beforeDestroy() {
    unregisterSection('trending')
  },
  methods: {
    persist: lodash.debounce(function persist(this: any) {
      const snapshots = this.cards.length ? [...this.history, this.cards] : this.history
      writeHistory(snapshots)
    }, 300),
    selectSort(key: TrendingSortKey) {
      if (key === this.sortKey) {
        if (key === 'default') {
          return
        }
        this.sortDescending = !this.sortDescending
      } else {
        this.sortKey = key
        this.sortDescending = true
      }
      freshHomeOptions.trendingSort = this.sortKey
      freshHomeOptions.trendingSortDescending = this.sortDescending
    },
    async load(append: boolean) {
      this.loading = true
      this.appending = append
      this.error = ''
      try {
        const batch = await getRecommendBatch(freshHomeOptions.personalized)
        const existing = new Set(append ? this.cards.map((c: PlusCard) => c.id) : [])
        const fresh = batch.filter(c => !existing.has(c.id))
        fresh.forEach((card, index) => {
          card.order = index
        })
        this.cards = append ? [...this.cards, ...fresh] : fresh
        this.batchCount = append ? this.batchCount + 1 : 1
        if (batch.length) {
          this.lastBatchSize = batch.length
        }
      } catch (error) {
        console.error(error)
        this.error = (error as Error).message || '加载失败'
      } finally {
        this.loading = false
      }
    },
    refresh() {
      if (this.loading) {
        return
      }
      if (this.cards.length) {
        this.history = [...this.history, this.cards].slice(-maxHistory)
      }
      this.cards = []
      this.load(false)
    },
    previous() {
      if (this.history.length === 0) {
        return
      }
      const history = [...this.history]
      const snapshot = filterBlockedUps(history.pop()).map((card, index) => ({
        ...card,
        order: index,
      }))
      this.history = history
      this.cards = snapshot
      this.batchCount = 1
    },
    more() {
      if (!this.loading) {
        this.load(true)
      }
    },
    block(card: PlusCard) {
      const name = card.upName
      const removed = this.cards
        .map((c: PlusCard, index: number) => ({ card: c, index }))
        .filter(({ card: c }) => c.upName === name)
      blockUp(name)
      this.cards = this.cards.filter((c: PlusCard) => c.upName !== name)
      showSnackbar({
        message: `已屏蔽「${name}」${
          removed.length > 1 ? `, 移除了 ${removed.length} 个视频` : ''
        }`,
        actionText: '撤销',
        action: () => {
          unblockUp(name)
          const cards = [...this.cards]
          removed.forEach(({ card: c, index }) => cards.splice(index, 0, c))
          this.cards = cards
        },
      })
    },
  },
})
</script>
