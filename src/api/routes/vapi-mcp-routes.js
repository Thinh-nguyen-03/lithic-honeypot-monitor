/**
 * Enhanced Vapi MCP Routes - Express routes for Model Context Protocol server integration
 * 
 * This module provides comprehensive MCP (Model Context Protocol) endpoints for Vapi AI agents:
 * - Real-time alert subscription management
 * - Transaction data query endpoints for AI verification  
 * - Connection management and health monitoring
 * - Enterprise-grade validation and error handling
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as vapiMcpController from '../controllers/vapi-mcp-controller.js';
import { validateVapiRequest, validateIntelligenceQuery, validateAlertRequest } from '../../middleware/validation.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ========== Middleware Functions ==========

/**
 * Error handling middleware for MCP routes.
 * Catches any unhandled errors and returns MCP-compliant error responses.
 * 
 * @param {Error} error - The error that occurred
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function mcpErrorHandler(error, req, res, next) {
  const requestId = req.requestId || uuidv4();
  
  logger.error({
    requestId,
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  }, 'MCP route error');

  // Don't send error response if headers already sent
  if (res.headersSent) {
    return next(error);
  }

  // MCP-compliant error response format
  res.status(500).json({
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: 'Internal server error',
      data: {
        timestamp: new Date().toISOString(),
        requestId
      }
    },
    id: null
  });
}

/**
 * Request logging middleware for MCP routes.
 * Logs incoming requests with MCP-specific metadata and timing.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function mcpRequestLogger(req, res, next) {
  const requestId = req.requestId || uuidv4();
  req.requestId = requestId;
  req.startTime = Date.now();

  logger.info({
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    mcpVersion: req.get('mcp-version') || 'unknown',
    contentType: req.get('content-type')
  }, 'MCP route request received');

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logger.info({
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      responseSize: res.get('content-length')
    }, 'MCP route request completed');
  });

  next();
}

/**
 * MCP session validation middleware.
 * Validates and sanitizes session-related parameters for MCP endpoints.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function validateMcpSession(req, res, next) {
  const requestId = req.requestId || uuidv4();

  try {
    // Validate sessionId parameter if present
    if (req.params.sessionId) {
      const sessionId = req.params.sessionId.trim();
      
      // UUID format validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(sessionId)) {
        logger.warn({
          requestId,
          sessionId: sessionId.substring(0, 8) + '...',
          ip: req.ip
        }, 'Invalid MCP session ID format');

        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Invalid session ID format',
            data: { 
              field: 'sessionId',
              expected: 'UUID v4 format'
            }
          },
          id: null
        });
      }

      req.params.sessionId = sessionId;
    }

    // Validate transactionId parameter if present
    if (req.params.transactionId) {
      const transactionId = req.params.transactionId.trim();
      
      // Basic validation - alphanumeric with underscores
      if (!/^[a-zA-Z0-9_-]+$/.test(transactionId) || transactionId.length > 100) {
        logger.warn({
          requestId,
          transactionId: transactionId.substring(0, 10) + '...',
          ip: req.ip
        }, 'Invalid transaction ID format');

        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Invalid transaction ID format',
            data: { 
              field: 'transactionId',
              expected: 'Alphanumeric with dashes and underscores, max 100 chars'
            }
          },
          id: null
        });
      }

      req.params.transactionId = transactionId;
    }

    next();
  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'MCP session validation error');

    return res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Session validation failed',
        data: { requestId }
      },
      id: null
    });
  }
}

// ========== Real-Time Alert Subscription Routes ==========

/**
 * POST /subscribe
 * 
 * Subscribe AI agent to real-time transaction alerts for specific card(s).
 * Establishes MCP connection for receiving real-time transaction notifications.
 * 
 * @route POST /api/mcp/subscribe
 * @param {string} agentId.body.required - Unique identifier for the AI agent
 * @param {Array<string>} cardTokens.body.required - Array of card tokens to monitor
 * @param {string} [connectionType=sse].body - Connection type (sse, websocket)
 * @param {Object} [metadata].body - Optional metadata (sessionId, conversationId, apiVersion)
 * @returns {Object} 200 - Subscription confirmation with session details
 * @returns {Object} 400 - Validation error response
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * POST /api/mcp/subscribe
 * Content-Type: application/json
 * 
 * {
 *   "agentId": "agent_vapi_123",
 *   "cardTokens": ["card_token_abc", "card_token_def"],
 *   "connectionType": "sse",
 *   "metadata": {
 *     "conversationId": "conv_456",
 *     "apiVersion": "v1"
 *   }
 * }
 * 
 * // Response:
 * {
 *   "jsonrpc": "2.0",
 *   "result": {
 *     "sessionId": "uuid",
 *     "agentId": "agent_vapi_123",
 *     "monitoringCards": ["card_token_abc", "card_token_def"],
 *     "connectionType": "sse",
 *     "status": "subscribed"
 *   },
 *   "id": null
 * }
 */
