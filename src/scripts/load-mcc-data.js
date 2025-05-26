import { loadMCCData } from './mcc-loader.js';

console.log('🚀 Starting MCC data load...');

loadMCCData()
  .then(() => {
    console.log('✅ MCC data load completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ MCC data load failed:', error);
    process.exit(1);
  });