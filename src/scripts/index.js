import "dotenv/config";
import { Lithic } from "lithic";
import { createClient } from "@supabase/supabase-js";
import { getCardDetails as retrieveCardDetails } from "./cards.js"; 

// Initialize Lithic client
const lithic = new Lithic({
  apiKey: process.env.LITHIC_API_KEY,
  environment: "sandbox", // or 'production' for live
});

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

/**
 * Parse detailed transaction information
 * @param {Object} transaction - Lithic transaction object
 * @returns {Object} Parsed transaction data
 */
function parseTransactionDetails(transaction) {
  // Get the first event (most recent)
  const event =
    transaction.events && transaction.events[0] ? transaction.events[0] : {};

  // Parse amounts
  const cardholderInfo = event.amounts?.cardholder || {};
  const merchantInfo = event.amounts?.merchant || {};

  // Parse detailed results
  const result = event.result || "UNKNOWN";

  // Parse network-specific data
  let networkType = null;
  let networkTransactionId = null;
  let retrievalReferenceNumber = null;

  if (event.network_info) {
    // Get retrieval reference number from acquirer info
    retrievalReferenceNumber =
      event.network_info.acquirer?.retrieval_reference_number || null;

    // Determine network type and transaction ID based on which network has data
    if (event.network_info.visa && event.network_info.visa !== null) {
      networkType = "visa";
      networkTransactionId = event.network_info.visa.transaction_id || null;
    } else if (
      event.network_info.mastercard &&
      event.network_info.mastercard !== null
    ) {
      networkType = "mastercard";
      networkTransactionId =
        event.network_info.mastercard.transaction_id || null;
    } else if (event.network_info.amex && event.network_info.amex !== null) {
      networkType = "amex";
      networkTransactionId = event.network_info.amex.transaction_id || null;
    }

    // Fallback: if all are null but we have a transaction.network, use that
    if (!networkType && transaction.network) {
      networkType = transaction.network.toLowerCase();
    }
  }

  return {
    // Basic info
    token: transaction.token,
    card_token: transaction.card_token,
    account_token: transaction.account_token,
    network: transaction.network,
    authorization_code: transaction.authorization_code || null,

    // Cardholder amounts
    cardholder_amount: cardholderInfo.amount || 0,
    cardholder_currency: cardholderInfo.currency || "USD",
    conversion_rate: cardholderInfo.conversion_rate
      ? parseFloat(cardholderInfo.conversion_rate)
      : 1.0,

    // Merchant amounts
    merchant_amount: merchantInfo.amount || cardholderInfo.amount || 0,
    merchant_currency:
      merchantInfo.currency || cardholderInfo.currency || "USD",

    // Result
    result: result,

    // Network specific info
    retrieval_reference_number: retrievalReferenceNumber,
    network_type: networkType,
    network_transaction_id: networkTransactionId,

    // Status
    status: transaction.status,
    created_at: transaction.created,

    // Store complete response for reference
    raw_data: transaction,
  };
}

/**
 * Parse merchant information from transaction
 * @param {Object} transaction - Lithic transaction object
 * @returns {Object} Parsed merchant data
 */
function parseMerchantInfo(transaction) {
  const merchant = transaction.merchant || {};

  return {
    acceptor_id: merchant.acceptor_id || null,
    descriptor: merchant.descriptor || "Unknown Merchant",
    city: merchant.city || null,
    state: merchant.state || null,
    country: merchant.country || null,
    mcc: merchant.mcc || null,
  };
}

/**
 * Fetch transactions using Lithic client
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} Array of transactions
 */
async function fetchTransactions(params = {}) {
  try {
    const response = await lithic.transactions.list({
      page_size: 100, // Max allowed
      ...params,
    });

    // The Lithic client returns paginated results
    const transactions = [];
    for await (const transaction of response) {
      transactions.push(transaction);
    }

    // Sort by created date (newest first)
    return transactions.sort(
      (a, b) => new Date(b.created) - new Date(a.created),
    );
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }
}

/**
 * Get a specific transaction by token
 * @param {string} token - Transaction token
 * @returns {Promise<Object>} Transaction object
 */
async function getTransaction(token) {
  try {
    const transaction = await lithic.transactions.retrieve(token);
    return transaction;
  } catch (error) {
    console.error("Error fetching transaction:", error);
    throw error;
  }
}

/**
 * Get the newest transaction
 * @returns {Promise<Object|null>} Newest transaction or null
 */
async function getNewestTransaction() {
  const transactions = await fetchTransactions({ page_size: 1 });
  return transactions.length > 0 ? transactions[0] : null;
}

