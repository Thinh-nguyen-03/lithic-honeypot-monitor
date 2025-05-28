/**
 * Parse detailed transaction information from a Lithic transaction object.
 * @param {Object} transaction - Lithic transaction object.
 * @returns {Object} Parsed transaction data.
 */
export function parseTransactionDetails(transaction) {
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

    // Fallback
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
 * Parse merchant information from a Lithic transaction object.
 * @param {Object} transaction - Lithic transaction object.
 * @returns {Object} Parsed merchant data.
 */
export function parseMerchantInfo(transaction) {
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