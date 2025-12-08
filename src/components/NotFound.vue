<template>
  <div class="not-found-container">
    <n-result
      status="404"
      title="页面未找到"
      description="抱歉，您访问的功能暂未上线或地址有误。"
    >
      <template #footer>
        <n-space vertical :size="16" align="center">
          <n-text depth="3">
            {{ countdown }} 秒后自动返回首页
          </n-text>
          <n-button type="primary" @click="handleBackHome">
            返回首页
          </n-button>
        </n-space>
      </template>
    </n-result>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { NResult, NButton, NSpace, NText } from 'naive-ui'
import { useRouter } from 'vue-router'

const router = useRouter()
const countdown = ref(5)
let timer: ReturnType<typeof setInterval> | null = null

function handleBackHome() {
  if (timer) {
    clearInterval(timer)
  }
  router.push('/')
}

function startCountdown() {
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      handleBackHome()
    }
  }, 1000)
}

onMounted(() => {
  startCountdown()
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
})
</script>

<style scoped>
.not-found-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
