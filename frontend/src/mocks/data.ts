import type { Site, FeeRule, User } from '../types';
export const currentUser: User = {
  id: 11,
  name: '김민수',
  role: 'WORKER',
  username: 'worker11',
  active: true,
};
export const users: User[] = [
  currentUser,
  {
    id: 12,
    name: '이서연',
    role: 'WORKER',
    username: 'worker12',
    active: true,
  },
  {
    id: 13,
    name: '박지훈',
    role: 'WORKER',
    username: 'worker13',
    active: true,
  },
  { id: 1, name: '관리자', role: 'ADMIN', username: 'admin', active: true },
];
const raw = [
  [
    '0012',
    '진량1',
    '이영희',
    '경산시 진량읍 봉황길 18',
    '731205-01',
    '가정용',
    'GA-028174',
    35.8747,
    128.82,
  ],
  [
    '0013',
    '진량1',
    '김철수',
    '경산시 진량읍 공단로 12',
    '731205-02',
    '일반용',
    'GA-028175',
    35.8742,
    128.8219,
  ],
  [
    '0014',
    '진량1',
    '박순자',
    '경산시 진량읍 봉황길 24',
    '731205-03',
    '가정용',
    'GA-028176',
    35.8756,
    128.8192,
  ],
  [
    '0015',
    '진량2',
    '최민호',
    '경산시 진량읍 대학로 119',
    '731205-04',
    '일반용',
    'GA-028177',
    35.876,
    128.8231,
  ],
  [
    '0016',
    '진량2',
    '정미경',
    '경산시 진량읍 선화길 8',
    '731205-05',
    '가정용',
    'GA-028178',
    35.8729,
    128.8224,
  ],
  [
    '0017',
    '압량1',
    '서경자',
    '경산시 압량읍 대학로 356',
    '731205-06',
    '가정용',
    'GA-028179',
    35.8431,
    128.7587,
  ],
  [
    '0018',
    '압량1',
    '장도현',
    '경산시 압량읍 신대길 45',
    '731205-07',
    '일반용',
    'GA-028180',
    35.8421,
    128.7599,
  ],
  [
    '0019',
    '압량2',
    '윤지호',
    '경산시 압량읍 압독로 88',
    '731205-08',
    '가정용',
    'GA-028181',
    35.8463,
    128.7632,
  ],
  [
    '0020',
    '하양1',
    '한재현',
    '경산시 하양읍 하양로 62',
    '731205-09',
    '가정용',
    'GA-028182',
    35.9126,
    128.8177,
  ],
  [
    '0021',
    '하양1',
    '임수진',
    '경산시 하양읍 문화로 15',
    '731205-10',
    '일반용',
    'GA-028183',
    35.9133,
    128.8188,
  ],
  [
    '0022',
    '하양2',
    '오은정',
    '경산시 하양읍 대경로 761',
    '731205-11',
    '가정용',
    'GA-028184',
    35.9108,
    128.8159,
  ],
  [
    '0023',
    '진량1',
    '배현우',
    '경산시 진량읍 신상리 121',
    '731205-12',
    '가정용',
    'GA-028185',
    35.8777,
    128.8241,
  ],
] as const;
export const seedSites: Site[] = raw.map((r, i) => ({
  id: i + 1,
  middleBlockId: `middle-${r[1].replace(/\d+$/, '')}`,
  smallBlockId: `small-${r[1]}`,
  supplyArea: r[3].split(' ')[1],
  managementNo: r[0],
  zone: r[1],
  name: r[2],
  address: r[3],
  waterNo: r[4],
  industry: r[5],
  meterNo: r[6],
  latitude: r[7],
  longitude: r[8],
  sealed: true,
  note: i === 2 ? '계량기함 주변 적치물 확인' : i === 5 ? '입구 우측 계량기함' : '',
  photos: [],
  inspections:
    i < 4
      ? {
          START: {
            date: '2026-11-03',
            reading: 1120 + i * 63,
            workerId: 11,
            workerName: '김민수',
            fee: 3000,
            recordedAt: '2026-11-03T14:00:00',
          },
          ...(i < 2
            ? {
                END: {
                  date: '2027-10-15',
                  reading: 1305 + i * 80,
                  workerId: 12,
                  workerName: '이서연',
                  fee: 3500,
                  recordedAt: '2027-10-15T11:00:00',
                },
              }
            : {}),
        }
      : {},
}));
export const seedRules: FeeRule[] = [
  {
    id: 1,
    phase: 'START',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    amount: 3000,
    createdAt: '2026-10-22T00:00:00',
  },
  {
    id: 2,
    phase: 'END',
    startDate: '2027-01-01',
    endDate: '2027-12-31',
    amount: 3500,
    createdAt: '2026-10-22T00:00:00',
  },
];

// Shared expansion helper for browser demos and explicit scale checks.
export function expandSeed(count: number) {
  const originals = seedSites.slice(0, 12);
  for (let id = seedSites.length + 1; id <= count; id++) {
    const original = originals[(id - 1) % originals.length];
    seedSites.push({
      ...structuredClone(original),
      id,
      managementNo: `T${String(id).padStart(6, '0')}`,
      waterNo: `MOCK-${id}`,
      name: `수용가 ${id}`,
      photos: [],
    });
  }
}
// Browser Mock sessions include enough fictitious records to inspect pagination.
// Node regression tests retain the original small fixture.
if (import.meta.env?.DEV || import.meta.env?.MODE === 'demo') {
  for (let id = 14; id <= 37; id++) {
    users.push({
      id,
      name: `시연 조사자 ${String(id - 10).padStart(2, '0')}`,
      username: `demo_worker${id}`,
      role: 'WORKER',
      active: id % 7 !== 0,
    });
  }
  const requested = Number(import.meta.env.VITE_MOCK_SITE_COUNT);
  const count =
    Number.isSafeInteger(requested) && requested > 12 && requested <= 50000 ? requested : 180;
  expandSeed(count);
  const workers = users.filter((user) => user.role === 'WORKER' && user.active);
  for (const site of seedSites.slice(12)) {
    const worker = workers[(site.id - 13) % workers.length];
    const day = String((site.id % 28) + 1).padStart(2, '0');
    site.address = `가상 현장 ${site.id} (시연 데이터)`;
    // Small offsets separate generated markers around the existing demo blocks.
    site.latitude = site.latitude! + Math.floor((site.id - 13) / 12) * 0.00015;
    site.longitude = site.longitude! + Math.floor((site.id - 13) / 12) * 0.00012;
    site.inspections =
      site.id % 3 === 0
        ? {}
        : {
            START: {
              date: `2026-11-${day}`,
              reading: 1000 + site.id * 7,
              workerId: worker.id,
              workerName: worker.name,
              fee: 3000,
              recordedAt: `2026-11-${day}T09:00:00`,
            },
            ...(site.id % 3 === 1
              ? {
                  END: {
                    date: `2027-11-${day}`,
                    reading: 1200 + site.id * 7,
                    workerId: worker.id,
                    workerName: worker.name,
                    fee: 3500,
                    recordedAt: `2027-11-${day}T10:00:00`,
                  },
                }
              : {}),
          };
  }
}

export const blocks = Array.from(new Set(seedSites.map((s) => s.middleBlockId))).flatMap((id) => [
  {
    id,
    name: seedSites.find((s) => s.middleBlockId === id)!.zone.replace(/\d+$/, ''),
  },
  ...Array.from(
    new Map(
      seedSites
        .filter((s) => s.middleBlockId === id)
        .map((s) => [s.smallBlockId, { id: s.smallBlockId, name: s.zone, parentId: id }]),
    ).values(),
  ),
]);
