import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'retrodosa',
  brand: {
    displayName: '슬롯머신 레트로도사', // 화면에 노출될 앱의 한글 이름으로 바꿔주세요.
    primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
    icon: 'https://static.toss.im/appsintoss/34157/6d99664a-ca41-40c5-a3dd-12130927e433.png',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'tsc -b && vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
});
