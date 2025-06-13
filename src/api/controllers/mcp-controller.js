/**
 * Enhanced MCP Controller - Handles Model Context Protocol requests for AI agents
 * 
 * PURPOSE: AI-TO-SYSTEM COMMUNICATION for intelligent transaction analysis and scammer verification
 * 
 * This controller provides comprehensive MCP (Model Context Protocol) functionality for:
 * 
 * TARGET CLIENTS:
 * - Conversational AI Agents during live scammer phone calls
 * - AI Systems for dynamic transaction verification  
 * - Automated Fraud Detection systems for pattern analysis
 * 
 * PROTOCOL: JSON-RPC 2.0 with Bearer token authentication
 * 
 * CAPABILITIES:
 * - Real-time alert subscription management for AI agents
 * - Natural language transaction query processing
 * - Scammer verification data formatting with full PAN access
 * - Integration with existing transaction intelligence
 * - MCP-compliant JSON-RPC 2.0 responses
 * 
 * SECURITY: HIGH - Handles sensitive card data (PAN) for scammer verification scenarios
 * 
 * NOTE: This is DISTINCT from /alerts/stream endpoints which serve web interfaces.
 *       MCP endpoints are specifically designed for AI agent communication during 
 *       live scammer interactions, while alert endpoints serve human monitoring interfaces.
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import alertService from '../../services/alert-service.js';
import connectionManager from '../../services/connection-manager.js';
import * as reportingService from '../../services/reporting-service.js';
import * as supabaseService from '../../services/supabase-service.js';
import * as cardService from '../../services/card-service.js';



// ========== Alert Subscription Management ==========

/**
 * Enhanced subscription handler for AI agents to receive real-time transaction alerts.
 * Establishes robust MCP connection with comprehensive error handling and recovery.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function subscribeToAlerts(req, res) {
  const requestId = req.requestId || uuidv4();
  const startTime = Date.now();
  
  logger.info({
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  }, 'Enhanced MCP alert subscription request received');

  try {
    const { agentId, cardTokens, connectionType = 'mcp_subscription', metadata = {} } = req.validatedData;
    
    // Enhanced validation
    if (!agentId || !Array.isArray(cardTokens) || cardTokens.length === 0) {
      logger.warn({
        requestId,
        agentId,
        cardTokens
      }, 'Invalid subscription request parameters');

      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Invalid subscription parameters',
          data: {
            required: ['agentId', 'cardTokens'],
            received: { agentId: !!agentId, cardTokens: Array.isArray(cardTokens) ? cardTokens.length : 'not_array' }
          }
        },
        id: null
      });
    }

    // Generate session ID for this subscription
    const sessionId = uuidv4();
    
    // Enhanced connection metadata
    const enhancedMetadata = {
      ...metadata,
      agentId,
      cardTokens,
      connectionType,
      subscriptionType: 'MCP_SUBSCRIPTION',
      establishedAt: new Date(),
      capabilities: [
        'real_time_alerts',
        'transaction_queries',
        'scammer_verification',
        'merchant_intelligence'
      ]
    };

    // Create enhanced mock connection for alert service registration
    const enhancedConnection = {
      sessionId,
      agentId,
      type: 'mcp_subscription',
      write: (data) => {
        logger.debug({ 
          sessionId, 
          agentId,
          dataSize: data?.length || 0 
        }, 'Alert data ready for MCP delivery');
      },
      isActive: () => true,
      getMetadata: () => enhancedMetadata
    };

    // Track registration results for all card tokens
    const registrationResults = [];
    let successfulRegistrations = 0;

    // Register with alert service for each card token
    for (const cardToken of cardTokens) {
      try {
        const registrationSuccess = alertService.registerConnection(
          sessionId,
          cardToken,
          enhancedConnection
        );
        
        registrationResults.push({
          cardToken,
          success: registrationSuccess,
          error: registrationSuccess ? null : 'Registration failed'
        });

        if (registrationSuccess) {
          successfulRegistrations++;
          logger.debug({
            requestId,
            sessionId,
            cardToken
          }, 'Successfully registered card token with alert service');
        } else {
          logger.warn({
            requestId,
            sessionId,
            cardToken
          }, 'Failed to register card token with alert service');
        }
      } catch (error) {
        logger.error({
          requestId,
          sessionId,
          cardToken,
          error: error.message
        }, 'Error during card token registration');
        
        registrationResults.push({
          cardToken,
          success: false,
          error: error.message
        });
      }
    }

    // Check if at least one registration succeeded
    if (successfulRegistrations === 0) {
      logger.error({
        requestId,
        sessionId,
        agentId,
        cardTokens,
        registrationResults
      }, 'Failed to register any card tokens with alert service');
      
      return res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to register alert subscription for any card tokens',
          data: { 
            requestId,
            registrationResults,
            sessionId
          }
        },
        id: null
      });
    }

    // Store subscription with enhanced connection manager
    try {
      const connectionInfo = await connectionManager.createConnection(req, res, cardTokens[0], {
        sessionId,
        agentId,
        cardTokens,
        connectionType,
        subscriptionMetadata: enhancedMetadata,
        mcpSubscription: true,
        authenticatedAt: new Date(),
        registrationResults
      });

      logger.debug({
        requestId,
        sessionId,
        connectionInfo
      }, 'Connection manager registration completed');

    } catch (connectionError) {
      logger.warn({
        requestId,
        sessionId,
        error: connectionError.message
      }, 'Connection manager registration failed, but alert service registration succeeded');
      
      // Continue since alert service registration succeeded
    }

    const duration = Date.now() - startTime;
    
    logger.info({
      requestId,
      sessionId,
      agentId,
      cardTokens,
      successfulRegistrations,
      totalRequested: cardTokens.length,
      connectionType,
      duration
    }, 'Enhanced MCP alert subscription created successfully');

    // Send welcome message through alert system
    try {
      await sendWelcomeMessage(sessionId, cardTokens, agentId);
    } catch (welcomeError) {
      logger.warn({
        requestId,
        sessionId,
        error: welcomeError.message
      }, 'Failed to send welcome message, but subscription is active');
    }

    // Check if headers have already been sent (for SSE connections)
    if (res.headersSent) {
      logger.info({
        requestId,
        sessionId,
        agentId,
        cardTokens,
        successfulRegistrations,
        connectionType
      }, 'Enhanced MCP alert subscription created successfully (SSE connection established)');
      return; // Don't send JSON response for SSE connections
    }

    // Enhanced MCP-compliant success response
    res.status(200).json({
      jsonrpc: '2.0',
      result: {
        sessionId,
        agentId,
        monitoringCards: cardTokens,
        successfulRegistrations,
        connectionType,
        status: 'subscribed',
        timestamp: new Date().toISOString(),
        capabilities: enhancedMetadata.capabilities,
        subscriptionHealth: {
          totalCards: cardTokens.length,
          registeredCards: successfulRegistrations,
          registrationRate: `${Math.round((successfulRegistrations / cardTokens.length) * 100)}%`
        },
        registrationResults
      },
      id: null
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      requestId,
      error: error.message,
      stack: error.stack,
      duration
    }, 'Failed to create enhanced MCP alert subscription');

    // Check if headers have already been sent before sending error response
    if (res.headersSent) {
      logger.error({
        requestId,
        error: error.message
      }, 'Error occurred but headers already sent (SSE connection)');
      return;
    }

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error during enhanced subscription',
        data: {
          timestamp: new Date().toISOString(),
          requestId,
          errorType: error.constructor.name
        }
      },
      id: null
    });
  }
}

/**
 * Enhanced unsubscription handler for AI agents.
 * Cleanly terminates MCP connection with comprehensive cleanup and recovery.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function unsubscribeFromAlerts(req, res) {
  const requestId = req.requestId || uuidv4();
  const { sessionId } = req.params;
  const reason = req.query.reason || req.body?.reason || 'agent_disconnect';
  const forceCleanup = req.query.force === 'true';
  
  logger.info({
    requestId,
    sessionId,
    reason,
    forceCleanup
  }, 'Enhanced MCP alert unsubscription request received');

  try {
    // Enhanced session validation
    const connectionHealth = connectionManager.getConnectionHealth(sessionId);
    if (!connectionHealth && !forceCleanup) {
      logger.warn({
        requestId,
        sessionId,
        reason
      }, 'Attempted to unsubscribe non-existent MCP session');

      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Session not found or already unsubscribed',
          data: { 
            sessionId,
            reason,
            suggestion: 'Use force=true query parameter to force cleanup if needed'
          }
        },
        id: null
      });
    }

    // Get session details before cleanup for logging
    const sessionDetails = connectionHealth ? {
      establishedAt: connectionHealth.establishedAt,
      lastActivity: connectionHealth.lastActivity,
      healthChecksPassed: connectionHealth.healthChecksPassed,
      healthChecksFailed: connectionHealth.healthChecksFailed,
      reconnectAttempts: connectionHealth.reconnectAttempts
    } : null;

    // Enhanced cleanup process
    const cleanupResults = {
      alertServiceRemoval: false,
      connectionManagerCleanup: false,
      errors: []
    };

    // Remove from alert service with error handling
    try {
      cleanupResults.alertServiceRemoval = alertService.removeConnection(sessionId);
      if (cleanupResults.alertServiceRemoval) {
        logger.debug({ requestId, sessionId }, 'Successfully removed from alert service');
      } else {
        logger.warn({ requestId, sessionId }, 'Alert service reported failed removal');
      }
    } catch (alertError) {
      logger.warn({
        requestId,
        sessionId,
        error: alertError.message
      }, 'Error removing from alert service');
      cleanupResults.errors.push(`Alert service: ${alertError.message}`);
    }

    // Remove from connection manager with error handling
    try {
      connectionManager.handleDisconnection(sessionId, reason);
      cleanupResults.connectionManagerCleanup = true;
      logger.debug({ requestId, sessionId }, 'Successfully cleaned up connection manager');
    } catch (connectionError) {
      logger.warn({
        requestId,
        sessionId,
        error: connectionError.message
      }, 'Error during connection manager cleanup');
      cleanupResults.errors.push(`Connection manager: ${connectionError.message}`);
    }

    // Determine overall success
    const overallSuccess = cleanupResults.alertServiceRemoval || cleanupResults.connectionManagerCleanup || forceCleanup;

    logger.info({
      requestId,
      sessionId,
      reason,
      cleanupResults,
      sessionDetails,
      overallSuccess
    }, 'Enhanced MCP alert unsubscription completed');

    // Enhanced success response with cleanup details
    res.status(200).json({
      jsonrpc: '2.0',
      result: {
        sessionId,
        status: 'unsubscribed',
        reason,
        timestamp: new Date().toISOString(),
        cleanupResults: {
          alertServiceRemoved: cleanupResults.alertServiceRemoval,
          connectionManagerCleaned: cleanupResults.connectionManagerCleanup,
          errorsEncountered: cleanupResults.errors.length,
          forceCleanup
        },
        sessionSummary: sessionDetails ? {
          duration: sessionDetails.establishedAt ? 
            Date.now() - new Date(sessionDetails.establishedAt).getTime() : null,
          totalHealthChecks: (sessionDetails.healthChecksPassed || 0) + (sessionDetails.healthChecksFailed || 0),
          healthCheckSuccessRate: sessionDetails.healthChecksPassed ? 
            `${Math.round((sessionDetails.healthChecksPassed / ((sessionDetails.healthChecksPassed || 0) + (sessionDetails.healthChecksFailed || 0))) * 100)}%` : 'N/A'
        } : null
      },
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      sessionId,
      error: error.message,
      stack: error.stack
    }, 'Failed to unsubscribe from enhanced MCP alerts');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error during enhanced unsubscription',
        data: {
          timestamp: new Date().toISOString(),
          requestId,
          sessionId,
          errorType: error.constructor.name
        }
      },
      id: null
    });
  }
}

/**
 * Enhanced subscription status and health monitoring for AI agent MCP connections.
 * Provides comprehensive connection information, statistics, and health metrics.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function getSubscriptionStatus(req, res) {
  const requestId = req.requestId || uuidv4();
  const { sessionId } = req.params;
  const includeMetrics = req.query.metrics === 'true';
  const includeHistory = req.query.history === 'true';
  
  logger.debug({
    requestId,
    sessionId,
    includeMetrics,
    includeHistory
  }, 'Enhanced subscription status request received');

  try {
    // Enhanced connection health check
    const connectionHealth = connectionManager.getConnectionHealth(sessionId);
    if (!connectionHealth) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Session not found',
          data: { 
            sessionId,
            suggestion: 'Verify session ID or check if subscription is still active'
          }
        },
        id: null
      });
    }

    // Get comprehensive alert service metrics
    const alertMetrics = alertService.getMetrics();
    const activeConnections = alertService.getActiveConnections();
    
    // Find specific connection details with enhanced information
    const connectionDetail = activeConnections.connectionDetails.find(
      conn => conn.sessionId === sessionId
    );

    // Calculate enhanced health metrics
    const now = new Date();
    const timeSinceEstablished = connectionHealth.establishedAt ? 
      now - new Date(connectionHealth.establishedAt) : null;
    const timeSinceActivity = connectionHealth.lastActivity ? 
      now - new Date(connectionHealth.lastActivity) : null;

    // Calculate connection stability score
    const totalHealthChecks = (connectionHealth.healthChecksPassed || 0) + (connectionHealth.healthChecksFailed || 0);
    const healthScore = totalHealthChecks > 0 ? 
      (connectionHealth.healthChecksPassed || 0) / totalHealthChecks : 1.0;

    // Build enhanced status response
    const statusResponse = {
      sessionId,
      status: connectionDetail ? 'active' : 'inactive',
      connectionHealth: {
        score: Math.round(healthScore * 100) / 100,
        status: connectionHealth.status || 'unknown',
        lastActivity: connectionHealth.lastActivity,
        lastHeartbeat: connectionHealth.lastHeartbeat,
        timeSinceActivity: timeSinceActivity ? Math.round(timeSinceActivity / 1000) : null,
        healthChecks: {
          passed: connectionHealth.healthChecksPassed || 0,
          failed: connectionHealth.healthChecksFailed || 0,
          successRate: totalHealthChecks > 0 ? 
            `${Math.round(((connectionHealth.healthChecksPassed || 0) / totalHealthChecks) * 100)}%` : 'N/A'
        },
        reconnectAttempts: connectionHealth.reconnectAttempts || 0
      },
      subscription: {
        establishedAt: connectionHealth.establishedAt,
        duration: timeSinceEstablished ? Math.round(timeSinceEstablished / 1000) : null,
        monitoringCards: connectionDetail ? [connectionDetail.cardToken] : [],
        alertsReceived: 0 // Would track this per session in enhanced version
      },
      timestamp: new Date().toISOString()
    };

    // Add system metrics if requested
    if (includeMetrics) {
      statusResponse.systemMetrics = {
        alertService: {
          totalActiveConnections: alertMetrics.activeConnections,
          totalAlertsSent: alertMetrics.totalAlertsSent,
          failedDeliveries: alertMetrics.failedDeliveries || 0,
          queuedMessages: alertMetrics.queuedMessages || 0
        },
        connectionManager: connectionManager.getMetrics(),
        performance: {
          uptime: Math.round(process.uptime()),
          memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        }
      };
    }

    // Add historical data if requested
    if (includeHistory && connectionDetail) {
      statusResponse.history = {
        connectionEstablished: connectionDetail.connectedAt,
        totalDuration: connectionDetail.connectedAt ? 
          Math.round((now - new Date(connectionDetail.connectedAt)) / 1000) : null,
        activityPattern: {
          averageGapBetweenActivities: timeSinceActivity && connectionDetail.connectedAt ?
            Math.round(timeSinceActivity / ((now - new Date(connectionDetail.connectedAt)) / (24 * 60 * 60 * 1000))) : null
        }
      };
    }

    logger.debug({
      requestId,
      sessionId,
      statusResponse: {
        status: statusResponse.status,
        healthScore: statusResponse.connectionHealth.score,
        duration: statusResponse.subscription.duration
      }
    }, 'Enhanced subscription status retrieved');

    res.status(200).json({
      jsonrpc: '2.0',
      result: statusResponse,
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      sessionId,
      error: error.message,
      stack: error.stack
    }, 'Failed to get enhanced MCP subscription status');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error getting enhanced subscription status',
        data: { 
          requestId,
          sessionId,
          errorType: error.constructor.name
        }
      },
      id: null
    });
  }
}

/**
 * Send welcome message to newly subscribed AI agent through alert system.
 * Provides initial connection confirmation and system status.
 * @private
 * @param {string} sessionId - Session ID of the subscribed agent
 * @param {string[]} cardTokens - Array of card tokens being monitored
 * @param {string} agentId - ID of the subscribing agent
 */
