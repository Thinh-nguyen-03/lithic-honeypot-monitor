import "dotenv/config";
import express from "express";
import { Lithic } from "lithic";
import { saveTransactionToSupabase, getTransaction } from "./index.js";

const app = express();

// Use raw body for webhook signature verification
app.use("/webhooks/lithic", express.raw({ type: "application/json" }));
app.use(express.json());

// Initialize Lithic client
const lithic = new Lithic({
  apiKey: process.env.LITHIC_API_KEY,
  environment: "sandbox",
});

// Webhook endpoint
app.post("/webhooks/lithic", async (req, res) => {
  try {
    // Verify webhook signature if in production
    if (process.env.NODE_ENV === "production") {
      const signature = req.headers["webhook-signature"];
      const webhookSecret = process.env.LITHIC_WEBHOOK_SECRET;

      // Lithic provides webhook verification
      const isValid = lithic.webhooks.verifySignature(
        req.body,
        signature,
        webhookSecret,
      );

      if (!isValid) {
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Parse the webhook payload
    const event =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    console.log(`📨 Received webhook: ${event.type}`);

    // Process different event types
    switch (event.type) {
      case "transaction.created":
      case "transaction.updated":
        // Fetch full transaction details
        const transaction = await getTransaction(event.payload.token);
        await saveTransactionToSupabase(transaction);
        console.log(`✅ Processed transaction ${event.payload.token}`);
        break;

      case "card.created":
        console.log(`💳 New card created: ${event.payload.token}`);
        // You could store card info if needed
        break;

      case "card.updated":
        console.log(`💳 Card updated: ${event.payload.token}`);
        break;

      default:
        console.log(`ℹ️  Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ status: "healthy", service: "lithic-webhook-handler" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎣 Webhook server listening on port ${PORT}`);
  console.log(`📍 Webhook URL: https://your-domain.com/webhooks/lithic`);
});
