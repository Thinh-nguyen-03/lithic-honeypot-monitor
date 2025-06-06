/**
 * Alert Controller - Handles SSE connections for AI agents and real-time message delivery
 * 
 * This controller provides:
 * - SSE endpoint establishment for AI agents
 * - Authentication and authorization checking
 * - Real-time transaction alert delivery
 * - Connection lifecycle management
 * - Error handling and monitoring
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import connectionManager from '../../services/connection-manager.js';
import alertService from '../../services/alert-service.js';

/**
 * Main SSE endpoint handler for AI agent connections.
 * Establishes Server-Sent Events connection with proper headers and authentication.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export async function establishSSEConnection(req, res) {
  const requestId = req.requestId || uuidv4();
  const startTime = Date.now();
  
  // Request already logged by route middleware

  try {
    // Authenticate the AI agent
    const authentication = await authenticateAgent(req);
    if (!authentication.success) {
      logger.warn({
        requestId,
        reason: authentication.reason,
        ip: req.ip
      }, 'SSE connection authentication failed');
      
      return handleAuthenticationError(authentication.reason, res, requestId);
    }

    // Extract connection parameters
    const { agentId, cardTokens, metadata } = authentication.agent;
    
    // Validate required parameters
    if (!cardTokens || cardTokens.length === 0) {
      logger.warn({
        requestId,
        agentId
      }, 'No card tokens provided for monitoring');
      
      return res.status(400).json({
        error: 'Bad Request',
        message: 'At least one card token must be provided for monitoring',
        timestamp: new Date().toISOString(),
        requestId
      });
    }

    // For now, we'll use the first card token for the connection
    // TODO: Enhance to support multiple card tokens per connection
    const primaryCardToken = cardTokens[0];

    // Create connection through connection manager (it will set SSE headers)
    const connectionInfo = await connectionManager.createConnection(
      req,
      res,
      primaryCardToken,
      {
        agentId,
        cardTokens,
        requestId,
        authenticatedAt: new Date(),
        ...metadata
      }
    );

    // Send welcome message
    await sendWelcomeMessage(connectionInfo, res, agentId);

    // Set up client disconnect handlers
    handleClientDisconnect(req, res, connectionInfo.sessionId, requestId);

    // Log successful connection establishment
    const duration = Date.now() - startTime;
    logger.info({
      requestId,
      sessionId: connectionInfo.sessionId,
      agentId,
      cardTokens,
      duration,
      activeConnections: connectionManager.getMetrics().activeConnections
    }, 'SSE connection established successfully');

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      requestId,
      error: error.message,
      stack: error.stack,
      duration,
      ip: req.ip
    }, 'Failed to establish SSE connection');

    return handleConnectionError(error, res, requestId);
  }
}

/**
 * Authenticates AI agent credentials and extracts connection parameters.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @returns {Promise<Object>} Authentication result with agent info.
 */
export async function authenticateAgent(req) {
  try {
    let token = null;
    let authMethod = 'header';

    // Try to extract authentication token from Authorization header first
    const authHeader = req.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      authMethod = 'header';
    } 
    // Fallback to token from query parameter (for web interface and EventSource)
    else if (req.query.token) {
      token = req.query.token;
      authMethod = 'query_param';
    }
    // No authentication found
    else {
      return {
        success: false,
        reason: 'missing_authentication'
      };
    }

    if (!token || token.length === 0) {
      return {
        success: false,
        reason: 'empty_token'
      };
    }

    // For web interface tokens, use simplified validation
    if (authMethod === 'query_param' && token.startsWith('web-interface-token-')) {
      // Allow web interface tokens (simplified auth for demo purposes)
      // In production, implement proper token validation
    } else {
      // Authenticate with connection manager for Bearer tokens
      const authHeaderForValidation = authMethod === 'header' ? authHeader : `Bearer ${token}`;
      const isValid = await connectionManager.authenticateConnection(authHeaderForValidation);
      if (!isValid) {
        return {
          success: false,
          reason: 'invalid_token'
        };
      }
    }

    // Extract agent parameters from query string or body
    const agentId = req.query.agentId || req.body?.agentId || `agent_${uuidv4().substr(0, 8)}`;
    
    // Extract card tokens to monitor
    let cardTokens = [];
    if (req.query.cardTokens) {
      // Handle comma-separated card tokens in query string
      cardTokens = req.query.cardTokens.split(',').map(token => token.trim());
    } else if (req.body?.cardTokens && Array.isArray(req.body.cardTokens)) {
      cardTokens = req.body.cardTokens;
    } else if (req.query.cardToken) {
      // Single card token
      cardTokens = [req.query.cardToken];
    }

    // For web interface tokens, automatically get all available cards if none specified
    if (cardTokens.length === 0 && authMethod === 'query_param' && token.startsWith('web-interface-token-')) {
      try {
        // Import card service to get available cards
        const { listCards } = await import('../../services/card-service.js');
        const availableCards = await listCards({ state: 'OPEN' });
        
        if (availableCards && availableCards.length > 0) {
          cardTokens = availableCards.map(card => card.token);
          logger.info({
            agentId,
            cardCount: cardTokens.length
          }, 'Web interface auto-subscribed to all available cards');
        }
      } catch (error) {
        logger.error({
          error: error.message,
          agentId
        }, 'Failed to get available cards for web interface');
      }
    }

    // Validate card tokens
    if (cardTokens.length === 0) {
      return {
        success: false,
        reason: 'no_card_tokens'
      };
    }

    // Extract additional metadata
    const metadata = {
      connectionType: req.query.connectionType || 'sse',
      sessionId: req.query.sessionId,
      conversationId: req.query.conversationId,
      apiVersion: req.query.apiVersion || 'v1',
      clientVersion: req.get('x-client-version'),
      platform: req.get('x-platform'),
      authMethod: authMethod
    };

    return {
      success: true,
      agent: {
        agentId,
        cardTokens,
        token,
        metadata
      }
    };

  } catch (error) {
    logger.error({
      error: error.message,
      ip: req.ip
    }, 'Authentication error');

    return {
      success: false,
      reason: 'authentication_error'
    };
  }
}

