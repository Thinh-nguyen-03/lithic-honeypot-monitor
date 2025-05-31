import { lithic_client } from "../config/lithic-client.js";
import logger from "../utils/logger.js";

/**
 * Create a honeypot card with specified settings.
 * @param {string} nickname - Card nickname.
 * @returns {Promise<Object>} Created Lithic card object.
 * @throws {Error} If card creation fails.
 */
export async function createHoneypotCard(nickname = "Honeypot Card") {
  try {
    logger.debug(`Creating honeypot card with nickname: ${nickname}`);
    const card = await lithic_client.cards.create({
      type: "VIRTUAL",
      memo: nickname,
      spend_limit: 100, // $1.00 in cents
      spend_limit_duration: "TRANSACTION",
      state: "OPEN",
      // Example authorization controls, adjust as needed
      // authorization_controls: [ // This was from the original cards.js, ensure it's what you want for a generic service
      //   {
      //     allowed_mcc: [],
      //     blocked_mcc: [],
      //     allowed_countries: ["USA"],
      //     blocked_countries: [],
      //   },
      // ],
    });

    logger.info(`Created card ${card.token} with last four: ${card.last_four}`);
    return card;
  } catch (error) {
    logger.error("Error creating card:", { message: error.message, nickname });
    throw error;
  }
}

/**
 * Update card spending limit.
 * @param {string} cardToken - Card token.
 * @param {number} newLimit - New limit in cents.
 * @param {string} [duration='TRANSACTION'] - Spend limit duration.
 * @returns {Promise<Object>} Updated Lithic card object.
 * @throws {Error} If card update fails.
 */
export async function updateCardLimit(
  cardToken,
  newLimit,
  duration = "TRANSACTION",
) {
  try {
    logger.debug(
      `Updating card limit for token: ${cardToken} to ${newLimit} cents, duration: ${duration}`,
    );
    const updatedCard = await lithic_client.cards.update(cardToken, {
      spend_limit: newLimit,
      spend_limit_duration: duration,
    });

    logger.info(
      `Updated card ${cardToken} limit to $${(newLimit / 100).toFixed(2)}`,
    );
    return updatedCard;
  } catch (error) {
    logger.error("Error updating card limit:", {
      message: error.message,
      cardToken,
      newLimit,
    });
    throw error;
  }
}

/**
 * Pause or unpause a card.
 * @param {string} cardToken - Card token.
 * @param {boolean} pause - True to pause (set state to "PAUSED"), false to unpause (set state to "OPEN").
 * @returns {Promise<Object>} Updated Lithic card object.
 * @throws {Error} If card update fails.
 */
export async function toggleCardState(cardToken, pause = true) {
  const newState = pause ? "PAUSED" : "OPEN";
  try {
    logger.debug(`Setting card ${cardToken} state to ${newState}`);
    const updatedCard = await lithic_client.cards.update(cardToken, {
      state: newState,
    });

    logger.info(`Card ${cardToken} state set to ${newState}`);
    return updatedCard;
  } catch (error) {
    logger.error("Error toggling card state:", {
      message: error.message,
      cardToken,
      newState,
    });
    throw error;
  }
}

/**
 * Get card details including PAN from Lithic.
 * @param {string} cardToken - Card token.
 * @returns {Promise<Object>} Object containing card details (token, pan, last_four, state, spend_limit, memo, created).
 * @throws {Error} If fetching card details fails.
 */
export async function getCardDetails(cardToken) {
  try {
    logger.debug(`Retrieving details for card token: ${cardToken}`);
    const card = await lithic_client.cards.retrieve(cardToken);

    return {
      token: card.token,
      pan: card.pan,
      last_four: card.last_four,
      state: card.state,
      spend_limit: card.spend_limit,
      spend_limit_duration: card.spend_limit_duration,
      memo: card.memo,
      created: card.created,
      type: card.type,
    };
  } catch (error) {
    logger.error("Error getting card details:", {
      message: error.message,
      cardToken,
    });
    throw error;
  }
}

/**
 * List all cards on the Lithic account.
 * @param {Object} params - Query parameters for the Lithic API.
 * @returns {Promise<Array>} Array of simplified card objects.
 * @throws {Error} If listing cards fails.
 */
export async function listCards(params = {}) {
  try {
    logger.debug("Listing cards from Lithic with params:", params);
    const cards = [];
    const response = await lithic_client.cards.list({
      page_size: 100,
      ...params,
    });
    
    for await (const card of response) {
      cards.push({
        token: card.token,
        last_four: card.last_four,
        state: card.state,
        type: card.type,
        spend_limit: card.spend_limit,
        spend_limit_duration: card.spend_limit_duration,
        memo: card.memo,
        created: card.created,
      });
    }
    
    logger.debug(`Listed ${cards.length} cards from Lithic.`);
    return cards;
  } catch (error) {
    logger.error("Error listing cards from Lithic:", error);
    throw error;
  }
}
