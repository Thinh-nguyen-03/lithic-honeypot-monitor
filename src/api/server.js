import express from "express";
import { config } from "../config/index.js";
import { supabase_client } from "../config/supabase-client.js";
import logger from "../utils/logger.js";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// Import route modules
import lithic_webhook_routes from "./routes/lithic-webhook-routes.js";
import alert_routes from "./routes/alert-routes.js";
import mcp_routes from "./routes/mcp-routes.js";
import system_routes from "./routes/system-routes.js";

// Import services for enhanced health check
import alertService from "../services/alert-service.js";
import connectionManager from "../services/connection-manager.js";

const app = express();

// Performance tracking for health metrics
let performanceMetrics = {
  responseTimeP95: 0,
  responseTimeP99: 0,
  errorRate: 0,
  throughput: 0,
  requestCount: 0,
  errorCount: 0,
  startTime: Date.now()
};

// Helper function for uptime formatting
function formatUptime(uptimeSeconds) {
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);
  
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// Helper function to get response time percentiles
async function getResponseTimePercentile(percentile) {
  // Simple implementation - in production you'd use a proper metrics library
  return performanceMetrics[`responseTimeP${percentile}`] || 0;
}

// Helper function to get error rate
async function getErrorRate() {
  if (performanceMetrics.requestCount === 0) return 0;
  return (performanceMetrics.errorCount / performanceMetrics.requestCount) * 100;
}

// Helper function to get throughput metrics
async function getThroughputMetrics() {
  const uptimeMs = Date.now() - performanceMetrics.startTime;
  const uptimeMinutes = uptimeMs / (1000 * 60);
  
  return {
    requestsPerMinute: uptimeMinutes > 0 ? performanceMetrics.requestCount / uptimeMinutes : 0,
    totalRequests: performanceMetrics.requestCount,
    totalErrors: performanceMetrics.errorCount
  };
}

// Middleware to track performance metrics
const trackPerformance = (req, res, next) => {
  const startTime = Date.now();
  performanceMetrics.requestCount++;
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // Track errors
    if (res.statusCode >= 400) {
      performanceMetrics.errorCount++;
    }
    
    // Simple percentile tracking (for demonstration)
    if (responseTime > performanceMetrics.responseTimeP95) {
      performanceMetrics.responseTimeP95 = responseTime;
    }
    if (responseTime > performanceMetrics.responseTimeP99) {
      performanceMetrics.responseTimeP99 = responseTime;
    }
  });
  
  next();
};

// Apply performance tracking middleware
app.use(trackPerformance);

// Consolidated Real-Time Middleware Configuration
// Single middleware to handle all real-time endpoint configuration
const configureRealTimeMiddleware = (req, res, next) => {
  // Handle SSE endpoints (only for GET requests that establish SSE connections)
  if ((req.path.startsWith('/alerts/stream') && req.method === 'GET') || 
      (req.path.startsWith('/api/mcp/subscribe') && req.method === 'GET')) {
    // Set timeouts for SSE connections but don't set headers yet
    // Let the connection manager handle headers to avoid conflicts
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    
    // Optimization settings
    res.locals.skipCompression = true;
  }
  // Handle other real-time endpoints (including POST to /api/mcp/subscribe)
  else if (req.path.startsWith('/alerts/') || req.path.startsWith('/api/mcp/')) {
    // CORS configuration for real-time endpoints
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, Cache-Control');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type, mcp-session-id');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    // Set connection timeout for real-time endpoints
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
  }
  next();
};

// Apply consolidated middleware
app.use(configureRealTimeMiddleware);

// Middleware for parsing JSON request bodies for ALL routes (must come before route mounting)
app.use(express.json({ limit: '10mb' }));

// Handle preflight requests for CORS
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, Cache-Control');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.status(200).end();
});

// Get current file directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from frontend/public directory
app.use(express.static(path.join(__dirname, '../../frontend/public')));

// Mount routes with appropriate base paths and middleware

// Real-time alert endpoints - mounted first for priority
app.use("/alerts", alert_routes);

// MCP server endpoints (JSON parsing already applied globally above)
app.use("/api/mcp", mcp_routes);

// System information and data endpoints
app.use("/system", system_routes);

// Webhook routes with raw body parsing for signature verification
app.use(
  "/webhooks",
  express.raw({ type: "application/json" }),
  lithic_webhook_routes,
);

