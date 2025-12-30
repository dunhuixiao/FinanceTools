<template>
  <n-modal
    v-model:show="visible"
    :mask-closable="false"
    preset="card"
    :title="title"
    style="width: 400px"
  >
    <n-space vertical>
      <n-progress
        type="line"
        :percentage="percentage"
        :indicator-placement="'inside'"
      />
      <n-text>{{ statusText }}</n-text>
      <n-text depth="3" style="font-size: 12px" v-if="currentFile">
        当前文件: {{ currentFile }}
      </n-text>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NModal, NSpace, NProgress, NText } from 'naive-ui'

interface Props {
  show: boolean
  percentage: number
  currentFile?: string
  title?: string
  mode?: 'parse' | 'process'
}

const props = withDefaults(defineProps<Props>(), {
  title: '处理文件中...',
  mode: 'parse'
})

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const visible = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

const statusText = computed(() => {
  const action = props.mode === 'parse' ? '正在解析' : '正在解析文件'
  return `${action}: ${props.percentage}%`
})
</script>
