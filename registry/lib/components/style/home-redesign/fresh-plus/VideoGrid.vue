<template>
  <transition-group tag="div" name="fhp-grid" class="fhp-grid" @before-leave="pinLeavingCard">
    <PlusVideoCard
      v-for="card of cards"
      :key="card.id"
      :card="card"
      :blockable="blockable"
      @block="$emit('block', $event)"
    />
  </transition-group>
</template>
<script lang="ts">
import PlusVideoCard from './PlusVideoCard.vue'

export default Vue.extend({
  components: { PlusVideoCard },
  props: {
    cards: { type: Array, default: () => [] },
    blockable: { type: Boolean, default: false },
  },
  methods: {
    /** 离场卡片脱离网格并固定在原位, 其余卡片才能平滑补位 */
    pinLeavingCard(el: HTMLElement) {
      const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = el
      Object.assign(el.style, {
        position: 'absolute',
        left: `${offsetLeft}px`,
        top: `${offsetTop}px`,
        width: `${offsetWidth}px`,
        height: `${offsetHeight}px`,
      })
    },
  },
})
</script>
<style lang="scss">
.fhp-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--fhp-card-min, 208px), 1fr));
  gap: 26px 18px;
  padding: 8px 0;

  &-move {
    transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  &-leave-active {
    transition: opacity 0.25s ease, transform 0.25s ease;
    z-index: 0;
    pointer-events: none;
  }
  &-leave-to {
    opacity: 0;
    transform: scale(0.92);
  }
}
@media (prefers-reduced-motion: reduce) {
  .fhp-grid-move,
  .fhp-grid-leave-active {
    transition: none !important;
  }
}
</style>
