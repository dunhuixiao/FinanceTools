<template>
  <div class="not-found-container">
    <n-result
      status="404"
      title="页面未找到"
      description="抱歉，您访问的功能暂未上线或地址有误。"
    >
      <template #footer>
        <n-button type="primary" @click="handleBackHome">
          返回首页
        </n-button>
      </template>
    </n-result>
  </div>
</template>

<script setup>
import { NResult, NButton } from 'naive-ui'
import { useRouter } from 'vue-router'

const router = useRouter()

function handleBackHome() {
  router.push('/')
}
</script>

<style scoped>
.not-found-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