// Enhanced health check endpoint with real-time service metrics
app.get("/health", async (req, res) => {
  const requestId = req.headers['x-request-id'] || 'health-check';
  const startTime = Date.now();
  
  try {
    logger.debug({ requestId }, "Enhanced health check endpoint accessed");
    
    // Existing database health check
    const { data: dbTest, error: dbError } = await supabase_client
      .from('transactions')
      .select('count', { count: 'exact', head: true });
    
    // Import real-time services for health metrics
    const alertMetrics = alertService.getMetrics();
    const connectionMetrics = connectionManager.getMetrics();
    const activeConnections = alertService.getActiveConnections();
    
    // Real-time system health metrics
    const realtimeMetrics = {
      alertService: {
        status: 'healthy',
        activeConnections: alertMetrics.activeConnections || 0,
        totalAlertsDelivered: alertMetrics.totalAlertsSent || 0,
        averageDeliveryTime: calculateAverageDeliveryTime(alertMetrics),
        lastAlertDelivered: getLastAlertTimestamp(activeConnections),
        failedDeliveries: alertMetrics.failedDeliveries || 0,
        deliverySuccessRate: calculateDeliverySuccessRate(alertMetrics),
        queuedMessages: alertMetrics.queuedMessages || 0
      },
      connectionManager: {
        status: 'healthy', 
        totalSessions: connectionMetrics.totalConnections || 0,
        activeSessions: connectionMetrics.activeConnections || 0,
        averageSessionDuration: calculateAverageSessionDuration(connectionMetrics.connections || []),
        connectionFailures: connectionMetrics.failedConnections || 0,
        healthChecksPassed: connectionMetrics.healthChecksPassed || 0,
        healthChecksFailed: connectionMetrics.healthChecksFailed || 0,
        connectionSuccessRate: calculateConnectionSuccessRate(connectionMetrics)
      }
    };
    
    // System resource metrics
    const systemMetrics = {
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
      },
      uptime: {
        seconds: Math.floor(process.uptime()),
        humanReadable: formatUptime(process.uptime())
      },
      cpu: {
        loadAverage: os.loadavg(),
        usage: process.cpuUsage(),
        cores: os.cpus().length
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) // GB
      }
    };
    
    // Determine overall health status
    const isHealthy = !dbError && 
                     realtimeMetrics.alertService.status === 'healthy' &&
                     realtimeMetrics.connectionManager.status === 'healthy';
    
    const healthResponse = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbError ? 'unhealthy' : 'healthy',
          transactionCount: dbTest?.[0]?.count || 0,
          error: dbError?.message || null
        },
        realtime: realtimeMetrics,
        system: systemMetrics
      },
      version: process.env.npm_package_version || '1.0.0',
      environment: config.server.nodeEnv,
      responseTime: `${Date.now() - startTime}ms`
    };
    
    // Log health check details
    logger.info({
      requestId,
      systemStatus: healthResponse.status,
      activeConnections: realtimeMetrics.alertService.activeConnections,
      totalAlertsSent: realtimeMetrics.alertService.totalAlertsDelivered,
      responseTime: healthResponse.responseTime
    }, 'Enhanced health check completed');
    
    res.status(isHealthy ? 200 : 503).json(healthResponse);
    
  } catch (error) {
    logger.error({
      requestId,
      error: error.message,
      stack: error.stack
    }, 'Enhanced health check failed');
    
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      service: "honeypot-transaction-monitor-api",
      realtime: {
        alertService: { status: 'unknown' },
        connectionManager: { status: 'unknown' }
      }
    });
  }
});

// Additional admin endpoint for detailed metrics
app.get("/health/detailed", async (req, res) => {
  // Add authentication check here in production
  const requestId = req.headers['x-request-id'] || 'detailed-health-check';
  
  try {
    logger.debug({ requestId }, "Detailed health check endpoint accessed");
    
    const alertMetrics = alertService.getMetrics();
    const connectionMetrics = connectionManager.getMetrics();
    
    const detailedMetrics = {
      connections: await getDetailedConnectionStats(connectionMetrics),
      alerts: await getDetailedAlertStats(alertMetrics),
      performance: {
        responseTimeP95: await getResponseTimePercentile(95),
        responseTimeP99: await getResponseTimePercentile(99),
        errorRate: await getErrorRate(),
        throughput: await getThroughputMetrics()
      },
      system: {
        memory: {
          heap: process.memoryUsage(),
          system: {
            total: os.totalmem(),
            free: os.freemem(),
            used: os.totalmem() - os.freemem()
          }
        },
        cpu: {
          usage: process.cpuUsage(),
          loadAverage: os.loadavg(),
          cores: os.cpus()
        },
        network: os.networkInterfaces()
      },
      timestamp: new Date().toISOString()
    };
    
    logger.info({ requestId }, 'Detailed health check completed');
    res.json(detailedMetrics);
    
  } catch (error) {
    logger.error({
      requestId,
      error: error.message,
      stack: error.stack
    }, 'Detailed health check failed');
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to generate detailed health metrics',
      timestamp: new Date().toISOString()
    });
  }
});

