<template>
  <VPopup
    v-model="visible"
    fixed
    :auto-close="false"
    :esc-close="true"
    class="adaptive-cdn-panel"
    :style="positionStyle"
  >
    <div class="adaptive-cdn-header" title="按住拖动" @pointerdown="onDragStart">
      <div class="adaptive-cdn-title">
        <VIcon icon="mdi-speedometer" :size="18" />
        CDN 自动优选
        <span class="adaptive-cdn-version">v{{ view.version }}</span>
      </div>
      <button type="button" class="adaptive-cdn-close" title="收起" @click="visible = false">
        <VIcon icon="close" :size="16" />
      </button>
    </div>
    <div class="adaptive-cdn-status" :class="{ busy: view.busy }">{{ view.status }}</div>
    <div class="adaptive-cdn-actions">
      <VButton type="primary" :disabled="view.busy" @click="refresh">刷新并测速</VButton>
      <VButton
        :title="
          view.isLive ? '重载直播播放器, 改用测速最快的节点' : '后续分片立即改走测速最快的节点'
        "
        @click="api && api.apply()"
      >
        应用优选
      </VButton>
      <VButton title="导出诊断信息 (已脱敏)" @click="api && api.exportDiagnostic()"
        >导出诊断</VButton
      >
    </div>
    <div class="adaptive-cdn-table">
      <div v-if="view.rows.length === 0" class="adaptive-cdn-empty">
        {{ view.busy ? '测速中…' : '还没有测速结果; 起播稳定后会自动测速' }}
      </div>
      <div
        v-for="row of view.rows"
        :key="row.key"
        class="adaptive-cdn-row"
        :class="{ ok: row.ok, current: row.current }"
      >
        <div class="adaptive-cdn-host" :title="row.host">
          <span v-if="row.current" class="adaptive-cdn-badge">当前</span>
          {{ row.host }}
          <span v-if="row.detail" class="adaptive-cdn-detail">{{ row.detail }}</span>
        </div>
        <div class="adaptive-cdn-metric">{{ row.ttfb }}</div>
        <div class="adaptive-cdn-metric">{{ row.speed }}</div>
        <div class="adaptive-cdn-state" :title="row.state">{{ row.state }}</div>
      </div>
    </div>
    <div v-if="view.messages.length" class="adaptive-cdn-log">
      <div v-for="(message, index) of view.messages" :key="index">{{ message }}</div>
    </div>
    <div v-if="view.stats" class="adaptive-cdn-stats">
      <div class="adaptive-cdn-stats-title">播放统计</div>
      <div class="adaptive-cdn-stats-line" title="解码方式、分辨率、实际渲染帧率和掉帧比例">
        <span>解码</span>{{ view.stats.decode }}
      </div>
      <div
        class="adaptive-cdn-stats-line"
        title="CPU 压力来自浏览器的 Compute Pressure 接口; 长任务是页面主线程被占住超过 50 ms 的时间"
      >
        <span>负载</span>{{ view.stats.load }}
      </div>
      <div class="adaptive-cdn-stats-line"><span>卡顿</span>{{ view.stats.summary }}</div>
      <div
        v-for="(line, index) of view.stats.recent.concat(view.stats.reloads, view.stats.errors)"
        :key="index"
        class="adaptive-cdn-stats-item"
      >
        {{ line }}
      </div>
      <details v-if="view.stats.hosts.length" class="adaptive-cdn-stats-hosts">
        <summary>各节点卡顿率 (近 14 天, 观看满 1 分钟的节点)</summary>
        <div v-for="(line, index) of view.stats.hosts" :key="index" class="adaptive-cdn-stats-item">
          {{ line }}
        </div>
      </details>
    </div>
    <details class="adaptive-cdn-settings">
      <summary>设置与自定义节点</summary>
      <label><input v-model="draft.autoVideo" type="checkbox" /> 自动优选视频</label>
      <label><input v-model="draft.autoLive" type="checkbox" /> 自动优选直播</label>
      <label>
        <input v-model="draft.autoRecover" type="checkbox" />
        直播断流时自动切换备用节点 (单次断流超过 6 秒, 或 90 秒内断流 3 次; 至少间隔 2 分钟)
      </label>
      <label>
        每
        <input v-model.number="draft.refreshMinutes" type="number" min="0" max="1440" />
        分钟自动刷新测速, 0 为仅手动
      </label>
      <label>
        视频候选域名 (每行一个, 内容与原片一致才会使用)
        <textarea v-model="draft.videoHosts" rows="2"></textarea>
      </label>
      <label>
        直播偏好域名 (只在官方返回的候选中挑选)
        <textarea v-model="draft.liveHosts" rows="2"></textarea>
      </label>
      <label>
        HTTPS JSON 节点列表订阅
        <textarea
          v-model="draft.listSources"
          rows="2"
          placeholder='{"video":["upos-xxx.bilivideo.com"],"live":["d1--xxx.bilivideo.com"]}'
        ></textarea>
      </label>
      <div class="adaptive-cdn-actions">
        <VButton type="primary" @click="save">保存设置</VButton>
        <VButton @click="api && api.exportList()">导出节点列表</VButton>
        <VButton @click="api && api.resetMetrics()">清空测速缓存</VButton>
      </div>
    </details>
  </VPopup>
