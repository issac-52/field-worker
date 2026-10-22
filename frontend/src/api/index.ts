import { siteApi } from './sites';
import { feeApi } from './fees';
import { investigatorApi } from './investigators';

export const api = { ...siteApi, ...feeApi, ...investigatorApi };