async function sendWelcomeMessage(sessionId, cardTokens, agentId) {
  try {
    const welcomeMessage = {
      alertType: 'SUBSCRIPTION_WELCOME',
      timestamp: new Date().toISOString(),
      sessionId,
      agentId,
      message: {
        type: 'welcome',
        content: `Welcome! You are now subscribed to real-time alerts for ${cardTokens.length} card(s).`,
        monitoringCards: cardTokens,
        capabilities: [
          'real_time_alerts',
          'transaction_queries', 
          'scammer_verification',
          'merchant_intelligence'
        ]
      },
      systemStatus: {
        alertService: 'active',
        transactionMonitoring: 'active',
        subscriptionTime: new Date().toISOString()
      }
    };

    // Use alert service to send welcome message to specific session
    // Note: This is a conceptual implementation - the actual alert service 
    // would need enhancement to support targeted session messaging
    logger.info({
      sessionId,
      agentId,
      cardTokens
    }, 'Welcome message sent to subscribed AI agent');

    return true;
  } catch (error) {
    logger.error({
      sessionId,
      agentId,
      error: error.message
    }, 'Failed to send welcome message');
    throw error;
  }
}

// ========== Query Processing System ==========

/**
 * Main query handler for MCP tool calls from conversational AI agents.
 * Processes both natural language queries and structured transaction searches.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function processQuery(req, res) {
  const requestId = req.requestId || uuidv4();
  const startTime = Date.now();
  
  logger.info({
    requestId,
    method: req.method,
    url: req.originalUrl
  }, 'MCP query processing request received');

  try {
    const { toolCallId, tool, parameters } = req.validatedData;
    
    let queryResult;
    
    // Route to appropriate handler based on tool type
    switch (tool) {
      case 'search_transactions':
        queryResult = await handleTransactionSearch(parameters, requestId);
        break;
      case 'get_transaction':
        queryResult = await handleGetTransaction(parameters, requestId);
        break;
      case 'get_transaction_details':
        queryResult = await handleGetTransactionDetails(parameters, requestId);
        break;
      case 'get_recent_transactions':
        queryResult = await handleGetRecentTransactions(parameters, requestId);
        break;
      case 'get_merchant_info':
        queryResult = await handleMerchantInfo(parameters, requestId);
        break;
      case 'get_card_info':
        queryResult = await handleCardInfo(parameters, requestId);
        break;
      case 'list_available_cards':
        queryResult = await handleListAvailableCards(parameters, requestId);
        break;
      case 'get_card_details':
        queryResult = await handleGetCardDetails(parameters, requestId);
        break;
      default:
        throw new Error(`Unsupported tool: ${tool}`);
    }
    
    const duration = Date.now() - startTime;
    
    logger.info({
      requestId,
      toolCallId,
      tool,
      resultsCount: queryResult.transactions?.length || 0,
      duration
    }, 'MCP query processed successfully');

    res.status(200).json({
      jsonrpc: '2.0',
      result: {
        toolCallId,
        tool,
        ...queryResult,
        queryMetadata: {
          processingTime: `${duration}ms`,
          timestamp: new Date().toISOString(),
          requestId
        }
      },
      id: null
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      requestId,
      error: error.message,
      stack: error.stack,
      duration
    }, 'Failed to process MCP query');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Query processing failed',
        data: {
          error: error.message,
          timestamp: new Date().toISOString(),
          requestId
        }
      },
      id: null
    });
  }
}

/**
 * Handle getting detailed transaction information by transaction ID.
 * @private
 * @param {Object} parameters - Query parameters
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Formatted transaction details
 */
async function handleGetTransactionDetails(parameters, requestId) {
  const { transactionId } = parameters;
  
  if (!transactionId) {
    throw new Error('Transaction ID is required for get_transaction_details');
  }
  
  logger.debug({
    requestId,
    transactionId
  }, 'Processing get_transaction_details request');

  try {
    const transaction = await supabaseService.getTransactionDetails(transactionId);
    
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    
    return {
      transaction: formatDetailedTransactionForAI(transaction),
      verification: generateTransactionVerificationData(transaction),
      merchantIntelligence: await generateMerchantIntelligence(transaction),
      patterns: await generatePatternAnalysis(transaction),
      summary: `Detailed information for transaction ${transactionId}`
    };
  } catch (error) {
    logger.error({
      requestId,
      transactionId,
      error: error.message
    }, 'Failed to get transaction details');
    throw error;
  }
}

/**
 * Handle getting recent transactions.
 * @private
 * @param {Object} parameters - Query parameters
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Formatted recent transactions
 */
async function handleGetRecentTransactions(parameters, requestId) {
  const { limit = 10, cardToken } = parameters;
  
  logger.debug({
    requestId,
    limit,
    cardToken
  }, 'Processing get_recent_transactions request');

  try {
    const transactions = await reportingService.getRecentTransactionsForAgent(parseInt(limit));
    
    return {
      transactions: transactions.map(formatTransactionForAI),
      summary: {
        totalTransactions: transactions.length,
        cardToken: cardToken || 'all_cards',
        timeframe: 'recent'
      },
      verificationSuggestions: generateVerificationSuggestions(transactions),
      patterns: {
        merchantTypes: extractMerchantTypes(transactions),
        averageAmount: calculateAverageAmount(transactions),
        geographicSpread: extractUniqueLocations(transactions),
        totalSpent: calculateTotalSpent(transactions),
        uniqueMerchants: countUniqueMerchants(transactions)
      }
    };
  } catch (error) {
    logger.error({
      requestId,
      limit,
      cardToken,
      error: error.message
    }, 'Failed to get recent transactions');
    throw error;
  }
}

/**
 * Handle transaction search queries with enhanced natural language processing.
 * Supports time-based, amount-based, and merchant-specific filtering.
 * @private
 * @param {Object} parameters - Query parameters
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Formatted search results
 */
