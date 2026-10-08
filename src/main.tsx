import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { I18nProvider } from './i18n/provider'

// rAF 停滞回退：窗口被完全遮挡或最小化时，Chromium 会暂停 requestAnimationFrame，
// 导致谱面渲染与导出录制停摆。这里让超时兜底接管（正常前台时 rAF 先触发，行为不变）。
const nativeRaf = window.requestAnimationFrame.bind(window)
window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
  let fired = false
  const run = (t: number) => {
    if (fired) return
    fired = true
    cb(t)
  }
  const id = nativeRaf(run)
  window.setTimeout(() => run(performance.now()), 50)
  return id
}) as typeof window.requestAnimationFrame

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
