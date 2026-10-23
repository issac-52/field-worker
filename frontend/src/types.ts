export type Phase = 'START' | 'END';
export type Role = 'ADMIN' | 'WORKER';
export const PHOTO_SLOTS = ['LOCATION_MAP', 'DISTANT', 'START_CLOSE', 'END_CLOSE'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];
export const PHOTO_LABEL: Record<PhotoSlot, string> = {
  LOCATION_MAP: '위치도 (선택)',
  DISTANT: '원경사진',
  START_CLOSE: 'START 근경사진',
  END_CLOSE: 'END 근경사진',
};
export type SitePhoto = { slot: PhotoSlot; url: string };
export type Site = {
  id: number;
  middleBlockId: string;
  smallBlockId: string;
  supplyArea: string;
  managementNo: string;
  zone: string;
  name: string;
  address: string;
  waterNo: string;
  industry: string;
  meterNo: string;
  sealed: boolean;
  latitude: number;
  longitude: number;
  note: string;
  photos: SitePhoto[];
  inspections: Partial<
    Record<
      Phase,
      {
        date: string;
        reading: number;
        workerId: number;
        workerName: string;
        fee?: number;
        recordedAt: string;
      }
    >
  >;
};
export type User = {
  id: number;
  name: string;
  role: Role;
  username: string;
  active: boolean;
  mustChangePassword?: boolean;
};
export type FeeRule = {
  id: number;
  phase: Phase;
  startDate: string;
  endDate: string;
  amount: number;
  createdAt: string;
};
export type ApiResult<T> = {
  success: boolean;
  code: string;
  message: string;
  data: T;
};
export const PHASE_LABEL: Record<Phase, string> = {
  START: '시작 검침',
  END: '종료 검침',
};
export const statusOf = (site: Pick<Site, 'inspections'>): 'DONE' | 'IN_PROGRESS' | 'TODO' =>
  site.inspections.END ? 'DONE' : site.inspections.START ? 'IN_PROGRESS' : 'TODO';

export type Block = { id: string; name: string; parentId?: string };
export type FeeAdjustmentRequest = {
  phase: Phase;
  startDate: string;
  endDate: string;
  amount: number;
  middleBlockId?: string;
  smallBlockId?: string;
  reason: string;
};
export type FeeAdjustmentResult = {
  updatedCount: number;
  amount: number;
  beforeTotal: number;
  afterTotal: number;
  auditId: string;
  changedAt: string;
};
export type BlockFilter = { middleBlockId?: string; smallBlockId?: string };
export type SiteFilter = BlockFilter & {
  q?: string;
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
};
export type PageRequest = { page?: number; pageSize?: number };
export type PageResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type SiteListItem = Omit<Site, 'photos' | 'note'> & {
  photoCount: number;
};
export type WorkerCount = {
  workerId: number;
  startCount: number;
  endCount: number;
};
export type SiteSummary = {
  total: number;
  done: number;
  progress: number;
  todo: number;
  startCount: number;
  endCount: number;
  ownStartCount: number;
  ownEndCount: number;
  workers: WorkerCount[];
};
export type SettlementFilter = BlockFilter & {
  workerId?: number;
  phase?: Phase;
  startDate?: string;
  endDate?: string;
};
export type SettlementRow = {
  siteId: number;
  managementNo: string;
  zone: string;
  phase: Phase;
  workerId: number;
  workerName: string;
  date: string;
  fee: number;
};
export type SettlementPage = PageResponse<SettlementRow> & {
  summary: {
    totalFee: number;
    workers: { workerId: number; count: number; fee: number }[];
  };
};
export type FeeAdjustmentPreview = {
  targetCount: number;
  beforeTotal: number;
  afterTotal: number;
};
export type CreateInvestigator = {
  username: string;
  name: string;
  temporaryPassword: string;
};
