/**
 * Alert Routes - Express routes for real-time SSE connections and alert management
 * 
 * This module provides:
 * - SSE endpoint for AI agent connections
 * - Connection management endpoints
 * - Health check and monitoring routes
 * - Administrative endpoints for testing and maintenance
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as alertController from '../controllers/alert-controller.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ========== Middleware Functions ==========

/**
 * Error handling middleware for alert routes.
 * Catches any unhandled errors and returns standardized error responses.
 * 
 * @param {Error} error - The error that occurred
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function alertErrorHandler(error, req, res, next) {
  const requestId = req.requestId || uuidv4();
  
  logger.error({
    requestId,
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  }, 'Alert route error');

  // Don't send error response if headers already sent (for SSE connections)
  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    requestId
  });
}

/**
 * Request logging middleware for alert routes.
 * Logs incoming requests with timing and metadata.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function alertRequestLogger(req, res, next) {
  const requestId = req.requestId || uuidv4();
  req.requestId = requestId;
  req.startTime = Date.now();

  logger.info({
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    contentLength: req.get('content-length')
  }, 'Alert route request received');

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logger.info({
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration
    }, 'Alert route request completed');
  });

  next();
}

/**
 * Parameter validation middleware for route parameters.
 * Validates and sanitizes URL parameters like cardToken and sessionId.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function validateRouteParams(req, res, next) {
  const requestId = req.requestId || uuidv4();

  try {
    // Validate cardToken parameter
    if (req.params.cardToken) {
      const cardToken = req.params.cardToken.trim();
      
      // Basic validation - alphanumeric with underscores and dashes
      if (!/^[a-zA-Z0-9_-]+$/.test(cardToken) || cardToken.length > 50) {
        logger.warn({
          requestId,
          cardToken: cardToken.substring(0, 10) + '...',
          ip: req.ip
        }, 'Invalid card token format');

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid card token format',
          field: 'cardToken',
          timestamp: new Date().toISOString(),
          requestId
        });
      }

      req.params.cardToken = cardToken;
    }

    // Validate sessionId parameter
    if (req.params.sessionId) {
      const sessionId = req.params.sessionId.trim();
      
      // UUID format validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(sessionId)) {
        logger.warn({
          requestId,
          sessionId: sessionId.substring(0, 8) + '...',
          ip: req.ip
        }, 'Invalid session ID format');

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid session ID format',
          field: 'sessionId',
          timestamp: new Date().toISOString(),
          requestId
        });
      }

      req.params.sessionId = sessionId;
    }

    next();
  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'Route parameter validation error');

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Parameter validation failed',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}

// ========== Route Definitions ==========

/**
 * GET /stream/:cardToken
 * 
 * Primary SSE endpoint for AI agents to connect and receive real-time transaction alerts.
 * Establishes a Server-Sent Events connection for the specified card token.
 * 
 * @route GET /api/alerts/stream/:cardToken
 * @param {string} cardToken.path.required - Card token to monitor for transactions
 * @param {string} agentId.query.required - Unique identifier for the AI agent
 * @param {string} [cardTokens].query - Comma-separated list of additional card tokens
 * @param {string} [connectionType=sse].query - Connection type (currently only 'sse' supported)
 * @param {string} [apiVersion=v1].query - API version for compatibility
 * @param {string} [sessionId].query - Optional session identifier for tracking
 * @param {string} [conversationId].query - Optional conversation identifier
 * @returns {Stream} Server-Sent Events stream with transaction alerts
 * @returns {Object} 400 - Validation error response
 * @returns {Object} 401 - Authentication error response
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * GET /api/alerts/stream/card_123?agentId=agent_456&apiVersion=v1
 * Authorization: Bearer your_token_here
 * 
 * // SSE Response:
 * event: welcome
 * data: {"sessionId":"uuid","agentId":"agent_456","status":"connected"}
 * 
 * event: transaction
 * data: {"alertType":"NEW_TRANSACTION","transactionId":"txn_123",...}
 */
router.get('/stream/:cardToken', 
  alertRequestLogger,
  validateRouteParams,
  alertController.establishSSEConnection
);

/**
 * GET /health
 * 
 * Health check endpoint for real-time alert system status and metrics.
 * Returns comprehensive status information about alert services.
 * 
 * @route GET /api/alerts/health
 * @returns {Object} 200 - Health status and service metrics
 * @returns {Object} 503 - Service unavailable response
 * 
 * @example
 * GET /api/alerts/health
 * 
 * // Response:
 * {
 *   "status": "healthy",
 *   "timestamp": "2024-01-15T10:30:00Z",
 *   "services": {
 *     "connectionManager": {"status": "active", "activeConnections": 5},
 *     "alertService": {"status": "active", "messagesSent": 150}
 *   },
 *   "uptime": 3600,
 *   "memory": {...}
 * }
 */
