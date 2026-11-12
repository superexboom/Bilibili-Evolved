<template>
  <div class="lfh-skeleton" :style="{ '--i': index }" aria-hidden="true">
    <div class="lfh-skeleton-cover lfh-shimmer" />
    <div class="lfh-skeleton-body">
      <div class="lfh-skeleton-face lfh-shimmer" />
      <div class="lfh-skeleton-lines">
        <div class="lfh-skeleton-line lfh-shimmer" />
        <div class="lfh-skeleton-line is-short lfh-shimmer" />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
/** 与 LiveCard 同尺寸的占位卡片, 加载时占住位置, 页面不跳动 */
export default Vue.extend({
  props: {
    index: { type: Number, default: 0 },
  },
})
</script>
<style lang="scss">
.lfh-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  animation: lfh-skeleton-in 0.3s ease backwards;
  animation-delay: calc(var(--i, 0) * 12ms);
  &-cover {
    aspect-ratio: 16 / 9;
    border-radius: 12px;
  }
  &-body {
    display: flex;
    gap: 10px;
    padding: 0 2px;
  }
  &-face {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    border-radius: 50%;
  }
  &-lines {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    padding-top: 2px;
  }
  &-line {
    height: 14px;
    border-radius: 7px;
    &.is-short {
      width: 45%;
      height: 12px;
    }
  }
}
.lfh-shimmer {
  background-color: var(--lfh-placeholder);
  background-image: linear-gradient(
    100deg,
    transparent 30%,
    var(--lfh-shimmer) 50%,
    transparent 70%
  );
  background-size: 300% 100%;
  background-repeat: no-repeat;
  background-attachment: fixed;
  animation: lfh-shimmer 1.6s ease-in-out infinite;
}
@keyframes lfh-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: 0 0;
  }
}
@keyframes lfh-skeleton-in {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lfh-skeleton,
  .lfh-shimmer {
    animation: none !important;
  }
}
</style>
