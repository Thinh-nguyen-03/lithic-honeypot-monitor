import { supabase_client } from "../config/supabase-client.js";
import logger from "../utils/logger.js";

// Query classification keywords for natural language processing (moved from controller)
const queryClassification = {
  recent: ['last', 'recent', 'latest', 'new', 'current', 'newest'],
  merchant: ['from', 'at', 'merchant', 'store', 'shop', 'bought', 'purchased', 'where', 'vendor', 'retailer'],
  statistics: ['stats', 'total', 'count', 'summary', 'how much', 'spent', 'average', 'analytics', 'report'],
  specific: ['transaction', 'purchase', 'payment', 'charge', 'txn', 'id'],
  verification: ['verify', 'confirm', 'check', 'validate', 'authenticate', 'suspicious', 'fraud'],
  amount: ['amount', 'cost', 'price', 'dollar', '$', 'spend', 'money', 'value', 'worth'],
  location: ['location', 'where', 'city', 'state', 'country', 'address', 'place', 'region'],
  time: ['when', 'time', 'date', 'hour', 'minute', 'ago', 'yesterday', 'today', 'before', 'after'],
  timeRange: ['hour', 'hours', 'today', 'yesterday', 'week', 'month', 'day', 'days', 'weekend', 'weekday'],
  amountRange: ['large', 'small', 'big', 'little', 'expensive', 'cheap', 'over', 'under', 'above', 'below', 'between'],
  pattern: ['pattern', 'unusual', 'strange', 'suspicious', 'frequent', 'repeated', 'anomaly', 'outlier'],
  category: ['category', 'type', 'kind', 'mcc', 'business', 'industry', 'sector'],
  network: ['visa', 'mastercard', 'amex', 'discover', 'network', 'card', 'credit', 'debit'],
  status: ['approved', 'declined', 'pending', 'failed', 'successful', 'rejected'],
  intelligence: ['analyze', 'analysis', 'insight', 'intelligence', 'behavior', 'trend', 'risk'],
  comparison: ['compare', 'versus', 'vs', 'difference', 'similar', 'like', 'unlike'],
  frequency: ['often', 'rarely', 'never', 'always', 'sometimes', 'frequency', 'regular', 'irregular'],
  geography: ['domestic', 'international', 'foreign', 'local', 'nearby', 'distant', 'cross-border'],
  security: ['security', 'risk', 'threat', 'safe', 'unsafe', 'secure', 'alert', 'warning']
};

/**
 * Get recent transactions formatted for conversational AI agents or similar use case.
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

/**
 * Classify query type based on keywords (moved from controller)
 * @param {string} query - Natural language query
 * @returns {Array} Array of classification categories
 */
export function classifyQuery(query) {
  const lowerQuery = query.toLowerCase();
  const classifications = [];
  
  for (const [category, keywords] of Object.entries(queryClassification)) {
    if (keywords.some(keyword => lowerQuery.includes(keyword))) {
      classifications.push(category);
    }
  }
  
  return classifications.length > 0 ? classifications : ['general'];
}

/**
 * Extract time filter criteria from natural language query (moved from controller)
 * @param {string} query - Natural language query
 * @returns {Object|null} Time filter configuration
 */
export function extractTimeFilter(query) {
  const lowerQuery = query.toLowerCase();
  
  // Time patterns with their corresponding filters
  const timePatterns = [
    {
      patterns: ['last hour', 'past hour', 'within hour'],
      filter: { hours: 1, description: 'last hour' }
    },
    {
      patterns: ['last 2 hours', 'past 2 hours', 'within 2 hours'],
      filter: { hours: 2, description: 'last 2 hours' }
    },
    {
      patterns: ['today', 'this day'],
      filter: { days: 1, startOfDay: true, description: 'today' }
    },
    {
      patterns: ['yesterday'],
      filter: { days: 1, dayOffset: -1, description: 'yesterday' }
    },
    {
      patterns: ['last 24 hours', 'past 24 hours', 'past day'],
      filter: { hours: 24, description: 'last 24 hours' }
    },
    {
      patterns: ['this week', 'last week', 'past week'],
      filter: { days: 7, description: 'this week' }
    },
    {
      patterns: ['last 3 days', 'past 3 days'],
      filter: { days: 3, description: 'last 3 days' }
    },
    {
      patterns: ['this month', 'last month', 'past month'],
      filter: { days: 30, description: 'this month' }
    }
  ];
  
  for (const timePattern of timePatterns) {
    if (timePattern.patterns.some(pattern => lowerQuery.includes(pattern))) {
      return timePattern.filter;
    }
  }
  
  return null;
}

