import "dotenv/config";
import { Lithic } from "lithic";

const lithic = new Lithic({
  apiKey: process.env.LITHIC_API_KEY,
  environment: "sandbox",
});

/**
 * Create a honeypot card with $1 limit
 * @param {string} nickname - Card nickname
 * @returns {Promise<Object>} Created card
 */
async function createHoneypotCard(nickname = "Honeypot Card") {
  try {
    const card = await lithic.cards.create({
      type: "VIRTUAL",
      memo: nickname,
      spend_limit: 100, // $1.00 in cents
      spend_limit_duration: "TRANSACTION",
      state: "OPEN",
      authorization_controls: [
        {
          allowed_mcc: [], // Allow all MCCs
          blocked_mcc: [], // Block none
          allowed_countries: ["USA"], // Limit to US merchants
          blocked_countries: [],
        },
      ],
    });

    console.log(`✅ Created card ${card.token}`);
    console.log(`   Last 4: ${card.last_four}`);
    console.log(
      `   Limit: $${(card.spend_limit / 100).toFixed(2)} per ${card.spend_limit_duration}`,
    );

    return card;
  } catch (error) {
    console.error("Error creating card:", error);
    throw error;
  }
}

/**
 * Update card spending limit
 * @param {string} cardToken - Card token
 * @param {number} newLimit - New limit in cents
 */
async function updateCardLimit(cardToken, newLimit) {
  try {
    const updated = await lithic.cards.update(cardToken, {
      spend_limit: newLimit,
      spend_limit_duration: "TRANSACTION",
    });

    console.log(`✅ Updated card limit to $${(newLimit / 100).toFixed(2)}`);
    return updated;
  } catch (error) {
    console.error("Error updating card:", error);
    throw error;
  }
}

/**
 * Pause/unpause a card
 * @param {string} cardToken - Card token
 * @param {boolean} pause - True to pause, false to unpause
 */
async function toggleCard(cardToken, pause = true) {
  try {
    const updated = await lithic.cards.update(cardToken, {
      state: pause ? "PAUSED" : "OPEN",
    });

    console.log(`✅ Card ${pause ? "paused" : "unpaused"}`);
    return updated;
  } catch (error) {
    console.error("Error toggling card:", error);
    throw error;
  }
}

/**
 * Get card details including PAN
 * @param {string} cardToken - Card token
 */
async function getCardDetails(cardToken) {
  try {
    const card = await lithic.cards.retrieve(cardToken);

    return {
      token: card.token,
      pan: card.pan, // Added PAN
      last_four: card.last_four,
      state: card.state,
      spend_limit: `$${(card.spend_limit / 100).toFixed(2)}`,
      memo: card.memo,
      created: card.created,
    };
  } catch (error) {
    console.error("Error getting card details:", error);
    throw error;
  }
}

export { createHoneypotCard, updateCardLimit, toggleCard, getCardDetails };
