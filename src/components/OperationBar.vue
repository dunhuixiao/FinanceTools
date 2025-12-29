<template>
  <n-space justify="space-between" align="center" style="margin-bottom: 16px">
    <n-space>
      <n-radio-group v-model:value="localFilterStatus" @update:value="handleFilterChange">
        <n-radio-button value="all">
          全部 ({{ totalCount }})
        </n-radio-button>
        <n-radio-button value="success">
          成功 ({{ successCount }})
        </n-radio-button>
        <n-radio-button value="failed">
          失败 ({{ failedCount }})
        </n-radio-button>
      </n-radio-group>
      
      <n-input
        v-model:value="localSearchKeyword"
        placeholder="搜索文件名..."
        clearable
        style="width: 200px"
        @update:value="handleSearchChange"
      >
        <template #prefix>
          <n-icon><SearchOutline /></n-icon>
        </template>
      </n-input>
    </n-space>
    
    <n-space>
      <n-button @click="emit('select-all')" :disabled="totalCount === 0">
        全选
      </n-button>
      <n-button @click="emit('clear-selection')" :disabled="selectedCount === 0">
        取消选择
      </n-button>
      <n-button
        type="error"
        @click="emit('delete-selected')"
        :disabled="selectedCount === 0"
      >
        删除选中 ({{ selectedCount }})
      </n-button>
      <n-button
        type="primary"
        @click="emit('export')"
        :disabled="successCount === 0"
        :loading="isExporting"
      >
        导出成功的文件
      </n-button>
    </n-space>
  </n-space>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NSpace, NRadioGroup, NRadioButton, NInput, NButton, NIcon } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'

const props = defineProps({
  filterStatus: {
    type: String,
    default: 'all'
  },
  searchKeyword: {
    type: String,
    default: ''
  },
  totalCount: {
    type: Number,
    default: 0
  },
  successCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  selectedCount: {
    type: Number,
    default: 0
  },
  isExporting: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:filterStatus',
  'update:searchKeyword',
  'select-all',
  'clear-selection',
  'delete-selected',
  'export'
])

const localFilterStatus = ref(props.filterStatus)
const localSearchKeyword = ref(props.searchKeyword)

watch(() => props.filterStatus, (val) => {
  localFilterStatus.value = val
})

watch(() => props.searchKeyword, (val) => {
  localSearchKeyword.value = val
})

function handleFilterChange(value: string) {
  emit('update:filterStatus', value)
}

function handleSearchChange(value: string) {
  emit('update:searchKeyword', value)
}
</script>