</template>

<script lang="ts">
import { getComponentSettings } from '@/core/settings'
import { Toast } from '@/core/toast'
import { VPopup, VButton, VIcon } from '@/ui'
import { NAME, SLOT, hosts } from './core'

const settings = getComponentSettings(NAME)
const editable = [
  'autoVideo',
  'autoLive',
  'autoRecover',
  'refreshMinutes',
  'videoHosts',
  'liveHosts',
  'listSources',
] as const
const readDraft = () =>
  Object.fromEntries(editable.map(key => [key, settings.options[key]])) as Record<
    (typeof editable)[number],
    any
  >
const emptyView = {
  version: '',
  isLive: false,
  busy: false,
  status: '等待播放器',
  rows: [],
  messages: [],
  stats: null,
}
const margin = 8
let unsubscribe: (() => void) | undefined
const readPosition = (): { left: number; top: number } | null => {
  const saved = settings.options.panelPosition
  return saved?.left >= 0 ? { left: saved.left, top: saved.top } : null
}

export default Vue.extend({
  components: {
    VPopup,
    VButton,
    VIcon,
  },
  data() {
    return {
      visible: false,
      view: emptyView,
      draft: readDraft(),
      position: readPosition(),
    }
  },
  computed: {
    api() {
      return unsafeWindow[SLOT] ?? null
    },
    positionStyle(): Record<string, string> {
      if (!this.position) {
        return {}
      }
      return {
        left: `${this.position.left}px`,
        top: `${this.position.top}px`,
        right: 'auto',
      }
    },
  },
  watch: {
    visible(visible: boolean) {
      if (visible) {
        this.draft = readDraft()
        this.update()
        this.$nextTick(() => this.clampIntoView())
      }
    },
  },
  created() {
    unsubscribe = this.api?.subscribe(() => {
      if (this.visible) {
        this.update()
      }
    })
    this.update()
  },
  beforeDestroy() {
    unsubscribe?.()
  },
  methods: {
    update() {
      this.view = this.api?.view() ?? emptyView
    },
    async refresh() {
      try {
        await this.api?.refresh()
      } finally {
        this.update()
      }
    },
    save() {
      const { options } = settings
      options.autoVideo = Boolean(this.draft.autoVideo)
      options.autoLive = Boolean(this.draft.autoLive)
      options.autoRecover = Boolean(this.draft.autoRecover)
      const minutes = Number(this.draft.refreshMinutes)
      options.refreshMinutes = minutes === 0 ? 0 : Math.min(1440, Math.max(5, minutes || 60))
      options.videoHosts = hosts(this.draft.videoHosts).join('\n')
      options.liveHosts = hosts(this.draft.liveHosts).join('\n')
      options.listSources = String(this.draft.listSources ?? '').trim()
      this.draft = readDraft()
      Toast.success('设置已保存', 'CDN 自动优选', 2000)
    },
    /** 窗口缩小后面板可能跑到屏幕外, 打开时拉回可见区域 */
    clampIntoView() {
      if (!this.position) {
        return
      }
      const { width, height } = this.$el.getBoundingClientRect()
      this.position = {
        left: Math.min(Math.max(this.position.left, margin), window.innerWidth - width - margin),
        top: Math.min(Math.max(this.position.top, margin), window.innerHeight - height - margin),
      }
    },
    onDragStart(e: PointerEvent) {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) {
        return
      }
      const header = e.currentTarget as HTMLElement
      const rect = (this.$el as HTMLElement).getBoundingClientRect()
      const offsetX = e.clientX - rect.left
      const offsetY = e.clientY - rect.top
      const move = (event: PointerEvent) => {
        this.position = {
          left: Math.min(
            Math.max(event.clientX - offsetX, margin),
            window.innerWidth - rect.width - margin,
          ),
          top: Math.min(
            Math.max(event.clientY - offsetY, margin),
            window.innerHeight - rect.height - margin,
          ),
        }
      }
      const end = () => {
        header.removeEventListener('pointermove', move)
        header.removeEventListener('pointerup', end)
        header.removeEventListener('pointercancel', end)
        if (this.position) {
          settings.options.panelPosition = { ...this.position }
        }
      }
      header.setPointerCapture(e.pointerId)
      header.addEventListener('pointermove', move)
      header.addEventListener('pointerup', end)
      header.addEventListener('pointercancel', end)
      e.preventDefault()
    },
  },
})
</script>

