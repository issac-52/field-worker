import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './demo.css';

async function bootstrap() {
  // 데모에서는 MSW를 켜고, Spring Boot API 연동 시 VITE_USE_MOCKS=false로 끌 수 있습니다.
  if (import.meta.env.VITE_USE_MOCKS !== 'false') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
  const client = new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30_000}}});
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></React.StrictMode>,
  );
}
bootstrap().catch(error=>{
  console.error('앱 시작 실패:', error);
  document.getElementById('root')!.textContent='앱을 시작하지 못했습니다. MSW 서비스 워커 설치를 확인해주세요.';
});
