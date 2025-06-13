import { supabase_client } from "../config/supabase-client.js";
import logger from "../utils/logger.js";

/**
 * Get recent transactions formatted for a Vapi agent or similar use case.
 * @param {number} [limit=5] - Number of recent transactions to fetch.
 * @returns {Promise<Array>} Array of formatted transaction objects.
 * @throws {Error} If fetching from Supabase fails.
 */
export async function getRecentTransactionsForAgent(limit = 5) {
  try {
    logger.debug(`Fetching ${limit} recent transactions for agent.`);
    const { data, error } = await supabase_client
      .from("transaction_details")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Error fetching recent transactions for agent:", error);
      throw error;
    }

    if (!data) return [];

    // Enhanced transaction mapping with proper categorization
    const enhancedTransactions = await Promise.all(
      data.map(async (t) => {
        let category = "Unknown Category";
        let description = "Unknown Description";
        
        // First, try using the already-populated mcc_category and mcc_description from database
        if (t.mcc_category) {
          category = t.mcc_category;
          logger.debug(`Using mcc_category from database for ${t.token}: ${t.mcc_category}`);
        }
        if (t.mcc_description) {
          description = t.mcc_description;
          logger.debug(`Using mcc_description from database for ${t.token}: ${t.mcc_description}`);
        }
        
        // Only do MCC lookup if category or description is missing
        if ((!t.mcc_category || !t.mcc_description) && t.merchant_mcc_code) {
          try {
            logger.debug(`Looking up MCC code ${t.merchant_mcc_code} for transaction ${t.token}`);
            const mccData = await lookupMCC(t.merchant_mcc_code);
            
            if (mccData) {
              if (!t.mcc_category && mccData.category) {
                category = mccData.category;
              }
              if (!t.mcc_description && mccData.description) {
                description = mccData.description;
              }
              logger.debug(`MCC ${t.merchant_mcc_code} resolved to category: ${category}, description: ${description}`);
            } else {
              logger.warn(`MCC lookup returned null for code ${t.merchant_mcc_code}`);
            }
          } catch (error) {
            logger.warn(`Failed to lookup MCC ${t.merchant_mcc_code}:`, error.message);
          }
        }
        
        // Fallback: if we still don't have category but have description, use description as category
        if (category === "Unknown Category" && description !== "Unknown Description") {
          category = description;
          logger.debug(`Using description as category fallback for ${t.token}: ${description}`);
        }
        // Fallback: if we still don't have description but have category, use category as description
        else if (description === "Unknown Description" && category !== "Unknown Category") {
          description = category;
          logger.debug(`Using category as description fallback for ${t.token}: ${category}`);
        }
        
        if (!t.mcc_category && !t.mcc_description && !t.merchant_mcc_code) {
          logger.debug(`No MCC code, category, or description found for transaction ${t.token}`);
        }

        return {
          token: t.token,
          timestamp: new Date(t.created_at).toLocaleString(),
          merchant: t.merchant_name || "Unknown Merchant",
          location:
            [t.merchant_city, t.merchant_state, t.merchant_country]
              .filter(Boolean)
              .join(", ") || "Unknown Location",
          amount: `${t.cardholder_currency} ${t.cardholder_amount_usd?.toFixed(2)}`,
          merchant_amount:
            t.merchant_amount_usd !== t.cardholder_amount_usd
              ? `${t.merchant_currency} ${t.merchant_amount_usd?.toFixed(2)}`
              : null,
          status: t.result,
          is_approved: t.result === "APPROVED",
          network: t.network_type?.toUpperCase() || "Unknown Network",
          authorization_code: t.authorization_code,
          reference_number: t.retrieval_reference_number,
          description: description, // Merchant description from database or MCC lookup
          category: category, // Enhanced category from database or MCC lookup
          merchant_mcc: t.merchant_mcc_code, // Include MCC code for reference
        };
      })
    );

    logger.debug(`Successfully processed ${enhancedTransactions.length} transactions with categories`);
    return enhancedTransactions;
  } catch (error) {
    logger.error(
      "Unhandled error fetching recent transactions for agent:",
      error,
    );
    throw error;
  }
}

/**
 * Get network-specific transaction count statistics.
 * @returns {Promise<Object>} Object with network types as keys and counts as values.
 * @throws {Error} If fetching from Supabase fails.
 */
