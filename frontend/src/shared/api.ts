// 브라우저 번들에 포함되는 값입니다. VITE_* 변수에 비밀 키를 넣지 마세요.
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');

export async function getHealth(): Promise<{ status: string }> {
  const response = await fetch(`${baseUrl}/api/health`, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Health check failed (${response.status})`);
  return response.json() as Promise<{ status: string }>;
}
