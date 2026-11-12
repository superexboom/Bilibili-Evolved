<template>
  <HomeRedesignBase>
    <div class="fresh-home fresh-home-plus">
      <transition name="fhp-nav">
        <nav v-if="navVisible && sections.length" class="fhp-nav">
          <button
            v-for="section of sections"
            :key="section.name"
            class="fhp-nav-item"
            :class="{ active: section.name === activeSection }"
            @click="scrollToSection(section)"
          >
            {{ section.title }}
            <span v-if="section.name === 'feeds' && feedsNewCount" class="fhp-nav-badge">
              {{ feedsNewCount > 99 ? '99+' : feedsNewCount }}
            </span>
          </button>
          <span class="fhp-nav-divider" />
          <button class="fhp-nav-item icon" title="回到顶部" @click="scrollToTop">
            <VIcon icon="mdi-arrow-up" :size="17" />
          </button>
        </nav>
      </transition>
      <div class="fresh-home-content-layout">
        <FreshLayoutItem v-for="layout of layouts" :key="layout.name" :item="layout" />
      </div>
      <transition name="fhp-snackbar">
        <div v-if="snackbar" :key="snackbar.key" class="fhp-snackbar" role="status">
          <span class="fhp-snackbar-message">{{ snackbar.message }}</span>
          <button v-if="snackbar.actionText" class="fhp-snackbar-action" @click="runSnackbarAction">
            {{ snackbar.actionText }}
          </button>
          <button class="fhp-snackbar-close" title="关闭" @click="closeSnackbar">
            <VIcon icon="close" :size="14" />
          </button>
        </div>
      </transition>
    </div>
  </HomeRedesignBase>
</template>
<script lang="ts">
import { VIcon } from '@/ui'
import HomeRedesignBase from '../HomeRedesignBase.vue'
import FreshLayoutItem from './FreshLayoutItem.vue'
import { layouts } from './layouts/layouts'
import { plusStore, closeSnackbar, PlusSection } from './store'

const navOffset = 76

export default Vue.extend({
  components: {
    HomeRedesignBase,
    FreshLayoutItem,
    VIcon,
  },
  data() {
    return {
      layouts,
      store: plusStore,
      navVisible: false,
      activeSection: '',
    }
  },
  computed: {
    sections(): PlusSection[] {
      return this.store.sections
    },
    feedsNewCount(): number {
      return this.store.feedsNewCount
    },
    snackbar() {
      return this.store.snackbar
    },
  },
  mounted() {
    let frame = 0
    this.onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => this.updateNav())
    }
    window.addEventListener('scroll', this.onScroll, { passive: true })
    this.updateNav()
  },
  beforeDestroy() {
    window.removeEventListener('scroll', this.onScroll)
  },
  methods: {
    updateNav() {
      this.navVisible = window.scrollY > 160
      let active = this.sections[0]?.name ?? ''
      this.sections.forEach((section: PlusSection) => {
        if (section.element.getBoundingClientRect().top <= navOffset + 40) {
          active = section.name
        }
      })
      this.activeSection = active
    },
    scrollToSection(section: PlusSection) {
      const top = section.element.getBoundingClientRect().top + window.scrollY - navOffset + 8
      window.scrollTo({ top, behavior: 'smooth' })
    },
    scrollToTop() {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    runSnackbarAction() {
      const action = this.snackbar?.action
      closeSnackbar()
      action?.()
    },
    closeSnackbar,
  },
})
</script>
<style lang="scss">
@import 'common';
@import 'tabs';

