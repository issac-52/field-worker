import { siteApi } from './sites';
import { feeApi } from './fees';
import { investigatorApi } from './investigators';
import { locationMapApi } from './locationMaps';

export const api = { ...siteApi, ...feeApi, ...investigatorApi, ...locationMapApi };
