// src/mcc-loader.js
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Load MCC data from JSON file
 */
function loadMCCDataFromFile() {
  const filePath = join(__dirname, '..', 'data', 'mcc-data.json');
  const fileContent = readFileSync(filePath, 'utf-8');
  return JSON.parse(fileContent);
}

/**
 * Load MCC data into database
 */
export async function loadMCCData() {
  try {
    console.log('🔄 Loading MCC data into database...');

    const MCC_DATA = loadMCCDataFromFile();
    const mccRecords = parseMCCData(MCC_DATA);

    // First, clear existing data for a clean load
    const { error: deleteError } = await supabase
      .from('mcc_codes')
      .delete()
      .neq('mcc_code', '0000'); // Delete all except a dummy condition

    if (deleteError) {
      console.log('Note: Could not clear existing data:', deleteError.message);
    }

    // Batch insert for better performance
    const batchSize = 100;
    let successCount = 0;

    for (let i = 0; i < mccRecords.length; i += batchSize) {
      const batch = mccRecords.slice(i, i + batchSize);

      const { data, error } = await supabase
        .from('mcc_codes')
        .upsert(batch, { 
          onConflict: 'mcc_code',
          ignoreDuplicates: false 
        })
        .select();

      if (error) {
        console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error);
      } else {
        successCount += data.length;
        console.log(`✅ Inserted batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(mccRecords.length / batchSize)}`);
      }
    }

    console.log(`✅ Successfully loaded ${successCount} MCC codes`);

    // Verify the load
    const { count } = await supabase
      .from('mcc_codes')
      .select('*', { count: 'exact', head: true });

    console.log(`📊 Total MCC codes in database: ${count}`);

  } catch (error) {
    console.error('❌ Error loading MCC data:', error);
    throw error;
  }
}

/**
 * Parse MCC data into flat structure
 */
function parseMCCData(mccData) {
  const parsedMCCs = [];

  for (const [category, codes] of Object.entries(mccData)) {
    for (const entry of codes) {
      parsedMCCs.push({
        mcc_code: entry.code.padStart(4, '0'),
        description: entry.description,
        category: category
      });
    }
  }

  return parsedMCCs;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  loadMCCData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}