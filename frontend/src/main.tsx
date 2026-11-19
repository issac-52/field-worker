import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/index.css';

if (import.meta.env.PROD && !__MOCKS_ENABLED__ && 'serviceWorker' in navigator) {
  void navigator.serviceWorker
    .register('/offline-worker.js', { updateViaCache: 'none' })
    .catch((error) => console.warn('오프라인 화면을 준비하지 못했습니다.', error));
}

async function bootstrap() {
  if (__MOCKS_ENABLED__) {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest(request, print) {
        const url = new URL(request.url);
        if (url.origin === location.origin && url.pathname.startsWith('/api/')) print.error();
      },
    });
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  });
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
bootstrap().catch((error) => {
  console.error('앱 시작 실패:', error);
  document.getElementById('root')!.textContent =
    '앱을 시작하지 못했습니다. 연결 상태를 확인하고 새로고침하세요.';
});
