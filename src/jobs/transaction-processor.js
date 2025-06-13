import * as lithic_service from "../services/lithic-service.js";
import * as supabase_service from "../services/supabase-service.js";
import * as reporting_service from "../services/reporting-service.js";
import logger from "../utils/logger.js";

/**
 * Checks for new transactions from Lithic and processes them.
 * - Fetches the timestamp of the most recent transaction from Supabase.
 * - Fetches transactions from Lithic created after this timestamp.
 * - For each new transaction, checks if it already exists (by token) to prevent duplicates
 * - Saves new, unique transactions to Supabase.
 * - Logs statistics if new transactions were processed.
 */
async function checkForNewTransactions() {
  logger.info("Starting check for new transactions...");
  try {
    const latestInDb = await supabase_service.getLatestTransactionTimestamp();
    let fetchParams = {};

    if (latestInDb && latestInDb.created_at) {
      // Fetch transactions that occurred at or after the last one stored.
      const beginDateTime = new Date(latestInDb.created_at);
      fetchParams.begin = beginDateTime.toISOString();
      logger.debug(
        {
          latestTimestamp: latestInDb.created_at,
          fetchBegin: fetchParams.begin,
        },
        "Fetching transactions at or after last known timestamp.",
      );
    } else {
      logger.info(
        "No previous transactions found in DB, or no timestamp. Fetching recent transactions.",
      );
    }

    const lithicTransactions =
      await lithic_service.fetchTransactions(fetchParams);

    if (!lithicTransactions || lithicTransactions.length === 0) {
      logger.info(
        "No new transactions found from Lithic based on current criteria.",
      );
      return;
    }

    logger.info(
      `Fetched ${lithicTransactions.length} potential new transactions from Lithic.`,
    );

    let newCount = 0;
    for (const transaction of lithicTransactions.slice().reverse()) {
      const exists = await supabase_service.checkIfTransactionExists(
        transaction.token,
      );
      if (!exists) {
        logger.debug(
          { transactionToken: transaction.token },
          "New transaction identified. Saving to Supabase.",
        );
        await supabase_service.saveTransaction(transaction);
        newCount++;
      } else {
        logger.debug(
          { transactionToken: transaction.token },
          'Transaction already exists in Supabase. Skipping save for "new" count.',
        );
      }
    }

    if (newCount > 0) {
      logger.info(
        { count: newCount },
        `Successfully processed and saved new transactions.`,
      );
      try {
        const stats = await reporting_service.getTransactionStats();
        logger.info(
          {
            totalTransactions: stats.total_transactions,
            approvalRate: stats.approval_rate,
            averageTransaction: stats.average_transaction,
          },
          `Updated transaction statistics.`,
        );
      } catch (statsError) {
        logger.error(
          { err: statsError },
          "Error fetching transaction statistics after processing new transactions.",
        );
      }
    } else {
      logger.info("No new unique transactions were saved in this cycle.");
    }
  } catch (error) {
    logger.error(
      { err: error },
      "Error during checkForNewTransactions routine.",
    );
  }
}

/**
 * Starts the transaction polling mechanism.
 * @param {number} [interval=30000] - The interval in milliseconds to check for new transactions.
 */
export function startTransactionPolling(interval = 30000) {
  logger.info(
    `Initializing transaction polling. Interval: ${interval / 1000} seconds.`,
  );
  checkForNewTransactions(); // Perform an initial check immediately
  setInterval(checkForNewTransactions, interval);
}