/**
 * Filter transactions based on time criteria (moved from controller)
 * @param {Array} transactions - Array of transactions
 * @param {Object} timeFilter - Time filter configuration
 * @returns {Array} Filtered transactions
 */
export function filterTransactionsByTime(transactions, timeFilter) {
  const now = new Date();
  let filterDate;
  
  if (timeFilter.hours) {
    filterDate = new Date(now.getTime() - (timeFilter.hours * 60 * 60 * 1000));
  } else if (timeFilter.days) {
    if (timeFilter.startOfDay) {
      // For "today", start from beginning of current day
      filterDate = new Date(now);
      filterDate.setHours(0, 0, 0, 0);
      if (timeFilter.dayOffset) {
        filterDate.setDate(filterDate.getDate() + timeFilter.dayOffset);
      }
    } else {
      // For "last X days", go back X days from now
      filterDate = new Date(now.getTime() - (timeFilter.days * 24 * 60 * 60 * 1000));
    }
  } else {
    return transactions; // No valid time filter
  }
  
  return transactions.filter(transaction => {
    const transactionDate = new Date(transaction.timestamp || transaction.created_at);
    return transactionDate >= filterDate;
  });
}

/**
 * Extract amount filter criteria from natural language query (moved from controller)
 * @param {string} query - Natural language query
 * @returns {Object|null} Amount filter configuration
 */
export function extractAmountFilter(query) {
  const lowerQuery = query.toLowerCase();
  
  // Amount patterns with their corresponding filters
  const amountPatterns = [
    {
      patterns: ['large', 'big', 'expensive', 'high'],
      filter: { type: 'large', minAmount: 100, description: 'large transactions (>$100)' }
    },
    {
      patterns: ['small', 'little', 'cheap', 'low'],
      filter: { type: 'small', maxAmount: 10, description: 'small transactions (<$10)' }
    },
    {
      patterns: ['medium', 'moderate'],
      filter: { type: 'medium', minAmount: 10, maxAmount: 100, description: 'medium transactions ($10-$100)' }
    },
    {
      patterns: ['over 100', 'above 100', 'more than 100'],
      filter: { type: 'custom', minAmount: 100, description: 'transactions over $100' }
    },
    {
      patterns: ['under 50', 'below 50', 'less than 50'],
      filter: { type: 'custom', maxAmount: 50, description: 'transactions under $50' }
    },
    {
      patterns: ['over 50', 'above 50', 'more than 50'],
      filter: { type: 'custom', minAmount: 50, description: 'transactions over $50' }
    }
  ];
  
  for (const amountPattern of amountPatterns) {
    if (amountPattern.patterns.some(pattern => lowerQuery.includes(pattern))) {
      return amountPattern.filter;
    }
  }
  
  // Look for specific dollar amounts
  const dollarMatch = lowerQuery.match(/[\$]?(\d+)/);
  if (dollarMatch) {
    const amount = parseInt(dollarMatch[1]);
    if (lowerQuery.includes('over') || lowerQuery.includes('above') || lowerQuery.includes('more than')) {
      return { 
        type: 'custom', 
        minAmount: amount, 
        description: `transactions over $${amount}` 
      };
    } else if (lowerQuery.includes('under') || lowerQuery.includes('below') || lowerQuery.includes('less than')) {
      return { 
        type: 'custom', 
        maxAmount: amount, 
        description: `transactions under $${amount}` 
      };
    }
  }
  
  return null;
}

/**
 * Filter transactions based on amount criteria (moved from controller)
 * @param {Array} transactions - Array of transactions
 * @param {Object} amountFilter - Amount filter configuration
 * @returns {Array} Filtered transactions
 */
export function filterTransactionsByAmount(transactions, amountFilter) {
  return transactions.filter(transaction => {
    // Extract numeric amount from transaction (handle various formats)
    const amountStr = transaction.amount || transaction.formatted_cardholder_amount || '0';
    const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
    
    if (isNaN(amount)) return false;
    
    // Apply min/max amount filters
    if (amountFilter.minAmount !== undefined && amount < amountFilter.minAmount) {
      return false;
    }
    if (amountFilter.maxAmount !== undefined && amount > amountFilter.maxAmount) {
      return false;
    }
    
    return true;
  });
}

