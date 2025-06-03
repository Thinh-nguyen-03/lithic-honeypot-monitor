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
    .valid('get_transaction', 'search_transactions', 'get_merchant_info', 'get_card_info')
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
      .max(50),
    
    merchantId: Joi.string()
      .trim()
      .max(50)
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