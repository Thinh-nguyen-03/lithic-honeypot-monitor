import express from "express";
import { config } from "../config/index.js";
import lithic_webhook_routes from "./routes/lithic-webhook-routes.js";
import logger from "../utils/logger.js";

const app = express();

// Middleware for parsing raw request body for webhook signature verification.
app.use(
  "/webhooks",
  express.raw({ type: "application/json" }),
  lithic_webhook_routes,
);

// Middleware for parsing JSON request bodies for other routes
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  logger.debug("Health check endpoint hit.");
  res.status(200).json({
    status: "healthy",
    service: "honeypot-transaction-monitor-api",
    timestamp: new Date().toISOString(),
  });
});

// Catch-all for unhandled routes
app.use((req, res) => {
  logger.warn({ path: req.path }, "Unhandled route accessed.");
  res.status(404).json({ error: "Not Found" });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(
    { err, path: req.path, method: req.method },
    "Unhandled API error occurred.",
  );
  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: err.message || "An unexpected error occurred.",
  });
});

export function startServer() {
  app.listen(config.server.port, () => {
    logger.info(
      `API Server (including webhooks) listening on port ${config.server.port}`,
    );
    logger.info(`Node Environment: ${config.server.nodeEnv}`);
    // Constructing the full webhook URL if a base URL is known
    const baseUrl =
      process.env.APP_BASE_URL || `http://localhost:${config.server.port}`;
    logger.info(`Expected Lithic Webhook URL: ${baseUrl}/webhooks/lithic`);
  });
}
