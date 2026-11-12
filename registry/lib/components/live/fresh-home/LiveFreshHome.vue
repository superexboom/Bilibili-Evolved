<template>
  <div v-show="isHome" class="lfh">
    <FollowingSection />
    <AreaSection />
  </div>
</template>
<script lang="ts">
import { liveStore } from './options'
import FollowingSection from './FollowingSection.vue'
import AreaSection from './AreaSection.vue'

export default Vue.extend({
  components: { FollowingSection, AreaSection },
  computed: {
    isHome(): boolean {
      return liveStore.isHome
    },
  },
})
</script>
<style lang="scss">
@import 'common';

.lfh {
  --lfh-text: #18191c;
  --lfh-muted: rgba(0, 0, 0, 0.5);
  --lfh-surface: #fff;
  --lfh-border: rgba(0, 0, 0, 0.06);
  --lfh-placeholder: #eef0f2;
  --lfh-shimmer: rgba(255, 255, 255, 0.6);
  --lfh-chip: rgba(0, 0, 0, 0.045);
  --lfh-chip-hover: rgba(0, 0, 0, 0.08);
  --lfh-glass: rgba(255, 255, 255, 0.78);
  --lfh-glass-border: rgba(0, 0, 0, 0.08);
  --lfh-theme-soft: color-mix(in srgb, var(--theme-color) 14%, transparent);
  --lfh-hover-shadow: 0 22px 44px -22px color-mix(in srgb, var(--theme-color) 55%, transparent),
    0 6px 18px -6px rgba(0, 0, 0, 0.1);
  body.dark & {
    --lfh-text: #e7e7e9;
    --lfh-muted: rgba(255, 255, 255, 0.5);
    --lfh-surface: #222224;
    --lfh-border: rgba(255, 255, 255, 0.07);
    --lfh-placeholder: #262628;
    --lfh-shimmer: rgba(255, 255, 255, 0.05);
    --lfh-chip: rgba(255, 255, 255, 0.06);
    --lfh-chip-hover: rgba(255, 255, 255, 0.1);
    --lfh-glass: rgba(28, 28, 30, 0.78);
    --lfh-glass-border: rgba(255, 255, 255, 0.08);
    --lfh-theme-soft: color-mix(in srgb, var(--theme-color) 20%, transparent);
    --lfh-hover-shadow: 0 22px 44px -20px color-mix(in srgb, var(--theme-color) 45%, transparent),
      0 6px 18px -6px rgba(0, 0, 0, 0.5);
  }
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 36px;
  min-width: 0;
  padding: 20px 28px 48px;
  color: var(--lfh-text);
  font-size: 14px;

  button {
    font: inherit;
  }

  // ---- 版块 ----
  .lfh-section {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .lfh-section-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .lfh-section-heading,
  .lfh-section-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .lfh-section-actions {
    gap: 8px;
  }
  .lfh-section-title {
    margin: 0;
    font-size: 22px;
    line-height: 30px;
    color: var(--lfh-text);
    @include semi-bold();
  }
  .lfh-section-meta {
    color: var(--lfh-muted);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .lfh-live-count {
    color: #ff4d6d;
    @include semi-bold();
  }
  .lfh-section-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 22px 0 4px;
  }
  .lfh-end-note {
    color: var(--lfh-muted);
    font-size: 12px;
  }
  .lfh-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 200px;
    border: 1.5px dashed var(--lfh-border);
    border-radius: 16px;
    color: var(--lfh-muted);
    &.is-compact {
      min-height: 96px;
      gap: 8px;
    }
  }

  // ---- 网格 ----
  .lfh-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
    gap: 24px 18px;
    min-width: 0;
    &.is-fixed {
      grid-template-columns: repeat(var(--lfh-columns, 6), minmax(0, 1fr));
    }
    // 只显示第一行: 之后的行高度为 0 并被裁掉, 列数随宽度自适应
    &.is-single-row {
      grid-template-rows: auto;
      grid-auto-rows: 0;
      row-gap: 0;
      overflow: hidden;
      // 留出悬停底板的位置, 避免被裁切
      padding: 10px;
      margin: -10px;
    }
  }

  // ---- 分区模块 ----
  .lfh-module {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 22px;
    &-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    &-icon {
      width: 22px;
      height: 22px;
      object-fit: contain;
    }
    &-title {
      font-size: 16px;
      @include semi-bold();
    }
    &-more {
      display: inline-flex;
      align-items: center;
      margin-left: auto;
      padding: 4px 6px 4px 10px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--lfh-muted);
      font-size: 13px;
      cursor: pointer;
      transition: background-color 0.2s ease, color 0.2s ease;
      &:hover {
        background: var(--lfh-chip);
        color: var(--theme-color);
      }
    }
  }

  // ---- 父分区标签 ----
  .lfh-tabs {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 2px;
    border-bottom: 1px solid var(--lfh-border);
    @include no-scrollbar();
  }
  .lfh-tab {
    position: relative;
    flex: 0 0 auto;
    height: 40px;
    padding: 0 14px;
    border: none;
    background: transparent;
    color: var(--lfh-muted);
    font-size: 15px;
    cursor: pointer;
    transition: color 0.2s ease;
    &::after {
      content: '';
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: -3px;
      height: 3px;
      border-radius: 3px;
      background: var(--theme-color);
      transform: scaleX(0);
      transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    &:hover {
      color: var(--lfh-text);
    }
    &.selected {
      color: var(--lfh-text);
      @include semi-bold();
      &::after {
        transform: scaleX(1);
      }
    }
  }

  // ---- 子分区标签 ----
  .lfh-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }
  .lfh-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--lfh-border);
    border-radius: 16px;
    background: var(--lfh-chip);
    color: var(--lfh-text);
    font-size: 13px;
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    &:hover {
      background: var(--lfh-chip-hover);
    }
    &.selected {
      border-color: var(--theme-color);
      background: var(--lfh-theme-soft);
      color: var(--theme-color);
      @include semi-bold();
    }
    &.is-ghost {
      background: transparent;
      border-style: dashed;
      color: var(--lfh-muted);
      &.selected {
        border-style: solid;
        color: var(--theme-color);
      }
    }
    &-icon {
      width: 20px;
      height: 20px;
      margin-left: -6px;
      border-radius: 6px;
      object-fit: cover;
    }
  }
  .lfh-area-panel {
    margin-top: 12px;
    padding: 12px;
    border-radius: 16px;
    background: var(--lfh-surface);
    border: 1px solid var(--lfh-border);
    box-shadow: 0 16px 40px -20px rgba(0, 0, 0, 0.25);
    &-search {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 12px;
      margin-bottom: 10px;
      border-radius: 10px;
      background: var(--lfh-chip);
      color: var(--lfh-muted);
    }
    &-input {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      color: var(--lfh-text);
      font: inherit;
    }
    &-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 4px;
      max-height: 300px;
      overflow-y: auto;
    }
    &-item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      height: 40px;
      padding: 0 8px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: var(--lfh-text);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      transition: background-color 0.2s ease;
      img {
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        border-radius: 7px;
        object-fit: cover;
      }
      span {
        @include single-line();
      }
      &:hover {
        background: var(--lfh-chip);
      }
      &.selected {
        background: var(--lfh-theme-soft);
        color: var(--theme-color);
        @include semi-bold();
      }
    }
  }
  .lfh-panel-enter-active,
  .lfh-panel-leave-active {
    transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .lfh-panel-enter,
  .lfh-panel-leave-to {
    opacity: 0;
    transform: translateY(-6px);
  }
  .lfh-areas .lfh-grid:not(.is-single-row) {
    margin-top: 18px;
  }

  // ---- 按钮 ----
  .lfh-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--lfh-border);
    border-radius: 17px;
    background: var(--lfh-chip);
    color: var(--lfh-text);
    font-size: 13px;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.2s ease;
    &:hover:not(:disabled) {
      background: var(--lfh-chip-hover);
    }
    &:active:not(:disabled) {
      transform: scale(0.97);
    }
    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
    &.is-icon {
      width: 34px;
      padding: 0;
    }
    &.is-wide {
      min-width: 220px;
      height: 40px;
      border-radius: 20px;
    }
  }
  .lfh-spin-on-hover {
    transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .lfh-button:hover .lfh-spin-on-hover {
    transform: rotate(1turn);
  }
  .lfh-spinning {
    animation: lfh-spin 0.8s linear infinite;
  }
  .lfh-spinner {
    width: 15px;
    height: 15px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 2px solid var(--lfh-chip-hover);
    border-top-color: var(--theme-color);
    animation: lfh-spin 0.7s linear infinite;
  }
  .lfh-segmented {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 12px;
    background: var(--lfh-chip);
    &-item {
      height: 28px;
      padding: 0 11px;
      border: none;
      border-radius: 9px;
      background: transparent;
      color: var(--lfh-muted);
      font-size: 13px;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
      &:hover {
        color: var(--lfh-text);
      }
      &.selected {
        background: var(--lfh-surface);
        color: var(--lfh-text);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        @include semi-bold();
      }
    }
  }
}
@keyframes lfh-spin {
  to {
    transform: rotate(1turn);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lfh * {
    animation: none !important;
    transition-duration: 0s !important;
  }
}
</style>
