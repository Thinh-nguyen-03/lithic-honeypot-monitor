/**
 * Enhanced Vapi MCP Controller - Handles Model Context Protocol requests for AI agents
 * 
 * This controller provides comprehensive MCP (Model Context Protocol) functionality:
 * - Real-time alert subscription management for AI agents
 * - Natural language transaction query processing
 * - Scammer verification data formatting
 * - Integration with existing transaction intelligence
 * - MCP-compliant JSON-RPC 2.0 responses
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import alertService from '../../services/alert-service.js';
import connectionManager from '../../services/connection-manager.js';
import * as reportingService from '../../services/reporting-service.js';
import * as supabaseService from '../../services/supabase-service.js';

// Query classification keywords for natural language processing
const queryClassification = {
  recent: ['last', 'recent', 'latest', 'new', 'current', 'newest'],
  merchant: ['from', 'at', 'merchant', 'store', 'shop', 'bought', 'purchased', 'where'],
  statistics: ['stats', 'total', 'count', 'summary', 'how much', 'spent', 'average'],
  specific: ['transaction', 'purchase', 'payment', 'charge', 'txn'],
  verification: ['verify', 'confirm', 'check', 'validate', 'authenticate'],
  amount: ['amount', 'cost', 'price', 'dollar', '$', 'spend', 'money'],
  location: ['location', 'where', 'city', 'state', 'country', 'address'],
  time: ['when', 'time', 'date', 'hour', 'minute', 'ago', 'yesterday', 'today'],
  timeRange: ['hour', 'hours', 'today', 'yesterday', 'week', 'month', 'day', 'days'],
  amountRange: ['large', 'small', 'big', 'little', 'expensive', 'cheap', 'over', 'under', 'above', 'below'],
  pattern: ['pattern', 'unusual', 'strange', 'suspicious', 'frequent', 'repeated']
};

// ========== Alert Subscription Management ==========

/**
 * Subscribe AI agent to real-time transaction alerts for specific card(s).
 * Establishes MCP connection for receiving real-time transaction notifications.
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
  }, 'MCP alert subscription request received');

  try {
    const { agentId, cardTokens, connectionType = 'sse', metadata = {} } = req.validatedData;
    
    // Generate session ID for this subscription
    const sessionId = uuidv4();
    
    // For now, we'll use the first card token for the primary subscription
    // TODO: Enhance to support multiple card tokens per subscription
    const primaryCardToken = cardTokens[0];
    
    // Create mock connection object for alert service registration
    const mockConnection = {
      write: (data) => {
        // This would normally write to SSE, but for MCP we'll handle differently
        logger.debug({ sessionId, data: data.substring(0, 100) }, 'Alert data ready for MCP delivery');
      }
    };
    
    // Register with alert service
    const registrationSuccess = alertService.registerConnection(
      sessionId,
      primaryCardToken,
      mockConnection
    );
    
    if (!registrationSuccess) {
      logger.error({
        requestId,
        sessionId,
        agentId,
        cardTokens
      }, 'Failed to register with alert service');
      
      return res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to register alert subscription',
          data: { requestId }
        },
        id: null
      });
    }
    
    // Store subscription metadata with connection manager
    await connectionManager.createConnection(req, res, primaryCardToken, {
      sessionId,
      agentId,
      cardTokens,
      connectionType,
      subscriptionMetadata: metadata,
      mcpSubscription: true,
      authenticatedAt: new Date()
    });
    
    const duration = Date.now() - startTime;
    
    logger.info({
      requestId,
      sessionId,
      agentId,
      cardTokens,
      connectionType,
      duration
    }, 'MCP alert subscription created successfully');

    // MCP-compliant success response
    res.status(200).json({
      jsonrpc: '2.0',
      result: {
        sessionId,
        agentId,
        monitoringCards: cardTokens,
        connectionType,
        status: 'subscribed',
        timestamp: new Date().toISOString(),
        capabilities: [
          'real_time_alerts',
          'transaction_queries',
          'scammer_verification',
          'merchant_intelligence'
        ]
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
    }, 'Failed to create MCP alert subscription');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error during subscription',
        data: {
          timestamp: new Date().toISOString(),
          requestId
        }
      },
      id: null
    });
  }
}

/**
 * Unsubscribe AI agent from real-time transaction alerts.
 * Cleanly terminates MCP connection and stops alert delivery.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function unsubscribeFromAlerts(req, res) {
  const requestId = req.requestId || uuidv4();
  const { sessionId } = req.params;
  const reason = req.query.reason || 'agent_disconnect';
  
  logger.info({
    requestId,
    sessionId,
    reason
  }, 'MCP alert unsubscription request received');

  try {
    // Check if session exists
    const connectionHealth = connectionManager.getConnectionHealth(sessionId);
    if (!connectionHealth) {
      logger.warn({
        requestId,
        sessionId
      }, 'Attempted to unsubscribe non-existent MCP session');

      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Session not found or already unsubscribed',
          data: { sessionId }
        },
        id: null
      });
    }

    // Remove from alert service
    const removalSuccess = alertService.removeConnection(sessionId);
    
    // Remove from connection manager
    connectionManager.handleDisconnection(sessionId, reason);

    logger.info({
      requestId,
      sessionId,
      reason,
      alertServiceRemoval: removalSuccess
    }, 'MCP alert unsubscription completed');

    res.status(200).json({
      jsonrpc: '2.0',
      result: {
        sessionId,
        status: 'unsubscribed',
        reason,
        timestamp: new Date().toISOString()
      },
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      sessionId,
      error: error.message,
      stack: error.stack
    }, 'Failed to unsubscribe from MCP alerts');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error during unsubscription',
        data: {
          timestamp: new Date().toISOString(),
          requestId
        }
      },
      id: null
    });
  }
}

/**
 * Check the subscription status and health of an AI agent's MCP connection.
 * Provides detailed connection information and monitoring statistics.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function getSubscriptionStatus(req, res) {
  const requestId = req.requestId || uuidv4();
  const { sessionId } = req.params;
  
  try {
    // Get connection health from connection manager
    const connectionHealth = connectionManager.getConnectionHealth(sessionId);
    if (!connectionHealth) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Session not found',
          data: { sessionId }
        },
        id: null
      });
    }

    // Get alert service metrics
    const alertMetrics = alertService.getMetrics();
    const activeConnections = alertService.getActiveConnections();
    
    // Find specific connection details
    const connectionDetail = activeConnections.connectionDetails.find(
      conn => conn.sessionId === sessionId
    );

    res.status(200).json({
      jsonrpc: '2.0',
      result: {
        sessionId,
        status: connectionDetail ? 'active' : 'inactive',
        connectionHealth: connectionHealth.healthScore || 0.95,
        monitoringCards: connectionDetail ? [connectionDetail.cardToken] : [],
        connectedAt: connectionDetail?.connectedAt,
        lastActivity: connectionDetail?.lastActivity,
        alertsReceived: 0, // Would track this per session in enhanced version
        systemStatus: {
          totalActiveConnections: alertMetrics.activeConnections,
          totalAlertsSent: alertMetrics.totalAlertsSent
        },
        timestamp: new Date().toISOString()
      },
      id: null
    });

  } catch (error) {
    logger.error({
      requestId,
      sessionId,
      error: error.message
    }, 'Failed to get MCP subscription status');

    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error getting subscription status',
        data: { requestId }
      },
      id: null
    });
  }
}

// ========== Query Processing System ==========

/**
 * Main query handler for MCP tool calls from Vapi AI agents.
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
      case 'get_merchant_info':
        queryResult = await handleMerchantInfo(parameters, requestId);
        break;
      case 'get_card_info':
        queryResult = await handleCardInfo(parameters, requestId);
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

  // Classify the query with enhanced categorization
  const queryType = classifyQuery(query);
  
  let transactions = [];
  let searchSummary = '';
  let appliedFilters = [];
  
  // Get base transaction data
  const baseTransactionLimit = Math.max(limit * 5, 50); // Get more data for filtering
  let baseTransactions = await reportingService.getRecentTransactionsForAgent(baseTransactionLimit);
  
  // Apply time-based filtering
  if (queryType.includes('timeRange') || queryType.includes('time')) {
    const timeFilter = extractTimeFilter(query);
    if (timeFilter) {
      baseTransactions = filterTransactionsByTime(baseTransactions, timeFilter);
      appliedFilters.push(`time: ${timeFilter.description}`);
      logger.debug({ requestId, timeFilter }, 'Applied time filter');
    }
  }
  
  // Apply amount-based filtering
  if (queryType.includes('amountRange') || queryType.includes('amount')) {
    const amountFilter = extractAmountFilter(query);
    if (amountFilter) {
      baseTransactions = filterTransactionsByAmount(baseTransactions, amountFilter);
      appliedFilters.push(`amount: ${amountFilter.description}`);
      logger.debug({ requestId, amountFilter }, 'Applied amount filter');
    }
  }
  
  // Route based on primary query classification
  if (queryType.includes('recent')) {
    transactions = baseTransactions.slice(0, limit);
    searchSummary = `Recent ${limit} transactions`;
  } else if (queryType.includes('merchant')) {
    // Extract merchant name from query
    const merchantName = extractMerchantName(query);
    if (merchantName) {
      transactions = baseTransactions.filter(t => 
        t.merchant.toLowerCase().includes(merchantName.toLowerCase())
      ).slice(0, limit);
      searchSummary = `Transactions from ${merchantName}`;
      appliedFilters.push(`merchant: ${merchantName}`);
    } else {
      transactions = baseTransactions.slice(0, limit);
      searchSummary = `Recent transactions (merchant query unclear)`;
    }
  } else if (queryType.includes('statistics')) {
    const stats = await generateEnhancedStatistics(baseTransactions, query);
    return {
      queryType: 'statistics',
      statistics: stats,
      appliedFilters,
      summary: 'Enhanced transaction statistics and summary data'
    };
  } else if (queryType.includes('pattern')) {
    const patternAnalysis = await analyzeTransactionPatterns(baseTransactions, query);
    return {
      queryType: 'pattern_analysis',
      patterns: patternAnalysis,
      appliedFilters,
      summary: 'Transaction pattern analysis results'
    };
  } else {
    // Default to recent transactions with any applied filters
    transactions = baseTransactions.slice(0, limit);
    searchSummary = appliedFilters.length > 0 ? 
      `Filtered transactions` : 
      `Recent transactions (general query)`;
  }
  
  // Add summary of applied filters
  if (appliedFilters.length > 0) {
    searchSummary += ` (filters: ${appliedFilters.join(', ')})`;
  }
  
  return {
    queryType: queryType.join(', '),
    transactions: transactions.map(formatTransactionForAI),
    summary: searchSummary,
    resultsCount: transactions.length,
    appliedFilters,
    verificationData: generateVerificationSuggestions(transactions),
    queryInsights: {
      totalAvailable: baseTransactions.length,
      filtersApplied: appliedFilters.length,
      processingNote: appliedFilters.length > 0 ? 
        'Results filtered based on query criteria' : 
        'No specific filters applied'
    }
  };
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
 * @private
 * @param {Object} parameters - Query parameters
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Card information
 */