.fresh-home {
  padding: 16px 36px;
  width: 100%;
  max-width: var(--home-max-width, unset);
  @include v-stretch();
  &-header {
    @include h-center();
    justify-content: space-between;
    margin-bottom: 16px;
    &-center-area {
      flex: 1;
      margin: 0 24px;
      @include h-center();
    }
    &-grow {
      flex: 1;
    }
    &-tabs {
      @include tabs-style();
      .default-tabs {
        padding: 4px 8px;
      }
    }
    &-title {
      color: var(--home-color);
      @include semi-bold();
      font-size: 20px;
      line-height: 28px;
    }
    &-pagination {
      @include h-center(8px);
      .be-button {
        .be-icon {
          transition: 0.3s ease-out;
        }
        .be-iconfont-left-arrow {
          transform: translateX(-0.5px);
        }
        .be-iconfont-right-arrow {
          transform: translateX(0.5px);
        }
        .mdi-refresh {
          margin: 1px;
          transition-duration: 0.5s;
        }
        &:hover .mdi-refresh {
          transform: rotate(1turn);
        }
      }
    }
    &-icon-button {
      @include semi-bold();
      font-size: 13px;
      &.be-button,
      .be-button {
        padding-left: 6px !important;
      }
      .be-icon {
        font-weight: normal;
        transition: 0.3s ease-out;
        margin-right: 6px;
      }
      &.rotate:hover .be-icon {
        transform: rotate(0.5turn);
      }
    }
  }
  &-content-layout {
    @include h-stretch();
    flex-wrap: wrap;
    gap: 8px 16px;
  }
}

