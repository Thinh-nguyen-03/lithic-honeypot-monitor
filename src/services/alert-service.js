/**
 * Alert Service - Manages AI agent connections and broadcasts real-time transaction alerts
 * 
 * This service handles:
 * - Connection registry for active AI agents
 * - Message broadcasting to connected agents
 * - Connection health monitoring and cleanup
 * - Alert formatting for AI consumption
 */

import EventEmitter from 'events';
import logger from '../utils/logger.js';

class AlertService extends EventEmitter {
  constructor() {
    super();
    
    // Connection registry: Map<sessionId, connectionInfo>
    this.connections = new Map();
    
    // Card-to-sessions mapping: Map<cardToken, Set<sessionId>>
    this.cardSessions = new Map();
    
    // Message queue for failed deliveries: Map<sessionId, Array<message>>
    this.messageQueue = new Map();
    
    // Connection health tracking
    this.connectionHealth = new Map();
    
    // Performance metrics
    this.metrics = {
      totalConnections: 0,
      totalAlertsSent: 0,
      failedDeliveries: 0,
      activeConnections: 0
    };
    
    // Start health check interval
    this.startHealthCheck();
  }
  
  /**
   * Register a new AI agent connection
   * @param {string} sessionId - Unique session identifier
   * @param {string} cardToken - Honeypot card token to monitor
   * @param {Object} connection - Connection object (SSE response or WebSocket)
   * @returns {boolean} Success status
   */
  registerConnection(sessionId, cardToken, connection) {
    try {
      // Store connection info
      this.connections.set(sessionId, {
        connection,
        cardToken,
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true
      });
      
      // Update card-to-sessions mapping
      if (!this.cardSessions.has(cardToken)) {
        this.cardSessions.set(cardToken, new Set());
      }
      this.cardSessions.get(cardToken).add(sessionId);
      
      // Initialize health tracking
      this.connectionHealth.set(sessionId, {
        lastPing: new Date(),
        failedPings: 0
      });
      
      // Update metrics
      this.metrics.totalConnections++;
      this.metrics.activeConnections = this.connections.size;
      
      logger.info({
        sessionId,
        cardToken,
        activeConnections: this.metrics.activeConnections
      }, 'AI agent connection registered');
      
      // Emit connection event
      this.emit('connection:registered', { sessionId, cardToken });
      
      return true;
    } catch (error) {
      logger.error({
        error: error.message,
        sessionId,
        cardToken
      }, 'Failed to register connection');
      return false;
    }
  }
  
  /**
   * Broadcast alert to all agents monitoring a specific card
   * @param {string} cardToken - Card token that triggered the alert
   * @param {Object} alertData - Transaction alert data
   * @returns {Object} Broadcast result with success/failure counts
   */
  async broadcastAlert(cardToken, alertData) {
    const result = {
      successful: 0,
      failed: 0,
      sessions: []
    };
    
    try {
      // Get all sessions monitoring this card
      const sessions = this.cardSessions.get(cardToken);
      if (!sessions || sessions.size === 0) {
        logger.debug({ cardToken }, 'No active sessions for card');
        return result;
      }
      
      // Format the alert
      const formattedAlert = this.formatTransactionAlert(alertData);
      
      // Broadcast to all connected sessions
      for (const sessionId of sessions) {
        const connectionInfo = this.connections.get(sessionId);
        if (!connectionInfo || !connectionInfo.isActive) {
          continue;
        }
        
        try {
          // Send alert based on connection type (SSE or WebSocket)
          await this.sendAlert(connectionInfo.connection, formattedAlert);
          
          // Update activity timestamp
          connectionInfo.lastActivity = new Date();
          
          // Track successful delivery
          result.successful++;
          result.sessions.push({ sessionId, status: 'delivered' });
          
          // Clear any queued messages for this session
          this.messageQueue.delete(sessionId);
          
        } catch (error) {
          logger.warn({
            error: error.message,
            sessionId,
            cardToken
          }, 'Failed to deliver alert to session');
          
          // Queue message for retry
          this.queueMessage(sessionId, formattedAlert);
          
          result.failed++;
          result.sessions.push({ sessionId, status: 'failed', error: error.message });
          this.metrics.failedDeliveries++;
        }
      }
      
      // Update metrics
      this.metrics.totalAlertsSent += result.successful;
      
      logger.info({
        cardToken,
        successful: result.successful,
        failed: result.failed,
        totalSessions: sessions.size
      }, 'Alert broadcast completed');
      
      return result;
      
    } catch (error) {
      logger.error({
        error: error.message,
        cardToken
      }, 'Alert broadcast failed');
      throw error;
    }
  }
  
