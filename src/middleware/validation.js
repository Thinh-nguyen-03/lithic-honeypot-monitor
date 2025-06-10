import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * Enterprise-grade validation middleware for Honeypot Transaction Monitoring System.
 * Provides comprehensive input validation, sanitization, and security measures.
 */

// ========== Schema Definitions ==========

/**
 * Schema for Vapi MCP query requests.
 * Validates tool calls from Vapi AI agents.
 */
const vapiMCPRequestSchema = Joi.object({
  toolCallId: Joi.string()
    .required()
    .trim()
    .max(100)
    .description('Unique identifier for the tool call from Vapi'),
  
  tool: Joi.string()
    .required()
    .valid(
      'get_transaction', 
      'get_transaction_details',
      'get_recent_transactions',
      'search_transactions', 
      'get_merchant_info', 
      'get_card_info',
      'list_available_cards',
      'get_card_details'
    )
    .description('The specific MCP tool being called'),
  
  parameters: Joi.object({
    query: Joi.string()
      .min(1)
      .max(200)
      .trim()
      .replace(/[<>]/g, ''), // Basic XSS prevention
    
    limit: Joi.number()
      .integer()
      .min(1)
      .max(50)
      .default(5),
    
    cardToken: Joi.string()
      .trim()
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/, 'card token format'), // Enhanced card token validation
    
    merchantId: Joi.string()
      .trim()
      .max(50),

    transactionId: Joi.string()
      .trim()
      .max(100)
      .description('Transaction ID for detailed lookup'),

    // New parameters for card access tools
    includeDetails: Joi.boolean()
      .default(false)
      .description('Include detailed information in card listings'),
    
    activeOnly: Joi.boolean()
      .default(true)
      .description('Filter to only active cards'),
    
    includeTransactionHistory: Joi.boolean()
      .default(false)
      .description('Include transaction history with card details')
  }).required()
});

/**
 * Schema for real-time alert subscription requests.
 * Validates SSE connection requests from AI agents.
 */
const alertSubscriptionSchema = Joi.object({
  agentId: Joi.string()
    .required()
    .trim()
    .max(50)
    .description('Unique identifier for the AI agent'),
  
  cardTokens: Joi.array()
    .items(
      Joi.string()
        .trim()
        .max(50)
        .regex(/^[a-zA-Z0-9_-]+$/) // Alphanumeric with dashes and underscores
    )
    .min(1)
    .max(10)
    .required()
    .description('Array of card tokens to monitor'),
  
  connectionType: Joi.string()
    .valid('sse', 'websocket')
    .default('sse')
    .description('Type of real-time connection'),
  
  metadata: Joi.object({
    sessionId: Joi.string().max(100),
    conversationId: Joi.string().max(100),
    apiVersion: Joi.string().valid('v1', 'v2').default('v1')
  }).optional()
});

/**
 * Schema for transaction intelligence query requests.
 * Validates advanced transaction analysis queries.
 */
const intelligenceQuerySchema = Joi.object({
  queryType: Joi.string()
    .required()
    .valid('pattern_analysis', 'merchant_verification', 'fraud_detection', 'transaction_history'),
  
  filters: Joi.object({
    cardToken: Joi.string().trim().max(50),
    merchantId: Joi.string().trim().max(50),
    startDate: Joi.date().iso().max('now'),
    endDate: Joi.date().iso().max('now').greater(Joi.ref('startDate')),
    minAmount: Joi.number().positive(),
    maxAmount: Joi.number().positive().greater(Joi.ref('minAmount')),
    transactionStatus: Joi.string().valid('APPROVED', 'DECLINED', 'PENDING'),
    mccCode: Joi.string().regex(/^\d{4}$/)
  }).min(1).required(),
  
  options: Joi.object({
    includePatterns: Joi.boolean().default(true),
    includeMerchantData: Joi.boolean().default(true),
    includeRiskScore: Joi.boolean().default(false),
    limit: Joi.number().integer().min(1).max(100).default(10)
  }).default()
});

// ========== Helper Functions ==========

/**
 * Sanitizes input to prevent injection attacks.
 * @param {any} input - The input to sanitize.
 * @returns {any} Sanitized input.
 */
