<template>
  <n-upload
    multiple
    directory-dnd
    :max="100"
    :accept="'.pdf,.xml'"
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
        支持 PDF 和 XML 格式的发票文件，单个文件不超过 10MB，最多 100 个文件
      </n-p>
    </n-upload-dragger>
  </n-upload>
</template>

<script setup lang="ts">
import { NUpload, NUploadDragger, NIcon, NText, NP } from 'naive-ui'
import { CloudUploadOutline } from '@vicons/ionicons5'

const emit = defineEmits(['upload'])

function handleUpload({ file, onFinish }: any) {
  // 自定义上传逻辑，实际上我们不上传到服务器
  // 只是触发文件处理
  emit('upload', file.file)
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