router.post('/subscribe',
  mcpRequestLogger,
  validateAlertRequest,
  vapiMcpController.subscribeToAlerts
);

/**
 * DELETE /unsubscribe/:sessionId
 * 
 * Unsubscribe AI agent from real-time transaction alerts.
 * Cleanly terminates MCP connection and stops alert delivery.
 * 
 * @route DELETE /api/mcp/unsubscribe/:sessionId
 * @param {string} sessionId.path.required - Session ID to unsubscribe (UUID format)
 * @param {string} [reason=agent_disconnect].query - Reason for unsubscribing
 * @returns {Object} 200 - Unsubscription confirmation
 * @returns {Object} 400 - Validation error (invalid session ID format)
 * @returns {Object} 404 - Session not found
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * DELETE /api/mcp/unsubscribe/550e8400-e29b-41d4-a716-446655440000?reason=conversation_ended
 * 
 * // Response:
 * {
 *   "jsonrpc": "2.0",
 *   "result": {
 *     "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *     "status": "unsubscribed",
 *     "reason": "conversation_ended"
 *   },
 *   "id": null
 * }
 */
router.delete('/unsubscribe/:sessionId',
  mcpRequestLogger,
  validateMcpSession,
  vapiMcpController.unsubscribeFromAlerts
);

/**
 * GET /subscription/status/:sessionId
 * 
 * Check the subscription status and health of an AI agent's MCP connection.
 * Provides detailed connection information and monitoring statistics.
 * 
 * @route GET /api/mcp/subscription/status/:sessionId
 * @param {string} sessionId.path.required - Session ID to check (UUID format)
 * @returns {Object} 200 - Subscription status and connection health
 * @returns {Object} 400 - Validation error (invalid session ID format)
 * @returns {Object} 404 - Session not found
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * GET /api/mcp/subscription/status/550e8400-e29b-41d4-a716-446655440000
 * 
 * // Response:
 * {
 *   "jsonrpc": "2.0",
 *   "result": {
 *     "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *     "agentId": "agent_vapi_123",
 *     "status": "active",
 *     "connectionHealth": 0.98,
 *     "monitoringCards": ["card_token_abc"],
 *     "alertsReceived": 5,
 *     "lastActivity": "2024-01-15T10:25:00Z"
 *   },
 *   "id": null
 * }
 */
router.get('/subscription/status/:sessionId',
  mcpRequestLogger,
  validateMcpSession,
  vapiMcpController.getSubscriptionStatus
);

// ========== Transaction Query Routes ==========

/**
 * POST /query
 * 
 * General transaction data query endpoint for AI agents.
 * Supports both natural language queries and structured transaction searches.
 * Provides comprehensive transaction intelligence for scammer verification.
 * 
 * @route POST /api/mcp/query
 * @param {string} toolCallId.body.required - Unique identifier for the tool call from Vapi
 * @param {string} tool.body.required - MCP tool name (get_transaction, search_transactions, etc.)
 * @param {Object} parameters.body.required - Query parameters specific to the tool
 * @returns {Object} 200 - Query results with transaction intelligence
 * @returns {Object} 400 - Validation error response
 * @returns {Object} 422 - Semantic validation error (invalid query structure)
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * POST /api/mcp/query
 * Content-Type: application/json
 * 
 * {
 *   "toolCallId": "tool_call_123",
 *   "tool": "search_transactions",
 *   "parameters": {
 *     "query": "recent transactions at coffee shops",
 *     "limit": 5,
 *     "cardToken": "card_token_abc"
 *   }
 * }
 * 
 * // Response:
 * {
 *   "jsonrpc": "2.0",
 *   "result": {
 *     "toolCallId": "tool_call_123",
 *     "transactions": [...],
 *     "verificationData": {...},
 *     "queryMetadata": {
 *       "resultsCount": 3,
 *       "processingTime": "45ms"
 *     }
 *   },
 *   "id": null
 * }
 */
