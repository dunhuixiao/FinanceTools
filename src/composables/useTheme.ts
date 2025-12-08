import { ref, computed, nextTick, watch } from 'vue'
import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme } from 'naive-ui'

const STORAGE_KEY = 'finance-tools-theme'

// 从 localStorage 读取初始值
const getInitialDark = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return typeof saved.isDark === 'boolean' ? saved.isDark : false
  } catch (e) {
    return false
  }
}

// 全局共享的主题状态
const isDark = ref(getInitialDark())

export function useTheme() {
  // Naive UI 主题配置
  const naiveTheme = computed(() => {
    return isDark.value ? darkTheme : null
  })

  // 主题覆盖配置
  const themeOverrides = computed<GlobalThemeOverrides>(() => ({
    common: {
      primaryColor: '#409EFF',
      primaryColorHover: '#66b1ff',
      primaryColorPressed: '#3a8ee6',
      successColor: '#67C23A',
      warningColor: '#E6A23C',
      errorColor: '#F56C6C',
      infoColor: '#909399',
      // 禁用组件内部的过渡动画，避免主题切换时的不同步
      cubicBezierEaseInOut: 'cubic-bezier(0, 0, 1, 1)',
      cubicBezierEaseOut: 'cubic-bezier(0, 0, 1, 1)',
      cubicBezierEaseIn: 'cubic-bezier(0, 0, 1, 1)'
    }
  }))

  /**
   * 切换主题
   * 临时禁用过渡动画，确保整个页面同步切换
   */
  const toggleTheme = async () => {
    // 添加禁用过渡的全局样式
    const style = document.createElement('style')
    style.id = 'disable-transitions'
    style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'
    document.head.appendChild(style)

    // 切换主题
    isDark.value = !isDark.value

    // 等待 Vue 完成 DOM 更新
    await nextTick()
    
    // 再等待渲染完成后移除禁用样式
    setTimeout(() => {
      const styleEl = document.getElementById('disable-transitions')
      if (styleEl) {
        styleEl.remove()
      }
    }, 0)
  }

  // 监听变化并保存到 localStorage
  watch(isDark, (newVal) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ isDark: newVal })
      )
    }
  })

  return {
    isDark,
    naiveTheme,
    themeOverrides,
    toggleTheme
  }
}
