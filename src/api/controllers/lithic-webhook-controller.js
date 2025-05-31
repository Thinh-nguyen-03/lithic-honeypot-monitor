import { config } from "../../config/index.js";
import { lithic_client } from "../../config/lithic-client.js";
import * as lithic_service from "../../services/lithic-service.js";
import * as supabase_service from "../../services/supabase-service.js";
import alertService from "../../services/alert-service.js";
import logger from "../../utils/logger.js";

/**
 * Handles incoming Lithic webhook events.
 * Verifies webhook signature in production.
 * Processes transaction and card events by saving/updating data via services.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export async function handleLithicEvent(req, res) {
  const webhookId = req.headers["webhook-id"] || "unknown_webhook_id";
  const eventType =
    req.body && typeof req.body === "object" && req.body.type
      ? req.body.type
      : "unknown_event_type";

  logger.info(
    {
      webhookId,
      eventTypeHeader: req.headers["webhook-event-type"],
      remoteAddress: req.ip,
    },
    "Received webhook request.",
  );

  try {
    // Verify webhook signature if in production
    if (config.server.nodeEnv === "production") {
      const signature = req.headers["webhook-signature"];
      const webhookSecret = config.lithic.webhookSecret;

      if (!signature || !webhookSecret) {
        logger.error(
          { webhookId },
          "Webhook signature or secret is missing in production environment.",
        );
        return res
          .status(400)
          .json({
            error: "Webhook signature or secret configuration missing.",
          });
      }

      // Ensure req.body is the raw buffer/string for verification
      if (!Buffer.isBuffer(req.body)) {
        logger.error(
          { webhookId },
          "Request body is not a Buffer, cannot verify signature. Ensure express.raw middleware is correctly configured.",
        );
        return res
          .status(500)
          .json({
            error:
              "Internal server error: Invalid body for signature verification.",
          });
      }

      try {
        lithic_client.webhooks.verifySignature(
          req.body,
          signature,
          webhookSecret,
        );
        logger.info({ webhookId }, "Webhook signature verified successfully.");
      } catch (verificationError) {
        logger.warn(
          { err: verificationError, webhookId, signatureReceived: signature },
          "Invalid webhook signature.",
        );
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Parse the webhook payload AFTER signature verification
    let eventPayload;
    if (Buffer.isBuffer(req.body)) {
      try {
        eventPayload = JSON.parse(req.body.toString());
      } catch (parseError) {
        logger.error(
          { err: parseError, webhookId },
          "Error parsing webhook JSON body after signature verification.",
        );
        return res.status(400).json({ error: "Invalid JSON payload." });
      }
    } else if (typeof req.body === "string") {
      try {
        eventPayload = JSON.parse(req.body);
      } catch (parseError) {
        logger.error(
          { err: parseError, webhookId },
          "Error parsing webhook string body.",
        );
        return res.status(400).json({ error: "Invalid JSON payload." });
      }
    } else {
      eventPayload = req.body;
    }

    const eventToken = eventPayload.payload?.token || "unknown_event_token";
    logger.info(
      { webhookId, eventType: eventPayload.type, eventToken },
      `Processing webhook event.`,
    );

    switch (eventPayload.type) {
      case "transaction.created":
      case "transaction.updated":
        logger.info(
          {
            webhookId,
            transactionToken: eventPayload.payload.token,
            eventType: eventPayload.type,
          },
          "Transaction event received. Fetching details.",
        );
        // Fetch full transaction details using the token from the event payload
        const transaction = await lithic_service.getTransaction(
          eventPayload.payload.token,
        );
        await supabase_service.saveTransaction(transaction);
        logger.info(
          { webhookId, transactionToken: eventPayload.payload.token },
          `Processed and saved transaction event.`,
        );

        // NEW: Trigger real-time alert
        try {
          await alertService.broadcastAlert(transaction.card_token, {
            alertType: 'NEW_TRANSACTION',
            timestamp: new Date().toISOString(),
            transactionId: transaction.token,
            cardToken: transaction.card_token,
            immediate: {
              amount: `$${(transaction.amount / 100).toFixed(2)}`,
              merchant: transaction.merchant?.descriptor || 'Unknown Merchant',
              location: `${transaction.merchant?.city || ''}, ${transaction.merchant?.state || ''}, ${transaction.merchant?.country || ''}`.replace(/^,\s*|,\s*$/g, ''),
              status: transaction.status,
              network: transaction.network,
              networkTransactionID: transaction.network_transaction_id
            },
            verification: {
              mccCode: transaction.merchant?.mcc || '',
              merchantType: transaction.merchant_info?.mcc_description || 'Unknown',
              merchantCategory: transaction.merchant_info?.mcc_category || 'Unknown',
              authorizationCode: transaction.authorization_code || '',
              retrievalReference: transaction.acquirer_reference_number || ''
            },
            intelligence: {
              isFirstTransaction: transaction.isFirstTransaction || false,
              merchantHistory: transaction.merchantHistory || 'New merchant for this card',
              geographicPattern: transaction.geographicPattern || 'New location for this card'
            }
          });
          
          logger.info({ 
            webhookId, 
            transactionToken: transaction.token,
            cardToken: transaction.card_token 
          }, 'Transaction processed and alert broadcast successfully');
        } catch (alertError) {
          // Log alert failure but don't break webhook processing
          logger.warn({ 
            err: alertError, 
            webhookId, 
            transactionToken: transaction.token,
            cardToken: transaction.card_token 
          }, 'Alert broadcast failed after successful transaction save');
        }
        break;

      case "card.created":
        logger.info(
          { webhookId, cardToken: eventPayload.payload.token },
          `Card created event received.`,
        );
        // Potential future action: Save card details to a 'cards' table in Supabase
        // const cardDetails = await lithic_service.getCardDetails(eventPayload.payload.token);
        // await supabase_service.saveCard(cardDetails); // Example
        break;

      case "card.updated":
        logger.info(
          { webhookId, cardToken: eventPayload.payload.token },
          `Card updated event received.`,
        );
        // Potential future action: Update card details in Supabase
        // const updatedCardDetails = await lithic_service.getCardDetails(eventPayload.payload.token);
        // await supabase_service.updateCard(updatedCardDetails); // Example
        break;

      default:
        logger.warn(
          { webhookId, eventType: eventPayload.type },
          `Unhandled event type received.`,
        );
    }

    res
      .status(200)
      .json({ received: true, message: "Webhook processed successfully." });
  } catch (error) {
    logger.error(
      { err: error, webhookId, eventType: req.body?.type },
      "Unhandled error in webhook handler.",
    );
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
}