/**
 * Process transaction search query with comprehensive filtering and analysis.
 * This function contains the core logic moved from handleTransactionSearch in the controller.
 * 
 * @param {string} query - Natural language search query
 * @param {number} limit - Maximum number of results to return
 * @param {string} cardToken - Optional card token for filtering
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Object>} Processed search results
 */
export async function processTransactionSearchQuery(query, limit = 5, cardToken, requestId) {
  logger.debug({
    requestId,
    query,
    limit,
    cardToken
  }, 'Processing enhanced transaction search query in reporting service');

  // Classify the query with enhanced categorization
  const queryType = classifyQuery(query);
  
  let transactions = [];
  let searchSummary = '';
  let appliedFilters = [];
  
  // Get base transaction data
  const baseTransactionLimit = Math.max(limit * 5, 50); // Get more data for filtering
  let baseTransactions = await getRecentTransactionsForAgent(baseTransactionLimit);
  
  // Apply time-based filtering
  if (queryType.includes('timeRange') || queryType.includes('time')) {
    const timeFilter = extractTimeFilter(query);
    if (timeFilter) {
      baseTransactions = filterTransactionsByTime(baseTransactions, timeFilter);
      appliedFilters.push(`time: ${timeFilter.description}`);
      logger.debug({ requestId, timeFilter }, 'Applied time filter');
    }
  }
  
  // Apply amount-based filtering
  if (queryType.includes('amountRange') || queryType.includes('amount')) {
    const amountFilter = extractAmountFilter(query);
    if (amountFilter) {
      baseTransactions = filterTransactionsByAmount(baseTransactions, amountFilter);
      appliedFilters.push(`amount: ${amountFilter.description}`);
      logger.debug({ requestId, amountFilter }, 'Applied amount filter');
    }
  }

  // Route based on primary query classification
  if (queryType.includes('recent')) {
    transactions = baseTransactions.slice(0, limit);
    searchSummary = `Recent ${limit} transactions`;
  } else if (queryType.includes('merchant')) {
    // Extract merchant name from query (basic implementation for now)
    const merchantMatch = query.match(/(?:from|at|merchant)\s+([a-zA-Z0-9\s]+)/i);
    const merchantName = merchantMatch ? merchantMatch[1].trim() : null;
    
    if (merchantName) {
      transactions = baseTransactions.filter(t => 
        t.merchant.toLowerCase().includes(merchantName.toLowerCase())
      ).slice(0, limit);
      searchSummary = `Transactions from ${merchantName}`;
      appliedFilters.push(`merchant: ${merchantName}`);
    } else {
      transactions = baseTransactions.slice(0, limit);
      searchSummary = `Recent transactions (merchant query unclear)`;
    }
  } else if (queryType.includes('statistics')) {
    // Basic statistics implementation - can be enhanced later
    const stats = {
      totalTransactions: baseTransactions.length,
      totalAmount: baseTransactions.reduce((sum, t) => {
        const amount = parseFloat((t.amount || '0').replace(/[^0-9.-]/g, ''));
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0),
      averageAmount: 0,
      merchants: [...new Set(baseTransactions.map(t => t.merchant))]
    };
    stats.averageAmount = stats.totalTransactions > 0 ? stats.totalAmount / stats.totalTransactions : 0;
    
    return {
      queryType: 'statistics',
      statistics: stats,
      appliedFilters,
      summary: 'Enhanced transaction statistics and summary data'
    };
  } else {
    // Enhanced default handling
    transactions = baseTransactions.slice(0, limit);
    searchSummary = appliedFilters.length > 0 ? 
      `Filtered transactions` : 
      `Recent transactions`;
  }

  // Add summary of applied filters
  if (appliedFilters.length > 0) {
    searchSummary += ` (filters: ${appliedFilters.join(', ')})`;
  }

  // Generate enhanced query insights
  const queryInsights = {
    totalAvailable: baseTransactions.length,
    filtersApplied: appliedFilters.length,
    processingNote: appliedFilters.length > 0 ? 
      'Results filtered based on query criteria' : 
      'No specific filters applied'
  };

  // Basic verification data generation
  const verificationData = {
    suggestions: [
      'Ask about specific transaction amounts',
      'Verify merchant names and locations',
      'Confirm transaction timestamps'
    ],
    transactionCount: transactions.length
  };
    
  return {
    queryType: queryType.join(', '),
    transactions: transactions,
    summary: searchSummary,
    resultsCount: transactions.length,
    appliedFilters,
    verificationData,
    queryInsights
  };
}