export async function getNetworkStats() {
  try {
    logger.debug("Fetching network transaction statistics.");
    const { data, error } = await supabase_client
      .from("transactions")
      .select("network_type")
      .not("network_type", "is", null);

    if (error) {
      logger.error("Error fetching network stats:", error);
      throw error;
    }

    if (!data) return {};

    const stats = data.reduce((acc, t) => {
      const network = t.network_type || "UNKNOWN";
      acc[network] = (acc[network] || 0) + 1;
      return acc;
    }, {});
    return stats;
  } catch (error) {
    logger.error("Unhandled error fetching network stats:", error);
    throw error;
  }
}

/**
 * Get declined transactions for analysis.
 * @param {number} [limit=10] - Number of declined transactions to fetch.
 * @returns {Promise<Array>} Array of formatted declined transaction objects.
 * @throws {Error} If fetching from Supabase fails.
 */
export async function getDeclinedTransactions(limit = 10) {
  try {
    logger.debug(`Fetching ${limit} declined transactions.`);
    const { data, error } = await supabase_client
      .from("transaction_details")
      .select(
        "token, created_at, merchant_name, cardholder_currency, cardholder_amount_usd, result, network_type",
      )
      .neq("result", "APPROVED")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Error fetching declined transactions:", error);
      throw error;
    }

    if (!data) return [];

    return data.map((t) => ({
      token: t.token,
      timestamp: t.created_at,
      merchant: t.merchant_name || "Unknown Merchant",
      amount: `${t.cardholder_currency} ${t.cardholder_amount_usd?.toFixed(2)}`,
      result: t.result,
      network: t.network_type || "Unknown Network",
    }));
  } catch (error) {
    logger.error("Unhandled error fetching declined transactions:", error);
    throw error;
  }
}

/**
 * Check for currency conversion transactions.
 * @returns {Promise<Array>} Array of formatted currency conversion transaction objects.
 * @throws {Error} If fetching from Supabase fails.
 */
export async function getCurrencyConversionTransactions() {
  try {
    logger.debug("Fetching currency conversion transactions.");
    const { data, error } = await supabase_client
      .from("transaction_details")
      .select(
        "token, merchant_name, cardholder_currency, cardholder_amount_usd, merchant_currency, merchant_amount_usd, conversion_rate",
      )
      .neq(
        "cardholder_currency",
        supabase_client.client.functions.sql("merchant_currency"),
      )
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error fetching currency conversion transactions:", error);
      throw error;
    }

    if (!data) return [];

    return data.map((t) => ({
      token: t.token,
      merchant: t.merchant_name || "Unknown Merchant",
      cardholder_amount: `${t.cardholder_currency} ${t.cardholder_amount_usd?.toFixed(2)}`,
      merchant_amount: `${t.merchant_currency} ${t.merchant_amount_usd?.toFixed(2)}`,
      conversion_rate: t.conversion_rate,
    }));
  } catch (error) {
    logger.error(
      "Unhandled error fetching currency conversion transactions:",
      error,
    );
    throw error;
  }
}

/**
 * Get overall transaction statistics from the database.
 * @returns {Promise<Object>} Object containing transaction statistics.
 * @throws {Error} If fetching from Supabase fails.
 */
export async function getTransactionStats() {
  try {
    logger.debug("Fetching overall transaction statistics from DB.");
    const { data, error } = await supabase_client
      .from("transaction_summary")
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        logger.warn("No transaction summary data found in DB.");
        return {
          // Return default empty stats
          total_transactions: 0,
          approved_count: 0,
          total_amount_usd: 0,
          approval_rate: "0%",
          average_transaction: "USD 0.00",
        };
      }
      logger.error("Error fetching transaction stats from DB:", error);
      throw error;
    }

    if (!data) {
      return {
        total_transactions: 0,
        approved_count: 0,
        total_amount_usd: 0,
        approval_rate: "0%",
        average_transaction: "USD 0.00",
      };
    }

    return {
      ...data,
      approval_rate:
        data.total_transactions > 0
          ? ((data.approved_count / data.total_transactions) * 100).toFixed(2) +
            "%"
          : "0%",
      average_transaction:
        data.total_transactions > 0
          ? `USD ${(data.total_amount_usd / data.total_transactions).toFixed(2)}`
          : "USD 0.00",
    };
  } catch (error) {
    logger.error("Unhandled error fetching transaction stats from DB:", error);
    throw error;
  }
}