/**
 * Handles authentication errors with appropriate HTTP responses.
 * 
 * @param {string} reason - The authentication failure reason.
 * @param {import('express').Response} res - The Express response object.
 * @param {string} requestId - Request ID for tracking.
 */
function handleAuthenticationError(reason, res, requestId) {
  // Don't send response if headers already sent
  if (res.headersSent) {
    logger.error({
      requestId,
      reason
    }, 'Authentication error occurred after headers sent');
    return;
  }

  const errorMessages = {
    missing_authorization_header: 'Authorization header is required',
    invalid_authorization_format: 'Authorization header must use Bearer token format',
    empty_token: 'Authorization token cannot be empty',
    invalid_token: 'Invalid or expired authentication token',
    no_card_tokens: 'At least one card token must be provided for monitoring',
    authentication_error: 'Internal authentication error'
  };

  const statusCodes = {
    missing_authorization_header: 401,
    invalid_authorization_format: 401,
    empty_token: 401,
    invalid_token: 401,
    no_card_tokens: 400,
    authentication_error: 500
  };

  const message = errorMessages[reason] || 'Authentication failed';
  const statusCode = statusCodes[reason] || 401;

  return res.status(statusCode).json({
    error: statusCode === 401 ? 'Unauthorized' : 'Authentication Error',
    message,
    reason,
    timestamp: new Date().toISOString(),
    requestId
  });
}

/**
 * Sends welcome message to newly connected AI agent.
 * 
 * @param {Object} connectionInfo - Connection information from connection manager.
 * @param {import('express').Response} res - The Express response object.
 * @param {string} agentId - Agent identifier.
 */
async function sendWelcomeMessage(connectionInfo, res, agentId) {
  try {
    const welcomeData = {
      type: 'welcome',
      data: {
        sessionId: connectionInfo.sessionId,
        agentId,
        cardToken: connectionInfo.cardToken,
        status: 'connected',
        timestamp: new Date().toISOString(),
        server: {
          version: '1.0.0',
          capabilities: [
            'real_time_alerts',
            'transaction_intelligence',
            'connection_health_monitoring'
          ]
        }
      }
    };

    // Send SSE formatted message
    const sseMessage = `event: welcome\ndata: ${JSON.stringify(welcomeData.data)}\n\n`;
    res.write(sseMessage);

    logger.debug({
      sessionId: connectionInfo.sessionId,
      agentId
    }, 'Welcome message sent');

  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: connectionInfo.sessionId,
      agentId
    }, 'Failed to send welcome message');
  }
}

/**
 * Sets up handlers for client disconnection events.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {string} sessionId - Session ID for the connection.
 * @param {string} requestId - Request ID for tracking.
 */