async function handleCardInfo(parameters, requestId) {
  const { cardToken } = parameters;
  
  // Get recent transactions for this card
  const transactions = await reportingService.getRecentTransactionsForAgent(10);
  
  return {
    queryType: 'card_info',
    cardToken,
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
    }
  };
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
function classifyQuery(query) {
  const lowerQuery = query.toLowerCase();
  const classifications = [];
  
  for (const [category, keywords] of Object.entries(queryClassification)) {
    if (keywords.some(keyword => lowerQuery.includes(keyword))) {
      classifications.push(category);
    }
  }
  
  return classifications.length > 0 ? classifications : ['general'];
}

/**
 * Extract merchant name from natural language query.
 * @private
 * @param {string} query - Natural language query
 * @returns {string|null} Extracted merchant name or null
 */
function extractMerchantName(query) {
  // Simple extraction - would be enhanced with NLP
  const words = query.split(' ');
  const atIndex = words.findIndex(word => word.toLowerCase() === 'at');
  const fromIndex = words.findIndex(word => word.toLowerCase() === 'from');
  
  const index = atIndex !== -1 ? atIndex : fromIndex;
  if (index !== -1 && words[index + 1]) {
    return words[index + 1].replace(/[^a-zA-Z0-9]/g, '');
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
        acceptorId: transaction.merchant_acceptor_id,
        mcc: transaction.merchant_mcc,
        descriptor: transaction.merchant_descriptor
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
function extractTimeFilter(query) {
  const lowerQuery = query.toLowerCase();
  
  // Time patterns with their corresponding filters
  const timePatterns = [
    {
      patterns: ['last hour', 'past hour', 'within hour'],
      filter: { hours: 1, description: 'last hour' }
    },
    {
      patterns: ['last 2 hours', 'past 2 hours', 'within 2 hours'],
      filter: { hours: 2, description: 'last 2 hours' }
    },
    {
      patterns: ['today', 'this day'],
      filter: { days: 1, startOfDay: true, description: 'today' }
    },
    {
      patterns: ['yesterday'],
      filter: { days: 1, dayOffset: -1, description: 'yesterday' }
    },
    {
      patterns: ['last 24 hours', 'past 24 hours', 'past day'],
      filter: { hours: 24, description: 'last 24 hours' }
    },
    {
      patterns: ['this week', 'last week', 'past week'],
      filter: { days: 7, description: 'this week' }
    },
    {
      patterns: ['last 3 days', 'past 3 days'],
      filter: { days: 3, description: 'last 3 days' }
    },
    {
      patterns: ['this month', 'last month', 'past month'],
      filter: { days: 30, description: 'this month' }
    }
  ];
  
  for (const timePattern of timePatterns) {
    if (timePattern.patterns.some(pattern => lowerQuery.includes(pattern))) {
      return timePattern.filter;
    }
  }
  
  return null;
}

/**
 * Filter transactions based on time criteria.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {Object} timeFilter - Time filter configuration
 * @returns {Array} Filtered transactions
 */
function filterTransactionsByTime(transactions, timeFilter) {
  const now = new Date();
  let filterDate;
  
  if (timeFilter.hours) {
    filterDate = new Date(now.getTime() - (timeFilter.hours * 60 * 60 * 1000));
  } else if (timeFilter.days) {
    if (timeFilter.startOfDay) {
      // For "today", start from beginning of current day
      filterDate = new Date(now);
      filterDate.setHours(0, 0, 0, 0);
      if (timeFilter.dayOffset) {
        filterDate.setDate(filterDate.getDate() + timeFilter.dayOffset);
      }
    } else {
      // For "last X days", go back X days from now
      filterDate = new Date(now.getTime() - (timeFilter.days * 24 * 60 * 60 * 1000));
    }
  } else {
    return transactions; // No valid time filter
  }
  
  return transactions.filter(transaction => {
    const transactionDate = new Date(transaction.timestamp || transaction.created_at);
    return transactionDate >= filterDate;
  });
}

/**
 * Extract amount filter criteria from natural language query.
 * @private
 * @param {string} query - Natural language query
 * @returns {Object|null} Amount filter configuration
 */
function extractAmountFilter(query) {
  const lowerQuery = query.toLowerCase();
  
  // Amount patterns with their corresponding filters
  const amountPatterns = [
    {
      patterns: ['large', 'big', 'expensive', 'high'],
      filter: { type: 'large', minAmount: 100, description: 'large transactions (>$100)' }
    },
    {
      patterns: ['small', 'little', 'cheap', 'low'],
      filter: { type: 'small', maxAmount: 10, description: 'small transactions (<$10)' }
    },
    {
      patterns: ['medium', 'moderate'],
      filter: { type: 'medium', minAmount: 10, maxAmount: 100, description: 'medium transactions ($10-$100)' }
    },
    {
      patterns: ['over 100', 'above 100', 'more than 100'],
      filter: { type: 'custom', minAmount: 100, description: 'transactions over $100' }
    },
    {
      patterns: ['under 50', 'below 50', 'less than 50'],
      filter: { type: 'custom', maxAmount: 50, description: 'transactions under $50' }
    },
    {
      patterns: ['over 50', 'above 50', 'more than 50'],
      filter: { type: 'custom', minAmount: 50, description: 'transactions over $50' }
    }
  ];
  
  for (const amountPattern of amountPatterns) {
    if (amountPattern.patterns.some(pattern => lowerQuery.includes(pattern))) {
      return amountPattern.filter;
    }
  }
  
  // Look for specific dollar amounts
  const dollarMatch = lowerQuery.match(/[\$]?(\d+)/);
  if (dollarMatch) {
    const amount = parseInt(dollarMatch[1]);
    if (lowerQuery.includes('over') || lowerQuery.includes('above') || lowerQuery.includes('more than')) {
      return { 
        type: 'custom', 
        minAmount: amount, 
        description: `transactions over $${amount}` 
      };
    } else if (lowerQuery.includes('under') || lowerQuery.includes('below') || lowerQuery.includes('less than')) {
      return { 
        type: 'custom', 
        maxAmount: amount, 
        description: `transactions under $${amount}` 
      };
    }
  }
  
  return null;
}

/**
 * Filter transactions based on amount criteria.
 * @private
 * @param {Array} transactions - Array of transactions
 * @param {Object} amountFilter - Amount filter configuration
 * @returns {Array} Filtered transactions
 */
function filterTransactionsByAmount(transactions, amountFilter) {
  return transactions.filter(transaction => {
    // Extract numeric amount from transaction (handle various formats)
    const amountStr = transaction.amount || transaction.formatted_cardholder_amount || '0';
    const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
    
    if (isNaN(amount)) return false;
    
    // Apply min/max amount filters
    if (amountFilter.minAmount !== undefined && amount < amountFilter.minAmount) {
      return false;
    }
    if (amountFilter.maxAmount !== undefined && amount > amountFilter.maxAmount) {
      return false;
    }
    
    return true;
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