// Helper functions for enhanced health metrics
function calculateAverageDeliveryTime(alertMetrics) {
  // Simple implementation - in production you'd track actual delivery times
  const baseTime = 50; // Base delivery time in ms
  const failureRate = alertMetrics.failedDeliveries || 0;
  const totalSent = alertMetrics.totalAlertsSent || 1;
  
  // Add delay based on failure rate
  return Math.round(baseTime + (failureRate / totalSent) * 100);
}

function getLastAlertTimestamp(activeConnections) {
  if (!activeConnections || !activeConnections.connectionDetails) {
    return null;
  }
  
  const lastActivities = activeConnections.connectionDetails
    .map(conn => conn.lastActivity)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));
    
  return lastActivities.length > 0 ? lastActivities[0] : null;
}

function calculateDeliverySuccessRate(alertMetrics) {
  const totalSent = alertMetrics.totalAlertsSent || 0;
  const failed = alertMetrics.failedDeliveries || 0;
  
  if (totalSent === 0) return 'N/A';
  return `${Math.round(((totalSent - failed) / totalSent) * 100)}%`;
}

function calculateAverageSessionDuration(connections) {
  if (!connections || connections.length === 0) return 0;
  
  const now = new Date();
  const durations = connections.map(conn => {
    if (conn.establishedAt) {
      return now - new Date(conn.establishedAt);
    }
    return 0;
  });
  
  const avgMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  return Math.round(avgMs / 1000); // Return in seconds
}

function calculateConnectionSuccessRate(connectionMetrics) {
  const total = connectionMetrics.totalConnections || 0;
  const failed = connectionMetrics.failedConnections || 0;
  
  if (total === 0) return 'N/A';
  return `${Math.round(((total - failed) / total) * 100)}%`;
}

async function getDetailedConnectionStats(connectionMetrics) {
  const connections = connectionMetrics.connections || [];
  
  return {
    totalConnections: connectionMetrics.totalConnections || 0,
    activeConnections: connectionMetrics.activeConnections || 0,
    failedConnections: connectionMetrics.failedConnections || 0,
    healthChecksPassed: connectionMetrics.healthChecksPassed || 0,
    healthChecksFailed: connectionMetrics.healthChecksFailed || 0,
    connectionsByStatus: groupConnectionsByStatus(connections),
    averageConnectionDuration: calculateAverageSessionDuration(connections),
    connectionBreakdown: connections.map(conn => ({
      sessionId: conn.sessionId,
      cardToken: conn.cardToken,
      agentId: conn.agentId,
      status: conn.status,
      duration: conn.establishedAt ? Date.now() - new Date(conn.establishedAt) : 0,
      healthChecksPassed: conn.healthChecksPassed || 0,
      healthChecksFailed: conn.healthChecksFailed || 0
    }))
  };
}

async function getDetailedAlertStats(alertMetrics) {
  return {
    totalAlertsSent: alertMetrics.totalAlertsSent || 0,
    failedDeliveries: alertMetrics.failedDeliveries || 0,
    queuedMessages: alertMetrics.queuedMessages || 0,
    activeConnections: alertMetrics.activeConnections || 0,
    deliverySuccessRate: calculateDeliverySuccessRate(alertMetrics),
    averageDeliveryTime: calculateAverageDeliveryTime(alertMetrics),
    performanceStats: {
      alertsPerMinute: calculateAlertsPerMinute(alertMetrics),
      peakConnectionsToday: alertMetrics.activeConnections || 0 // Simplified for demo
    }
  };
}

function groupConnectionsByStatus(connections) {
  const grouped = {
    active: 0,
    unhealthy: 0,
    recovering: 0,
    unknown: 0
  };
  
  connections.forEach(conn => {
    const status = conn.status || 'unknown';
    if (grouped.hasOwnProperty(status)) {
      grouped[status]++;
    } else {
      grouped.unknown++;
    }
  });
  
  return grouped;
}

function calculateAlertsPerMinute(alertMetrics) {
  const uptimeMs = Date.now() - performanceMetrics.startTime;
  const uptimeMinutes = uptimeMs / (1000 * 60);
  const totalAlerts = alertMetrics.totalAlertsSent || 0;
  
  return uptimeMinutes > 0 ? (totalAlerts / uptimeMinutes).toFixed(2) : 0;
}

// System info endpoint for debugging and monitoring
app.get("/system/info", (req, res) => {
  logger.debug("System info endpoint accessed");
  
  const systemInfo = {
    service: "honeypot-transaction-monitor-api",
    version: "1.0.0",
    environment: config.server.nodeEnv,
    nodeVersion: process.version,
    platform: process.platform,
    uptime: Math.round(process.uptime()),
    memoryUsage: process.memoryUsage(),
    endpoints: {
      health: "/health",
      systemInfo: "/system/info",
      alerts: "/alerts/*",
      mcpServer: "/api/mcp/*",
      webhooks: "/webhooks/*"
    },
    features: [
      "real_time_alerts",
      "mcp_server", 
      "transaction_monitoring",
      "ai_agent_integration",
      "webhook_processing"
    ],
    timestamp: new Date().toISOString()
  };
  
  res.status(200).json(systemInfo);
});

