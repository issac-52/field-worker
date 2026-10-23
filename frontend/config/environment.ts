type Environment = Record<string, string | undefined>;

export function environmentPolicy(mode: string, command: string, env: Environment) {
  const demo = mode === 'demo';
  if (
    demo &&
    (env.VITE_APP_ENV !== 'demo' ||
      env.VITE_USE_MOCKS !== 'true' ||
      env.VITE_DEMO_SWITCH !== 'true')
  ) {
    throw new Error(
      'demo 모드는 VITE_APP_ENV=demo, VITE_USE_MOCKS=true, VITE_DEMO_SWITCH=true가 필요합니다.',
    );
  }
  if (!demo && (env.VITE_APP_ENV === 'demo' || env.VITE_DEMO_SWITCH === 'true')) {
    throw new Error('시연 설정은 --mode demo 전용입니다.');
  }
  if (
    command === 'build' &&
    !demo &&
    (env.VITE_USE_MOCKS === 'true' || env.VITE_DEMO_ROLE === 'ADMIN')
  ) {
    throw new Error('운영 빌드에 Mock 또는 시연 관리자 설정을 사용할 수 없습니다.');
  }
  return {
    demo,
    mocks: demo || (mode !== 'production' && command === 'serve' && env.VITE_USE_MOCKS !== 'false'),
  };
}
