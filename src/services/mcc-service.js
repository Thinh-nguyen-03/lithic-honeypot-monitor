import { supabase_client } from "../config/supabase-client.js";
import logger from "../utils/logger.js";
import fs from "fs";
import csv from "csv-parser";
import path from "path";
import { fileURLToPath } from "url";

// Get current file directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache for MCC lookups to reduce database calls
const mccCache = new Map();

// In-memory store for CSV MCC data
let csvMccData = new Map();
let csvDataLoaded = false;

/**
 * Load MCC data from CSV file
 * @returns {Promise<void>}
 */
async function loadMccDataFromCsv() {
  if (csvDataLoaded) {
    return;
  }
  
  return new Promise((resolve, reject) => {
    const csvPath = path.join(__dirname, '../../data/mcc_codes_rows.csv');
    
    logger.info('Loading MCC data from CSV file:', csvPath);
    
    // Check if file exists
    if (!fs.existsSync(csvPath)) {
      const error = new Error(`CSV file not found at path: ${csvPath}`);
      logger.error('CSV file does not exist:', error.message);
      reject(error);
      return;
    }
    
    let rowCount = 0;
    
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        // CSV columns: mcc_code, description, category
        if (row.mcc_code && row.description) {
          const normalizedCode = row.mcc_code.toString().padStart(4, '0');
          csvMccData.set(normalizedCode, {
            description: row.description,
            category: row.category || 'Unknown',
            source: 'csv'
          });
        } else {
          logger.debug(`Skipping invalid CSV row ${rowCount}:`, row);
        }
      })
      .on('end', () => {
        csvDataLoaded = true;
        logger.info(`Successfully loaded ${csvMccData.size} MCC codes from CSV file`);
        resolve();
      })
      .on('error', (error) => {
        logger.error('Error loading MCC data from CSV:', error);
        reject(error);
      });
  });
}

/**
 * Get MCC data from CSV (with lazy loading)
 * @param {string} mccCode - The MCC code to look up
 * @returns {Promise<{description: string, category: string, source: string} | null>}
 */
async function getMccFromCsv(mccCode) {
  if (!csvDataLoaded) {
    try {
      await loadMccDataFromCsv();
    } catch (error) {
      logger.warn('Failed to load CSV data, continuing without it:', error.message);
      return null;
    }
  }
  
  const normalizedCode = mccCode.toString().padStart(4, '0');
  return csvMccData.get(normalizedCode) || null;
}

/**
 * Look up MCC information from multiple sources (CSV first, then database)
 * @param {string} mccCode - The MCC code to look up.
 * @returns {Promise<{description: string, category: string, source: string} | null>} MCC details or null.
 * @throws {Error} If Supabase query fails unexpectedly.
 */
