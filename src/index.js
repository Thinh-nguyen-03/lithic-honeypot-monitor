import { startServer } from "./api/server.js";
import { startTransactionPolling } from "./jobs/transaction-processor.js";
import logger from "./utils/logger.js";
import { config } from "./config/index.js";

function main() {
  logger.info("🚀 Honeypot Lithic Monitor Starting...");
  logger.info(`Environment: ${config.server.nodeEnv}`);

  // Start the webhook API server
  startServer();

  // Start the transaction polling job
  if (process.env.ENABLE_POLLING !== "false") {
    startTransactionPolling(
      process.env.POLLING_INTERVAL_MS
        ? parseInt(process.env.POLLING_INTERVAL_MS)
        : 30000,
    );
  } else {
    logger.info("Transaction polling is disabled via environment variable.");
  }
}

main();
