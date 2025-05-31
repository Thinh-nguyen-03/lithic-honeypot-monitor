import { lithic_client } from "../config/lithic-client.js";
import logger from "../utils/logger.js";

/**
 * Fetch transactions using Lithic client.
 * @param {Object} params - Query parameters for the Lithic API.
 * @returns {Promise<Array>} Array of Lithic transaction objects.
 * @throws {Error} If fetching transactions fails.
 */
export async function fetchTransactions(params = {}) {
  try {
    logger.debug("Fetching transactions from Lithic with params:", params);
    const response = await lithic_client.transactions.list({
      page_size: 100, // Max allowed by Lithic
      ...params,
    });

    const transactions = [];
    for await (const transaction of response) {
      transactions.push(transaction);
    }

    // Sort by created date (newest first)
    const sortedTransactions = transactions.sort(
      (a, b) => new Date(b.created) - new Date(a.created),
    );
    logger.debug(
      `Fetched ${sortedTransactions.length} transactions from Lithic.`,
    );
    return sortedTransactions;
  } catch (error) {
    logger.error("Error fetching transactions from Lithic:", error);
    throw error;
  }
}

/**
 * Get a specific transaction by token from Lithic.
 * @param {string} token - Transaction token.
 * @returns {Promise<Object>} Lithic transaction object.
 * @throws {Error} If fetching the transaction fails.
 */
export async function getTransaction(token) {
  try {
    logger.debug(`Fetching transaction with token: ${token} from Lithic.`);
    const transaction = await lithic_client.transactions.retrieve(token);
    return transaction;
  } catch (error) {
    logger.error(`Error fetching transaction ${token} from Lithic:`, error);
    throw error;
  }
}

/**
 * Get the newest transaction from Lithic.
 * @returns {Promise<Object|null>} Newest Lithic transaction object or null if none found.
 * @throws {Error} If fetching transactions fails.
 */
export async function getNewestTransaction() {
  try {
    logger.debug("Fetching newest transaction from Lithic.");
    const transactions = await fetchTransactions({ page_size: 1 }); // Uses the local fetchTransactions
    return transactions.length > 0 ? transactions[0] : null;
  } catch (error) {
    logger.error("Error fetching newest transaction from Lithic:", error);
    throw error;
  }
}

/**
 * Simulate a transaction in the Lithic sandbox environment.
 * @param {string} pan - Card PAN to use (Required).
 * @param {number} amount - Amount in cents (Required).
 * @param {string} descriptor - Merchant descriptor (Required).
 * @param {Object} [options={}] - Optional parameters for simulation.
 * @param {string} [options.mcc=null] - Merchant category code.
 * @param {string} [options.status='AUTHORIZATION'] - Type of event to simulate.
 * @param {string} [options.merchant_acceptor_id=null] - Merchant acceptor ID.
 * @param {number} [options.merchant_amount=null] - Amount in merchant's currency.
 * @param {string} [options.merchant_currency=null] - 3-character ISO 4217 currency code.
 * @param {boolean} [options.partial_approval_capable=null] - Terminal capable of partial approval.
 * @param {string} [options.pin=null] - Simulate PIN entry (4-12 digits).
 * @returns {Promise<Object>} Lithic simulation response object.
 * @throws {Error} If transaction simulation fails.
 */
export async function simulateTransaction(
  pan,
  amount,
  descriptor,
  {
    mcc = null,
    status = "AUTHORIZATION",
    merchant_acceptor_id = null,
    merchant_amount = null,
    merchant_currency = null,
    partial_approval_capable = null,
    pin = null,
  } = {},
) {
  try {
    logger.debug(
      `Simulating transaction for ${descriptor} using PAN: ${pan.slice(0, 4)}...${pan.slice(-4)}`,
      { amount, status, mcc },
    );

    const payload = {
      pan,
      amount,
      descriptor,
      status,
    };

    if (mcc !== null) payload.mcc = mcc;
    if (merchant_acceptor_id !== null)
      payload.merchant_acceptor_id = merchant_acceptor_id;
    if (merchant_amount !== null) payload.merchant_amount = merchant_amount;
    if (merchant_currency !== null)
      payload.merchant_currency = merchant_currency;
    if (partial_approval_capable !== null)
      payload.partial_approval_capable = partial_approval_capable;
    if (pin !== null) payload.pin = pin;

    logger.debug("Transaction simulation payload:", payload);

    const simulation =
      await lithic_client.transactions.simulateAuthorization(payload);

    logger.info(
      `Simulated transaction: ${simulation.token}, Status: ${simulation.status}, Result: ${simulation.result}`,
    );
    
    return simulation;
  } catch (error) {
    logger.error("Error simulating transaction:", {
      message: error.message,
      apiDetails: error.error,
      panLastFour: pan.slice(-4),
    });
    throw error;
  }
}
