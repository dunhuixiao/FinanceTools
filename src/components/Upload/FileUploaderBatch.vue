<template>
  <n-upload
    multiple
    directory-dnd
    :max="100"
    :accept="accept"
    :show-file-list="false"
    :custom-request="handleUpload"
    @change="handleChange"
  >
    <n-upload-dragger>
      <div style="margin-bottom: 12px">
        <n-icon size="48" :depth="3">
          <CloudUploadOutline />
        </n-icon>
      </div>
      <n-text style="font-size: 16px">
        点击或拖拽文件到此区域上传
      </n-text>
      <n-p depth="3" style="margin: 8px 0 0 0">
        {{ description }}
      </n-p>
    </n-upload-dragger>
  </n-upload>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NUpload, NUploadDragger, NIcon, NText, NP } from 'naive-ui'
import { CloudUploadOutline } from '@vicons/ionicons5'

interface Props {
  accept?: string
  disabled?: boolean
  description?: string
}

withDefaults(defineProps<Props>(), {
  accept: 'application/pdf,.pdf',
  disabled: false,
  description: '支持 PDF 格式的发票文件，单个文件不超过 10MB，最多 100 个文件'
})

const emit = defineEmits(['upload'])

const fileList = ref<File[]>([])
let uploadTimer: ReturnType<typeof setTimeout> | null = null

function handleUpload({ file, onFinish }: any) {
  // 收集文件
  fileList.value.push(file.file)
  
  // 清除之前的定时器
  if (uploadTimer) {
    clearTimeout(uploadTimer)
  }
  
  // 延迟触发，等待所有文件收集完毕
  uploadTimer = setTimeout(() => {
    if (fileList.value.length > 0) {
      emit('upload', [...fileList.value])
      fileList.value = []
    }
  }, 100)
  
  onFinish()
}

function handleChange() {
  // 可以在这里处理文件列表变化
}
</script>

<style scoped>
:deep(.n-upload-dragger) {
  padding: 40px 20px;
}
</style>