function handleClientDisconnect(req, res, sessionId, requestId) {
  // Handle client closing the connection
  req.on('close', () => {
    logger.info({
      sessionId,
      requestId,
      reason: 'client_close'
    }, 'Client closed SSE connection');
    
    connectionManager.handleDisconnection(sessionId, 'client_close');
  });

  // Handle request errors
  req.on('error', (error) => {
    logger.error({
      sessionId,
      requestId,
      error: error.message
    }, 'SSE request error');
    
    connectionManager.handleDisconnection(sessionId, 'request_error');
  });

  // Handle response errors
  res.on('error', (error) => {
    logger.error({
      sessionId,
      requestId,
      error: error.message
    }, 'SSE response error');
    
    connectionManager.handleDisconnection(sessionId, 'response_error');
  });

  // Handle response finish (connection ended)
  res.on('finish', () => {
    logger.debug({
      sessionId,
      requestId
    }, 'SSE response finished');
  });
}

/**
 * Centralized error handling for connection failures.
 * 
 * @param {Error} error - The error that occurred.
 * @param {import('express').Response} res - The Express response object.
 * @param {string} requestId - Request ID for tracking.
 */
export function handleConnectionError(error, res, requestId) {
  // Don't send response if headers already sent (SSE connection established)
  if (res.headersSent) {
    logger.error({
      error: error.message,
      requestId
    }, 'Error occurred after SSE headers sent');
    
    // Try to send error event through SSE
    try {
      const errorEvent = {
        type: 'error',
        data: {
          error: 'Connection Error',
          message: 'An error occurred with your connection',
          timestamp: new Date().toISOString(),
          requestId
        }
      };
      
      const sseMessage = `event: error\ndata: ${JSON.stringify(errorEvent.data)}\n\n`;
      res.write(sseMessage);
      res.end();
    } catch (sseError) {
      logger.error({
        error: sseError.message,
        requestId
      }, 'Failed to send SSE error event');
    }
    
    return;
  }

  // Determine appropriate error response
  let statusCode = 500;
  let errorType = 'Internal Server Error';
  let message = 'An unexpected error occurred while establishing connection';

  if (error.message.includes('authentication')) {
    statusCode = 401;
    errorType = 'Authentication Error';
    message = 'Failed to authenticate connection';
  } else if (error.message.includes('validation')) {
    statusCode = 400;
    errorType = 'Validation Error';
    message = 'Invalid connection parameters';
  } else if (error.message.includes('timeout')) {
    statusCode = 408;
    errorType = 'Timeout Error';
    message = 'Connection establishment timed out';
  }

  return res.status(statusCode).json({
    error: errorType,
    message,
    timestamp: new Date().toISOString(),
    requestId
  });
}

/**
 * Health check endpoint for SSE service status.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export async function healthCheck(req, res) {
  const requestId = req.requestId || uuidv4();
  
  try {
    // Get connection manager metrics
    const metrics = connectionManager.getMetrics();
    
    // Get alert service status
    const alertServiceStatus = alertService.getMetrics();
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      requestId,
      services: {
        connectionManager: {
          status: 'active',
          activeConnections: metrics.activeConnections,
          totalConnections: metrics.totalConnections,
          failedConnections: metrics.failedConnections
        },
        alertService: {
          status: 'active',
          registeredConnections: alertServiceStatus.totalConnections,
          messagesSent: alertServiceStatus.messagesSent,
          messagesDelivered: alertServiceStatus.messagesDelivered
        }
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version
    };

    logger.debug({
      requestId,
      activeConnections: metrics.activeConnections
    }, 'Health check performed');

    res.status(200).json(healthData);

  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'Health check failed');

    res.status(503).json({
      status: 'unhealthy',
      error: 'Service Unavailable',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}

/**
 * Endpoint to get current connection statistics.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export async function getConnectionStats(req, res) {
  const requestId = req.requestId || uuidv4();
  
  try {
    // Get detailed connection information
    const connections = connectionManager.getAllConnections();
    const metrics = connectionManager.getMetrics();

    const stats = {
      summary: {
        active: metrics.activeConnections,
        total: metrics.totalConnections,
        failed: metrics.failedConnections,
        reconnectionAttempts: metrics.reconnectionAttempts
      },
      healthChecks: {
        passed: metrics.healthChecksPassed,
        failed: metrics.healthChecksFailed
      },
      connections: connections.map(conn => ({
        sessionId: conn.sessionId,
        agentId: conn.agentId,
        cardToken: conn.cardToken,
        status: conn.status,
        establishedAt: conn.establishedAt,
        lastActivity: conn.lastActivity,
        healthScore: conn.healthChecksPassed / (conn.healthChecksPassed + conn.healthChecksFailed + 1)
      })),
      timestamp: new Date().toISOString(),
      requestId
    };

    logger.debug({
      requestId,
      activeConnections: metrics.activeConnections
    }, 'Connection stats requested');

    res.status(200).json(stats);

  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'Failed to get connection stats');

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve connection statistics',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
} 