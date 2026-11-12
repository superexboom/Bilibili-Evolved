<template>
  <div
    class="fhp-card"
    :class="{ 'is-new': card.isNew, previewing: Boolean(previewStyle) }"
    :style="{ '--i': stagger }"
  >
    <a
      class="fhp-card-cover"
      :href="url"
      target="_blank"
      @mouseenter="startPreview"
      @mousemove="movePreview"
      @mouseleave="stopPreview"
    >
      <DpiImage class="fhp-card-cover-image" :src="card.coverUrl" :size="coverSize" />
      <div v-if="previewStyle" class="fhp-card-preview" :style="previewStyle" />
      <div v-if="previewStyle" class="fhp-card-progress">
        <div class="fhp-card-progress-bar" :style="{ transform: `scaleX(${progress})` }" />
      </div>
      <div class="fhp-card-badges">
        <span v-if="card.isNew" class="fhp-badge fhp-badge-new">NEW</span>
        <span v-if="card.followed" class="fhp-badge fhp-badge-followed">已关注</span>
        <span v-else-if="card.reason" class="fhp-badge">{{ card.reason }}</span>
      </div>
      <div class="fhp-card-actions">
        <button
          v-if="canWatchlater"
          class="fhp-card-action"
          :class="{ active: inWatchlater }"
          :title="inWatchlater ? '移出稍后再看' : '稍后再看'"
          @click.prevent.stop="toggleWatchlater"
        >
          <VIcon :icon="inWatchlater ? 'mdi-check' : 'mdi-clock-outline'" :size="16" />
        </button>
        <button
          v-if="blockable"
          class="fhp-card-action danger"
          :title="`屏蔽 UP 主「${card.upName}」`"
          @click.prevent.stop="$emit('block', card)"
        >
          <VIcon icon="mdi-account-cancel-outline" :size="16" />
        </button>
      </div>
      <div class="fhp-card-glass">
        <span v-if="card.playCount" class="fhp-card-stat">
          <VIcon icon="play" :size="14" />{{ card.playCount }}
        </span>
        <span v-if="card.danmakuCount" class="fhp-card-stat">
          <VIcon icon="danmaku" :size="14" />{{ card.danmakuCount }}
        </span>
        <span class="fhp-card-glass-grow" />
        <span v-if="card.durationText" class="fhp-card-duration">{{ card.durationText }}</span>
      </div>
    </a>
    <div class="fhp-card-body">
      <a class="fhp-card-title" :href="url" target="_blank" :title="card.title">
        {{ card.title }}
      </a>
      <div class="fhp-card-meta">
        <a
          class="fhp-card-up"
          :href="card.upID ? `https://space.bilibili.com/${card.upID}` : null"
          target="_blank"
          :title="upTitle"
        >
          <DpiImage v-if="card.upFaceUrl" class="fhp-card-face" :src="card.upFaceUrl" :size="20" />
          <span class="fhp-card-up-name">{{ card.upName }}</span>
          <span v-if="cooperationCount" class="fhp-card-coop">等{{ cooperationCount + 1 }}人</span>
        </a>
        <span v-if="timeText" class="fhp-card-time" :title="timeTitle">{{ timeText }}</span>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { DpiImage, VIcon } from '@/ui'
import { getUID } from '@/core/utils'
import { watchlaterList, toggleWatchlater } from '@/components/video/watchlater'
import { freshHomeOptions } from './options'
import { relativeTime, fullTime } from './time'
import { getVideoShot, getShotFrameStyle, preloadShot, VideoShot } from './video-shot'

const previewDelay = 280

export default Vue.extend({
  components: { DpiImage, VIcon },
  props: {
    card: { type: Object, required: true },
    blockable: { type: Boolean, default: false },
  },
  data() {
    return {
      watchlaterList,
      shot: null as VideoShot | null,
      hovering: false,
      progress: 0,
      previewTimer: 0,
    }
  },
  computed: {
    url(): string {
      return this.card.epID
        ? `https://www.bilibili.com/bangumi/play/ep${this.card.epID}`
        : `https://www.bilibili.com/video/${this.card.bvid}/`
    },
    coverSize() {
      return { width: 320, height: 180 }
    },
    stagger(): number {
      return Math.min(this.card.order ?? 0, 24)
    },
    canWatchlater(): boolean {
      return Boolean(getUID() && this.card.aid && !this.card.epID)
    },
    inWatchlater(): boolean {
      return this.watchlaterList.includes(this.card.aid)
    },
    cooperationCount(): number {
      return Math.max(0, (this.card.cooperation?.length ?? 0) - 1)
    },
    upTitle(): string {
      if (this.cooperationCount) {
        return this.card.cooperation.map(it => it.name).join(' / ')
      }
      return this.card.upName
    },
    timeText(): string {
      return relativeTime(this.card.timestamp)
    },
    timeTitle(): string {
      return fullTime(this.card.timestamp)
    },
    previewStyle() {
      if (!this.hovering || !this.shot) {
        return null
      }
      return getShotFrameStyle(this.shot, this.progress)
    },
  },
  beforeDestroy() {
    window.clearTimeout(this.previewTimer)
  },
  methods: {
    toggleWatchlater() {
      toggleWatchlater(this.card.aid)
    },
    startPreview(e: MouseEvent) {
      if (!freshHomeOptions.hoverPreview || !this.card.bvid) {
        return
      }
      this.updateProgress(e)
      window.clearTimeout(this.previewTimer)
      this.previewTimer = window.setTimeout(async () => {
        const shot = await getVideoShot(this.card.bvid, this.card.cid)
        if (!shot) {
          return
        }
        preloadShot(shot)
        this.shot = shot
        this.hovering = true
      }, previewDelay)
    },
    movePreview(e: MouseEvent) {
      this.updateProgress(e)
    },
    stopPreview() {
      window.clearTimeout(this.previewTimer)
      this.hovering = false
    },
    updateProgress(e: MouseEvent) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      this.progress = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    },
  },
})
</script>
<style lang="scss">
@import 'common';