/**
 * Save transaction to Supabase with all details
 * @param {Object} transaction - Lithic transaction object
 */
async function saveTransactionToSupabase(transaction) {
  try {
    // Parse all transaction details
    const transactionDetails = parseTransactionDetails(transaction);
    const merchantInfo = parseMerchantInfo(transaction);

    // Check if merchant already exists
    let merchantId;
    if (merchantInfo.acceptor_id) {
      const { data: existingMerchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("acceptor_id", merchantInfo.acceptor_id)
        .single();

      if (existingMerchant) {
        merchantId = existingMerchant.id;
      } else {
        // Create new merchant
        const { data: newMerchant, error: merchantError } = await supabase
          .from("merchants")
          .insert([merchantInfo])
          .select()
          .single();

        if (merchantError) throw merchantError;
        merchantId = newMerchant.id;
      }
    }

    // Save transaction with all details
    const { error: transactionError } = await supabase
      .from("transactions")
      .upsert([transactionDetails], {
        onConflict: "token",
      });

    if (transactionError) throw transactionError;

    // Link transaction to merchant if we have a merchant
    if (merchantId) {
      const { error: linkError } = await supabase
        .from("transaction_merchants")
        .upsert(
          [
            {
              transaction_token: transaction.token,
              merchant_id: merchantId,
            },
          ],
          {
            onConflict: "transaction_token,merchant_id",
          },
        );

      if (linkError) throw linkError;
    }

    console.log(`✅ Transaction ${transaction.token} saved successfully`);
    console.log(
      `   Amount: ${transactionDetails.cardholder_currency} ${(transactionDetails.cardholder_amount / 100).toFixed(2)}`,
    );
    console.log(`   Result: ${transactionDetails.result}`);
    console.log(`   Network: ${transactionDetails.network_type || "Unknown"}`);

    return {
      success: true,
      transaction_token: transaction.token,
      merchant_id: merchantId,
      details: transactionDetails,
    };
  } catch (error) {
    console.error("❌ Error saving to Supabase:", error);
    throw error;
  }
}

/**
 * Process new transactions
 */
async function processNewTransactions() {
  try {
    console.log("🔍 Checking for new transactions...");

    // Get latest transaction from database
    const { data: latestInDb } = await supabase
      .from("transactions")
      .select("token, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Fetch recent transactions from Lithic
    const transactions = await fetchTransactions();

    // Process new transactions
    let newCount = 0;
    for (const transaction of transactions) {
      // Skip if we already have this transaction
      if (latestInDb && transaction.token === latestInDb.token) {
        break;
      }

      await saveTransactionToSupabase(transaction);
      newCount++;
    }

    if (newCount > 0) {
      // Get and display updated stats
      const stats = await getTransactionStats();
      console.log(
        `📊 Stats: ${stats.total_transactions} total, ${stats.approval_rate} approval rate`,
      );
    }

    console.log(`✅ Processed ${newCount} new transactions`);
  } catch (error) {
    console.error("❌ Error processing transactions:", error);
  }
}

/**
 * Simulate a transaction (sandbox only)
 * @param {string} pan - Card PAN to use (Required)
 * @param {number} amount - Amount in cents (Required). For credit/financial_credit, will be negative. 0 for balance_inquiry.
 * @param {string} descriptor - Merchant descriptor (Required)
 * @param {string} [mcc=null] - Merchant category code (Optional)
 * @param {string} [status='AUTHORIZATION'] - Type of event to simulate (Optional).
 * Valid values: 'AUTHORIZATION', 'BALANCE_INQUIRY', 'CREDIT_AUTHORIZATION',
 * 'FINANCIAL_AUTHORIZATION', 'FINANCIAL_CREDIT_AUTHORIZATION'.
 * @param {string} [merchant_acceptor_id=null] - Merchant acceptor ID (Optional)
 * @param {number} [merchant_amount=null] - Amount in merchant's currency (Optional)
 * @param {string} [merchant_currency=null] - 3-character ISO 4217 currency code for merchant_amount (Optional)
 * @param {boolean} [partial_approval_capable=null] - Terminal capable of partial approval (Optional)
 * @param {string} [pin=null] - Simulate PIN entry (Optional, 4-12 digits)
 */
async function simulateTransaction(
  pan,
  amount,
  descriptor,
  {
    mcc = null,
    status = "AUTHORIZATION", // API defaults to AUTHORIZATION, making it explicit here.
    merchant_acceptor_id = null,
    merchant_amount = null,
    merchant_currency = null,
    partial_approval_capable = null,
    pin = null,
  } = {}, // Options object for optional parameters
) {
  try {
    console.log(
      `🎯 Simulating transaction for ${descriptor} using PAN: ${pan.slice(0, 4)}...${pan.slice(-4)}`,
    );
    console.log(`   Amount: ${amount}, Status: ${status}`);

    const payload = {
      pan: pan,
      amount: amount,
      descriptor: descriptor,
      status: status, // status is actually a top-level parameter for this endpoint
    };

    if (mcc !== null) {
      payload.mcc = mcc;
    }
    if (merchant_acceptor_id !== null) {
      payload.merchant_acceptor_id = merchant_acceptor_id;
    }
    if (merchant_amount !== null) {
      payload.merchant_amount = merchant_amount;
    }
    if (merchant_currency !== null) {
      payload.merchant_currency = merchant_currency;
    }
    if (partial_approval_capable !== null) {
      payload.partial_approval_capable = partial_approval_capable;
    }
    if (pin !== null) {
      payload.pin = pin;
    }

    console.log("   Simulation Payload:", payload); // Log the payload for debugging

    const simulation = await lithic.transactions.simulateAuthorization(payload);

    console.log(
      `✅ Simulated transaction: ${simulation.token}, Status: ${simulation.status}, Result: ${simulation.result}`,
    );
    return simulation;
  } catch (error) {
    console.error("❌ Error simulating transaction:", error.message); // Log error message
    if (error.error?.message)
      console.error("   API Error Details:", error.error.message); // Log API specific error message
    if (error.error?.debugging_request_id)
      console.error(
        "   Debugging Request ID:",
        error.error.debugging_request_id,
      );
    throw error;
  }
}

/**
 * Get transaction with formatted amounts from DB
 */
async function getTransactionDetails(transactionToken) {
  try {
    const { data, error } = await supabase
      .from("transaction_details") // Assuming this is a view or table with joined data
      .select("*")
      .eq("token", transactionToken)
      .single();

    if (error) throw error;

    // Format the responsef
    return {
      ...data,
      formatted_cardholder_amount: `${data.cardholder_currency} ${data.cardholder_amount_usd?.toFixed(2)}`,
      formatted_merchant_amount: `${data.merchant_currency} ${data.merchant_amount_usd?.toFixed(2)}`,
      is_approved: data.result === "APPROVED",
      network_info: {
        type: data.network_type,
        transaction_id: data.network_transaction_id,
        retrieval_reference: data.retrieval_reference_number,
      },
    };
  } catch (error) {
    console.error("Error fetching transaction details from DB:", error);
    throw error;
  }
}

/**
 * Get transaction statistics
 */
async function getTransactionStats() {
  try {
    const { data, error } = await supabase
      .from("transaction_summary") // Assuming this is a view or table
      .select("*")
      .single();

    if (error) throw error;

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
    console.error("Error fetching stats:", error);
    throw error;
  }
}

/**
 * List all cards on the account
 */
async function listCards() {
  try {
    const cards = [];
    const response = await lithic.cards.list({ page_size: 100 });

    for await (const card of response) {
      cards.push({
        token: card.token,
        last_four: card.last_four,
        state: card.state,
        type: card.type,
        spend_limit: card.spend_limit,
        spend_limit_duration: card.spend_limit_duration,
      });
    }

    return cards;
  } catch (error) {
    console.error("Error listing cards:", error);
    throw error;
  }
}

// Main execution
async function main() {
  console.log("🚀 Honeypot Lithic Monitor Started");
  console.log("📡 Environment: Sandbox");
  console.log("🗄️  Database:", process.env.SUPABASE_URL);
  console.log("");

  // List available cards
  console.log("💳 Available cards:");
  const cards = await listCards();
  cards.forEach((card) => {
    console.log(
      `   - ****${card.last_four} (${card.state}) - Limit: $${(card.spend_limit / 100).toFixed(2)}`,
    );
  });
  console.log("");

  // Initial check
  await processNewTransactions();

  // Set up periodic checks (every 30 seconds)
  setInterval(processNewTransactions, 30000);
}

// Start the application
main().catch(console.error);

// Export functions for use in other modules
export {
  lithic,
  fetchTransactions,
  getTransaction,
  getNewestTransaction,
  saveTransactionToSupabase,
  getTransactionDetails, // For fetching from DB
  retrieveCardDetails as getCardDetails, // Re-export from cards.js
  parseMerchantInfo,
  parseTransactionDetails,
  getTransactionStats,
  simulateTransaction,
  listCards,
};
