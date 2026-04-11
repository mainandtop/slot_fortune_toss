import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 1. 리액트 플러그인 설정 (이게 없으면 리액트가 안 돌아가오!)
  plugins: [react()],

  build: {
    // 2. 덩치 큰 파일 경고 기준을 1500kB로 상향
    chunkSizeWarningLimit: 1500, 

    // 3. 특정 라이브러리를 별도 보따리(Chunk)로 분리
    rollupOptions: {
      output: {
        manualChunks: {
          // html2canvas 같은 무거운 녀석은 'vendor'라는 이름의 별도 파일로 뽑아내오
          vendor: ['html2canvas'], 
        },
      },
    },
  },
})