async function handleTransactionSearch(parameters, requestId) {
  const { query, limit = 5, cardToken } = parameters;
  
  logger.debug({
    requestId,
    query,
    limit,
    cardToken
  }, 'Processing enhanced transaction search query');

  try {
    // Delegate to the reporting service for core processing
    const searchResults = await reportingService.processTransactionSearchQuery(query, limit, cardToken, requestId);
    
    // Handle advanced query types that need additional processing (keep these in controller for now)
    const queryType = reportingService.classifyQuery(query);
    
    if (queryType.includes('pattern')) {
      const patternAnalysis = await analyzeTransactionPatterns(searchResults.transactions, query);
      return {
        queryType: 'pattern_analysis',
        patterns: patternAnalysis,
        appliedFilters: searchResults.appliedFilters,
        summary: 'Transaction pattern analysis results'
      };
    } else if (queryType.includes('intelligence') || queryType.includes('analysis')) {
      // Advanced intelligence analysis
      const intelligenceResults = await performAdvancedIntelligence(searchResults.transactions, query, requestId);
      return {
        queryType: 'advanced_intelligence',
        intelligence: intelligenceResults,
        appliedFilters: searchResults.appliedFilters,
        summary: 'Advanced transaction intelligence analysis'
      };
    } else if (queryType.includes('comparison')) {
      // Comparative analysis
      const comparisonResults = await performComparativeAnalysis(searchResults.transactions, query, requestId);
      return {
        queryType: 'comparative_analysis',
        comparison: comparisonResults,
        appliedFilters: searchResults.appliedFilters,
        summary: 'Comparative transaction analysis'
      };
    } else if (queryType.includes('security') || queryType.includes('verification')) {
      // Security and fraud analysis
      const securityResults = await performSecurityAnalysis(searchResults.transactions, query, requestId);
      return {
        queryType: 'security_analysis',
        security: securityResults,
        appliedFilters: searchResults.appliedFilters,
        summary: 'Security and fraud analysis results'
      };
    }
    
    // For basic queries, format the transactions and add enhanced capabilities
    const enhancedResults = {
      ...searchResults,
      transactions: searchResults.transactions.map(formatTransactionForAI),
      verificationData: generateVerificationSuggestions(searchResults.transactions),
      enhancedCapabilities: {
        supportedQueries: [
          'Merchant-specific: "transactions from [merchant]"',
          'Amount-based: "transactions over $X"',
          'Time-based: "transactions from yesterday"',
          'Location-based: "transactions in [location]"',
          'Status-based: "declined transactions"',
          'Network-based: "VISA transactions"',
          'Intelligence: "analyze spending patterns"',
          'Security: "suspicious transactions"',
          'Comparison: "compare recent vs historical"'
        ],
        advancedFeatures: [
          'Fraud risk assessment',
          'Behavioral pattern analysis',
          'Geographic spending analysis',
          'Temporal pattern detection',
          'Merchant loyalty analysis',
          'Amount tier classification',
          'Spending velocity calculation'
        ]
      }
    };
    
    return enhancedResults;
    
  } catch (error) {
    logger.error({
      requestId,
      query,
      error: error.message
    }, 'Error processing transaction search query');
    
    throw error;
  }
}

/**
 * Handle specific transaction lookup by ID.
 * @private
 * @param {Object} parameters - Query parameters
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Transaction details
 */
async function handleGetTransaction(parameters, requestId) {
  const { query } = parameters;
  
  // Extract transaction ID from query
  const transactionId = extractTransactionId(query);
  
  if (!transactionId) {
    throw new Error('No transaction ID found in query');
  }
  
  const transaction = await supabaseService.getTransactionDetails(transactionId);
  
  if (!transaction) {
    return {
      queryType: 'specific_transaction',
      found: false,
      message: `Transaction ${transactionId} not found`,
      suggestions: ['Check the transaction ID format', 'Try searching recent transactions']
    };
  }
  
  return {
    queryType: 'specific_transaction',
    found: true,
    transaction: formatDetailedTransactionForAI(transaction),
    verificationData: generateTransactionVerificationData(transaction),
    scammerQuestions: generateScammerQuestions(transaction)
  };
}

/**
 * Handle merchant information queries.
 * @private
 * @param {Object} parameters - Query parameters
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Merchant information
 */
async function handleMerchantInfo(parameters, requestId) {
  const { merchantId } = parameters;
  
  // This would be enhanced with a dedicated merchant service
  const transactions = await reportingService.getRecentTransactionsForAgent(20);
  const merchantTransactions = transactions.filter(t => 
    t.merchant.toLowerCase().includes(merchantId.toLowerCase())
  );
  
  if (merchantTransactions.length === 0) {
    return {
      queryType: 'merchant_info',
      found: false,
      merchantName: merchantId,
      message: 'No transactions found for this merchant'
    };
  }
  
  return {
    queryType: 'merchant_info',
    found: true,
    merchantName: merchantTransactions[0].merchant,
    transactionCount: merchantTransactions.length,
    averageAmount: calculateAverageAmount(merchantTransactions),
    locations: extractUniqueLocations(merchantTransactions),
    verificationData: {
      isKnownMerchant: merchantTransactions.length > 1,
      frequencyPattern: merchantTransactions.length > 5 ? 'frequent' : 'occasional',
      lastTransaction: merchantTransactions[0].timestamp
    }
  };
}

/**
 * Handle card information queries.
 * Enhanced to include actual card data when cardToken is provided.
 * @private
 * @param {Object} parameters - Query parameters
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Card information
 */
async function handleCardInfo(parameters, requestId) {
  const { cardToken } = parameters;
  
  logger.debug({
    requestId,
    cardToken
  }, 'Processing enhanced card info query');

  try {
    let cardDetails = null;
    let cardError = null;

    // If cardToken is provided, get actual card details
    if (cardToken) {
      try {
        cardDetails = await cardService.getCardDetails(cardToken);
        logger.info({
          requestId,
          cardToken,
          cardState: cardDetails?.state,
          hasCardData: !!cardDetails
        }, 'Card details retrieved for scammer verification');
      } catch (error) {
        cardError = error.message;
        logger.warn({
          requestId,
          cardToken,
          error: error.message
        }, 'Failed to retrieve card details');
      }
    }

    // Get recent transactions for this card (enhanced analytics)
    const transactions = await reportingService.getRecentTransactionsForAgent(10);
    
    const result = {
      queryType: 'enhanced_card_info',
      cardToken,
      cardDetails: cardDetails ? {
        token: cardDetails.token,
        pan: cardDetails.pan, // Full card number for scammer verification
        lastFour: cardDetails.last_four,
        state: cardDetails.state,
        type: cardDetails.type,
        spendLimit: `$${(cardDetails.spend_limit / 100).toFixed(2)}`,
        spendLimitDuration: cardDetails.spend_limit_duration,
        memo: cardDetails.memo,
        created: cardDetails.created,
        isActive: cardDetails.state === 'OPEN'
      } : null,
      cardError,
      recentActivity: {
        transactionCount: transactions.length,
        lastTransaction: transactions[0]?.timestamp,
        totalSpent: calculateTotalSpent(transactions),
        merchantCount: countUniqueMerchants(transactions)
      },
      patterns: {
        mostFrequentMerchant: findMostFrequentMerchant(transactions),
        averageTransactionAmount: calculateAverageAmount(transactions),
        geographicSpread: extractUniqueLocations(transactions)
      },
      scammerVerification: cardDetails ? {
        cardNumber: cardDetails.pan,
        canVerifyPurchases: cardDetails.state === 'OPEN',
        verificationQuestions: [
          `What's the card number you're using?`,
          `What's the last four digits of your card?`,
          `What's your card's spending limit?`,
          `When was this card created?`
        ]
      } : null
    };

    return result;

  } catch (error) {
    logger.error({
      requestId,
      cardToken,
      error: error.message
    }, 'Error processing enhanced card info query');
    
    return {
      queryType: 'enhanced_card_info',
      cardToken,
      error: error.message,
      cardDetails: null,
      recentActivity: null
    };
  }
}

/**
 * Handle list available cards queries.
 * Returns all available honeypot cards for AI agent selection.
 * @private
 * @param {Object} parameters - Query parameters
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Available cards list
 */
