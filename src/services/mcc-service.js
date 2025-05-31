import { supabase_client } from "../config/supabase-client.js";
import logger from "../utils/logger.js";

// Cache for MCC lookups to reduce database calls
const mccCache = new Map();

/**
 * Look up MCC information.
 * @param {string} mccCode - The MCC code to look up.
 * @returns {Promise<{description: string, category: string} | null>} MCC details or null.
 * @throws {Error} If Supabase query fails unexpectedly.
 */
export async function lookupMCC(mccCode) {
  if (!mccCode) return null;

  const normalizedCode = mccCode.toString().padStart(4, "0");

  if (mccCache.has(normalizedCode)) {
    logger.debug(`MCC ${normalizedCode} found in cache.`);
    return mccCache.get(normalizedCode);
  }

  try {
    logger.debug(`Looking up MCC ${normalizedCode} in database.`);
    const { data, error } = await supabase_client // Using the imported client
      .from("mcc_codes")
      .select("description, category")
      .eq("mcc_code", normalizedCode)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // "Query returned 0 rows"
        logger.warn(`MCC ${normalizedCode} not found in database.`);
        return null;
      }
      logger.error(
        `Error looking up MCC ${normalizedCode} in database:`,
        error,
      );
      throw error;
    }

    if (!data) {
      logger.warn(
        `MCC ${normalizedCode} not found in database (no data returned).`,
      );
      return null;
    }

    mccCache.set(normalizedCode, data);
    logger.debug(`MCC ${normalizedCode} cached:`, data);
    return data;
  } catch (error) {
    logger.error(`Unhandled error looking up MCC ${normalizedCode}:`, error);
    return null;
  }
}

/**
 * Batch lookup MCCs.
 * @param {string[]} mccCodes - Array of MCC codes to look up.
 * @returns {Promise<Map<string, {description: string, category: string}>>} Map of MCC codes to their details.
 */
export async function batchLookupMCCs(mccCodes) {
  if (!mccCodes || mccCodes.length === 0) return new Map();

  const normalizedCodes = mccCodes.map((code) =>
    code.toString().padStart(4, "0"),
  );
  const results = new Map();
  const uncachedCodes = [];

  for (const code of normalizedCodes) {
    if (mccCache.has(code)) {
      results.set(code, mccCache.get(code));
    } else {
      uncachedCodes.push(code);
    }
  }

  if (uncachedCodes.length > 0) {
    try {
      logger.debug(
        `Batch looking up ${uncachedCodes.length} MCCs in database:`,
        uncachedCodes,
      );
      const { data, error } = await supabase_client
        .from("mcc_codes")
        .select("mcc_code, description, category")
        .in("mcc_code", uncachedCodes);

      if (error) {
        logger.error("Error batch looking up MCCs:", error);
      } else if (data) {
        logger.debug(
          `Received ${data.length} MCCs from batch database lookup.`,
        );
        data.forEach((mcc) => {
          const detail = {
            description: mcc.description,
            category: mcc.category,
          };
          mccCache.set(mcc.mcc_code, detail);
          results.set(mcc.mcc_code, detail);
        });
      }
    } catch (error) {
      logger.error("Unhandled error during batch MCC lookup:", error);
    }
  }
  logger.debug("Batch MCC lookup completed. Results count:", results.size);
  return results;
}

/**
 * Clear the MCC cache.
 */
export function clearMCCCache() {
  logger.info("MCC cache cleared.");
  mccCache.clear();
}