router.get('/health',
  alertRequestLogger,
  alertController.healthCheck
);

/**
 * GET /connections
 * 
 * Administrative endpoint to get current connection statistics and active sessions.
 * Provides detailed information about connected AI agents and connection health.
 * 
 * @route GET /api/alerts/connections
 * @returns {Object} 200 - Connection statistics and active session details
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * GET /api/alerts/connections
 * 
 * // Response:
 * {
 *   "summary": {"active": 3, "total": 10, "failed": 1},
 *   "healthChecks": {"passed": 45, "failed": 2},
 *   "connections": [
 *     {
 *       "sessionId": "uuid",
 *       "agentId": "agent_123",
 *       "cardToken": "card_456",
 *       "status": "active",
 *       "establishedAt": "2024-01-15T10:00:00Z",
 *       "healthScore": 0.95
 *     }
 *   ]
 * }
 */
router.get('/connections',
  alertRequestLogger,
  alertController.getConnectionStats
);

/**
 * POST /test-alert
 * 
 * Development and testing endpoint to manually trigger transaction alerts.
 * Useful for testing AI agent responses and system integration.
 * 
 * @route POST /api/alerts/test-alert
 * @param {string} cardToken.body.required - Card token to send test alert for
 * @param {string} [alertType=TEST_TRANSACTION].body - Type of alert to send
 * @param {Object} [transactionData].body - Custom transaction data for testing
 * @returns {Object} 200 - Test alert sent successfully
 * @returns {Object} 400 - Validation error response
 * @returns {Object} 404 - No active connections for card token
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * POST /api/alerts/test-alert
 * Content-Type: application/json
 * 
 * {
 *   "cardToken": "card_123",
 *   "alertType": "TEST_TRANSACTION",
 *   "transactionData": {
 *     "amount": "$5.00",
 *     "merchant": "Test Coffee Shop",
 *     "location": "Test City, TX"
 *   }
 * }
 */
router.post('/test-alert',
  alertRequestLogger,
  async (req, res) => {
    const requestId = req.requestId || uuidv4();
    
    try {
      const { cardToken, alertType = 'TEST_TRANSACTION', transactionData = {} } = req.body;
      
      // Validate required fields
      if (!cardToken) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Card token is required',
          field: 'cardToken',
          timestamp: new Date().toISOString(),
          requestId
        });
      }

      // Create test alert payload
      const testAlert = {
        alertType,
        timestamp: new Date().toISOString(),
        transactionId: `test_txn_${uuidv4().substr(0, 8)}`,
        cardToken,
        immediate: {
          amount: transactionData.amount || '$1.00',
          merchant: transactionData.merchant || 'Test Merchant',
          location: transactionData.location || 'Test Location',
          status: 'APPROVED',
          network: 'TEST',
          networkTransactionID: `test_${Date.now()}`
        },
        verification: {
          mccCode: '9999',
          merchantType: 'Test Merchant',
          merchantCategory: 'Testing',
          authorizationCode: '123456',
          retrievalReference: 'TEST123'
        },
        intelligence: {
          isFirstTransaction: false,
          merchantHistory: 'Test transaction for development',
          geographicPattern: 'Test pattern',
          isTestAlert: true
        }
      };

      // Send alert through alert service
      const alertService = (await import('../../services/alert-service.js')).default;
      const result = await alertService.broadcastAlert(cardToken, testAlert);

      logger.info({
        requestId,
        cardToken,
        alertType,
        deliveredTo: result.deliveredTo
      }, 'Test alert sent');

      res.status(200).json({
        message: 'Test alert sent successfully',
        alertType,
        cardToken,
        deliveredTo: result.deliveredTo,
        timestamp: new Date().toISOString(),
        requestId
      });

    } catch (error) {
      logger.error({
        requestId,
        error: error.message,
        stack: error.stack
      }, 'Failed to send test alert');

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to send test alert',
        timestamp: new Date().toISOString(),
        requestId
      });
    }
  }
);