  /**
   * Remove a disconnected AI agent connection
   * @param {string} sessionId - Session to remove
   * @returns {boolean} Success status
   */
  removeConnection(sessionId) {
    try {
      const connectionInfo = this.connections.get(sessionId);
      if (!connectionInfo) {
        return false;
      }
      
      // Remove from card sessions
      const cardToken = connectionInfo.cardToken;
      if (this.cardSessions.has(cardToken)) {
        this.cardSessions.get(cardToken).delete(sessionId);
        
        // Clean up empty sets
        if (this.cardSessions.get(cardToken).size === 0) {
          this.cardSessions.delete(cardToken);
        }
      }
      
      // Clean up related data
      this.connections.delete(sessionId);
      this.connectionHealth.delete(sessionId);
      this.messageQueue.delete(sessionId);
      
      // Update metrics
      this.metrics.activeConnections = this.connections.size;
      
      logger.info({
        sessionId,
        cardToken,
        activeConnections: this.metrics.activeConnections
      }, 'AI agent connection removed');
      
      // Emit disconnection event
      this.emit('connection:removed', { sessionId, cardToken });
      
      return true;
    } catch (error) {
      logger.error({
        error: error.message,
        sessionId
      }, 'Failed to remove connection');
      return false;
    }
  }
  
  /**
   * Get count and details of active connections
   * @returns {Object} Active connection statistics
   */
  getActiveConnections() {
    const stats = {
      totalActive: this.connections.size,
      byCard: {},
      connectionDetails: []
    };
    
    // Group by card
    for (const [cardToken, sessions] of this.cardSessions) {
      stats.byCard[cardToken] = sessions.size;
    }
    
    // Get connection details
    for (const [sessionId, info] of this.connections) {
      if (info.isActive) {
        stats.connectionDetails.push({
          sessionId,
          cardToken: info.cardToken,
          connectedAt: info.connectedAt,
          lastActivity: info.lastActivity
        });
      }
    }
    
    return stats;
  }
  
  /**
   * Format transaction data into AI-consumable alert structure
   * @param {Object} transactionData - Raw transaction data
   * @returns {Object} Formatted alert for AI consumption
   */
  formatTransactionAlert(transactionData) {
    try {
      const alert = {
        alertType: 'NEW_TRANSACTION',
        timestamp: new Date().toISOString(),
        transactionId: transactionData.token || transactionData.id,
        cardToken: transactionData.card_token,
        immediate: {
          amount: `$${(transactionData.amount / 100).toFixed(2)}`,
          merchant: transactionData.merchant?.descriptor || 'Unknown Merchant',
          location: this.formatLocation(transactionData.merchant),
          status: transactionData.status || 'PENDING',
          network: transactionData.network || 'UNKNOWN',
          networkTransactionId: transactionData.network_transaction_id || ''
        },
        verification: {
          mccCode: transactionData.merchant?.mcc || '',
          merchantType: transactionData.merchant_info?.mcc_description || 'Unknown',
          merchantCategory: transactionData.merchant_info?.mcc_category || 'Unknown',
          authorizationCode: transactionData.authorization_code || '',
          retrievalReference: transactionData.acquirer_reference_number || ''
        },
        intelligence: {
          isFirstTransaction: transactionData.isFirstTransaction || false,
          merchantHistory: transactionData.merchantHistory || 'New merchant for this card',
          geographicPattern: transactionData.geographicPattern || 'New location for this card'
        }
      };
      
      return alert;
    } catch (error) {
      logger.error({
        error: error.message,
        transactionId: transactionData?.id
      }, 'Failed to format transaction alert');
      throw error;
    }
  }
  