router.post('/query',
  mcpRequestLogger,
  validateVapiRequest,
  vapiMcpController.processQuery
);

/**
 * GET /transaction/:transactionId
 * 
 * Get comprehensive details for a specific transaction.
 * Provides all verification data points needed for scammer interrogation.
 * 
 * @route GET /api/mcp/transaction/:transactionId
 * @param {string} transactionId.path.required - Unique transaction identifier
 * @param {boolean} [includeVerification=true].query - Include verification data points
 * @param {boolean} [includeMerchant=true].query - Include merchant intelligence
 * @param {boolean} [includePatterns=false].query - Include pattern analysis
 * @returns {Object} 200 - Complete transaction details with verification data
 * @returns {Object} 400 - Validation error (invalid transaction ID format)
 * @returns {Object} 404 - Transaction not found
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * GET /api/mcp/transaction/txn_abc123?includeVerification=true&includeMerchant=true
 * 
 * // Response:
 * {
 *   "jsonrpc": "2.0",
 *   "result": {
 *     "transaction": {
 *       "id": "txn_abc123",
 *       "amount": "$12.45",
 *       "merchant": "Starbucks #1234",
 *       "timestamp": "2024-01-15T10:30:00Z",
 *       ...
 *     },
 *     "verification": {
 *       "mccCode": "5814",
 *       "merchantType": "Coffee Shop",
 *       "location": "Seattle, WA, USA",
 *       ...
 *     },
 *     "intelligence": {
 *       "isFirstTransaction": false,
 *       "merchantHistory": "5 previous transactions",
 *       ...
 *     }
 *   },
 *   "id": null
 * }
 */
router.get('/transaction/:transactionId',
  mcpRequestLogger,
  validateMcpSession,
  vapiMcpController.getTransactionDetails
);

/**
 * GET /transactions/recent
 * 
 * Get recent transactions for specific card(s) with AI-optimized formatting.
 * Useful for conversation context and pattern verification.
 * 
 * @route GET /api/mcp/transactions/recent
 * @param {string} cardToken.query.required - Card token to query
 * @param {number} [limit=10].query - Maximum number of transactions to return (1-50)
 * @param {string} [timeframe=24h].query - Time window (1h, 6h, 24h, 7d, 30d)
 * @param {boolean} [includeVerification=true].query - Include verification data
 * @returns {Object} 200 - Recent transactions with verification context
 * @returns {Object} 400 - Validation error (missing or invalid parameters)
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * GET /api/mcp/transactions/recent?cardToken=card_abc&limit=5&timeframe=24h
 * 
 * // Response:
 * {
 *   "jsonrpc": "2.0",
 *   "result": {
 *     "transactions": [...],
 *     "summary": {
 *       "totalTransactions": 5,
 *       "timeframe": "24h",
 *       "cardToken": "card_abc"
 *     },
 *     "patterns": {
 *       "merchantTypes": ["Coffee Shop", "Gas Station"],
 *       "averageAmount": "$8.75"
 *     }
 *   },
 *   "id": null
 * }
 */
router.get('/transactions/recent',
  mcpRequestLogger,
  vapiMcpController.getRecentTransactions
);

/**
 * GET /transactions/merchant/:merchantName
 * 
 * Get transaction history for a specific merchant.
 * Enables AI agents to verify merchant familiarity and transaction patterns.
 * 
 * @route GET /api/mcp/transactions/merchant/:merchantName
 * @param {string} merchantName.path.required - Merchant name or identifier
 * @param {string} [cardToken].query - Filter by specific card token
 * @param {number} [limit=20].query - Maximum number of transactions (1-100)
 * @param {string} [timeframe=30d].query - Time window for search
 * @returns {Object} 200 - Merchant transaction history with intelligence
 * @returns {Object} 400 - Validation error (invalid parameters)
 * @returns {Object} 404 - Merchant not found
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * GET /api/mcp/transactions/merchant/Starbucks?cardToken=card_abc&limit=10
 * 
 * // Response:
 * {
 *   "jsonrpc": "2.0",
 *   "result": {
 *     "merchant": {
 *       "name": "Starbucks",
 *       "mccCode": "5814",
 *       "category": "Coffee Shop"
 *     },
 *     "transactions": [...],
 *     "intelligence": {
 *       "frequency": "Weekly customer",
 *       "averageAmount": "$4.50",
 *       "locations": ["Seattle, WA", "Portland, OR"]
 *     }
 *   },
 *   "id": null
 * }
 */
