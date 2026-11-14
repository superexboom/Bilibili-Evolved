<template>
  <DefaultWidget name="CDN 优选" icon="mdi-speedometer" @click="toggle"></DefaultWidget>
</template>

<script lang="ts">
import { DefaultWidget } from '@/ui'
import { togglePanel } from './panel'

export default Vue.extend({
  components: {
    DefaultWidget,
  },
  methods: {
    toggle() {
      togglePanel()
    },
  },
})
</script>
