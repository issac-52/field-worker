import { authHandlers } from './auth';
import { sitesHandlers } from './sites';
import { feesHandlers } from './fees';
import { settlementsHandlers } from './settlements';
import { investigatorsHandlers } from './investigators';
import { exportHandlers } from './exports';

export const handlers = [
  ...authHandlers,
  ...sitesHandlers,
  ...exportHandlers,
  ...feesHandlers,
  ...settlementsHandlers,
  ...investigatorsHandlers,
];