// ===== 清爽首页 Plus =====
.fresh-home-plus {
  --fhp-surface: #fff;
  --fhp-border: rgba(0, 0, 0, 0.06);
  --fhp-muted: rgba(0, 0, 0, 0.5);
  --fhp-placeholder: #eef0f2;
  --fhp-chip: rgba(0, 0, 0, 0.045);
  --fhp-chip-hover: rgba(0, 0, 0, 0.08);
  --fhp-glass: rgba(255, 255, 255, 0.72);
  --fhp-glass-border: rgba(0, 0, 0, 0.08);
  --fhp-hover-shadow: 0 22px 44px -22px color-mix(in srgb, var(--theme-color) 55%, transparent),
    0 6px 18px -6px rgba(0, 0, 0, 0.1);
  --fhp-theme-soft: color-mix(in srgb, var(--theme-color) 14%, transparent);
  --fhp-shimmer: rgba(255, 255, 255, 0.6);
  --fhp-radius: 14px;
  body.dark & {
    --fhp-shimmer: rgba(255, 255, 255, 0.05);
    --fhp-surface: #222224;
    --fhp-border: rgba(255, 255, 255, 0.07);
    --fhp-muted: rgba(255, 255, 255, 0.5);
    --fhp-placeholder: #262628;
    --fhp-chip: rgba(255, 255, 255, 0.06);
    --fhp-chip-hover: rgba(255, 255, 255, 0.1);
    --fhp-glass: rgba(28, 28, 30, 0.72);
    --fhp-glass-border: rgba(255, 255, 255, 0.08);
    --fhp-hover-shadow: 0 22px 44px -20px color-mix(in srgb, var(--theme-color) 45%, transparent),
      0 6px 18px -6px rgba(0, 0, 0, 0.5);
    --fhp-theme-soft: color-mix(in srgb, var(--theme-color) 20%, transparent);
  }
  padding-top: 20px;

  button {
    font: inherit;
  }

  // ---- 版块 ----
  // 版块容器是 flex 子项, 默认 min-width: auto 会取内容的最小宽度;
  // 而 auto-fill 网格的最小宽度 = 卡片数 × 最小列宽, 卡片越多版块被撑得越宽 (超出屏幕),
  // 表现为动态时间线每次加载都先挤成一行再重排. 这里统一归零.
  .fresh-home-content-layout-item,
  .fhp-section,
  .fhp-timeline,
  .fhp-timeline-group,
  .fhp-grid {
    min-width: 0;
  }
  .fresh-home-content-layout-item.grow {
    max-width: 100%;
  }
  .fhp-section {
    @include v-stretch();
    width: 100%;
  }
  .fhp-append-skeleton {
    margin-top: 8px;
  }
  .fhp-sort {
    .fhp-segmented-item {
      @include h-center(2px);
      padding: 0 11px;
    }
  }
  .fhp-sort-arrow {
    transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    &.ascending {
      transform: rotate(180deg);
    }
  }
  .fhp-section-header {
    @include h-center(12px);
    flex-wrap: wrap;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .fhp-section-heading {
    @include h-center(14px);
    flex-wrap: wrap;
    min-width: 0;
  }
  .fhp-section-title {
    margin: 0;
    font-size: 22px;
    line-height: 30px;
    color: var(--home-color);
    @include semi-bold();
    letter-spacing: 0.01em;
  }
  .fhp-section-meta {
    color: var(--fhp-muted);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .fhp-section-actions {
    @include h-center(8px);
  }
  .fhp-section-footer {
    @include h-center();
    justify-content: center;
    padding: 22px 0 8px;
  }
  .fhp-end-note {
    color: var(--fhp-muted);
    font-size: 12px;
  }
  .fresh-home-feeds {
    margin-top: 28px;
  }
  .fhp-placeholder {
    @include h-center(12px);
    justify-content: center;
    min-height: 220px;
    border: 1.5px dashed var(--fhp-border);
    border-radius: 16px;
    color: var(--fhp-muted);
  }

  // ---- 按钮 ----
  .fhp-button {
    @include h-center(6px);
    justify-content: center;
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--fhp-border);
    border-radius: 17px;
    background: var(--fhp-chip);
    color: var(--home-color);
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease,
      transform 0.2s ease;
    &:hover:not(:disabled) {
      background: var(--fhp-chip-hover);
    }
    &:active:not(:disabled) {
      transform: scale(0.97);
    }
    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
    &.icon {
      width: 34px;
      padding: 0;
    }
    &.primary {
      background: var(--theme-color);
      border-color: transparent;
      color: var(--foreground-color, #fff);
      @include semi-bold();
      &:hover:not(:disabled) {
        background: var(--theme-color);
        filter: brightness(1.08);
      }
    }
    &.wide {
      min-width: 220px;
      height: 40px;
      border-radius: 20px;
    }
    .fhp-spin-on-hover {
      transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    &:hover .fhp-spin-on-hover {
      transform: rotate(1turn);
    }
  }
  .fhp-spinning {
    animation: fhp-spin 0.8s linear infinite;
  }
  .fhp-spinner {
    width: 15px;
    height: 15px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 2px solid var(--fhp-chip-hover);
    border-top-color: var(--theme-color);
    animation: fhp-spin 0.7s linear infinite;
  }

  // ---- 分段切换 ----
  .fhp-segmented {
    @include h-center(2px);
    padding: 3px;
    border-radius: 12px;
    background: var(--fhp-chip);
    &-item {
      height: 28px;
      padding: 0 14px;
      border: none;
      border-radius: 9px;
      background: transparent;
      color: var(--fhp-muted);
      font-size: 13px;
      cursor: pointer;
      transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
      &:hover {
        color: var(--home-color);
      }
      &.selected {
        background: var(--fhp-surface);
        color: var(--home-color);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        @include semi-bold();
      }
    }
  }
  .fhp-new-pill {
    @include h-center(6px);
    height: 28px;
    padding: 0 10px 0 12px;
    border: none;
    border-radius: 14px;
    background: var(--fhp-theme-soft);
    color: var(--theme-color);
    font-size: 13px;
    cursor: pointer;
    @include semi-bold();
    transition: filter 0.2s ease;
    &:hover {
      filter: brightness(1.15);
    }
    &-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--theme-color);
      box-shadow: 0 0 0 3px var(--fhp-theme-soft);
      animation: fhp-pulse 2s ease-in-out infinite;
    }
  }

  // ---- UP 筛选条 ----
  .fhp-up-strip {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 2px 2px 12px;
    margin-bottom: 6px;
    @include no-scrollbar();
    mask-image: linear-gradient(to right, #000 calc(100% - 48px), transparent);
  }
  .fhp-up-chip {
    @include h-center(7px);
    flex: 0 0 auto;
    height: 34px;
    padding: 0 12px 0 5px;
    border: 1px solid var(--fhp-border);
    border-radius: 17px;
    background: var(--fhp-chip);
    color: var(--home-color);
    font-size: 12px;
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    &:hover {
      background: var(--fhp-chip-hover);
    }
    &.selected {
      border-color: var(--theme-color);
      background: var(--fhp-theme-soft);
      color: var(--theme-color);
      @include semi-bold();
    }
    &-all {
      @include h-center();
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--fhp-chip-hover);
    }
    &-face {
      position: relative;
      width: 24px;
      height: 24px;
      img {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        object-fit: cover;
        display: block;
      }
    }
    &-dot {
      position: absolute;
      top: -1px;
      right: -1px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--theme-color);
      border: 2px solid var(--home-base-color);
    }
    &-name {
      max-width: 7em;
      @include single-line();
    }
  }

  // ---- 时间线 ----
  .fhp-timeline {
    @include v-stretch(18px);
  }
  .fhp-timeline-label {
    position: sticky;
    top: 70px;
    z-index: 2;
    @include h-center(8px);
    align-self: flex-start;
    width: fit-content;
    margin-bottom: 4px;
    padding: 4px 12px;
    border-radius: 12px;
    color: var(--home-color);
    font-size: 13px;
    @include semi-bold();
    background: var(--fhp-glass);
    border: 1px solid var(--fhp-glass-border);
    backdrop-filter: blur(16px) saturate(1.6);
  }
  .fhp-timeline-group {
    @include v-stretch();
  }
  .fhp-timeline-count {
    color: var(--fhp-muted);
    font-weight: normal;
    font-variant-numeric: tabular-nums;
  }

  // ---- 悬浮导航 ----
  .fhp-nav {
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    @include h-center(2px);
    padding: 4px;
    border-radius: 16px;
    background: var(--fhp-glass);
    border: 1px solid var(--fhp-glass-border);
    box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(20px) saturate(1.8);
    &-item {
      @include h-center(6px);
      height: 32px;
      padding: 0 14px;
      border: none;
      border-radius: 12px;
      background: transparent;
      color: var(--fhp-muted);
      font-size: 13px;
      cursor: pointer;
      transition: background-color 0.2s ease, color 0.2s ease;
      &:hover {
        color: var(--home-color);
      }
      &.active {
        background: var(--fhp-chip-hover);
        color: var(--home-color);
        @include semi-bold();
      }
      &.icon {
        width: 32px;
        padding: 0;
        justify-content: center;
      }
    }
    &-badge {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      box-sizing: border-box;
      border-radius: 9px;
      background: var(--theme-color);
      color: var(--foreground-color, #fff);
      font-size: 11px;
      line-height: 18px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    &-divider {
      width: 1px;
      height: 18px;
      margin: 0 4px;
      background: var(--fhp-border);
    }
  }
  .fhp-nav-enter-active,
  .fhp-nav-leave-active {
    transition: opacity 0.25s ease, transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .fhp-nav-enter,
  .fhp-nav-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(-12px) scale(0.96);
  }

  // ---- 撤销提示条 ----
  .fhp-snackbar {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 1001;
    @include h-center(10px);
    padding: 6px 6px 6px 16px;
    border-radius: 14px;
    color: var(--home-color);
    font-size: 13px;
    background: var(--fhp-glass);
    border: 1px solid var(--fhp-glass-border);
    box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(20px) saturate(1.8);
    &-action {
      height: 30px;
      padding: 0 12px;
      border: none;
      border-radius: 10px;
      background: var(--fhp-theme-soft);
      color: var(--theme-color);
      cursor: pointer;
      @include semi-bold();
      &:hover {
        filter: brightness(1.15);
      }
    }
    &-close {
      @include h-center();
      justify-content: center;
      width: 30px;
      height: 30px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: var(--fhp-muted);
      cursor: pointer;
      &:hover {
        background: var(--fhp-chip-hover);
      }
    }
  }
  .fhp-snackbar-enter-active,
  .fhp-snackbar-leave-active {
    transition: opacity 0.25s ease, transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .fhp-snackbar-enter,
  .fhp-snackbar-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(16px);
  }
}
@keyframes fhp-spin {
  to {
    transform: rotate(1turn);
  }
}
@keyframes fhp-pulse {
  50% {
    box-shadow: 0 0 0 6px transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fresh-home-plus * {
    animation: none !important;
    transition-duration: 0s !important;
  }
}
</style>
