import { useState } from 'react';

export function usePagePosition(key: string) {
  const [position, setPosition] = useState({ key, page: 1 });
  return {
    page: position.key === key ? position.page : 1,
    setPage: (page: number) => setPosition({ key, page }),
  };
}
