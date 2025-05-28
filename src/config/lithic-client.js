import { Lithic } from 'lithic';
import { config } from './index.js';

export const lithic_client = new Lithic({
  apiKey: config.lithic.apiKey,
  environment: config.lithic.environment,
});