<style lang="scss">
@import 'common';

.adaptive-cdn-panel {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 100002;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(520px, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  padding: 12px 14px;
  overflow: auto;
  font-size: 12px;
  @include popup();
  @include text-color();
  @include no-scrollbar();

  &.close {
    pointer-events: none;
    opacity: 0;
  }
  &.open {
    pointer-events: initial;
    opacity: 1;
  }
}

.adaptive-cdn-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -4px -4px 0;
  padding: 4px;
  border-radius: 6px;
  cursor: move;
  user-select: none;
  touch-action: none;

  &:hover {
    background-color: #8882;
  }
}

.adaptive-cdn-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: bold;
}

.adaptive-cdn-version {
  font-size: 11px;
  font-weight: normal;
  opacity: 0.5;
}

.adaptive-cdn-close {
  display: flex;
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:hover {
    background-color: #8883;
  }
}

.adaptive-cdn-status {
  padding: 6px 8px;
  border-radius: 6px;
  background-color: #8881;
  overflow-wrap: anywhere;

  &.busy {
    color: var(--theme-color);
  }
}

.adaptive-cdn-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.adaptive-cdn-table {
  display: flex;
  flex-direction: column;
}

.adaptive-cdn-empty {
  padding: 12px 0;
  text-align: center;
  opacity: 0.6;
}

.adaptive-cdn-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px 92px 76px;
  gap: 8px;
  align-items: center;
  padding: 5px 4px;
  border-bottom: 1px solid #8882;

  &.current {
    background-color: var(--theme-color-10, #8881);
    border-radius: 4px;
  }
}

.adaptive-cdn-host {
  @include single-line();
}

.adaptive-cdn-badge {
  margin-right: 2px;
  padding: 0 4px;
  border-radius: 3px;
  background-color: var(--theme-color);
  color: var(--foreground-color);
  font-size: 11px;
}

.adaptive-cdn-detail {
  opacity: 0.5;
}

.adaptive-cdn-metric {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.adaptive-cdn-state {
  text-align: right;
  color: #e6764d;
  @include single-line();

  .ok > & {
    color: #3aa675;
  }
}

.adaptive-cdn-log {
  opacity: 0.7;
  overflow-wrap: anywhere;
}

.adaptive-cdn-stats {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
  border-radius: 6px;
  background-color: #8881;
  overflow-wrap: anywhere;

  summary {
    cursor: pointer;
    user-select: none;
    opacity: 0.8;
  }
}

.adaptive-cdn-stats-title {
  font-weight: bold;
}

.adaptive-cdn-stats-line > span {
  display: inline-block;
  width: 3em;
  opacity: 0.6;
}

.adaptive-cdn-stats-item {
  padding-left: 3em;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.adaptive-cdn-settings {
  summary {
    cursor: pointer;
    user-select: none;
  }

  label {
    display: block;
    margin: 6px 0;
  }

  textarea {
    box-sizing: border-box;
    display: block;
    width: 100%;
    margin-top: 2px;
    padding: 4px 6px;
    border: 1px solid #8884;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    resize: vertical;
  }

  input[type='number'] {
    width: 64px;
    border: 1px solid #8884;
    border-radius: 4px;
    background: transparent;
    color: inherit;
  }
}
</style>