export async function lookupMCC(mccCode) {
  if (!mccCode) return null;

  const normalizedCode = mccCode.toString().padStart(4, "0");

  // Check cache first
  if (mccCache.has(normalizedCode)) {
    logger.debug(`MCC ${normalizedCode} found in cache.`);
    return mccCache.get(normalizedCode);
  }

  // Try CSV data first (comprehensive and fast)
  try {
    const csvResult = await getMccFromCsv(normalizedCode);
    if (csvResult) {
      logger.debug(`MCC ${normalizedCode} found in CSV data.`);
      mccCache.set(normalizedCode, csvResult);
      return csvResult;
    }
  } catch (error) {
    logger.warn(`Error accessing CSV MCC data for ${normalizedCode}:`, error);
  }

  // Fallback to database lookup
  try {
    logger.debug(`Looking up MCC ${normalizedCode} in database.`);
    const { data, error } = await supabase_client
      .from("mcc_codes")
      .select("description, category")
      .eq("mcc_code", normalizedCode)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        logger.warn(`MCC ${normalizedCode} not found in database or CSV.`);
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

    const result = { ...data, source: 'database' };
    mccCache.set(normalizedCode, result);
    logger.debug(`MCC ${normalizedCode} cached from database:`, result);
    return result;
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
 * Get all MCC codes from CSV data
 * @returns {Promise<Array<{mcc_code: string, description: string, category: string}>>}
 */
export async function getAllMccCodes() {
  if (!csvDataLoaded) {
    await loadMccDataFromCsv();
  }
  
  const codes = [];
  for (const [mccCode, data] of csvMccData.entries()) {
    codes.push({
      mcc_code: mccCode,
      description: data.description,
      category: data.category
    });
  }
  
  return codes.sort((a, b) => a.mcc_code.localeCompare(b.mcc_code));
}

/**
 * Get MCC codes by category
 * @param {string} category - Category to filter by
 * @returns {Promise<Array<{mcc_code: string, description: string, category: string}>>}
 */
export async function getMccCodesByCategory(category) {
  if (!csvDataLoaded) {
    await loadMccDataFromCsv();
  }
  
  const codes = [];
  for (const [mccCode, data] of csvMccData.entries()) {
    if (data.category && data.category.toLowerCase().includes(category.toLowerCase())) {
      codes.push({
        mcc_code: mccCode,
        description: data.description,
        category: data.category
      });
    }
  }
  
  return codes.sort((a, b) => a.mcc_code.localeCompare(b.mcc_code));
}

/**
 * Get suspicious MCC codes (commonly associated with fraud)
 * @returns {Promise<Array<{mcc_code: string, description: string, category: string, riskLevel: string}>>}
 */
export async function getSuspiciousMccCodes() {
  const suspiciousRanges = [
    { start: 5960, end: 5969, risk: 'HIGH', reason: 'Direct Marketing/Telemarketing' },
    { start: 4829, end: 4829, risk: 'HIGH', reason: 'Money Transfer' },
    { start: 6010, end: 6012, risk: 'MEDIUM', reason: 'Financial Institution Cash' },
    { start: 6051, end: 6051, risk: 'HIGH', reason: 'Quasi-cash merchants' },
    { start: 7273, end: 7273, risk: 'MEDIUM', reason: 'Dating services' },
    { start: 7276, end: 7278, risk: 'MEDIUM', reason: 'Counseling services' },
    { start: 7321, end: 7321, risk: 'MEDIUM', reason: 'Credit reporting' },
    { start: 7800, end: 7802, risk: 'HIGH', reason: 'Government gambling' },
    { start: 7995, end: 7996, risk: 'HIGH', reason: 'Gambling/Fortune telling' }
  ];
  
  if (!csvDataLoaded) {
    await loadMccDataFromCsv();
  }
  
  const suspiciousCodes = [];
  
  for (const [mccCode, data] of csvMccData.entries()) {
    const numericCode = parseInt(mccCode);
    
    for (const range of suspiciousRanges) {
      if (numericCode >= range.start && numericCode <= range.end) {
        suspiciousCodes.push({
          mcc_code: mccCode,
          description: data.description,
          category: data.category,
          riskLevel: range.risk,
          reason: range.reason
        });
        break;
      }
    }
  }
  
  return suspiciousCodes.sort((a, b) => a.mcc_code.localeCompare(b.mcc_code));
}

/**
 * Get MCC data statistics
 * @returns {Promise<{totalCodes: number, categories: Array<string>, csvLoaded: boolean}>}
 */
export async function getMccStatistics() {
  if (!csvDataLoaded) {
    try {
      await loadMccDataFromCsv();
    } catch (error) {
      return {
        totalCodes: 0,
        categories: [],
        csvLoaded: false,
        error: error.message
      };
    }
  }
  
  const categories = new Set();
  for (const [, data] of csvMccData.entries()) {
    if (data.category) {
      categories.add(data.category);
    }
  }
  
  return {
    totalCodes: csvMccData.size,
    categories: Array.from(categories).sort(),
    csvLoaded: true
  };
}

/**
 * Clear the MCC cache.
 */
export function clearMCCCache() {
  logger.info("MCC cache cleared.");
  mccCache.clear();
}