.fhp-card {
  --fhp-radius: 14px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  // backwards: 动画结束后不再锁定 transform, 以免挡住 transition-group 的补位动画
  animation: fhp-card-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  animation-delay: calc(var(--i, 0) * 22ms);

  // 悬停时浮现的底板, 让卡片在无边框时也有清晰的交互反馈
  &::before {
    content: '';
    position: absolute;
    inset: -8px -8px -10px;
    border-radius: calc(var(--fhp-radius) + 6px);
    background: var(--fhp-surface);
    border: 1px solid var(--fhp-border);
    box-shadow: var(--fhp-hover-shadow);
    opacity: 0;
    transform: scale(0.97);
    transition: opacity 0.25s ease, transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
    pointer-events: none;
  }
  &:hover::before {
    opacity: 1;
    transform: scale(1);
  }
  > * {
    position: relative;
  }

  &-cover {
    display: block;
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: var(--fhp-radius);
    overflow: hidden;
    background: var(--fhp-placeholder);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    transform: translateZ(0);
    &-image {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
  }
  &:hover &-cover-image {
    transform: scale(1.06);
  }
  &-preview {
    position: absolute;
    inset: 0;
    background-repeat: no-repeat;
    background-color: #000;
  }
  &-progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.25);
    z-index: 2;
    &-bar {
      height: 100%;
      background: var(--theme-color);
      transform-origin: left;
    }
  }
  &-badges {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    gap: 6px;
    z-index: 1;
  }
  &-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
    z-index: 1;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.2s ease, transform 0.25s ease;
  }
  &:hover &-actions {
    opacity: 1;
    transform: none;
  }
  &-action {
    @include h-center();
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 9px;
    color: #fff;
    background: rgba(20, 20, 20, 0.45);
    backdrop-filter: blur(12px) saturate(1.6);
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.2s ease;
    &:hover {
      transform: scale(1.08);
      background: rgba(20, 20, 20, 0.7);
    }
    &.active {
      background: var(--theme-color);
      border-color: transparent;
    }
    &.danger:hover {
      background: #e5484d;
      border-color: transparent;
    }
  }
  &-glass {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    @include h-center(10px);
    padding: 18px 10px 7px;
    color: #fff;
    font-size: 12px;
    line-height: 1;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0));
    pointer-events: none;
    transition: opacity 0.2s ease;
    &-grow {
      flex: 1;
    }
  }
  &.previewing &-glass,
  &.previewing &-badges {
    opacity: 0;
  }
  &-stat {
    @include h-center(3px);
    font-variant-numeric: tabular-nums;
    .be-icon {
      opacity: 0.9;
    }
  }
  &-duration {
    padding: 3px 6px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    font-variant-numeric: tabular-nums;
  }

  &-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 2px;
  }
  &-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 14px;
    line-height: 1.45;
    min-height: 2.9em;
    color: var(--home-color);
    @include semi-bold();
    word-break: break-word;
    transition: color 0.2s ease;
    &:hover {
      color: var(--theme-color);
    }
  }
  &-meta {
    @include h-center(6px);
    min-width: 0;
    color: var(--fhp-muted);
    font-size: 12px;
  }
  &-up {
    @include h-center(6px);
    min-width: 0;
    color: inherit;
    &:hover {
      color: var(--theme-color);
    }
    &-name {
      @include single-line();
    }
  }
  &-face {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
  }
  &-coop {
    flex: 0 0 auto;
    opacity: 0.8;
  }
  &-time {
    flex: 0 0 auto;
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  &.is-new &-time {
    color: var(--theme-color);
  }
}
.fhp-badge {
  padding: 3px 7px;
  border-radius: 7px;
  font-size: 11px;
  line-height: 1.2;
  color: #fff;
  background: rgba(20, 20, 20, 0.45);
  backdrop-filter: blur(12px) saturate(1.6);
  border: 1px solid rgba(255, 255, 255, 0.16);
  &-new {
    background: var(--theme-color);
    border-color: transparent;
    @include semi-bold();
    letter-spacing: 0.04em;
  }
  &-followed {
    background: rgba(251, 114, 153, 0.85);
    border-color: transparent;
  }
}
@keyframes fhp-card-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fhp-card,
  .fhp-card *,
  .fhp-card::before {
    animation: none !important;
    transition: none !important;
  }
}
</style>
