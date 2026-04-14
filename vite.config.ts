import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// @ts-check
/** @type {import('vite').UserConfig} */
export default defineConfig({
  // 1. 리액트 플러그인 설정
  plugins: [react()],

  // 🌟 [중요] 토스 미니앱은 상대 경로로 파일을 찾아야 하므로 './' 설정이 필수요!
  base: './', 

  build: {
    // 2. 덩치 큰 파일 경고 기준 상향 (2000kB)
    chunkSizeWarningLimit: 2000, 

    rollupOptions: {
      output: {
        // 3. 🌟 함수형 manualChunks (타입스크립트 에러를 피하는 가장 확실한 방법)
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // 라이브러리들은 모두 'vendor'라는 보따리에 따로 담으시오
            return 'vendor';
          }
        },
      },
    },
  },
})