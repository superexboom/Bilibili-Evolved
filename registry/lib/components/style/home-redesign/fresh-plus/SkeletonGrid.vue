<template>
  <div class="fhp-grid fhp-skeleton-grid" aria-busy="true" aria-label="加载中">
    <div
      v-for="index of count"
      :key="index"
      class="fhp-skeleton"
      :style="{ '--i': Math.min(index - 1, 24) }"
    >
      <div class="fhp-skeleton-cover fhp-shimmer" />
      <div class="fhp-skeleton-line fhp-shimmer" />
      <div class="fhp-skeleton-line short fhp-shimmer" />
      <div class="fhp-skeleton-meta">
        <div class="fhp-skeleton-face fhp-shimmer" />
        <div class="fhp-skeleton-line tiny fhp-shimmer" />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
/** 与 VideoGrid 同尺寸的骨架屏, 加载时占住位置, 避免页面高度跳变 */
export default Vue.extend({
  props: {
    count: { type: Number, default: 12 },
  },
})
</script>
<style lang="scss">
.fhp-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  animation: fhp-skeleton-in 0.35s ease backwards;
  animation-delay: calc(var(--i, 0) * 12ms);

  &-cover {
    aspect-ratio: 16 / 9;
    border-radius: var(--fhp-radius, 12px);
  }
  &-line {
    height: 14px;
    border-radius: 7px;
    &.short {
      width: 62%;
      margin-top: -2px;
    }
    &.tiny {
      flex: 0 0 38%;
      height: 12px;
      border-radius: 6px;
    }
  }
  &-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  &-face {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: 50%;
  }
}
.fhp-shimmer {
  background-color: var(--fhp-placeholder, #eef0f2);
  background-image: linear-gradient(
    100deg,
    transparent 30%,
    var(--fhp-shimmer, rgba(255, 255, 255, 0.55)) 50%,
    transparent 70%
  );
  background-size: 300% 100%;
  background-repeat: no-repeat;
  // 用 fixed 背景让所有骨架块共享同一道光, 扫过时连成一片
  background-attachment: fixed;
  animation: fhp-shimmer 1.6s ease-in-out infinite;
}
@keyframes fhp-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: 0 0;
  }
}
@keyframes fhp-skeleton-in {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fhp-skeleton,
  .fhp-shimmer {
    animation: none !important;
  }
}
</style>
