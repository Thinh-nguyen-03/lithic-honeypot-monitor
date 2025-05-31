/**
 * Connection Manager - Manages AI agent connection lifecycle and health monitoring
 * 
 * This service handles:
 * - Connection establishment and authentication
 * - Session management with UUID identification
 * - Health monitoring with automatic recovery
 * - Graceful disconnection and cleanup
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import alertService from './alert-service.js';

class ConnectionManager {
  constructor() {
    // Connection registry: Map<sessionId, connectionInfo>
    this.connections = new Map();
    
    // Health check intervals: Map<sessionId, intervalId>
    this.healthCheckers = new Map();
    
    // Connection configuration
    this.config = {
      heartbeatInterval: 30000,      // 30 seconds
      heartbeatTimeout: 60000,       // 60 seconds
      connectionTimeout: 300000,     // 5 minutes idle timeout
      maxReconnectAttempts: 3,       // Max reconnection attempts
      sseKeepAliveInterval: 15000    // SSE keep-alive ping every 15 seconds
    };
    
    // Performance metrics
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      reconnectionAttempts: 0,
      healthChecksPassed: 0,
      healthChecksFailed: 0
    };
  }
  
  /**
   * Create and establish a new SSE connection
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {string} cardToken - Card token to monitor
   * @param {Object} metadata - Additional connection metadata
   * @returns {Object} Connection info with sessionId
   */
  async createConnection(req, res, cardToken, metadata = {}) {
    try {
      // Generate unique session ID
      const sessionId = uuidv4();
      
      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable Nginx buffering
      });
      
      // Create connection info
      const connectionInfo = {
        sessionId,
        cardToken,
        req,
        res,
        establishedAt: new Date(),
        lastActivity: new Date(),
        lastHeartbeat: new Date(),
        status: 'active',
        metadata: {
          ...metadata,
          userAgent: req.get('user-agent'),
          ip: req.ip,
          agentId: metadata.agentId || `agent_${sessionId.substr(0, 8)}`
        },
        reconnectAttempts: 0,
        healthChecksPassed: 0,
        healthChecksFailed: 0
      };
      
      // Store connection
      this.connections.set(sessionId, connectionInfo);
      
      // Register with alert service
      const registered = alertService.registerConnection(sessionId, cardToken, res);
      if (!registered) {
        throw new Error('Failed to register connection with alert service');
      }
      
      // Send initial connection success event
      this.sendEvent(res, {
        type: 'connection',
        data: {
          sessionId,
          status: 'connected',
          timestamp: new Date().toISOString()
        }
      });
      
      // Start health monitoring
      this.monitorConnection(sessionId);
      
      // Set up connection handlers
      this.setupConnectionHandlers(sessionId, req, res);
      
      // Update metrics
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
      
      logger.info({
        sessionId,
        cardToken,
        agentId: connectionInfo.metadata.agentId,
        activeConnections: this.metrics.activeConnections
      }, 'SSE connection established');
      
      return {
        sessionId,
        cardToken,
        status: 'connected',
        establishedAt: connectionInfo.establishedAt
      };
      
    } catch (error) {
      logger.error({
        error: error.message,
        cardToken,
        metadata
      }, 'Failed to create connection');
      
      // Clean up on failure
      if (res && !res.headersSent) {
        res.status(500).json({
          error: 'Connection Error',
          message: 'Failed to establish SSE connection',
          timestamp: new Date().toISOString()
        });
      }
      
      this.metrics.failedConnections++;
      throw error;
    }
  }
  
  /**
   * Authenticate connection with provided credentials
   * @param {string} token - Authentication token
   * @param {Object} context - Additional authentication context
   * @returns {boolean} Authentication result
   */
  async authenticateConnection(token, context = {}) {
    try {
      // TODO: Implement actual authentication logic
      // For now, basic token validation
      if (!token || typeof token !== 'string') {
        return false;
      }
      
      // Validate token format (example: Bearer token)
      if (token.startsWith('Bearer ')) {
        const authToken = token.substring(7);
        // Add your token validation logic here
        return authToken.length > 0;
      }
      
      return false;
    } catch (error) {
      logger.error({
        error: error.message,
        context
      }, 'Authentication error');
      return false;
    }
  }
  
  /**
   * Start health monitoring for a connection
   * @param {string} sessionId - Session ID to monitor
   */
  monitorConnection(sessionId) {
    try {
      const connectionInfo = this.connections.get(sessionId);
      if (!connectionInfo) {
        logger.warn({ sessionId }, 'Cannot monitor non-existent connection');
        return;
      }
      
      // Clear any existing health checker
      if (this.healthCheckers.has(sessionId)) {
        clearInterval(this.healthCheckers.get(sessionId));
      }
      
      // Set up keep-alive ping
      const keepAliveInterval = setInterval(() => {
        this.sendKeepAlive(sessionId);
      }, this.config.sseKeepAliveInterval);
      
      // Set up health check interval
      const healthCheckInterval = setInterval(() => {
        this.performHealthCheck(sessionId);
      }, this.config.heartbeatInterval);
      
      // Store both intervals
      this.healthCheckers.set(sessionId, {
        keepAlive: keepAliveInterval,
        healthCheck: healthCheckInterval
      });
      
      logger.debug({ sessionId }, 'Connection monitoring started');
      
    } catch (error) {
      logger.error({
        error: error.message,
        sessionId
      }, 'Failed to start connection monitoring');
    }
  }
  
  /**
   * Perform health check on a connection
   * @private
   * @param {string} sessionId - Session ID to check
   */
  performHealthCheck(sessionId) {
    const connectionInfo = this.connections.get(sessionId);
    if (!connectionInfo) {
      this.cleanupConnection(sessionId);
      return;
    }
    
    const now = new Date();
    const timeSinceLastActivity = now - connectionInfo.lastActivity;
    const timeSinceLastHeartbeat = now - connectionInfo.lastHeartbeat;
    
    // Check for timeout conditions
    if (timeSinceLastActivity > this.config.connectionTimeout) {
      logger.warn({
        sessionId,
        lastActivity: connectionInfo.lastActivity,
        minutesInactive: Math.floor(timeSinceLastActivity / 60000)
      }, 'Connection timed out due to inactivity');
      
      this.handleDisconnection(sessionId, 'timeout');
      return;
    }
    
    if (timeSinceLastHeartbeat > this.config.heartbeatTimeout) {
      connectionInfo.healthChecksFailed++;
      this.metrics.healthChecksFailed++;
      
      logger.warn({
        sessionId,
        lastHeartbeat: connectionInfo.lastHeartbeat,
        failedChecks: connectionInfo.healthChecksFailed
      }, 'Connection failed heartbeat check');
      
      // Mark as unhealthy
      connectionInfo.status = 'unhealthy';
      
      // Attempt recovery
      if (connectionInfo.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.attemptRecovery(sessionId);
      } else {
        this.handleDisconnection(sessionId, 'health_check_failed');
      }
    } else {
      connectionInfo.healthChecksPassed++;
      this.metrics.healthChecksPassed++;
      connectionInfo.status = 'active';
    }
  }
  
  /**
   * Send keep-alive ping to maintain SSE connection
   * @private
   * @param {string} sessionId - Session ID
   */
  sendKeepAlive(sessionId) {
    const connectionInfo = this.connections.get(sessionId);
    if (!connectionInfo || !connectionInfo.res) {
      return;
    }
    
    try {
      // Send SSE comment to keep connection alive
      connectionInfo.res.write(':ping\n\n');
      connectionInfo.lastActivity = new Date();
    } catch (error) {
      logger.debug({
        sessionId,
        error: error.message
      }, 'Failed to send keep-alive ping');
      
      // Connection might be broken
      this.handleDisconnection(sessionId, 'write_error');
    }
  }
  
  /**
   * Attempt to recover an unhealthy connection
   * @private
   * @param {string} sessionId - Session ID
   */
  attemptRecovery(sessionId) {
    const connectionInfo = this.connections.get(sessionId);
    if (!connectionInfo) return;
    
    connectionInfo.reconnectAttempts++;
    this.metrics.reconnectionAttempts++;
    
    logger.info({
      sessionId,
      attempt: connectionInfo.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts
    }, 'Attempting connection recovery');
    
    try {
      // Send recovery event
      this.sendEvent(connectionInfo.res, {
        type: 'recovery',
        data: {
          sessionId,
          attempt: connectionInfo.reconnectAttempts,
          timestamp: new Date().toISOString()
        }
      });
      
      // Update timestamps
      connectionInfo.lastActivity = new Date();
      connectionInfo.lastHeartbeat = new Date();
      connectionInfo.status = 'recovering';
      
    } catch (error) {
      logger.error({
        error: error.message,
        sessionId
      }, 'Recovery attempt failed');
      
      this.handleDisconnection(sessionId, 'recovery_failed');
    }
  }
  
  /**
   * Handle connection disconnection and cleanup
   * @param {string} sessionId - Session ID to disconnect
   * @param {string} reason - Disconnection reason
   */
  handleDisconnection(sessionId, reason = 'unknown') {
    try {
      const connectionInfo = this.connections.get(sessionId);
      
      if (connectionInfo) {
        // Send disconnect event if possible
        try {
          this.sendEvent(connectionInfo.res, {
            type: 'disconnect',
            data: {
              sessionId,
              reason,
              timestamp: new Date().toISOString()
            }
          });
        } catch (error) {
          // Connection already broken, ignore
        }
        
        // End the response
        if (connectionInfo.res && !connectionInfo.res.writableEnded) {
          connectionInfo.res.end();
        }
        
        logger.info({
          sessionId,
          reason,
          cardToken: connectionInfo.cardToken,
          duration: new Date() - connectionInfo.establishedAt,
          healthChecksPassed: connectionInfo.healthChecksPassed,
          healthChecksFailed: connectionInfo.healthChecksFailed
        }, 'Connection disconnected');
      }
      
      // Clean up
      this.cleanupConnection(sessionId);
      
      // Update metrics
      this.metrics.activeConnections = this.connections.size;
      
    } catch (error) {
      logger.error({
        error: error.message,
        sessionId,
        reason
      }, 'Error during disconnection handling');
    }
  }
  
  /**
   * Clean up connection resources
   * @private
   * @param {string} sessionId - Session ID to clean up
   */
  cleanupConnection(sessionId) {
    // Clear health check intervals
    const intervals = this.healthCheckers.get(sessionId);
    if (intervals) {
      if (intervals.keepAlive) clearInterval(intervals.keepAlive);
      if (intervals.healthCheck) clearInterval(intervals.healthCheck);
      this.healthCheckers.delete(sessionId);
    }
    
    // Remove from alert service
    alertService.removeConnection(sessionId);
    
    // Remove from connections map
    this.connections.delete(sessionId);
  }
  
  /**
   * Set up connection event handlers
   * @private
   * @param {string} sessionId - Session ID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  setupConnectionHandlers(sessionId, req, res) {
    // Handle client disconnect
    req.on('close', () => {
      logger.debug({ sessionId }, 'Client closed connection');
      this.handleDisconnection(sessionId, 'client_disconnect');
    });
    
    req.on('error', (error) => {
      logger.error({
        error: error.message,
        sessionId
      }, 'Request error');
      this.handleDisconnection(sessionId, 'request_error');
    });
    
    res.on('error', (error) => {
      logger.error({
        error: error.message,
        sessionId
      }, 'Response error');
      this.handleDisconnection(sessionId, 'response_error');
    });
  }
  
  /**
   * Send SSE event to client
   * @private
   * @param {Object} res - Express response object
   * @param {Object} event - Event data
   */
  sendEvent(res, event) {
    const eventString = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    res.write(eventString);
  }
  
  /**
   * Get connection health status
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Connection health info
   */
  getConnectionHealth(sessionId) {
    const connectionInfo = this.connections.get(sessionId);
    if (!connectionInfo) {
      return null;
    }
    
    const now = new Date();
    return {
      sessionId,
      status: connectionInfo.status,
      establishedAt: connectionInfo.establishedAt,
      lastActivity: connectionInfo.lastActivity,
      lastHeartbeat: connectionInfo.lastHeartbeat,
      timeSinceActivity: now - connectionInfo.lastActivity,
      timeSinceHeartbeat: now - connectionInfo.lastHeartbeat,
      healthChecksPassed: connectionInfo.healthChecksPassed,
      healthChecksFailed: connectionInfo.healthChecksFailed,
      reconnectAttempts: connectionInfo.reconnectAttempts
    };
  }
  
  /**
   * Get all active connections with their status
   * @returns {Array} Array of connection summaries
   */
  getAllConnections() {
    const connections = [];
    
    for (const [sessionId, info] of this.connections) {
      connections.push({
        sessionId,
        cardToken: info.cardToken,
        agentId: info.metadata.agentId,
        status: info.status,
        establishedAt: info.establishedAt,
        lastActivity: info.lastActivity,
        healthChecksPassed: info.healthChecksPassed,
        healthChecksFailed: info.healthChecksFailed
      });
    }
    
    return connections;
  }
  
  /**
   * Update connection activity timestamp
   * @param {string} sessionId - Session ID
   */
  updateActivity(sessionId) {
    const connectionInfo = this.connections.get(sessionId);
    if (connectionInfo) {
      connectionInfo.lastActivity = new Date();
    }
  }
  
  /**
   * Update connection heartbeat timestamp
   * @param {string} sessionId - Session ID
   */
  updateHeartbeat(sessionId) {
    const connectionInfo = this.connections.get(sessionId);
    if (connectionInfo) {
      connectionInfo.lastHeartbeat = new Date();
      connectionInfo.lastActivity = new Date();
    }
  }
  
  /**
   * Get service metrics
   * @returns {Object} Current service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeConnections: this.connections.size,
      connections: this.getAllConnections()
    };
  }
  
  /**
   * Shutdown service gracefully
   */
  shutdown() {
    logger.info('Shutting down connection manager');
    
    // Disconnect all active connections
    for (const sessionId of this.connections.keys()) {
      this.handleDisconnection(sessionId, 'shutdown');
    }
    
    // Clear all intervals
    for (const intervals of this.healthCheckers.values()) {
      if (intervals.keepAlive) clearInterval(intervals.keepAlive);
      if (intervals.healthCheck) clearInterval(intervals.healthCheck);
    }
    
    this.healthCheckers.clear();
    this.connections.clear();
    
    logger.info('Connection manager shutdown complete');
  }
}

// Export singleton instance
const connectionManager = new ConnectionManager();
export default connectionManager; 