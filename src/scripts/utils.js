import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

/**
 * Get transactions formatted for Vapi agent
 */
async function getRecentTransactionsForAgent(limit = 5) {
  const { data, error } = await supabase
    .from("transaction_details")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Format for Vapi agent with all new details
  return data.map((t) => ({
    timestamp: new Date(t.created_at).toLocaleString(),
    merchant: t.merchant_name || "Unknown",
    location: [t.merchant_city, t.merchant_state, t.merchant_country]
      .filter(Boolean)
      .join(", "),
    amount: `${t.cardholder_currency} ${t.cardholder_amount_usd?.toFixed(2)}`,
    merchant_amount:
      t.merchant_amount_usd !== t.cardholder_amount_usd
        ? `${t.merchant_currency} ${t.merchant_amount_usd?.toFixed(2)}`
        : null,
    status: t.result,
    is_approved: t.result === "APPROVED",
    network: t.network_type?.toUpperCase() || "Unknown",
    authorization_code: t.authorization_code,
    reference_number: t.retrieval_reference_number,
    category: t.merchant_category,
  }));
}

/**
 * Get network-specific stats
 */
async function getNetworkStats() {
  const { data, error } = await supabase
    .from("transactions")
    .select("network_type")
    .not("network_type", "is", null);

  if (error) throw error;

  const stats = data.reduce((acc, t) => {
    acc[t.network_type] = (acc[t.network_type] || 0) + 1;
    return acc;
  }, {});

  return stats;
}

/**
 * Get declined transactions for analysis
 */
async function getDeclinedTransactions(limit = 10) {
  const { data, error } = await supabase
    .from("transaction_details")
    .select("*")
    .neq("result", "APPROVED")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return data.map((t) => ({
    token: t.token,
    timestamp: t.created_at,
    merchant: t.merchant_name,
    amount: `${t.cardholder_currency} ${t.cardholder_amount_usd?.toFixed(2)}`,
    result: t.result,
    network: t.network_type,
  }));
}

/**
 * Check for currency conversion transactions
 */
async function getCurrencyConversionTransactions() {
  const { data, error } = await supabase
    .from("transaction_details")
    .select("*")
    .neq("cardholder_currency", "merchant_currency")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data.map((t) => ({
    token: t.token,
    merchant: t.merchant_name,
    cardholder_amount: `${t.cardholder_currency} ${t.cardholder_amount_usd?.toFixed(2)}`,
    merchant_amount: `${t.merchant_currency} ${t.merchant_amount_usd?.toFixed(2)}`,
    conversion_rate: t.conversion_rate,
  }));
}

export {
  getRecentTransactionsForAgent,
  getNetworkStats,
  getDeclinedTransactions,
  getCurrencyConversionTransactions,
};
