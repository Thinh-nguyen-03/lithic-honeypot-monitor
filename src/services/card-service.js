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
 * Get card access analytics for monitoring.
 * @returns {Object} Current card access metrics
 */
export function getCardAccessMetrics() {
  return {
    ...cardAccessMetrics,
    // Convert Map to object for JSON serialization
    cardRequests: Object.fromEntries(cardAccessMetrics.cardRequests)
  };
}

/**
 * Reset card access metrics.
 * Useful for testing or periodic metric resets.
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

// ========== MCP TOOL FUNCTIONS (Task 1.2) ==========

/**
 * Get available cards formatted for MCP tools.
 * Contains the core logic moved from handleListAvailableCards in the controller.
 * 
 * @param {Object} params - Query parameters
 * @param {boolean} params.includeDetails - Include additional card details
 * @param {boolean} params.activeOnly - Filter for only active cards
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Object>} Formatted card list for MCP
 */
export async function getAvailableCardsForMcp(params = {}, requestId) {
  const { includeDetails = false, activeOnly = true } = params;

  logger.debug({
    requestId,
    includeDetails,
    activeOnly
  }, 'Processing MCP list available cards query in service');

  try {
    // Get all cards from Lithic using existing service function
    const allCards = await executeCardOperation(
      () => listCards(),
      'listCards',
      { requestId }
    );
    
    // Filter cards if activeOnly is true
    const filteredCards = activeOnly 
      ? allCards.filter(card => card.state === 'OPEN')
      : allCards;

    const result = {
      queryType: 'list_available_cards',
      cardCount: filteredCards.length,
      cards: filteredCards.map(card => ({
        token: card.token,
        lastFour: card.last_four,
        state: card.state,
        type: card.type,
        memo: card.memo || 'Honeypot Card',
        spendLimit: `$${(card.spend_limit / 100).toFixed(2)}`,
        created: card.created,
        isActive: card.state === 'OPEN',
        // Include additional details if requested
        ...(includeDetails ? {
          spendLimitDuration: card.spend_limit_duration,
          canReceiveTransactions: card.state === 'OPEN'
        } : {})
      })),
      summary: {
        totalCards: allCards.length,
        activeCards: allCards.filter(card => card.state === 'OPEN').length,
        availableForMonitoring: filteredCards.length
      },
      recommendations: {
        suggestedForScammerTesting: filteredCards
          .filter(card => card.state === 'OPEN' && card.spend_limit <= 1000) // $10 or less
          .map(card => card.token)
          .slice(0, 3), // Top 3 recommendations
        usage: 'These cards are ready for scammer verification scenarios'
      }
    };

    logger.info({
      requestId,
      cardCount: result.cardCount,
      activeCards: result.summary.activeCards
    }, 'Available cards listed for AI agent via MCP service');

    return result;

  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'Error processing MCP list available cards query in service');
    
    return {
      queryType: 'list_available_cards',
      error: error.message,
      cardCount: 0,
      cards: [],
      summary: { totalCards: 0, activeCards: 0, availableForMonitoring: 0 }
    };
  }
}

/**
 * Get comprehensive card details for MCP tools with scammer verification data.
 * Contains the core logic moved from handleGetCardDetails in the controller.
 * 
 * @param {string} cardToken - Card token to retrieve details for
 * @param {string} requestId - Request ID for logging
 * @param {Object} options - Additional options
 * @param {boolean} options.includeTransactionHistory - Include transaction history
 * @param {Function} options.getTransactionHistory - Function to get transaction history
 * @param {Function} options.formatTransactionForAI - Function to format transactions
 * @param {Function} options.findMostFrequentMerchant - Function to find frequent merchant
 * @param {Function} options.calculateAverageAmount - Function to calculate average amount
 * @returns {Promise<Object>} Comprehensive card details for MCP
 */
