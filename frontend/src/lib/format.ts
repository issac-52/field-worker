const numberFormat = new Intl.NumberFormat('ko-KR');

export const formatWon = (value: number) => `${numberFormat.format(value)}원`;
export const formatDate = (value: string) => value.replaceAll('-', '.');
export const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
