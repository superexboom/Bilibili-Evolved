<template>
  <a
    class="lfh-card"
    :class="{ 'show-frame': frameReady && hovering }"
    :href="url"
    target="_blank"
    :title="room.title"
    :style="{ '--i': stagger }"
    @mouseenter="enter"
    @mouseleave="hovering = false"
  >
    <div class="lfh-card-cover">
      <img class="lfh-card-image" :src="coverSrc" loading="lazy" alt="" />
      <img
        v-if="frameSrc"
        class="lfh-card-image lfh-card-frame"
        :src="frameSrc"
        alt=""
        @load="frameReady = true"
      />
      <div class="lfh-card-badges">
        <span v-if="following" class="lfh-badge is-live"><span class="lfh-live-dot" />直播中</span>
        <span v-if="room.areaName" class="lfh-badge">{{ room.areaName }}</span>
      </div>
      <div class="lfh-card-glass">
        <span v-if="countText" class="lfh-card-stat" :title="countTitle">
          <VIcon :icon="following ? 'mdi-fire' : 'mdi-eye-outline'" :size="14" />
          {{ countText }}
        </span>
        <span v-if="durationText" class="lfh-card-stat" title="已开播">
          <VIcon icon="mdi-clock-outline" :size="13" />
          {{ durationText }}
        </span>
        <span v-if="frameReady && hovering" class="lfh-card-frame-tip">实时画面</span>
      </div>
    </div>
    <div class="lfh-card-body">
      <img class="lfh-card-face" :src="faceSrc" loading="lazy" alt="" />
      <div class="lfh-card-text">
        <div class="lfh-card-title">{{ room.title }}</div>
        <div class="lfh-card-up">{{ room.uname }}</div>
      </div>
    </div>
  </a>
</template>
<script lang="ts">
import { VIcon } from '@/ui'
import { formatCount } from '@/core/utils/formatters'
import { LiveRoom, roomUrl, thumb } from './api'
import { liveStore } from './options'

const formatDuration = (seconds: number) => {
  const minutes = Math.max(1, Math.floor(seconds / 60))
  if (minutes < 60) {
    return `${minutes}分钟`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}小时${rest}分` : `${hours}小时`
}

export default Vue.extend({
  components: { VIcon },
  props: {
    room: { type: Object as () => LiveRoom, required: true },
    following: { type: Boolean, default: false },
    index: { type: Number, default: 0 },
  },
  data() {
    return {
      hovering: false,
      frameSrc: '',
      frameReady: false,
    }
  },
  computed: {
    url(): string {
      return roomUrl(this.room.roomId)
    },
    stagger(): number {
      return Math.min(this.index, 24)
    },
    coverSrc(): string {
      return thumb(this.room.cover, 400, 225)
    },
    faceSrc(): string {
      return thumb(this.room.face, 36, 36)
    },
    countText(): string {
      if (this.room.watchedText) {
        return this.room.watchedText
      }
      return this.room.online ? formatCount(this.room.online) : ''
    },
    countTitle(): string {
      return this.following ? '人气' : '观看'
    },
    durationText(): string {
      if (!this.room.liveStart) {
        return ''
      }
      return formatDuration(Date.now() / 1000 - this.room.liveStart)
    },
  },
  methods: {
    enter() {
      this.hovering = true
      // 实时画面只在第一次悬停时加载, 避免一次性请求大量截图
      if (!this.frameSrc && liveStore.hoverKeyframe && this.room.keyframe) {
        if (this.room.keyframe !== this.room.cover) {
          this.frameSrc = thumb(this.room.keyframe, 400, 225)
        }
      }
    },
  },
})
</script>
<style lang="scss">
@import 'common';

.lfh-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  color: inherit;
  text-decoration: none !important;
  animation: lfh-card-in 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  animation-delay: calc(var(--i, 0) * 18ms);

  &::before {
    content: '';
    position: absolute;
    inset: -8px -8px -10px;
    border-radius: 18px;
    background: var(--lfh-surface);
    border: 1px solid var(--lfh-border);
    box-shadow: var(--lfh-hover-shadow);
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
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
    background: var(--lfh-placeholder);
    transform: translateZ(0);
  }
  &-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease;
  }
  &:hover &-image {
    transform: scale(1.05);
  }
  &-frame {
    opacity: 0;
  }
  &.show-frame &-frame {
    opacity: 1;
  }
  &-badges {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  &-glass {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 10px 7px;
    color: #fff;
    font-size: 12px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.62), transparent);
  }
  &-stat {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-variant-numeric: tabular-nums;
    .be-icon {
      opacity: 0.9;
    }
  }
  &-frame-tip {
    margin-left: auto;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    font-size: 11px;
  }
  &-body {
    display: flex;
    gap: 10px;
    padding: 0 2px;
    min-width: 0;
  }
  &-face {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--lfh-placeholder);
  }
  &-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  &-title {
    color: var(--lfh-text);
    font-size: 14px;
    line-height: 20px;
    @include semi-bold();
    @include single-line();
    transition: color 0.2s ease;
  }
  &:hover &-title {
    color: var(--theme-color);
  }
  &-up {
    color: var(--lfh-muted);
    font-size: 12px;
    line-height: 17px;
    @include single-line();
  }
}
.lfh-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 7px;
  border-radius: 7px;
  font-size: 11px;
  line-height: 1.2;
  color: #fff;
  background: rgba(20, 20, 20, 0.45);
  backdrop-filter: blur(12px) saturate(1.6);
  border: 1px solid rgba(255, 255, 255, 0.16);
  @include single-line();
  &.is-live {
    background: #ff4d6d;
    border-color: transparent;
    @include semi-bold();
  }
}
.lfh-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  animation: lfh-live-pulse 1.4s ease-in-out infinite;
}
@keyframes lfh-live-pulse {
  50% {
    opacity: 0.35;
  }
}
@keyframes lfh-card-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lfh-card,
  .lfh-card *,
  .lfh-card::before {
    animation: none !important;
    transition: none !important;
  }
}
</style>