router.get('/transactions/merchant/:merchantName',
  mcpRequestLogger,
  vapiMcpController.getTransactionsByMerchant
);

// ========== Advanced Intelligence Routes ==========

/**
 * POST /intelligence/analyze
 * 
 * Advanced transaction intelligence analysis for sophisticated scammer verification.
 * Provides deep pattern analysis and fraud detection insights.
 * 
 * @route POST /api/mcp/intelligence/analyze
 * @param {string} queryType.body.required - Analysis type (pattern_analysis, fraud_detection, etc.)
 * @param {Object} filters.body.required - Analysis filters and parameters
 * @param {Object} [options].body - Analysis options and configuration
 * @returns {Object} 200 - Advanced intelligence analysis results
 * @returns {Object} 400 - Validation error response
 * @returns {Object} 422 - Semantic validation error (invalid analysis parameters)
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * POST /api/mcp/intelligence/analyze
 * Content-Type: application/json
 * 
 * {
 *   "queryType": "pattern_analysis",
 *   "filters": {
 *     "cardToken": "card_abc",
 *     "timeframe": "7d"
 *   },
 *   "options": {
 *     "includeRiskScore": true,
 *     "includePatterns": true
 *   }
 * }
 */
router.post('/intelligence/analyze',
  mcpRequestLogger,
  validateIntelligenceQuery,
  vapiMcpController.analyzeTransactionIntelligence
);

// ========== Connection Management Routes ==========

/**
 * GET /health
 * 
 * Health check endpoint for MCP server status and performance metrics.
 * Provides comprehensive status information for monitoring and debugging.
 * 
 * @route GET /api/mcp/health
 * @returns {Object} 200 - MCP server health status and metrics
 * @returns {Object} 503 - Service unavailable response
 * 
 * @example
 * GET /api/mcp/health
 * 
 * // Response:
 * {
 *   "jsonrpc": "2.0",
 *   "result": {
 *     "status": "healthy",
 *     "timestamp": "2024-01-15T10:30:00Z",
 *     "services": {
 *       "mcpServer": {"status": "active", "responseTime": "15ms"},
 *       "alertService": {"status": "active", "activeConnections": 3},
 *       "transactionService": {"status": "active", "querySpeed": "avg 45ms"}
 *     },
 *     "performance": {
 *       "uptime": 3600,
 *       "memoryUsage": "125MB",
 *       "avgResponseTime": "32ms"
 *     }
 *   },
 *   "id": null
 * }
 */
router.get('/health',
  mcpRequestLogger,
  vapiMcpController.healthCheck
);

/**
 * GET /connections
 * 
 * Administrative endpoint to get current MCP connection statistics.
 * Provides detailed information about active AI agent sessions.
 * 
 * @route GET /api/mcp/connections
 * @param {boolean} [detailed=false].query - Include detailed session information
 * @returns {Object} 200 - MCP connection statistics and session details
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * GET /api/mcp/connections?detailed=true
 * 
 * // Response:
 * {
 *   "jsonrpc": "2.0",
 *   "result": {
 *     "summary": {
 *       "activeConnections": 3,
 *       "totalSessions": 15,
 *       "averageSessionDuration": "12 minutes"
 *     },
 *     "connections": [
 *       {
 *         "sessionId": "uuid",
 *         "agentId": "agent_vapi_123",
 *         "cardTokens": ["card_abc"],
 *         "status": "active",
 *         "connectionHealth": 0.98,
 *         "connectedAt": "2024-01-15T10:15:00Z"
 *       }
 *     ]
 *   },
 *   "id": null
 * }
 */
router.get('/connections',
  mcpRequestLogger,
  vapiMcpController.getMcpConnectionStats
);

// ========== Error Handling ==========

// Apply error handling middleware to all routes
router.use(mcpErrorHandler);

export default router; 