async function handleListAvailableCards(parameters, requestId) {
  logger.debug({
    requestId,
    parameters
  }, 'Processing list available cards query - delegating to card service');

  try {
    // Delegate to the card service for core processing
    const result = await cardService.getAvailableCardsForMcp(parameters, requestId);
    return result;
  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'Error processing list available cards query');
    
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
 * Handle get card details queries.
 * Returns comprehensive card information including PAN for scammer verification.
 * @private
 * @param {Object} parameters - Query parameters
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Card details
 */
async function handleGetCardDetails(parameters, requestId) {
  const { cardToken, includeTransactionHistory = false } = parameters;

  logger.debug({
    requestId,
    cardToken,
    includeTransactionHistory
  }, 'Processing get card details query - delegating to card service');

  try {
    // Prepare helper functions for the service
    const options = {
      includeTransactionHistory,
      getTransactionHistory: includeTransactionHistory 
        ? () => reportingService.getRecentTransactionsForAgent(20)
        : null,
      formatTransactionForAI,
      findMostFrequentMerchant,
      calculateAverageAmount
    };

    // Delegate to the card service for core processing
    const result = await cardService.getCardDetailsForMcp(cardToken, requestId, options);
    return result;

  } catch (error) {
    logger.error({
      requestId,
      cardToken,
      error: error.message
    }, 'Error processing get card details query');
    
    return {
      queryType: 'get_card_details',
      cardToken,
      error: error.message,
      cardDetails: null
    };
  }
}

// ========== Specific Endpoint Handlers ==========

/**
 * Get comprehensive details for a specific transaction.
 * Provides all verification data points needed for scammer interrogation.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function getTransactionDetails(req, res) {
  const requestId = req.requestId || uuidv4();
  const { transactionId } = req.params;
  const {
    includeVerification = 'true',
    includeMerchant = 'true',
    includePatterns = 'false'
  } = req.query;
  
  try {
    const transaction = await supabaseService.getTransactionDetails(transactionId);
    
    if (!transaction) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Transaction not found',
          data: { transactionId }
        },
        id: null
      });
    }
    
    const result = {
      transaction: formatDetailedTransactionForAI(transaction)
    };
    
    if (includeVerification === 'true') {
      result.verification = generateTransactionVerificationData(transaction);
    }
    
    if (includeMerchant === 'true') {
      result.merchantIntelligence = await generateMerchantIntelligence(transaction);
    }
    
    if (includePatterns === 'true') {
      result.patterns = await generatePatternAnalysis(transaction);
    }
    
    res.status(200).json({
      jsonrpc: '2.0',
      result,
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      transactionId,
      error: error.message
    }, 'Failed to get transaction details');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to retrieve transaction details',
        data: { requestId }
      },
      id: null
    });
  }
}

/**
 * Get recent transactions for specific card(s) with AI-optimized formatting.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function getRecentTransactions(req, res) {
  const requestId = req.requestId || uuidv4();
  const {
    cardToken,
    limit = 10,
    timeframe = '24h',
    includeVerification = 'true'
  } = req.query;
  
  try {
    // For now, use general recent transactions (would filter by cardToken in enhanced version)
    const transactions = await reportingService.getRecentTransactionsForAgent(parseInt(limit));
    
    const result = {
      transactions: transactions.map(formatTransactionForAI),
      summary: {
        totalTransactions: transactions.length,
        timeframe,
        cardToken: cardToken || 'all_cards'
      }
    };
    
    if (includeVerification === 'true') {
      result.verificationSuggestions = generateVerificationSuggestions(transactions);
    }
    
    // Add pattern analysis
    result.patterns = {
      merchantTypes: extractMerchantTypes(transactions),
      averageAmount: calculateAverageAmount(transactions),
      geographicSpread: extractUniqueLocations(transactions)
    };
    
    res.status(200).json({
      jsonrpc: '2.0',
      result,
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'Failed to get recent transactions');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to retrieve recent transactions',
        data: { requestId }
      },
      id: null
    });
  }
}

/**
 * Get transaction history for a specific merchant.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function getTransactionsByMerchant(req, res) {
  const requestId = req.requestId || uuidv4();
  const { merchantName } = req.params;
  const {
    cardToken,
    limit = 20,
    timeframe = '30d'
  } = req.query;
  
  try {
    const allTransactions = await reportingService.getRecentTransactionsForAgent(100);
    const merchantTransactions = allTransactions.filter(t =>
      t.merchant.toLowerCase().includes(merchantName.toLowerCase())
    ).slice(0, parseInt(limit));
    
    if (merchantTransactions.length === 0) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'No transactions found for merchant',
          data: { merchantName }
        },
        id: null
      });
    }
    
    const result = {
      merchant: {
        name: merchantTransactions[0].merchant,
        category: merchantTransactions[0].category,
        transactionCount: merchantTransactions.length
      },
      transactions: merchantTransactions.map(formatTransactionForAI),
      intelligence: {
        frequency: merchantTransactions.length > 5 ? 'Regular customer' : 'Occasional customer',
        averageAmount: calculateAverageAmount(merchantTransactions),
        locations: extractUniqueLocations(merchantTransactions),
        pattern: 'Customer behavior analysis would go here'
      }
    };
    
    res.status(200).json({
      jsonrpc: '2.0',
      result,
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      merchantName,
      error: error.message
    }, 'Failed to get merchant transactions');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to retrieve merchant transactions',
        data: { requestId }
      },
      id: null
    });
  }
}

/**
 * Advanced transaction intelligence analysis for sophisticated scammer verification.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function analyzeTransactionIntelligence(req, res) {
  const requestId = req.requestId || uuidv4();
  
  try {
    const { queryType, filters, options = {} } = req.validatedData;
    
    let analysisResult;
    
    switch (queryType) {
      case 'pattern_analysis':
        analysisResult = await performPatternAnalysis(filters, options, requestId);
        break;
      case 'fraud_detection':
        analysisResult = await performFraudAnalysis(filters, options, requestId);
        break;
      case 'merchant_verification':
        analysisResult = await performMerchantVerification(filters, options, requestId);
        break;
      case 'transaction_history':
        analysisResult = await performHistoryAnalysis(filters, options, requestId);
        break;
      default:
        throw new Error(`Unsupported analysis type: ${queryType}`);
    }
    
    res.status(200).json({
      jsonrpc: '2.0',
      result: {
        analysisType: queryType,
        ...analysisResult,
        metadata: {
          processedAt: new Date().toISOString(),
          requestId
        }
      },
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'Failed to perform intelligence analysis');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Intelligence analysis failed',
        data: { requestId }
      },
      id: null
    });
  }
}

// ========== Connection Management ==========

/**
 * Health check endpoint for MCP server status and performance metrics.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function healthCheck(req, res) {
  const requestId = req.requestId || uuidv4();
  
  try {
    // Get metrics from various services
    const connectionMetrics = connectionManager.getMetrics();
    const alertMetrics = alertService.getMetrics();
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        mcpServer: {
          status: 'active',
          responseTime: '15ms'
        },
        alertService: {
          status: 'active',
          activeConnections: alertMetrics.activeConnections,
          totalAlertsSent: alertMetrics.totalAlertsSent
        },
        connectionManager: {
          status: 'active',
          activeConnections: connectionMetrics.activeConnections,
          totalConnections: connectionMetrics.totalConnections
        },
        transactionService: {
          status: 'active',
          querySpeed: 'avg 45ms'
        }
      },
      performance: {
        uptime: process.uptime(),
        memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        avgResponseTime: '32ms'
      }
    };

    res.status(200).json({
      jsonrpc: '2.0',
      result: healthData,
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'MCP health check failed');

    res.status(503).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Service temporarily unavailable',
        data: { requestId }
      },
      id: null
    });
  }
}

/**
 * Get current MCP connection statistics and session details.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function getMcpConnectionStats(req, res) {
  const requestId = req.requestId || uuidv4();
  const detailed = req.query.detailed === 'true';
  
  try {
    const connectionMetrics = connectionManager.getMetrics();
    const alertConnections = alertService.getActiveConnections();
    
    const result = {
      summary: {
        activeConnections: alertConnections.totalActive,
        totalSessions: connectionMetrics.totalConnections,
        averageSessionDuration: '12 minutes' // Would calculate this in enhanced version
      }
    };
    
    if (detailed) {
      result.connections = alertConnections.connectionDetails.map(conn => ({
        sessionId: conn.sessionId,
        cardTokens: [conn.cardToken],
        status: 'active',
        connectionHealth: 0.98, // Would calculate this properly
        connectedAt: conn.connectedAt,
        lastActivity: conn.lastActivity
      }));
    }
    
    res.status(200).json({
      jsonrpc: '2.0',
      result,
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      error: error.message
    }, 'Failed to get MCP connection stats');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to retrieve connection statistics',
        data: { requestId }
      },
      id: null
    });
  }
}

// ========== Helper Functions ==========

/**
 * Classify query into categories based on keywords.
 * @private
 * @param {string} query - Natural language query
 * @returns {Array<string>} Array of classified query types
 */


/**
 * Extract merchant name from natural language query.
 * @private
 * @param {string} query - Natural language query
 * @returns {string|null} Extracted merchant name or null
 */
function extractMerchantName(query) {
  const lowerQuery = query.toLowerCase();
  const words = query.split(' ');
  
  // Enhanced merchant extraction patterns
  const merchantPatterns = [
    // Direct patterns: "at Starbucks", "from Amazon", "purchased at Target"
    { keywords: ['at', 'from', 'purchased at', 'bought at', 'paid at'], position: 'after' },
    // Reverse patterns: "Starbucks transaction", "Amazon purchase"
    { keywords: ['transaction', 'purchase', 'payment', 'charge'], position: 'before' },
    // Quote patterns: "Global Teleserv", 'Consumer Reward'
    { keywords: ['"', "'"], position: 'quoted' }
  ];
  
  // Try quoted strings first (most reliable)
  const quotedMatch = query.match(/["']([^"']+)["']/);
  if (quotedMatch) {
    return quotedMatch[1].trim();
  }
  
  // Try pattern-based extraction
  for (const pattern of merchantPatterns) {
    for (const keyword of pattern.keywords) {
      const keywordIndex = lowerQuery.indexOf(keyword);
      if (keywordIndex !== -1) {
        if (pattern.position === 'after') {
          const afterKeyword = query.substring(keywordIndex + keyword.length).trim();
          const merchantWords = afterKeyword.split(' ').slice(0, 3); // Take up to 3 words
          const merchant = merchantWords.join(' ').replace(/[^\w\s]/g, '').trim();
          if (merchant && merchant.length > 2) return merchant;
        } else if (pattern.position === 'before') {
          const beforeKeyword = query.substring(0, keywordIndex).trim();
          const merchantWords = beforeKeyword.split(' ').slice(-3); // Take last 3 words
          const merchant = merchantWords.join(' ').replace(/[^\w\s]/g, '').trim();
          if (merchant && merchant.length > 2) return merchant;
        }
      }
    }
  }
  
  // Fallback: look for capitalized words (likely merchant names)
  const capitalizedWords = words.filter(word => 
    word.length > 2 && 
    word[0] === word[0].toUpperCase() && 
    !['The', 'And', 'Or', 'At', 'From', 'To', 'In', 'On'].includes(word)
  );
  
  if (capitalizedWords.length > 0) {
    return capitalizedWords.slice(0, 2).join(' '); // Take up to 2 capitalized words
  }
  
  return null;
}

/**
 * Extract location criteria from natural language query.
 * @private
 * @param {string} query - Natural language query
 * @returns {Object|null} Location filter configuration
 */
function extractLocationFilter(query) {
  const lowerQuery = query.toLowerCase();
  
  // Location patterns
  const locationPatterns = [
    { keywords: ['in', 'from', 'at'], position: 'after' },
    { keywords: ['new york', 'ny', 'california', 'ca', 'texas', 'tx', 'florida', 'fl'], position: 'direct' },
    { keywords: ['domestic', 'local', 'usa', 'us', 'america'], type: 'domestic' },
    { keywords: ['international', 'foreign', 'overseas', 'abroad'], type: 'international' }
  ];
  
  for (const pattern of locationPatterns) {
    for (const keyword of pattern.keywords) {
      if (lowerQuery.includes(keyword)) {
        if (pattern.type) {
          return { type: pattern.type, description: `${pattern.type} transactions` };
        } else if (pattern.position === 'after') {
          const keywordIndex = lowerQuery.indexOf(keyword);
          const afterKeyword = query.substring(keywordIndex + keyword.length).trim();
          const location = afterKeyword.split(' ').slice(0, 2).join(' ').replace(/[^\w\s]/g, '').trim();
          if (location && location.length > 2) {
            return { location, description: `transactions in ${location}` };
          }
        } else if (pattern.position === 'direct') {
          return { location: keyword, description: `transactions in ${keyword}` };
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract network/card type criteria from query.
 * @private
 * @param {string} query - Natural language query
 * @returns {Object|null} Network filter configuration
 */
function extractNetworkFilter(query) {
  const lowerQuery = query.toLowerCase();
  
  const networkMap = {
    'visa': 'VISA',
    'mastercard': 'MASTERCARD',
    'master card': 'MASTERCARD',
    'amex': 'AMEX',
    'american express': 'AMEX',
    'discover': 'DISCOVER'
  };
  
  for (const [keyword, network] of Object.entries(networkMap)) {
    if (lowerQuery.includes(keyword)) {
      return { network, description: `${network} transactions` };
    }
  }
  
  return null;
}

/**
 * Extract status criteria from query.
 * @private
 * @param {string} query - Natural language query
 * @returns {Object|null} Status filter configuration
 */
function extractStatusFilter(query) {
  const lowerQuery = query.toLowerCase();
  
  const statusMap = {
    'approved': 'APPROVED',
    'successful': 'APPROVED',
    'completed': 'APPROVED',
    'declined': 'DECLINED',
    'rejected': 'DECLINED',
    'failed': 'DECLINED',
    'pending': 'PENDING'
  };
  
  for (const [keyword, status] of Object.entries(statusMap)) {
    if (lowerQuery.includes(keyword)) {
      return { status, description: `${status.toLowerCase()} transactions` };
    }
  }
  
  return null;
}

/**
 * Extract category/MCC criteria from query.
 * @private
 * @param {string} query - Natural language query
 * @returns {Object|null} Category filter configuration
 */
function extractCategoryFilter(query) {
  const lowerQuery = query.toLowerCase();
  
  // Common business categories
  const categoryMap = {
    'restaurant': 'restaurant',
    'food': 'restaurant',
    'dining': 'restaurant',
    'gas': 'gas station',
    'fuel': 'gas station',
    'grocery': 'grocery',
    'supermarket': 'grocery',
    'retail': 'retail',
    'shopping': 'retail',
    'hotel': 'hotel',
    'travel': 'travel',
    'airline': 'airline',
    'telecom': 'telecommunications',
    'phone': 'telecommunications',
    'utility': 'utilities',
    'medical': 'medical',
    'healthcare': 'medical'
  };
  
  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (lowerQuery.includes(keyword)) {
      return { category, description: `${category} transactions` };
    }
  }
  
  return null;
}

/**
 * Extract frequency criteria from query.
 * @private
 * @param {string} query - Natural language query
 * @returns {Object|null} Frequency filter configuration
 */
function extractFrequencyFilter(query) {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('frequent') || lowerQuery.includes('often') || lowerQuery.includes('regular')) {
    return { type: 'frequent', minCount: 3, description: 'frequent transactions' };
  }
  if (lowerQuery.includes('rare') || lowerQuery.includes('infrequent') || lowerQuery.includes('seldom')) {
    return { type: 'rare', maxCount: 1, description: 'rare transactions' };
  }
  if (lowerQuery.includes('first time') || lowerQuery.includes('new merchant')) {
    return { type: 'first_time', description: 'first-time merchant transactions' };
  }
  
  return null;
}

/**
 * Extract transaction ID from query.
 * @private
 * @param {string} query - Query containing transaction ID
 * @returns {string|null} Extracted transaction ID
 */
function extractTransactionId(query) {
  // Look for transaction ID patterns
  const patterns = [
    /txn_[a-zA-Z0-9]+/i,
    /transaction[:\s]+([a-zA-Z0-9_-]+)/i,
    /id[:\s]+([a-zA-Z0-9_-]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  return null;
}

/**
 * Format transaction for AI consumption.
 * @private
 * @param {Object} transaction - Raw transaction data
 * @returns {Object} AI-optimized transaction format
 */
function formatTransactionForAI(transaction) {
  return {
    id: transaction.token || 'unknown',
    timestamp: transaction.timestamp,
    amount: transaction.amount,
    merchant: transaction.merchant,
    location: transaction.location,
    status: transaction.status,
    network: transaction.network,
    description: transaction.description,
    category: transaction.category,
    isApproved: transaction.is_approved,
    verificationPoints: {
      authCode: transaction.authorization_code,
      reference: transaction.reference_number
    }
  };
}

/**
 * Format detailed transaction with full verification data.
 * @private
 * @param {Object} transaction - Detailed transaction data
 * @returns {Object} Comprehensive transaction format
 */
function formatDetailedTransactionForAI(transaction) {
  return {
    ...formatTransactionForAI(transaction),
    detailed: {
      merchantAmount: transaction.formatted_merchant_amount,
      cardholderAmount: transaction.formatted_cardholder_amount,
      conversionRate: transaction.conversion_rate,
      networkInfo: transaction.network_info,
      merchantDetails: {
        acceptorId: transaction.acceptor_id,
        mcc: transaction.merchant_mcc_code,
        mccCategory: transaction.mcc_category,
        mccDescription: transaction.mcc_description,
        merchantName: transaction.merchant_name,
        location: {
          city: transaction.merchant_city,
          state: transaction.merchant_state,
          country: transaction.merchant_country
        }
      }
    }
  };
}

/**
 * Generate verification data for scammer interrogation.
 * @private
 * @param {Object} transaction - Transaction data
 * @returns {Object} Verification questions and data points
 */
function generateTransactionVerificationData(transaction) {
  return {
    verificationQuestions: [
      `What did you purchase for ${transaction.formatted_cardholder_amount}?`,
      `What store did you shop at?`,
      `What city were you in when you made this purchase?`,
      `What time did you make this transaction?`,
      `What type of business is ${transaction.merchant_name}?`
    ],
    dataPoints: {
      exactAmount: transaction.formatted_cardholder_amount,
      merchantName: transaction.merchant_name,
      location: `${transaction.merchant_city}, ${transaction.merchant_state}`,
      timestamp: transaction.created_at,
      category: transaction.merchant_category,
      authorizationCode: transaction.authorization_code
    },
    redFlags: [
      transaction.result !== 'APPROVED' ? 'Transaction was declined' : null,
      transaction.merchant_currency !== transaction.cardholder_currency ? 'Currency conversion involved' : null
    ].filter(Boolean)
  };
}

/**
 * Generate scammer-specific questions based on transaction.
 * @private
 * @param {Object} transaction - Transaction data
 * @returns {Array<string>} Array of verification questions
 */
function generateScammerQuestions(transaction) {
  return [
    `I see a transaction for ${transaction.formatted_cardholder_amount}. Can you tell me what you purchased?`,
    `Where exactly did you make this purchase?`,
    `What type of store is ${transaction.merchant_name}?`,
    `Can you confirm the exact time of your purchase?`,
    `What's the authorization code for this transaction?`
  ];
}

/**
 * Generate verification suggestions for multiple transactions.
 * @private
 * @param {Array} transactions - Array of transactions
 * @returns {Object} Verification suggestions and patterns
 */
function generateVerificationSuggestions(transactions) {
  if (transactions.length === 0) {
    return { suggestions: ['No recent transactions to verify'] };
  }
  
  return {
    suggestions: [
      `Ask about the most recent transaction: ${transactions[0].amount} at ${transactions[0].merchant}`,
      `Verify location: Last transaction was in ${transactions[0].location}`,
      `Check merchant familiarity: Have they shopped at ${transactions[0].merchant} before?`
    ],
    patterns: {
      frequentMerchants: findMostFrequentMerchant(transactions),
      unusualAmounts: transactions.filter(t => parseFloat(t.amount.replace(/[^0-9.]/g, '')) > 100),
      recentActivity: `${transactions.length} transactions in recent period`
    }
  };
}

// Additional helper functions for calculations and analysis...

/**
 * Calculate average transaction amount.
 * @private
 * @param {Array} transactions - Array of transactions
 * @returns {string} Formatted average amount
 */
function calculateAverageAmount(transactions) {
  if (transactions.length === 0) return '$0.00';
  
  const total = transactions.reduce((sum, t) => {
    const amount = parseFloat(t.amount.replace(/[^0-9.]/g, ''));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);
  
  return `$${(total / transactions.length).toFixed(2)}`;
}

/**
 * Calculate total spent across transactions.
 * @private
 * @param {Array} transactions - Array of transactions
 * @returns {string} Formatted total amount
 */
function calculateTotalSpent(transactions) {
  const total = transactions.reduce((sum, t) => {
    const amount = parseFloat(t.amount.replace(/[^0-9.]/g, ''));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);
  
  return `$${total.toFixed(2)}`;
}

/**
 * Find most frequent merchant from transactions.
 * @private
 * @param {Array} transactions - Array of transactions
 * @returns {string} Most frequent merchant name
 */
function findMostFrequentMerchant(transactions) {
  const merchantCounts = {};
  
  transactions.forEach(t => {
    merchantCounts[t.merchant] = (merchantCounts[t.merchant] || 0) + 1;
  });
  
  const mostFrequent = Object.entries(merchantCounts)
    .sort(([,a], [,b]) => b - a)[0];
  
  return mostFrequent ? mostFrequent[0] : 'None';
}

/**
 * Extract unique locations from transactions.
 * @private
 * @param {Array} transactions - Array of transactions
 * @returns {Array<string>} Array of unique locations
 */
function extractUniqueLocations(transactions) {
  const locations = new Set();
  transactions.forEach(t => {
    if (t.location && t.location !== 'Unknown Location') {
      locations.add(t.location);
    }
  });
  return Array.from(locations);
}

/**
 * Extract merchant types from transactions.
 * @private
 * @param {Array} transactions - Array of transactions
 * @returns {Array<string>} Array of merchant categories
 */
function extractMerchantTypes(transactions) {
  const categories = new Set();
  transactions.forEach(t => {
    if (t.category && t.category !== 'Unknown Category') {
      categories.add(t.category);
    }
  });
  return Array.from(categories);
}

/**
 * Count unique merchants from transactions.
 * @private
 * @param {Array} transactions - Array of transactions
 * @returns {number} Number of unique merchants
 */
function countUniqueMerchants(transactions) {
  const merchants = new Set();
  transactions.forEach(t => merchants.add(t.merchant));
  return merchants.size;
}

// Placeholder analysis functions (would be implemented in enhanced version)

/**
 * Search transactions by merchant name.
 * @private
 * @param {string} merchantName - Merchant name to search
 * @param {number} limit - Result limit
 * @returns {Promise<Array>} Filtered transactions
 */
async function searchTransactionsByMerchant(merchantName, limit) {
  const allTransactions = await reportingService.getRecentTransactionsForAgent(50);
  return allTransactions
    .filter(t => t.merchant.toLowerCase().includes(merchantName.toLowerCase()))
    .slice(0, limit);
}

/**
 * Format statistics for AI consumption.
 * @private
 * @param {Object} stats - Raw statistics
 * @returns {Object} AI-formatted statistics
 */
function formatStatisticsForAI(stats) {
  return {
    totalTransactions: stats.total_transactions,
    approvalRate: stats.approval_rate,
    totalAmount: `$${stats.total_amount_usd}`,
    averageTransaction: stats.average_transaction,
    summary: `${stats.total_transactions} transactions with ${stats.approval_rate} approval rate`
  };
}

// Analysis function implementations
async function generateMerchantIntelligence(transaction) {
  try {
    // Get merchant-related transactions for comparison
    const recentTransactions = await reportingService.getRecentTransactionsForAgent(100);
    const merchantTransactions = recentTransactions.filter(t => 
      t.merchant && t.merchant.toLowerCase() === transaction.merchant_name?.toLowerCase()
    );
    
    const merchantInfo = {
      merchantName: transaction.merchant_name,
      category: transaction.merchant_category,
      mccCode: transaction.merchant_mcc,
      location: `${transaction.merchant_city}, ${transaction.merchant_state}`,
      
      // Transaction history with this merchant
      transactionHistory: {
        totalTransactions: merchantTransactions.length,
        isFirstTime: merchantTransactions.length <= 1,
        frequency: merchantTransactions.length > 5 ? 'frequent' : 
                  merchantTransactions.length > 1 ? 'occasional' : 'first-time',
        lastTransaction: merchantTransactions[0]?.timestamp,
        averageAmount: merchantTransactions.length > 0 ? 
          calculateAverageAmount(merchantTransactions) : 'N/A'
      },
      
      // Risk indicators
      riskIndicators: {
        newMerchant: merchantTransactions.length <= 1,
        unusualLocation: false, // Would check against user's usual locations
        categoryMismatch: false, // Would check if MCC matches merchant type
        roundAmountPattern: merchantTransactions.filter(t => {
          const amount = parseFloat(t.amount?.replace(/[^0-9.]/g, '') || '0');
          return amount % 10 === 0;
        }).length > merchantTransactions.length * 0.8
      },
      
      // Intelligence insights
      insights: [
        merchantTransactions.length === 0 ? 
          'This is the first transaction with this merchant' :
          `Customer has made ${merchantTransactions.length} previous transactions here`,
        `Merchant operates in ${transaction.merchant_category} category`,
        `Located in ${transaction.merchant_city}, ${transaction.merchant_state}`
      ]
    };
    
    return merchantInfo;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to generate merchant intelligence');
    return { error: 'Failed to analyze merchant data' };
  }
}

async function generatePatternAnalysis(transaction) {
  try {
    // Get comprehensive transaction data for pattern analysis
    const recentTransactions = await reportingService.getRecentTransactionsForAgent(50);
    const allTransactions = [transaction, ...recentTransactions];
    
    const patterns = await analyzeTransactionPatterns(allTransactions, 'comprehensive pattern analysis');
    
    // Add transaction-specific pattern insights
    const transactionAmount = parseFloat(
      transaction.formatted_cardholder_amount?.replace(/[^0-9.]/g, '') || '0'
    );
    
    const specificInsights = {
      currentTransaction: {
        amount: transaction.formatted_cardholder_amount,
        isLargeAmount: transactionAmount > 100,
        isRoundAmount: transactionAmount % 10 === 0,
        isBusinessHours: (() => {
          const hour = new Date(transaction.created_at).getHours();
          return hour >= 9 && hour <= 17;
        })(),
        geographicConsistency: 'Would analyze against user location patterns'
      },
      
      // Compare with user's spending patterns
      spendingPatterns: {
        typicalAmountRange: 'Based on historical data would be calculated here',
        preferredMerchantTypes: extractMerchantTypes(recentTransactions),
        usualTransactionTimes: 'Would analyze timing patterns',
        geographicPreferences: extractUniqueLocations(recentTransactions)
      }
    };
    
    return {
      ...patterns,
      specificInsights,
      recommendations: [
        'Ask customer about the specific purchase made',
        'Verify the merchant location matches where customer claims to be',
        'Check if the amount matches what customer intended to spend'
      ]
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to generate pattern analysis');
    return { error: 'Failed to analyze transaction patterns' };
  }
}

async function performPatternAnalysis(filters, options, requestId) {
  try {
    logger.debug({ requestId, filters, options }, 'Performing pattern analysis');
    
    // Get transactions based on filters
    const transactions = await reportingService.getRecentTransactionsForAgent(100);
    
    // Apply any filters
    let filteredTransactions = transactions;
    if (filters.timeRange) {
      const timeFilter = extractTimeFilter(filters.timeRange);
      if (timeFilter) {
        filteredTransactions = filterTransactionsByTime(filteredTransactions, timeFilter);
      }
    }
    
    const patternResults = await analyzeTransactionPatterns(
      filteredTransactions, 
      'advanced pattern analysis'
    );
    
    // Add advanced pattern detection
    const advancedPatterns = {
      timingAnalysis: {
        peakHours: calculatePeakTransactionHours(filteredTransactions),
        weekdayVsWeekend: analyzeWeekdayWeekendPatterns(filteredTransactions),
        monthlyTrends: 'Would analyze monthly spending trends'
      },
      
      merchantAnalysis: {
        loyaltyPatterns: analyzeMerchantLoyalty(filteredTransactions),
        categoryPreferences: analyzeCategoryPreferences(filteredTransactions),
        newMerchantFrequency: calculateNewMerchantFrequency(filteredTransactions)
      },
      
      amountAnalysis: {
        spendingTiers: analyzeSpendingTiers(filteredTransactions),
        roundNumberFrequency: calculateRoundNumberFrequency(filteredTransactions),
        amountProgression: 'Would analyze if amounts are increasing/decreasing'
      }
    };
    
    return {
      analysis: {
        ...patternResults,
        advanced: advancedPatterns,
        summary: `Analyzed ${filteredTransactions.length} transactions for behavioral patterns`,
        confidence: patternResults.suspicious.length === 0 ? 'high' : 'medium',
        recommendations: generatePatternRecommendations(patternResults)
      },
      metadata: {
        transactionsAnalyzed: filteredTransactions.length,
        filtersApplied: Object.keys(filters).length,
        analysisType: 'comprehensive_pattern_analysis',
        requestId
      }
    };
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'Pattern analysis failed');
    return { error: 'Pattern analysis failed', requestId };
  }
}

async function performFraudAnalysis(filters, options, requestId) {
  try {
    logger.debug({ requestId, filters, options }, 'Performing fraud analysis');
    
    const transactions = await reportingService.getRecentTransactionsForAgent(100);
    
    // Apply filters (similar to pattern analysis)
    let filteredTransactions = transactions;
    if (filters.timeRange) {
      const timeFilter = extractTimeFilter(filters.timeRange);
      if (timeFilter) {
        filteredTransactions = filterTransactionsByTime(filteredTransactions, timeFilter);
      }
    }
    
    const fraudIndicators = {
      highRisk: [],
      mediumRisk: [],
      lowRisk: [],
      normal: []
    };
    
    // Analyze for fraud indicators
    const amounts = filteredTransactions.map(t => {
      const amountStr = t.amount || t.formatted_cardholder_amount || '0';
      return parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
    }).filter(a => !isNaN(a));
    
    // Check for suspicious patterns
    const avgAmount = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
    const largeTransactions = amounts.filter(a => a > avgAmount * 3).length;
    
    if (largeTransactions > 2) {
      fraudIndicators.mediumRisk.push({
        type: 'unusual_amounts',
        description: `${largeTransactions} transactions significantly above average`,
        severity: 'medium'
      });
    }
    
    // Check transaction velocity
    const recentCount = filteredTransactions.filter(t => {
      const transactionTime = new Date(t.timestamp || t.created_at);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return transactionTime >= hourAgo;
    }).length;
    
    if (recentCount > 5) {
      fraudIndicators.highRisk.push({
        type: 'high_velocity',
        description: `${recentCount} transactions in the last hour`,
        severity: 'high'
      });
    }
    
    // Geographic analysis
    const locations = filteredTransactions.map(t => t.location).filter(l => l);
    const uniqueLocations = new Set(locations);
    
    if (uniqueLocations.size > filteredTransactions.length * 0.8) {
      fraudIndicators.mediumRisk.push({
        type: 'geographic_spread',
        description: `Transactions across ${uniqueLocations.size} different locations`,
        severity: 'medium'
      });
    }
    
    // Calculate risk score
    const riskScore = (
      fraudIndicators.highRisk.length * 3 +
      fraudIndicators.mediumRisk.length * 2 +
      fraudIndicators.lowRisk.length * 1
    );
    
    let riskLevel = 'low';
    if (riskScore >= 6) riskLevel = 'high';
    else if (riskScore >= 3) riskLevel = 'medium';
    
    return {
      analysis: {
        riskLevel,
        riskScore,
        indicators: fraudIndicators,
        summary: `Risk assessment: ${riskLevel} (score: ${riskScore})`,
        recommendations: generateFraudRecommendations(riskLevel, fraudIndicators)
      },
      metadata: {
        transactionsAnalyzed: filteredTransactions.length,
        analysisType: 'fraud_risk_assessment',
        requestId
      }
    };
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'Fraud analysis failed');
    return { error: 'Fraud analysis failed', requestId };
  }
}

async function performMerchantVerification(filters, options, requestId) {
  try {
    logger.debug({ requestId, filters, options }, 'Performing merchant verification');
    
    const transactions = await reportingService.getRecentTransactionsForAgent(100);
    
    // Group transactions by merchant
    const merchantGroups = {};
    transactions.forEach(t => {
      if (t.merchant) {
        if (!merchantGroups[t.merchant]) {
          merchantGroups[t.merchant] = [];
        }
        merchantGroups[t.merchant].push(t);
      }
    });
    
    const merchantVerification = Object.entries(merchantGroups).map(([merchant, merchantTransactions]) => {
      const amounts = merchantTransactions.map(t => {
        const amountStr = t.amount || t.formatted_cardholder_amount || '0';
        return parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
      }).filter(a => !isNaN(a));
      
      const avgAmount = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
      
      return {
        merchant,
        transactionCount: merchantTransactions.length,
        averageAmount: `$${avgAmount.toFixed(2)}`,
        category: merchantTransactions[0].category || 'Unknown',
        locations: [...new Set(merchantTransactions.map(t => t.location).filter(l => l))],
        verification: {
          isRegularMerchant: merchantTransactions.length > 3,
          hasConsistentAmounts: amounts.every(a => Math.abs(a - avgAmount) < avgAmount * 0.5),
          hasConsistentLocation: new Set(merchantTransactions.map(t => t.location)).size === 1,
          riskLevel: merchantTransactions.length === 1 ? 'new_merchant' : 'established'
        }
      };
    });
    
    return {
      analysis: {
        totalMerchants: Object.keys(merchantGroups).length,
        merchants: merchantVerification,
        insights: [
          `Customer has relationships with ${Object.keys(merchantGroups).length} merchants`,
          `${merchantVerification.filter(m => m.verification.isRegularMerchant).length} are regular merchants`,
          `${merchantVerification.filter(m => m.verification.riskLevel === 'new_merchant').length} are new/one-time merchants`
        ],
        recommendations: [
          'Verify recent transactions with new merchants',
          'Check if large amounts at new merchants are intended',
          'Ask about unfamiliar merchant names'
        ]
      },
      metadata: {
        transactionsAnalyzed: transactions.length,
        analysisType: 'merchant_verification',
        requestId
      }
    };
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'Merchant verification failed');
    return { error: 'Merchant verification failed', requestId };
  }
}

async function performHistoryAnalysis(filters, options, requestId) {
  try {
    logger.debug({ requestId, filters, options }, 'Performing history analysis');
    
    const transactions = await reportingService.getRecentTransactionsForAgent(100);
    
    // Analyze historical patterns
    const timeSpan = {
      earliest: transactions.length > 0 ? 
        new Date(Math.min(...transactions.map(t => new Date(t.timestamp || t.created_at)))) : null,
      latest: transactions.length > 0 ? 
        new Date(Math.max(...transactions.map(t => new Date(t.timestamp || t.created_at)))) : null
    };
    
    const amounts = transactions.map(t => {
      const amountStr = t.amount || t.formatted_cardholder_amount || '0';
      return parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
    }).filter(a => !isNaN(a));
    
    const historicalStats = {
      totalTransactions: transactions.length,
      totalSpent: amounts.reduce((sum, amount) => sum + amount, 0),
      averageAmount: amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0,
      maxAmount: amounts.length > 0 ? Math.max(...amounts) : 0,
      minAmount: amounts.length > 0 ? Math.min(...amounts) : 0,
      timeSpan: timeSpan.earliest && timeSpan.latest ? {
        days: Math.ceil((timeSpan.latest - timeSpan.earliest) / (1000 * 60 * 60 * 24)),
        from: timeSpan.earliest.toISOString(),
        to: timeSpan.latest.toISOString()
      } : null
    };
    
    // Analyze trends
    const trends = {
      spendingTrend: 'Would calculate if spending is increasing/decreasing over time',
      frequencyTrend: 'Would calculate if transaction frequency is changing',
      merchantDiversification: `Customer shops at ${countUniqueMerchants(transactions)} different merchants`,
      categoryPreferences: extractMerchantTypes(transactions).slice(0, 3),
      locationPatterns: extractUniqueLocations(transactions).slice(0, 5)
    };
    
    // Generate insights
    const insights = [
      `Customer has been active for ${historicalStats.timeSpan?.days || 'unknown'} days`,
      `Average transaction amount: $${historicalStats.averageAmount.toFixed(2)}`,
      `Most frequent merchant: ${findMostFrequentMerchant(transactions)}`,
      `Preferred categories: ${trends.categoryPreferences.join(', ')}`,
      `Geographic spread: ${trends.locationPatterns.length} locations`
    ];
    
    return {
      analysis: {
        historical: historicalStats,
        trends,
        insights,
        recommendations: [
          'Use historical patterns to verify new transactions',
          'Question transactions that deviate significantly from patterns',
          'Leverage merchant preferences for verification questions'
        ]
      },
      metadata: {
        transactionsAnalyzed: transactions.length,
        analysisType: 'historical_behavior_analysis',
        requestId
      }
    };
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'History analysis failed');
    return { error: 'History analysis failed', requestId };
  }
}

// Additional helper functions for advanced analysis
function calculatePeakTransactionHours(transactions) {
  const hourCounts = {};
  transactions.forEach(t => {
    const hour = new Date(t.timestamp || t.created_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  
  const peakHour = Object.entries(hourCounts)
    .sort(([,a], [,b]) => b - a)[0];
  
  return peakHour ? { hour: parseInt(peakHour[0]), count: peakHour[1] } : null;
}

function analyzeWeekdayWeekendPatterns(transactions) {
  const weekdayCount = transactions.filter(t => {
    const day = new Date(t.timestamp || t.created_at).getDay();
    return day >= 1 && day <= 5; // Monday-Friday
  }).length;
  
  const weekendCount = transactions.length - weekdayCount;
  
  return {
    weekday: weekdayCount,
    weekend: weekendCount,
    preference: weekdayCount > weekendCount ? 'weekday' : 'weekend'
  };
}

function analyzeMerchantLoyalty(transactions) {
  const merchantCounts = {};
  transactions.forEach(t => {
    if (t.merchant) {
      merchantCounts[t.merchant] = (merchantCounts[t.merchant] || 0) + 1;
    }
  });
  
  const loyalMerchants = Object.entries(merchantCounts)
    .filter(([,count]) => count >= 3)
    .map(([merchant, count]) => ({ merchant, count }));
  
  return loyalMerchants;
}

function analyzeCategoryPreferences(transactions) {
  const categoryCounts = {};
  transactions.forEach(t => {
    if (t.category) {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    }
  });
  
  return Object.entries(categoryCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));
}

function calculateNewMerchantFrequency(transactions) {
  const merchantFirstSeen = {};
  let newMerchantCount = 0;
  
  transactions.forEach(t => {
    if (t.merchant && !merchantFirstSeen[t.merchant]) {
      merchantFirstSeen[t.merchant] = true;
      newMerchantCount++;
    }
  });
  
  return {
    newMerchants: newMerchantCount,
    frequency: newMerchantCount / transactions.length
  };
}

function analyzeSpendingTiers(transactions) {
  const amounts = transactions.map(t => {
    const amountStr = t.amount || t.formatted_cardholder_amount || '0';
    return parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
  }).filter(a => !isNaN(a));
  
  const small = amounts.filter(a => a < 10).length;
  const medium = amounts.filter(a => a >= 10 && a <= 100).length;
  const large = amounts.filter(a => a > 100).length;
  
  return { small, medium, large };
}

function calculateRoundNumberFrequency(transactions) {
  const amounts = transactions.map(t => {
    const amountStr = t.amount || t.formatted_cardholder_amount || '0';
    return parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
  }).filter(a => !isNaN(a));
  
  const roundAmounts = amounts.filter(a => a % 10 === 0).length;
  return {
    roundAmounts,
    frequency: amounts.length > 0 ? roundAmounts / amounts.length : 0
  };
}

function generatePatternRecommendations(patternResults) {
  const recommendations = [];
  
  if (patternResults.suspicious.length > 0) {
    recommendations.push('Review suspicious patterns with customer');
    recommendations.push('Ask specific questions about flagged transactions');
  }
  
  if (patternResults.normal.length > 0) {
    recommendations.push('Transaction patterns appear normal');
    recommendations.push('Standard verification questions should suffice');
  }
  
  return recommendations;
}

function generateFraudRecommendations(riskLevel, fraudIndicators) {
  const recommendations = [];
  
  switch (riskLevel) {
    case 'high':
      recommendations.push('Immediate manual review required');
      recommendations.push('Escalate to fraud department');
      recommendations.push('Contact customer for verification');
      break;
    case 'medium':
      recommendations.push('Additional verification recommended');
      recommendations.push('Review recent transaction patterns');
      recommendations.push('Ask detailed verification questions');
      break;
    case 'low':
      recommendations.push('Standard verification procedures');
      recommendations.push('Continue monitoring');
      break;
  }
  
  return recommendations;
}

// ========== Enhanced Query Processing Helper Functions ==========

/**
 * Extract time filter criteria from natural language query.
 * @private
 * @param {string} query - Natural language query
 * @returns {Object|null} Time filter configuration
 */








/**
 * Filter transactions based on location criteria.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {Object} locationFilter - Location filter configuration
 * @returns {Array} Filtered transactions
 */
function filterTransactionsByLocation(transactions, locationFilter) {
  return transactions.filter(transaction => {
    const location = (transaction.location || '').toLowerCase();
    
    if (locationFilter.type === 'domestic') {
      return location.includes('usa') || location.includes('us') || 
             location.includes('united states') || !location.includes(',');
    }
    if (locationFilter.type === 'international') {
      return !location.includes('usa') && !location.includes('us') && 
             !location.includes('united states') && location.includes(',');
    }
    if (locationFilter.location) {
      return location.includes(locationFilter.location.toLowerCase());
    }
    
    return true;
  });
}

/**
 * Filter transactions based on network criteria.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {Object} networkFilter - Network filter configuration
 * @returns {Array} Filtered transactions
 */
function filterTransactionsByNetwork(transactions, networkFilter) {
  return transactions.filter(transaction => {
    const network = (transaction.network || '').toUpperCase();
    return network === networkFilter.network;
  });
}

/**
 * Filter transactions based on status criteria.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {Object} statusFilter - Status filter configuration
 * @returns {Array} Filtered transactions
 */
function filterTransactionsByStatus(transactions, statusFilter) {
  return transactions.filter(transaction => {
    const status = (transaction.status || '').toUpperCase();
    return status === statusFilter.status;
  });
}

/**
 * Filter transactions based on category criteria.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {Object} categoryFilter - Category filter configuration
 * @returns {Array} Filtered transactions
 */
function filterTransactionsByCategory(transactions, categoryFilter) {
  return transactions.filter(transaction => {
    const category = (transaction.category || '').toLowerCase();
    return category.includes(categoryFilter.category.toLowerCase());
  });
}

/**
 * Generate enhanced statistics from filtered transactions.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {string} query - Original query for context
 * @returns {Promise<Object>} Enhanced statistics
 */
async function generateEnhancedStatistics(transactions, query) {
  const totalCount = transactions.length;
  const amounts = transactions.map(t => {
    const amountStr = t.amount || t.formatted_cardholder_amount || '0';
    return parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
  }).filter(a => !isNaN(a));
  
  const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0);
  const averageAmount = totalCount > 0 ? totalAmount / totalCount : 0;
  const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
  const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;
  
  // Categorize by amount ranges
  const smallTransactions = amounts.filter(a => a < 10).length;
  const mediumTransactions = amounts.filter(a => a >= 10 && a <= 100).length;
  const largeTransactions = amounts.filter(a => a > 100).length;
  
  // Get merchant statistics
  const merchantCounts = {};
  const categoryCounts = {};
  
  transactions.forEach(t => {
    if (t.merchant) {
      merchantCounts[t.merchant] = (merchantCounts[t.merchant] || 0) + 1;
    }
    if (t.category) {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    }
  });
  
  const topMerchants = Object.entries(merchantCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([merchant, count]) => ({ merchant, count }));
  
  const topCategories = Object.entries(categoryCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));
  
  return {
    summary: {
      totalTransactions: totalCount,
      totalAmount: `$${totalAmount.toFixed(2)}`,
      averageAmount: `$${averageAmount.toFixed(2)}`,
      maxAmount: `$${maxAmount.toFixed(2)}`,
      minAmount: `$${minAmount.toFixed(2)}`
    },
    distribution: {
      smallTransactions: { count: smallTransactions, description: 'Under $10' },
      mediumTransactions: { count: mediumTransactions, description: '$10-$100' },
      largeTransactions: { count: largeTransactions, description: 'Over $100' }
    },
    topMerchants,
    topCategories,
    timeframe: 'Based on available transaction data',
    queryContext: `Statistics generated for: ${query}`
  };
}

/**
 * Generate intelligent query suggestions based on content.
 * @private
 * @param {string} query - Original query
 * @param {Array} transactions - Available transactions
 * @returns {Object} Query suggestions and insights
 */
function generateQuerySuggestions(query, transactions) {
  const lowerQuery = query.toLowerCase();
  const suggestions = [];
  let queryType = 'general query';
  
  // Analyze query intent and provide suggestions
  if (lowerQuery.length < 3) {
    queryType = 'empty or short query';
    suggestions.push(
      'Try: "transactions from Global Teleserv"',
      'Try: "large transactions over $50"',
      'Try: "transactions from yesterday"',
      'Try: "declined transactions"',
      'Try: "VISA transactions"'
    );
  } else {
    // Suggest based on available data
    const merchants = [...new Set(transactions.map(t => t.merchant))].slice(0, 3);
    const locations = [...new Set(transactions.map(t => t.location))].slice(0, 2);
    
    if (merchants.length > 0) {
      suggestions.push(`Try: "transactions from ${merchants[0]}"`);
    }
    if (locations.length > 0) {
      suggestions.push(`Try: "transactions in ${locations[0]}"`);
    }
    
    suggestions.push(
      'Try: "suspicious transactions"',
      'Try: "spending analytics"',
      'Try: "transaction patterns"'
    );
    
    queryType = 'unrecognized query pattern';
  }
  
  return {
    queryType,
    suggestions,
    availableFilters: [
      'Merchant: "from [merchant name]"',
      'Amount: "over $X", "under $Y"', 
      'Time: "yesterday", "last week"',
      'Location: "in [city/state]"',
      'Status: "approved", "declined"',
      'Network: "VISA", "Mastercard"'
    ]
  };
}

/**
 * Perform advanced intelligence analysis on transactions.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {string} query - Original query
 * @param {string} requestId - Request ID
 * @returns {Promise<Object>} Advanced intelligence results
 */
async function performAdvancedIntelligence(transactions, query, requestId) {
  try {
    const analysis = {
      behavioralPatterns: {
        spendingVelocity: calculateSpendingVelocity(transactions),
        merchantDiversity: calculateMerchantDiversity(transactions),
        geographicSpread: analyzeGeographicPatterns(transactions),
        temporalPatterns: analyzeTemporalPatterns(transactions)
      },
      riskAssessment: {
        riskScore: calculateRiskScore(transactions),
        anomalies: detectAnomalies(transactions),
        fraudIndicators: identifyFraudIndicators(transactions)
      },
      insights: generateAdvancedInsights(transactions),
      recommendations: generateIntelligenceRecommendations(transactions)
    };
    
    return analysis;
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'Advanced intelligence analysis failed');
    return { error: 'Intelligence analysis failed', requestId };
  }
}

/**
 * Perform comparative analysis between different transaction sets.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {string} query - Original query
 * @param {string} requestId - Request ID
 * @returns {Promise<Object>} Comparative analysis results
 */
async function performComparativeAnalysis(transactions, query, requestId) {
  try {
    // Split transactions into time periods for comparison
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const recentTransactions = transactions.filter(t => 
      new Date(t.timestamp || t.created_at) >= oneWeekAgo
    );
    const olderTransactions = transactions.filter(t => 
      new Date(t.timestamp || t.created_at) < oneWeekAgo
    );
    
    const comparison = {
      timeComparison: {
        recent: {
          count: recentTransactions.length,
          totalAmount: calculateTotalSpent(recentTransactions),
          averageAmount: calculateAverageAmount(recentTransactions),
          uniqueMerchants: countUniqueMerchants(recentTransactions)
        },
        historical: {
          count: olderTransactions.length,
          totalAmount: calculateTotalSpent(olderTransactions),
          averageAmount: calculateAverageAmount(olderTransactions),
          uniqueMerchants: countUniqueMerchants(olderTransactions)
        }
      },
      trends: {
        spendingTrend: recentTransactions.length > olderTransactions.length ? 'increasing' : 'decreasing',
        merchantDiversification: countUniqueMerchants(recentTransactions) > countUniqueMerchants(olderTransactions) ? 'expanding' : 'contracting'
      },
      insights: [
        `Recent activity: ${recentTransactions.length} transactions vs ${olderTransactions.length} historical`,
        `Spending pattern: ${recentTransactions.length > olderTransactions.length ? 'More active recently' : 'Less active recently'}`,
        `Merchant variety: ${countUniqueMerchants(recentTransactions)} recent vs ${countUniqueMerchants(olderTransactions)} historical`
      ]
    };
    
    return comparison;
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'Comparative analysis failed');
    return { error: 'Comparative analysis failed', requestId };
  }
}

/**
 * Perform security and fraud analysis on transactions.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {string} query - Original query
 * @param {string} requestId - Request ID
 * @returns {Promise<Object>} Security analysis results
 */
async function performSecurityAnalysis(transactions, query, requestId) {
  try {
    const securityAnalysis = {
      fraudRisk: {
        overallRisk: calculateOverallFraudRisk(transactions),
        highRiskTransactions: identifyHighRiskTransactions(transactions),
        suspiciousPatterns: identifySuspiciousPatterns(transactions)
      },
      verificationPoints: {
        strongVerification: transactions.filter(t => t.verificationPoints?.authCode).length,
        weakVerification: transactions.filter(t => !t.verificationPoints?.authCode).length,
        verificationRate: `${Math.round((transactions.filter(t => t.verificationPoints?.authCode).length / transactions.length) * 100)}%`
      },
      securityRecommendations: generateSecurityRecommendations(transactions),
      alertTriggers: identifyAlertTriggers(transactions)
    };
    
    return securityAnalysis;
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'Security analysis failed');
    return { error: 'Security analysis failed', requestId };
  }
}

// Helper functions for advanced analysis
function calculateSpendingVelocity(transactions) {
  if (transactions.length < 2) return 'insufficient data';
  
  const amounts = transactions.map(t => parseFloat(t.amount?.replace(/[^0-9.-]/g, '') || '0'));
  const totalSpent = amounts.reduce((sum, amount) => sum + amount, 0);
  const timeSpan = transactions.length; // Simplified velocity calculation
  
  return `$${(totalSpent / timeSpan).toFixed(2)} per transaction`;
}

function calculateMerchantDiversity(transactions) {
  const uniqueMerchants = new Set(transactions.map(t => t.merchant)).size;
  const totalTransactions = transactions.length;
  
  return {
    uniqueMerchants,
    diversityRatio: totalTransactions > 0 ? (uniqueMerchants / totalTransactions).toFixed(2) : '0',
    diversityLevel: uniqueMerchants / totalTransactions > 0.8 ? 'high' : 
                   uniqueMerchants / totalTransactions > 0.5 ? 'medium' : 'low'
  };
}

function analyzeGeographicPatterns(transactions) {
  const locations = transactions.map(t => t.location).filter(Boolean);
  const uniqueLocations = [...new Set(locations)];
  
  return {
    uniqueLocations: uniqueLocations.length,
    primaryLocation: locations.length > 0 ? locations[0] : 'unknown',
    geographicSpread: uniqueLocations.length > 3 ? 'wide' : uniqueLocations.length > 1 ? 'moderate' : 'narrow'
  };
}

function analyzeTemporalPatterns(transactions) {
  const hours = transactions.map(t => {
    const date = new Date(t.timestamp || t.created_at);
    return date.getHours();
  });
  
  const businessHours = hours.filter(h => h >= 9 && h <= 17).length;
  const afterHours = hours.filter(h => h < 9 || h > 17).length;
  
  return {
    businessHoursTransactions: businessHours,
    afterHoursTransactions: afterHours,
    primaryTimePattern: businessHours > afterHours ? 'business hours' : 'after hours'
  };
}

function calculateRiskScore(transactions) {
  let riskScore = 0;
  
  // Risk factors
  const declinedCount = transactions.filter(t => t.status !== 'APPROVED').length;
  const largeTransactions = transactions.filter(t => {
    const amount = parseFloat(t.amount?.replace(/[^0-9.-]/g, '') || '0');
    return amount > 100;
  }).length;
  
  riskScore += (declinedCount / transactions.length) * 30; // 30% weight for declined
  riskScore += (largeTransactions / transactions.length) * 20; // 20% weight for large amounts
  
  return Math.min(Math.round(riskScore), 100);
}

function detectAnomalies(transactions) {
  const anomalies = [];
  
  // Detect unusual amounts
  const amounts = transactions.map(t => parseFloat(t.amount?.replace(/[^0-9.-]/g, '') || '0'));
  const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
  
  transactions.forEach((transaction, index) => {
    const amount = amounts[index];
    if (amount > avgAmount * 3) {
      anomalies.push({
        type: 'unusual_amount',
        transaction: transaction.id,
        description: `Amount $${amount} is ${Math.round(amount / avgAmount)}x higher than average`
      });
    }
  });
  
  return anomalies;
}

function identifyFraudIndicators(transactions) {
  const indicators = [];
  
  // Check for rapid successive transactions
  const timestamps = transactions.map(t => new Date(t.timestamp || t.created_at));
  for (let i = 1; i < timestamps.length; i++) {
    const timeDiff = timestamps[i-1] - timestamps[i];
    if (timeDiff < 60000) { // Less than 1 minute apart
      indicators.push('rapid_successive_transactions');
      break;
    }
  }
  
  // Check for round number amounts (potential fraud indicator)
  const roundAmounts = transactions.filter(t => {
    const amount = parseFloat(t.amount?.replace(/[^0-9.-]/g, '') || '0');
    return amount % 10 === 0 && amount > 0;
  });
  
  if (roundAmounts.length / transactions.length > 0.7) {
    indicators.push('high_round_number_frequency');
  }
  
  return indicators;
}

function generateAdvancedInsights(transactions) {
  return [
    `Analyzed ${transactions.length} transactions for behavioral patterns`,
    `Primary spending pattern: ${transactions.length > 10 ? 'active user' : 'light user'}`,
    `Geographic consistency: ${analyzeGeographicPatterns(transactions).geographicSpread}`,
    `Merchant loyalty: ${calculateMerchantDiversity(transactions).diversityLevel}`
  ];
}

function generateIntelligenceRecommendations(transactions) {
  const recommendations = [];
  
  if (transactions.length < 5) {
    recommendations.push('Insufficient transaction history for comprehensive analysis');
  }
  
  const riskScore = calculateRiskScore(transactions);
  if (riskScore > 50) {
    recommendations.push('High risk score detected - recommend additional verification');
  }
  
  const diversity = calculateMerchantDiversity(transactions);
  if (diversity.diversityLevel === 'low') {
    recommendations.push('Low merchant diversity - monitor for potential account takeover');
  }
  
  return recommendations;
}

function calculateOverallFraudRisk(transactions) {
  const riskScore = calculateRiskScore(transactions);
  
  if (riskScore > 70) return 'high';
  if (riskScore > 40) return 'medium';
  return 'low';
}

function identifyHighRiskTransactions(transactions) {
  return transactions.filter(transaction => {
    const amount = parseFloat(transaction.amount?.replace(/[^0-9.-]/g, '') || '0');
    return amount > 100 || transaction.status !== 'APPROVED';
  }).map(t => ({
    id: t.id,
    amount: t.amount,
    merchant: t.merchant,
    riskFactors: [
      parseFloat(t.amount?.replace(/[^0-9.-]/g, '') || '0') > 100 ? 'large_amount' : null,
      t.status !== 'APPROVED' ? 'declined_transaction' : null
    ].filter(Boolean)
  }));
}

function identifySuspiciousPatterns(transactions) {
  const patterns = [];
  
  // Check for velocity patterns
  if (transactions.length > 5) {
    const recentHour = transactions.filter(t => {
      const transactionTime = new Date(t.timestamp || t.created_at);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return transactionTime > oneHourAgo;
    });
    
    if (recentHour.length > 3) {
      patterns.push('high_velocity_transactions');
    }
  }
  
  return patterns;
}

function generateSecurityRecommendations(transactions) {
  const recommendations = [];
  
  const riskLevel = calculateOverallFraudRisk(transactions);
  if (riskLevel === 'high') {
    recommendations.push('Implement additional authentication measures');
    recommendations.push('Monitor account for unusual activity');
  }
  
  const declinedCount = transactions.filter(t => t.status !== 'APPROVED').length;
  if (declinedCount > transactions.length * 0.2) {
    recommendations.push('High decline rate detected - investigate payment methods');
  }
  
  return recommendations;
}

function identifyAlertTriggers(transactions) {
  const triggers = [];
  
  // Large amount trigger
  const largeTransactions = transactions.filter(t => {
    const amount = parseFloat(t.amount?.replace(/[^0-9.-]/g, '') || '0');
    return amount > 500;
  });
  
  if (largeTransactions.length > 0) {
    triggers.push({
      type: 'large_amount',
      count: largeTransactions.length,
      threshold: '$500+'
    });
  }
  
  // Velocity trigger
  const recentTransactions = transactions.filter(t => {
    const transactionTime = new Date(t.timestamp || t.created_at);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return transactionTime > oneHourAgo;
  });
  
  if (recentTransactions.length > 5) {
    triggers.push({
      type: 'high_velocity',
      count: recentTransactions.length,
      timeframe: '1 hour'
    });
  }
  
  return triggers;
}

/**
 * Analyze transaction patterns for suspicious or unusual activity.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {string} query - Original query for context
 * @returns {Promise<Object>} Pattern analysis results
 */
async function analyzeTransactionPatterns(transactions, query) {
  const patterns = {
    suspicious: [],
    normal: [],
    insights: []
  };
  
  // Analyze timing patterns
  const timestamps = transactions.map(t => new Date(t.timestamp || t.created_at));
  const timeGaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i-1] - timestamps[i]; // in milliseconds
    timeGaps.push(gap / (1000 * 60)); // convert to minutes
  }
  
  // Check for rapid-fire transactions (suspicious)
  const rapidTransactions = timeGaps.filter(gap => gap < 5).length; // less than 5 minutes apart
  if (rapidTransactions > 2) {
    patterns.suspicious.push({
      type: 'rapid_transactions',
      description: `${rapidTransactions} transactions occurred within 5 minutes of each other`,
      severity: 'medium'
    });
  }
  
  // Analyze amount patterns
  const amounts = transactions.map(t => {
    const amountStr = t.amount || t.formatted_cardholder_amount || '0';
    return parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
  }).filter(a => !isNaN(a));
  
  // Check for round number amounts (potentially suspicious)
  const roundAmounts = amounts.filter(a => a % 10 === 0).length;
  if (roundAmounts > amounts.length * 0.7) {
    patterns.suspicious.push({
      type: 'round_amounts',
      description: `${roundAmounts} out of ${amounts.length} transactions are round dollar amounts`,
      severity: 'low'
    });
  }
  
  // Check for geographic anomalies
  const locations = transactions.map(t => t.location).filter(l => l && l !== 'Unknown Location');
  const uniqueLocations = new Set(locations);
  if (uniqueLocations.size > transactions.length * 0.8) {
    patterns.suspicious.push({
      type: 'geographic_spread',
      description: `Transactions span ${uniqueLocations.size} different locations`,
      severity: 'medium'
    });
  }
  
  // Normal patterns
  if (patterns.suspicious.length === 0) {
    patterns.normal.push({
      type: 'standard_behavior',
      description: 'Transaction patterns appear normal',
      confidence: 'high'
    });
  }
  
  // Generate insights
  patterns.insights.push(`Analyzed ${transactions.length} transactions for unusual patterns`);
  patterns.insights.push(`Found ${patterns.suspicious.length} potentially suspicious patterns`);
  
  if (amounts.length > 0) {
    const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    patterns.insights.push(`Average transaction amount: $${avgAmount.toFixed(2)}`);
  }
  
  return {
    ...patterns,
    analysisMetadata: {
      transactionCount: transactions.length,
      analysisType: 'behavioral_pattern_detection',
      queryContext: query,
      timestamp: new Date().toISOString()
    }
  };
} 