function sanitizeInput(input) {
  if (typeof input === 'string') {
    // Remove potential SQL injection patterns
    return input
      .replace(/['";\\]/g, '')
      .replace(/--/g, '')
      .replace(/\/\*/g, '')
      .replace(/\*\//g, '')
      .trim();
  }
  if (Array.isArray(input)) {
    // Preserve arrays and sanitize each element
    return input.map(item => sanitizeInput(item));
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

/**
 * Creates a standardized error response.
 * @param {string} message - Error message.
 * @param {string} field - Field that caused the error.
 * @param {number} statusCode - HTTP status code.
 * @param {string} requestId - Request ID for tracking.
 * @returns {Object} Standardized error response.
 */
function createErrorResponse(message, field, statusCode, requestId) {
  return {
    error: statusCode === 422 ? 'Semantic Validation Error' : 'Validation Error',
    details: message,
    field: field || 'unknown',
    timestamp: new Date().toISOString(),
    requestId
  };
}

/**
 * Logs validation errors with context.
 * @param {string} requestId - Request ID.
 * @param {string} validationType - Type of validation.
 * @param {Object} error - Validation error details.
 * @param {Object} req - Express request object.
 */
function logValidationError(requestId, validationType, error, req) {
  logger.warn({
    requestId,
    validationType,
    error: error.message,
    field: error.field,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    endpoint: req.originalUrl,
    method: req.method
  }, 'Validation failed');
}

// ========== Middleware Functions ==========

/**
 * Validates Vapi MCP requests.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
export async function validateVapiRequest(req, res, next) {
  const requestId = uuidv4();
  req.requestId = requestId;
  
  const startTime = Date.now();
  
  try {
    // Check payload size (max 1MB)
    const contentLength = parseInt(req.get('content-length') || '0');
    if (contentLength > 1048576) {
      logger.warn({ requestId, contentLength }, 'Request payload too large');
      return res.status(413).json(createErrorResponse(
        'Request payload too large (max 1MB)',
        'body',
        413,
        requestId
      ));
    }
    
    // Sanitize input
    const sanitizedBody = sanitizeInput(req.body);
    
    // Validate against schema
    const { error, value } = vapiMCPRequestSchema.validate(sanitizedBody, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const field = error.details[0].path.join('.');
      logValidationError(requestId, 'vapiMCPRequest', { message: error.details[0].message, field }, req);
      return res.status(400).json(createErrorResponse(
        error.details[0].message,
        field,
        400,
        requestId
      ));
    }
    
    // Tool-specific validation
    const { tool, parameters } = value;
    
    // Check rate limiting for sensitive card access tools
    const rateLimitResult = checkCardAccessRateLimit(tool, requestId, req);
    if (rateLimitResult) {
      logValidationError(requestId, 'vapiMCPRequest', { 
        message: rateLimitResult.error, 
        field: rateLimitResult.field 
      }, req);
      return res.status(429).json(createErrorResponse(
        rateLimitResult.error,
        rateLimitResult.field,
        429,
        requestId
      ));
    }

    // Log security-sensitive card access attempts
    logCardAccessAttempt(requestId, tool, parameters, req);
    
    // Validate required parameters based on tool type
    if ((tool === 'get_transaction' || tool === 'search_transactions') && !parameters.query) {
      logValidationError(requestId, 'vapiMCPRequest', { 
        message: 'Query parameter is required for transaction search tools', 
        field: 'parameters.query' 
      }, req);
      return res.status(400).json(createErrorResponse(
        'Query parameter is required for transaction search tools',
        'parameters.query',
        400,
        requestId
      ));
    }
    
    if (tool === 'get_card_info' && !parameters.cardToken) {
      logValidationError(requestId, 'vapiMCPRequest', { 
        message: 'Card token is required for get_card_info tool', 
        field: 'parameters.cardToken' 
      }, req);
      return res.status(400).json(createErrorResponse(
        'Card token is required for get_card_info tool',
        'parameters.cardToken',
        400,
        requestId
      ));
    }
    
    if (tool === 'get_merchant_info' && !parameters.merchantId) {
      logValidationError(requestId, 'vapiMCPRequest', { 
        message: 'Merchant ID is required for get_merchant_info tool', 
        field: 'parameters.merchantId' 
      }, req);
      return res.status(400).json(createErrorResponse(
        'Merchant ID is required for get_merchant_info tool',
        'parameters.merchantId',
        400,
        requestId
      ));
    }

    // Enhanced validation for new card access tools
    if (tool === 'get_card_details') {
      if (!parameters.cardToken) {
        logValidationError(requestId, 'vapiMCPRequest', { 
          message: 'Card token is required for get_card_details tool', 
          field: 'parameters.cardToken' 
        }, req);
        return res.status(400).json(createErrorResponse(
          'Card token is required for get_card_details tool',
          'parameters.cardToken',
          400,
          requestId
        ));
      }

      // Enhanced card token validation for sensitive operations
      const cardTokenValidation = validateCardToken(parameters.cardToken, requestId, req);
      if (cardTokenValidation) {
        logValidationError(requestId, 'vapiMCPRequest', cardTokenValidation, req);
        return res.status(400).json(createErrorResponse(
          cardTokenValidation.error,
          cardTokenValidation.field,
          400,
          requestId
        ));
      }

      // Security validation: Check if requesting transaction history
      if (parameters.includeTransactionHistory) {
        logger.info({
          requestId,
          tool,
          cardToken: `${parameters.cardToken.substring(0, 8)}...`,
          securityAlert: 'TRANSACTION_HISTORY_REQUESTED',
          ip: req.ip,
          userAgent: req.get('user-agent')
        }, 'SECURITY: Transaction history requested with card details');
      }
    }

    // Validation for list_available_cards
    if (tool === 'list_available_cards') {
      // Security validation: Check if requesting detailed information
      if (parameters.includeDetails) {
        logger.info({
          requestId,
          tool,
          securityAlert: 'DETAILED_CARD_LIST_REQUESTED',
          ip: req.ip,
          userAgent: req.get('user-agent')
        }, 'SECURITY: Detailed card list requested');
      }

      // Validate boolean parameters if present
      if (parameters.activeOnly !== undefined && typeof parameters.activeOnly !== 'boolean') {
        logValidationError(requestId, 'vapiMCPRequest', { 
          message: 'activeOnly parameter must be a boolean', 
          field: 'parameters.activeOnly' 
        }, req);
        return res.status(400).json(createErrorResponse(
          'activeOnly parameter must be a boolean',
          'parameters.activeOnly',
          400,
          requestId
        ));
      }
    }

    // Enhanced card token validation for get_card_info (existing tool)
    if (tool === 'get_card_info' && parameters.cardToken) {
      const cardTokenValidation = validateCardToken(parameters.cardToken, requestId, req);
      if (cardTokenValidation) {
        logValidationError(requestId, 'vapiMCPRequest', cardTokenValidation, req);
        return res.status(400).json(createErrorResponse(
          cardTokenValidation.error,
          cardTokenValidation.field,
          400,
          requestId
        ));
      }
    }
    
    // Attach validated and sanitized data
    req.validatedData = value;
    
    // Log successful validation (debug level)
    logger.debug({
      requestId,
      validationType: 'vapiMCPRequest',
      tool: value.tool,
      duration: Date.now() - startTime
    }, 'Validation successful');
    
    next();
  } catch (err) {
    logger.error({ requestId, error: err.message, stack: err.stack }, 'Validation system error');
    return res.status(500).json(createErrorResponse(
      'Internal validation error',
      'system',
      500,
      requestId
    ));
  }
}

/**
 * Validates real-time alert subscription requests.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
export async function validateAlertRequest(req, res, next) {
  const requestId = uuidv4();
  req.requestId = requestId;
  
  const startTime = Date.now();
  
  try {
    // Check if headers have already been sent (from SSE middleware)
    if (res.headersSent) {
      logger.warn({
        requestId,
        path: req.path,
        method: req.method
      }, 'Headers already sent, skipping validation response');
      return next();
    }
    
    // For SSE connections, data might come from query params
    const data = req.method === 'GET' ? req.query : req.body;
    
    // Parse arrays from query strings if needed
    if (req.method === 'GET' && data.cardTokens && typeof data.cardTokens === 'string') {
      data.cardTokens = data.cardTokens.split(',').map(token => token.trim());
    }
    
    // Sanitize input
    const sanitizedData = sanitizeInput(data);
    
    // Validate against schema
    const { error, value } = alertSubscriptionSchema.validate(sanitizedData, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const field = error.details[0].path.join('.');
      logValidationError(requestId, 'alertSubscription', { message: error.details[0].message, field }, req);
      
      // Check again before sending response
      if (!res.headersSent) {
        return res.status(400).json(createErrorResponse(
          error.details[0].message,
          field,
          400,
          requestId
        ));
      } else {
        logger.warn({
          requestId,
          error: error.details[0].message,
          field
        }, 'Validation failed but headers already sent');
        return next(new Error(`Validation failed: ${error.details[0].message}`));
      }
    }
    
    // Validate agent has permission for requested cards (semantic validation)
    // This is a placeholder - implement actual permission check based on your auth system
    if (value.cardTokens.length > 5 && !req.user?.isAdmin) {
      if (!res.headersSent) {
        return res.status(422).json(createErrorResponse(
          'Agent not authorized to monitor more than 5 cards',
          'cardTokens',
          422,
          requestId
        ));
      } else {
        logger.warn({
          requestId,
          cardCount: value.cardTokens.length
        }, 'Authorization failed but headers already sent');
        return next(new Error('Agent not authorized to monitor more than 5 cards'));
      }
    }
    
    req.validatedData = value;
    
    logger.debug({
      requestId,
      validationType: 'alertSubscription',
      agentId: value.agentId,
      cardCount: value.cardTokens.length,
      duration: Date.now() - startTime
    }, 'Validation successful');
    
    next();
  } catch (err) {
    logger.error({ requestId, error: err.message, stack: err.stack }, 'Validation system error');
    
    // Check before sending error response
    if (!res.headersSent) {
      return res.status(500).json(createErrorResponse(
        'Internal validation error',
        'system',
        500,
        requestId
      ));
    } else {
      logger.error({
        requestId,
        error: err.message
      }, 'Validation system error but headers already sent');
      return next(err);
    }
  }
}

/**
 * Validates transaction intelligence query requests.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
export async function validateIntelligenceQuery(req, res, next) {
  const requestId = uuidv4();
  req.requestId = requestId;
  
  const startTime = Date.now();
  
  try {
    // Intelligence queries typically come as POST with JSON body
    const sanitizedBody = sanitizeInput(req.body);
    
    // Validate against schema
    const { error, value } = intelligenceQuerySchema.validate(sanitizedBody, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const field = error.details[0].path.join('.');
      logValidationError(requestId, 'intelligenceQuery', { message: error.details[0].message, field }, req);
      return res.status(400).json(createErrorResponse(
        error.details[0].message,
        field,
        400,
        requestId
      ));
    }
    
    // Semantic validation: Check date range is reasonable (max 90 days)
    if (value.filters.startDate && value.filters.endDate) {
      const daysDiff = (new Date(value.filters.endDate) - new Date(value.filters.startDate)) / (1000 * 60 * 60 * 24);
      if (daysDiff > 90) {
        return res.status(422).json(createErrorResponse(
          'Date range cannot exceed 90 days for performance reasons',
          'filters.endDate',
          422,
          requestId
        ));
      }
    }
    
    req.validatedData = value;
    
    logger.debug({
      requestId,
      validationType: 'intelligenceQuery',
      queryType: value.queryType,
      filterCount: Object.keys(value.filters).length,
      duration: Date.now() - startTime
    }, 'Validation successful');
    
    next();
  } catch (err) {
    logger.error({ requestId, error: err.message, stack: err.stack }, 'Validation system error');
    return res.status(500).json(createErrorResponse(
      'Internal validation error',
      'system',
      500,
      requestId
    ));
  }
}

/**
 * Generic validation middleware factory for custom schemas.
 * @param {Joi.Schema} schema - Joi schema to validate against.
 * @param {string} validationType - Type of validation for logging.
 * @returns {Function} Express middleware function.
 */
export function createValidator(schema, validationType) {
  return async (req, res, next) => {
    const requestId = uuidv4();
    req.requestId = requestId;
    
    try {
      const sanitizedBody = sanitizeInput(req.body);
      const { error, value } = schema.validate(sanitizedBody, {
        abortEarly: false,
        stripUnknown: true
      });
      
      if (error) {
        const field = error.details[0].path.join('.');
        logValidationError(requestId, validationType, { message: error.details[0].message, field }, req);
        return res.status(400).json(createErrorResponse(
          error.details[0].message,
          field,
          400,
          requestId
        ));
      }
      
      req.validatedData = value;
      next();
    } catch (err) {
      logger.error({ requestId, error: err.message }, 'Validation system error');
      return res.status(500).json(createErrorResponse(
        'Internal validation error',
        'system',
        500,
        requestId
      ));
    }
  };
}

// Export schemas for reuse
export const schemas = {
  vapiMCPRequest: vapiMCPRequestSchema,
  alertSubscription: alertSubscriptionSchema,
  intelligenceQuery: intelligenceQuerySchema
};

/**
 * Validates card token format and security requirements.
 * @param {string} cardToken - Card token to validate
 * @param {string} requestId - Request ID for logging
 * @param {Object} req - Express request object
 * @returns {Object|null} Validation result or null if valid
 */
function validateCardToken(cardToken, requestId, req) {
  // Enhanced card token validation
  if (!cardToken || typeof cardToken !== 'string') {
    return {
      error: 'Card token is required and must be a string',
      field: 'parameters.cardToken'
    };
  }

  // Check format: should be alphanumeric with underscores and dashes
  const cardTokenPattern = /^[a-zA-Z0-9_-]{8,50}$/;
  if (!cardTokenPattern.test(cardToken)) {
    return {
      error: 'Invalid card token format. Must be 8-50 characters, alphanumeric with underscores and dashes only',
      field: 'parameters.cardToken'
    };
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /(.)\1{4,}/, // Repeated characters (5+ times)
    /^(test|demo|fake|invalid|null|undefined)$/i, // Common test values
    /['"<>]/g // Potential injection attempts
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(cardToken)) {
      logger.warn({
        requestId,
        cardToken: `${cardToken.substring(0, 8)}...`,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        pattern: pattern.toString()
      }, 'Suspicious card token pattern detected');
      
      return {
        error: 'Card token contains invalid or suspicious patterns',
        field: 'parameters.cardToken'
      };
    }
  }

  return null; // Valid
}

/**
 * Logs security-sensitive card access attempts.
 * @param {string} requestId - Request ID
 * @param {string} tool - MCP tool being used
 * @param {Object} parameters - Tool parameters
 * @param {Object} req - Express request object
 */
function logCardAccessAttempt(requestId, tool, parameters, req) {
  const sensitiveTools = ['get_card_details', 'list_available_cards', 'get_card_info'];
  
  if (sensitiveTools.includes(tool)) {
    const logData = {
      requestId,
      securityEvent: 'CARD_ACCESS_ATTEMPT',
      tool,
      cardToken: parameters.cardToken ? `${parameters.cardToken.substring(0, 8)}...` : null,
      includeDetails: parameters.includeDetails,
      includeTransactionHistory: parameters.includeTransactionHistory,
      activeOnly: parameters.activeOnly,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      endpoint: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    };

    // Log different levels based on sensitivity
    if (tool === 'get_card_details' && parameters.includeTransactionHistory) {
      logger.info(logData, 'HIGH SENSITIVITY: Card details with transaction history requested');
    } else if (tool === 'get_card_details') {
      logger.info(logData, 'MEDIUM SENSITIVITY: Card details requested');
    } else {
      logger.debug(logData, 'LOW SENSITIVITY: Card information requested');
    }
  }
}

/**
 * Implements rate limiting considerations for sensitive card data access.
 * @param {string} tool - MCP tool being used
 * @param {string} requestId - Request ID
 * @param {Object} req - Express request object
 * @returns {Object|null} Rate limit result or null if within limits
 */
function checkCardAccessRateLimit(tool, requestId, req) {
  // Simple rate limiting simulation (in production, use Redis or similar)
  // This is a placeholder for actual rate limiting implementation
  
  const sensitiveTools = ['get_card_details', 'list_available_cards'];
  if (!sensitiveTools.includes(tool)) {
    return null; // No rate limiting for non-sensitive tools
  }

  // Check if this IP has made too many requests recently
  const clientIP = req.ip;
  const userAgent = req.get('user-agent');
  
  // Log for monitoring purposes (actual implementation would check against cache/database)
  logger.debug({
    requestId,
    tool,
    clientIP,
    userAgent,
    rateLimit: 'check_performed'
  }, 'Rate limit check for sensitive card access');

  // In a real implementation, you would:
  // 1. Check Redis/memory cache for request count per IP/user
  // 2. Increment counter
  // 3. Return error if limit exceeded
  // 4. Set TTL for counter reset
  
  // For now, just log and allow through
  // Example rate limit: 100 card access requests per hour per IP
  const rateLimitWarningThreshold = 50; // Would track actual counts in production
  
  if (Math.random() < 0.05) { // 5% random rate limit warning for demo
    logger.warn({
      requestId,
      tool,
      clientIP,
      userAgent,
      warning: 'approaching_rate_limit'
    }, 'Client approaching rate limit for sensitive card access');
  }

  return null; // Allow request
} 