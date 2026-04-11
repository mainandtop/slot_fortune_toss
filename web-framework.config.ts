import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'retrodosa', // 🌟 도사님의 앱 이름으로 변경
  web: {
    // 🌟 중요: 윈도우 터미널에서 'ipconfig'를 쳐서 나오는 본인의 IPv4 주소를 적으세요.
    host: '0.0.0.0', // '0.0.0.0'으로 두면 모든 네트워크 접속을 허용해서 더 편합니다.
    port: 5173,
    commands: {
      dev: 'vite --host', 
      build: 'vite build',
    },
  },
  permissions: [], // 필요한 권한이 있다면 여기에 추가 (진동 등)
});