import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Cache for MCC lookups to reduce database calls
const mccCache = new Map();

/**
 * Look up MCC information
 * @param {string} mccCode - The MCC code to look up
 * @returns {Promise<{description: string, category: string} | null>}
 */
export async function lookupMCC(mccCode) {
  if (!mccCode) return null;

  // Normalize MCC code
  const normalizedCode = mccCode.toString().padStart(4, '0');

  // Check cache first
  if (mccCache.has(normalizedCode)) {
    return mccCache.get(normalizedCode);
  }

  try {
    const { data, error } = await supabase
      .from('mcc_codes')
      .select('description, category')
      .eq('mcc_code', normalizedCode)
      .single();

    if (error || !data) {
      console.log(`MCC ${normalizedCode} not found in database`);
      return null;
    }

    // Cache the result
    mccCache.set(normalizedCode, data);
    return data;
  } catch (error) {
    console.error('Error looking up MCC:', error);
    return null;
  }
}

/**
 * Batch lookup MCCs
 * @param {string[]} mccCodes - Array of MCC codes to look up
 * @returns {Promise<Map<string, {description: string, category: string}>>}
 */
export async function batchLookupMCCs(mccCodes) {
  if (!mccCodes || mccCodes.length === 0) return new Map();

  // Normalize codes
  const normalizedCodes = mccCodes.map(code => code.toString().padStart(4, '0'));

  // Filter out already cached codes
  const uncachedCodes = normalizedCodes.filter(code => !mccCache.has(code));

  if (uncachedCodes.length > 0) {
    try {
      const { data, error } = await supabase
        .from('mcc_codes')
        .select('mcc_code, description, category')
        .in('mcc_code', uncachedCodes);

      if (!error && data) {
        // Cache the results
        data.forEach(mcc => {
          mccCache.set(mcc.mcc_code, {
            description: mcc.description,
            category: mcc.category
          });
        });
      }
    } catch (error) {
      console.error('Error batch looking up MCCs:', error);
    }
  }

  // Return results for all requested codes
  const results = new Map();
  normalizedCodes.forEach(code => {
    if (mccCache.has(code)) {
      results.set(code, mccCache.get(code));
    }
  });

  return results;
}

/**
 * Clear the MCC cache
 */
export function clearMCCCache() {
  mccCache.clear();
}