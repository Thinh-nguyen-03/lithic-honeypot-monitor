import { createClient } from '@supabase/supabase-js';
import { batchLookupMCCs } from './mcc-service.js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Update existing merchants with MCC descriptions
 */
async function updateExistingMerchants() {
  console.log('📊 Updating existing merchants with MCC data...');

  // Get all merchants with MCC codes but no descriptions
  const { data: merchants, error } = await supabase
    .from('merchants')
    .select('id, mcc')
    .not('mcc', 'is', null)
    .is('mcc_description', null);

  if (error) {
    console.error('Error fetching merchants:', error);
    return;
  }

  console.log(`Found ${merchants.length} merchants to update`);

  // Get unique MCC codes
  const uniqueMCCs = [...new Set(merchants.map(m => m.mcc).filter(Boolean))];

  // Batch lookup MCC information
  const mccMap = await batchLookupMCCs(uniqueMCCs);

  // Update merchants in batches
  const batchSize = 50;
  let updatedCount = 0;

  for (let i = 0; i < merchants.length; i += batchSize) {
    const batch = merchants.slice(i, i + batchSize);

    const updates = batch
      .filter(merchant => mccMap.has(merchant.mcc.padStart(4, '0')))
      .map(merchant => {
        const mccInfo = mccMap.get(merchant.mcc.padStart(4, '0'));
        return {
          id: merchant.id,
          mcc_description: mccInfo.description,
          mcc_category: mccInfo.category
        };
      });

    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from('merchants')
        .upsert(updates, { onConflict: 'id' });

      if (updateError) {
        console.error(`Error updating batch ${Math.floor(i / batchSize) + 1}:`, updateError);
      } else {
        updatedCount += updates.length;
        console.log(`✅ Updated batch ${Math.floor(i / batchSize) + 1}`);
      }
    }
  }

  console.log(`✅ Successfully updated ${updatedCount} merchants with MCC data`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateExistingMerchants()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}