  /**
   * Send alert to a specific connection
   * @private
   * @param {Object} connection - Connection object
   * @param {Object} alert - Formatted alert data
   */
  async sendAlert(connection, alert) {
    // For SSE connections
    if (connection.write) {
      const data = `data: ${JSON.stringify(alert)}\n\n`;
      connection.write(data);
      return;
    }
    
    // For WebSocket connections
    if (connection.send) {
      connection.send(JSON.stringify(alert));
      return;
    }
    
    throw new Error('Unknown connection type');
  }
  
  /**
   * Queue message for failed delivery retry
   * @private
   * @param {string} sessionId - Session ID
   * @param {Object} message - Message to queue
   */
  queueMessage(sessionId, message) {
    if (!this.messageQueue.has(sessionId)) {
      this.messageQueue.set(sessionId, []);
    }
    
    const queue = this.messageQueue.get(sessionId);
    
    // Limit queue size to prevent memory issues
    if (queue.length < 10) {
      queue.push({
        message,
        queuedAt: new Date(),
        attempts: 0
      });
    }
  }
  
  /**
   * Format location string from merchant data
   * @private
   * @param {Object} merchant - Merchant object
   * @returns {string} Formatted location
   */
  formatLocation(merchant) {
    if (!merchant) return 'Unknown Location';
    
    const parts = [];
    if (merchant.city) parts.push(merchant.city);
    if (merchant.state) parts.push(merchant.state);
    if (merchant.country) parts.push(merchant.country);
    
    return parts.join(', ') || 'Unknown Location';
  }
  
  /**
   * Start health check interval
   * @private
   */
  startHealthCheck() {
    // Check connection health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, 30000);
  }
  
  /**
   * Check health of all connections
   * @private
   */
  checkConnectionHealth() {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const [sessionId, info] of this.connections) {
      const timeSinceActivity = now - info.lastActivity;
      
      if (timeSinceActivity > staleThreshold) {
        logger.warn({
          sessionId,
          lastActivity: info.lastActivity,
          minutesInactive: Math.floor(timeSinceActivity / 60000)
        }, 'Removing stale connection');
        
        this.removeConnection(sessionId);
      }
    }
    
    // Retry queued messages
    this.retryQueuedMessages();
  }
  
  /**
   * Retry delivery of queued messages
   * @private
   */
  async retryQueuedMessages() {
    for (const [sessionId, queue] of this.messageQueue) {
      const connectionInfo = this.connections.get(sessionId);
      if (!connectionInfo || !connectionInfo.isActive) {
        continue;
      }
      
      const messagesToRetry = [...queue];
      queue.length = 0; // Clear queue
      
      for (const item of messagesToRetry) {
        try {
          await this.sendAlert(connectionInfo.connection, item.message);
          logger.info({ sessionId }, 'Successfully delivered queued message');
        } catch (error) {
          item.attempts++;
          if (item.attempts < 3) {
            queue.push(item);
          } else {
            logger.error({
              sessionId,
              attempts: item.attempts
            }, 'Failed to deliver queued message after max attempts');
          }
        }
      }
    }
  }
  
  /**
   * Get service metrics
   * @returns {Object} Current service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queuedMessages: Array.from(this.messageQueue.values())
        .reduce((sum, queue) => sum + queue.length, 0)
    };
  }
  
  /**
   * Shutdown service gracefully
   */
  shutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Close all connections
    for (const sessionId of this.connections.keys()) {
      this.removeConnection(sessionId);
    }
    
    logger.info('Alert service shutdown complete');
  }
}

// Export singleton instance
const alertService = new AlertService();
export default alertService; 