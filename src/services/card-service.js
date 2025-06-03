import { lithic_client } from "../config/lithic-client.js";
import logger from "../utils/logger.js";

// Analytics tracking for card access monitoring
const cardAccessMetrics = {
  requests: {
    total: 0,
    successful: 0,
    failed: 0,
    errors: {}
  },
  lastAccess: null,
  cardRequests: new Map() // Track requests per card
};

/**
 * Enhanced error handling wrapper for card operations.
 * @param {Function} operation - The card operation to execute
 * @param {string} operationName - Name of the operation for logging
 * @param {Object} context - Additional context for logging
 * @returns {Promise<Object>} Operation result or fallback response
 */
async function executeCardOperation(operation, operationName, context = {}) {
  const startTime = Date.now();
  const requestId = `card_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Log card access attempt
  logger.info({
    requestId,
    operation: operationName,
    context: {
      ...context,
      cardToken: context.cardToken ? `${context.cardToken.substring(0, 8)}...` : null
    },
    timestamp: new Date().toISOString()
  }, `Card operation attempted: ${operationName}`);

  // Update metrics
  cardAccessMetrics.requests.total++;
  cardAccessMetrics.lastAccess = new Date().toISOString();

  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    // Log successful operation
    logger.debug({
      requestId,
      operation: operationName,
      duration,
      success: true
    }, `Card operation completed: ${operationName}`);

    // Update success metrics
    cardAccessMetrics.requests.successful++;
    
    // Track per-card metrics if applicable
    if (context.cardToken) {
      const cardMetrics = cardAccessMetrics.cardRequests.get(context.cardToken) || { count: 0, lastAccess: null };
      cardMetrics.count++;
      cardMetrics.lastAccess = new Date().toISOString();
      cardAccessMetrics.cardRequests.set(context.cardToken, cardMetrics);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Enhanced error logging with context
    logger.error({
      requestId,
      operation: operationName,
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN',
        statusCode: error.statusCode || error.status
      },
      context,
      duration,
      timestamp: new Date().toISOString()
    }, `Card operation failed: ${operationName}`);

    // Update error metrics
    cardAccessMetrics.requests.failed++;
    const errorType = error.code || error.message.split(' ')[0] || 'UNKNOWN';
    cardAccessMetrics.requests.errors[errorType] = (cardAccessMetrics.requests.errors[errorType] || 0) + 1;

    // Determine if fallback should be used
    const shouldUseFallback = shouldUseFallbackResponse(error, operationName);
    
    if (shouldUseFallback) {
      logger.warn({
        requestId,
        operation: operationName,
        originalError: error.message
      }, 'Using fallback response for card operation');
      
      return createFallbackResponse(operationName, context, error);
    }

    // Re-throw error for operations that shouldn't have fallbacks
    throw error;
  }
}

/**
 * Determines if a fallback response should be used based on error type.
 * @param {Error} error - The original error
 * @param {string} operationName - Name of the operation
 * @returns {boolean} Whether to use fallback
 */
function shouldUseFallbackResponse(error, operationName) {
  // Use fallback for read operations (list, get) but not write operations (create, update)
  const readOperations = ['listCards', 'getCardDetails'];
  const isReadOperation = readOperations.includes(operationName);
  
  // Use fallback for network errors, rate limits, temporary failures
  const isRetryableError = 
    error.code === 'ECONNRESET' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ETIMEDOUT' ||
    error.statusCode === 429 || // Rate limit
    error.statusCode === 502 || // Bad gateway
    error.statusCode === 503 || // Service unavailable
    error.statusCode === 504;   // Gateway timeout

  return isReadOperation && isRetryableError;
}

/**
 * Creates a fallback response when Lithic API is unavailable.
 * @param {string} operationName - Name of the operation
 * @param {Object} context - Operation context
 * @param {Error} originalError - The original error
 * @returns {Object} Fallback response
 */
function createFallbackResponse(operationName, context, originalError) {
  const fallbackResponse = {
    fallback: true,
    originalError: originalError.message,
    timestamp: new Date().toISOString()
  };

  switch (operationName) {
    case 'listCards':
      return {
        ...fallbackResponse,
        cards: [],
        message: 'Card service temporarily unavailable. Please try again later.'
      };
    
    case 'getCardDetails':
      return {
        ...fallbackResponse,
        token: context.cardToken,
        pan: null,
        last_four: 'XXXX',
        state: 'UNKNOWN',
        spend_limit: null,
        message: 'Card details temporarily unavailable. Please try again later.'
      };
    
    default:
      return {
        ...fallbackResponse,
        message: 'Card service temporarily unavailable. Please try again later.'
      };
  }
}

/**
 * Validates card token format and existence.
 * @param {string} cardToken - Card token to validate
 * @returns {Object} Validation result
 */
function validateCardToken(cardToken) {
  if (!cardToken || typeof cardToken !== 'string') {
    return {
      valid: false,
      error: 'Card token is required and must be a string'
    };
  }

  // Enhanced card token validation (consistent with validation middleware)
  const cardTokenPattern = /^[a-zA-Z0-9_-]{8,50}$/;
  if (!cardTokenPattern.test(cardToken)) {
    return {
      valid: false,
      error: 'Invalid card token format. Must be 8-50 characters, alphanumeric with underscores and dashes only'
    };
  }

  return { valid: true };
}

/**
 * Create a honeypot card with specified settings.
 * @param {string} nickname - Card nickname.
 * @returns {Promise<Object>} Created Lithic card object.
 * @throws {Error} If card creation fails.
 */
export async function createHoneypotCard(nickname = "Honeypot Card") {
  return executeCardOperation(
    async () => {
      const card = await lithic_client.cards.create({
        type: "VIRTUAL",
        memo: nickname,
        spend_limit: 100, // $1.00 in cents
        spend_limit_duration: "TRANSACTION",
        state: "OPEN",
      });
      
      logger.info(`Created card ${card.token} with last four: ${card.last_four}`);
      return card;
    },
    'createHoneypotCard',
    { nickname }
  );
}

/**
 * Update card spending limit.
 * @param {string} cardToken - Card token.
 * @param {number} newLimit - New limit in cents.
 * @param {string} [duration='TRANSACTION'] - Spend limit duration.
 * @returns {Promise<Object>} Updated Lithic card object.
 * @throws {Error} If card update fails.
 */
export async function updateCardLimit(cardToken, newLimit, duration = "TRANSACTION") {
  // Validate inputs
  const validation = validateCardToken(cardToken);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (typeof newLimit !== 'number' || newLimit < 0) {
    throw new Error('New limit must be a non-negative number');
  }

  return executeCardOperation(
    async () => {
      const updatedCard = await lithic_client.cards.update(cardToken, {
        spend_limit: newLimit,
        spend_limit_duration: duration,
      });

      logger.info(`Updated card ${cardToken} limit to $${(newLimit / 100).toFixed(2)}`);
      return updatedCard;
    },
    'updateCardLimit',
    { cardToken, newLimit, duration }
  );
}

/**
 * Pause or unpause a card.
 * @param {string} cardToken - Card token.
 * @param {boolean} pause - True to pause (set state to "PAUSED"), false to unpause (set state to "OPEN").
 * @returns {Promise<Object>} Updated Lithic card object.
 * @throws {Error} If card update fails.
 */
export async function toggleCardState(cardToken, pause = true) {
  // Validate inputs
  const validation = validateCardToken(cardToken);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const newState = pause ? "PAUSED" : "OPEN";
  
  return executeCardOperation(
    async () => {
      const updatedCard = await lithic_client.cards.update(cardToken, {
        state: newState,
      });

      logger.info(`Card ${cardToken} state set to ${newState}`);
      return updatedCard;
    },
    'toggleCardState',
    { cardToken, newState }
  );
}

/**
 * Get card details including PAN from Lithic with enhanced error handling.
 * @param {string} cardToken - Card token.
 * @returns {Promise<Object>} Object containing card details (token, pan, last_four, state, spend_limit, memo, created).
 * @throws {Error} If fetching card details fails.
 */
export async function getCardDetails(cardToken) {
  // Validate input
  const validation = validateCardToken(cardToken);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return executeCardOperation(
    async () => {
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
    },
    'getCardDetails',
    { cardToken }
  );
}

/**
 * List all cards on the Lithic account with enhanced error handling and fallback.
 * @param {Object} params - Query parameters for the Lithic API.
 * @returns {Promise<Array>} Array of simplified card objects.
 * @throws {Error} If listing cards fails and no fallback is available.
 */
export async function listCards(params = {}) {
  return executeCardOperation(
    async () => {
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
    },
    'listCards',
    { params }
  );
}

/**
 * Get card access analytics and monitoring data.
 * @returns {Object} Card access metrics and statistics
 */
export function getCardAccessMetrics() {
  const successRate = cardAccessMetrics.requests.total > 0 
    ? Math.round((cardAccessMetrics.requests.successful / cardAccessMetrics.requests.total) * 100)
    : 0;

  return {
    requests: {
      ...cardAccessMetrics.requests,
      successRate: `${successRate}%`
    },
    lastAccess: cardAccessMetrics.lastAccess,
    cardRequestStats: {
      uniqueCardsAccessed: cardAccessMetrics.cardRequests.size,
      topAccessedCards: Array.from(cardAccessMetrics.cardRequests.entries())
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, 5)
        .map(([token, metrics]) => ({
          cardToken: `${token.substring(0, 8)}...`,
          accessCount: metrics.count,
          lastAccess: metrics.lastAccess
        }))
    },
    summary: {
      healthy: successRate >= 95,
      status: successRate >= 95 ? 'healthy' : successRate >= 80 ? 'degraded' : 'unhealthy'
    }
  };
}

/**
 * Reset card access metrics (useful for testing or periodic resets).
 */
export function resetCardAccessMetrics() {
  cardAccessMetrics.requests.total = 0;
  cardAccessMetrics.requests.successful = 0;
  cardAccessMetrics.requests.failed = 0;
  cardAccessMetrics.requests.errors = {};
  cardAccessMetrics.lastAccess = null;
  cardAccessMetrics.cardRequests.clear();
  
  logger.info('Card access metrics reset');
}
