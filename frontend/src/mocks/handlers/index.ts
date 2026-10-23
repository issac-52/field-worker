import { authHandlers } from './auth';
import { sitesHandlers } from './sites';
import { feesHandlers } from './fees';
import { settlementsHandlers } from './settlements';
import { investigatorsHandlers } from './investigators';
import { locationMapsHandlers } from './locationMaps';

export const handlers = [
  ...authHandlers,
  ...sitesHandlers,
  ...locationMapsHandlers,
  ...feesHandlers,
  ...settlementsHandlers,
  ...investigatorsHandlers,
];
