import { authHandlers } from './auth';
import { sitesHandlers } from './sites';
import { feesHandlers } from './fees';
import { settlementsHandlers } from './settlements';
import { investigatorsHandlers } from './investigators';

export const handlers = [
  ...authHandlers,
  ...sitesHandlers,
  ...feesHandlers,
  ...settlementsHandlers,
  ...investigatorsHandlers,
];