export async function getCardDetailsForMcp(cardToken, requestId, options = {}) {
  const { 
    includeTransactionHistory = false,
    getTransactionHistory,
    formatTransactionForAI,
    findMostFrequentMerchant,
    calculateAverageAmount
  } = options;

  logger.debug({
    requestId,
    cardToken,
    includeTransactionHistory
  }, 'Processing MCP get card details query in service');

  // Log security-sensitive card access
  logger.info({
    requestId,
    cardToken: cardToken ? `${cardToken.substring(0, 8)}...` : null,
    operation: 'get_card_details_mcp',
    sensitivity: 'HIGH'
  }, 'Sensitive card data access requested by AI agent via MCP service');

  try {
    if (!cardToken) {
      return {
        queryType: 'get_card_details',
        error: 'Card token is required',
        cardToken: null,
        cardDetails: null
      };
    }

    // Get comprehensive card details from Lithic using existing service function
    const cardDetails = await executeCardOperation(
      () => getCardDetails(cardToken),
      'getCardDetails',
      { cardToken, requestId }
    );
    
    if (!cardDetails) {
      return {
        queryType: 'get_card_details',
        error: 'Card not found',
        cardToken,
        cardDetails: null
      };
    }

    // Get transaction history if requested and helper functions provided
    let transactionHistory = null;
    if (includeTransactionHistory && getTransactionHistory) {
      try {
        const transactions = await getTransactionHistory(20);
        transactionHistory = {
          recentTransactions: transactions.slice(0, 5).map(formatTransactionForAI || (t => t)),
          totalCount: transactions.length,
          patterns: {
            mostFrequentMerchant: findMostFrequentMerchant ? findMostFrequentMerchant(transactions) : 'N/A',
            averageAmount: calculateAverageAmount ? calculateAverageAmount(transactions) : 0
          }
        };
      } catch (error) {
        logger.warn({
          requestId,
          cardToken,
          error: error.message
        }, 'Failed to retrieve transaction history for card in MCP service');
      }
    }

    const result = {
      queryType: 'get_card_details',
      cardToken,
      cardDetails: {
        // Essential card information
        token: cardDetails.token,
        pan: cardDetails.pan, // Full card number - SENSITIVE
        lastFour: cardDetails.last_four,
        state: cardDetails.state,
        type: cardDetails.type,
        
        // Financial limits and settings
        spendLimit: `$${(cardDetails.spend_limit / 100).toFixed(2)}`,
        spendLimitDuration: cardDetails.spend_limit_duration,
        
        // Metadata
        memo: cardDetails.memo || 'Honeypot Card',
        created: cardDetails.created,
        
        // Status flags
        isActive: cardDetails.state === 'OPEN',
        canReceiveTransactions: cardDetails.state === 'OPEN',
        
        // Formatted for scammer verification
        displayName: `${cardDetails.memo || 'Card'} (...${cardDetails.last_four})`
      },
      transactionHistory,
      scammerVerification: {
        // Key verification points for scammer testing
        primaryCardNumber: cardDetails.pan,
        lastFourDigits: cardDetails.last_four,
        spendingLimit: `$${(cardDetails.spend_limit / 100).toFixed(2)}`,
        cardType: cardDetails.type,
        isActiveForSpending: cardDetails.state === 'OPEN',
        
        // Suggested verification questions
        verificationQuestions: [
          `What's the full card number you're using?`,
          `Can you confirm the last four digits of your card?`,
          `What's the spending limit on this card?`,
          `What type of card is this?`,
          `Is this card currently active?`
        ],
        
        // Expected answers for AI agent
        expectedAnswers: {
          fullCardNumber: cardDetails.pan,
          lastFour: cardDetails.last_four,
          spendLimit: `$${(cardDetails.spend_limit / 100).toFixed(2)}`,
          cardType: cardDetails.type,
          activeStatus: cardDetails.state === 'OPEN' ? 'Yes, active' : 'No, inactive'
        }
      }
    };

    // Log successful card access for security monitoring
    logger.info({
      requestId,
      cardToken: `${cardToken.substring(0, 8)}...`,
      cardState: cardDetails.state,
      accessGranted: true,
      sensitivity: 'HIGH'
    }, 'Card details successfully provided to AI agent for scammer verification via MCP service');

    return result;

  } catch (error) {
    logger.error({
      requestId,
      cardToken,
      error: error.message
    }, 'Error processing MCP get card details query in service');
    
    return {
      queryType: 'get_card_details',
      cardToken,
      error: error.message,
      cardDetails: null
    };
  }
}