/**
 * DELETE /connection/:sessionId
 * 
 * Administrative endpoint to force disconnect a specific AI agent session.
 * Useful for maintenance, debugging, or handling problematic connections.
 * 
 * @route DELETE /api/alerts/connection/:sessionId
 * @param {string} sessionId.path.required - Session ID to disconnect (UUID format)
 * @param {string} [reason=admin_disconnect].query - Reason for disconnection
 * @returns {Object} 200 - Session disconnected successfully
 * @returns {Object} 400 - Validation error (invalid session ID format)
 * @returns {Object} 404 - Session not found
 * @returns {Object} 500 - Internal server error response
 * 
 * @example
 * DELETE /api/alerts/connection/550e8400-e29b-41d4-a716-446655440000?reason=maintenance
 * 
 * // Response:
 * {
 *   "message": "Session disconnected successfully",
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *   "reason": "maintenance",
 *   "timestamp": "2024-01-15T10:30:00Z"
 * }
 */
router.delete('/connection/:sessionId',
  alertRequestLogger,
  validateRouteParams,
  async (req, res) => {
    const requestId = req.requestId || uuidv4();
    
    try {
      const { sessionId } = req.params;
      const reason = req.query.reason || 'admin_disconnect';

      // Import connection manager
      const connectionManager = (await import('../../services/connection-manager.js')).default;
      
      // Check if session exists
      const connectionHealth = connectionManager.getConnectionHealth(sessionId);
      if (!connectionHealth) {
        logger.warn({
          requestId,
          sessionId,
          ip: req.ip
        }, 'Attempted to disconnect non-existent session');

        return res.status(404).json({
          error: 'Not Found',
          message: 'Session not found or already disconnected',
          sessionId,
          timestamp: new Date().toISOString(),
          requestId
        });
      }

      // Force disconnect the session
      connectionManager.handleDisconnection(sessionId, reason);

      logger.info({
        requestId,
        sessionId,
        reason,
        ip: req.ip
      }, 'Session force disconnected');

      res.status(200).json({
        message: 'Session disconnected successfully',
        sessionId,
        reason,
        timestamp: new Date().toISOString(),
        requestId
      });

    } catch (error) {
      logger.error({
        requestId,
        error: error.message,
        stack: error.stack
      }, 'Failed to disconnect session');

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to disconnect session',
        timestamp: new Date().toISOString(),
        requestId
      });
    }
  }
);

// ========== Additional Utility Routes ==========

/**
 * GET /metrics
 * 
 * Detailed metrics endpoint for monitoring and observability.
 * Provides comprehensive system metrics for external monitoring tools.
 * 
 * @route GET /api/alerts/metrics
 * @returns {Object} 200 - Detailed system metrics
 * @returns {Object} 500 - Internal server error response
 */
router.get('/metrics',
  alertRequestLogger,
  async (req, res) => {
    const requestId = req.requestId || uuidv4();
    
    try {
      // Import services
      const connectionManager = (await import('../../services/connection-manager.js')).default;
      const alertService = (await import('../../services/alert-service.js')).default;

      const connectionMetrics = connectionManager.getMetrics();
      const alertMetrics = alertService.getMetrics();

      const metrics = {
        timestamp: new Date().toISOString(),
        requestId,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform
        },
        connections: {
          active: connectionMetrics.activeConnections,
          total: connectionMetrics.totalConnections,
          failed: connectionMetrics.failedConnections,
          reconnectionAttempts: connectionMetrics.reconnectionAttempts,
          healthChecksPassed: connectionMetrics.healthChecksPassed,
          healthChecksFailed: connectionMetrics.healthChecksFailed
        },
        alerts: {
          totalConnections: alertMetrics.totalConnections,
          messagesSent: alertMetrics.messagesSent,
          messagesDelivered: alertMetrics.messagesDelivered,
          messagesRetried: alertMetrics.messagesRetried || 0,
          messagesFailed: alertMetrics.messagesFailed || 0
        },
        performance: {
          averageConnectionDuration: connectionMetrics.averageConnectionDuration || 0,
          averageMessageDeliveryTime: alertMetrics.averageDeliveryTime || 0,
          successRate: alertMetrics.messagesSent > 0 
            ? (alertMetrics.messagesDelivered / alertMetrics.messagesSent) * 100 
            : 100
        }
      };

      res.status(200).json(metrics);

    } catch (error) {
      logger.error({
        requestId,
        error: error.message
      }, 'Failed to get metrics');

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve metrics',
        timestamp: new Date().toISOString(),
        requestId
      });
    }
  }
);

// ========== Error Handling ==========

// Apply error handling middleware to all routes
router.use(alertErrorHandler);

export default router; 