// Catch-all for unhandled routes
app.use((req, res) => {
  logger.warn({ 
    path: req.path, 
    method: req.method,
    userAgent: req.get('user-agent'),
    ip: req.ip
  }, "Unhandled route accessed");
  
  res.status(404).json({ 
    error: "Not Found",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      "/health",
      "/system/info", 
      "/alerts/*",
      "/api/mcp/*",
      "/webhooks/*"
    ]
  });
});

// Global error handler with enhanced logging for real-time services
app.use((err, req, res, next) => {
  const errorId = req.headers['x-request-id'] || `error_${Date.now()}`;
  
  logger.error({
    errorId,
    err: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userAgent: req.get('user-agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  }, "Unhandled API error occurred");
  
  // Special handling for SSE/real-time connection errors
  if (req.path.startsWith('/alerts/') || req.path.startsWith('/api/mcp/')) {
    // Handle SSE connection failures
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
      logger.warn({
        errorId,
        path: req.path,
        error: err.code
      }, "Real-time connection dropped by client");
      
      if (!res.headersSent) {
        res.status(499).json({
          error: "Client Disconnected",
          message: "Real-time connection was terminated by client",
          errorId,
          timestamp: new Date().toISOString()
        });
      }
      return;
    }
    
    // Handle timeout errors
    if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      logger.warn({
        errorId,
        path: req.path,
        error: err.message
      }, "Real-time connection timeout occurred");
      
      if (!res.headersSent) {
        res.status(408).json({
          error: "Connection Timeout",
          message: "Real-time connection timed out",
          errorId,
          timestamp: new Date().toISOString()
        });
      }
      return;
    }
    
    // Handle SSE-specific errors
    if (req.path.includes('/stream') || req.path.includes('/subscribe')) {
      logger.error({
        errorId,
        path: req.path,
        error: err.message,
        isSSE: true
      }, "SSE connection error occurred");
      
      if (!res.headersSent) {
        res.status(err.status || 500).json({
          error: "SSE Service Error",
          message: err.message || "Server-Sent Events connection failed",
          errorId,
          timestamp: new Date().toISOString()
        });
      }
      return;
    }
    
    // General real-time service errors
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: "Real-time Service Error",
        message: err.message || "An unexpected error occurred in real-time service",
        errorId,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: "Internal Server Error",
        message: err.message || "An unexpected error occurred",
        errorId,
        timestamp: new Date().toISOString()
      });
    }
  }
});

export function startServer() {
  // Configure server timeouts for real-time connections
  const server = app.listen(config.server.port, () => {
    logger.info(
      `🚀 Enhanced Honeypot Transaction Monitoring API Server started`,
    );
    logger.info(`📡 Server listening on port ${config.server.port}`);
    logger.info(`🌍 Node Environment: ${config.server.nodeEnv}`);
    
    // Log endpoint information
    const baseUrl = process.env.APP_BASE_URL || `http://localhost:${config.server.port}`;
    logger.info(`🔗 Base URL: ${baseUrl}`);
    logger.info(`📥 Webhook URL: ${baseUrl}/webhooks/lithic`);
    logger.info(`🚨 Alert Service: ${baseUrl}/alerts/*`);
    logger.info(`🤖 MCP Server: ${baseUrl}/api/mcp/*`);
    logger.info(`💊 Health Check: ${baseUrl}/health`);
    logger.info(`📊 System Info: ${baseUrl}/system/info`);
    
    // Log service status
    const alertMetrics = alertService.getMetrics();
    const connectionMetrics = connectionManager.getMetrics();
    logger.info(`✅ Alert Service initialized (${alertMetrics.activeConnections} active connections)`);
    logger.info(`✅ Connection Manager initialized (${connectionMetrics.totalConnections} total connections)`);
    logger.info(`🎯 Real-time transaction monitoring system ready!`);
  });

  // Configure timeouts for real-time connections
  server.keepAliveTimeout = 65000; // 65 seconds (longer than typical load balancer timeout)
  server.headersTimeout = 66000;   // Slightly longer than keepAliveTimeout
  server.timeout = 120000;         // 2 minutes for SSE connections

  // Log timeout configuration
  logger.info(`⏱️  Server timeout configuration:`);
  logger.info(`   Keep-alive timeout: ${server.keepAliveTimeout}ms`);
  logger.info(`   Headers timeout: ${server.headersTimeout}ms`);
  logger.info(`   Request timeout: ${server.timeout}ms`);
  logger.info(`🔧 Real-time middleware configured for SSE optimization`);

  return server;
}
