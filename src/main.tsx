import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// ⬇️ 도사가 준 토스 신당의 기운(Provider)을 불러오는 줄일세!
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ⬇️ 여기서 App을 포근하게 감싸주어야 토스의 기운이 서린다네! */}
    <TDSMobileAITProvider>
      <App />
    </TDSMobileAITProvider>
  </StrictMode>,
)