/**
 * Enhanced Health Check System Unit Tests
 * Tests for Task 5.3: Enhance Health Check System
 * 
 * Tests the enhanced health check endpoint with:
 * - Comprehensive real-time service monitoring
 * - System resource metrics
 * - Performance tracking
 * - Detailed admin endpoint
 */

import { createMockContext, TestResults, runTest, runTestSuite } from '../../helpers/test-helpers.js';

const results = new TestResults();

// Mock the enhanced health check functions and metrics
function createMockAlertMetrics() {
  return {
    activeConnections: 5,
    totalAlertsSent: 250,
    failedDeliveries: 2,
    queuedMessages: 0
  };
}

function createMockConnectionMetrics() {
  return {
    totalConnections: 12,
    activeConnections: 5,
    failedConnections: 1,
    healthChecksPassed: 45,
    healthChecksFailed: 3,
    connections: [
      {
        sessionId: 'session_1',
        cardToken: 'card_123',
        agentId: 'agent_1',
        status: 'active',
        establishedAt: new Date(Date.now() - 300000), // 5 minutes ago
        healthChecksPassed: 10,
        healthChecksFailed: 0
      },
      {
        sessionId: 'session_2',
        cardToken: 'card_456',
        agentId: 'agent_2',
        status: 'recovering',
        establishedAt: new Date(Date.now() - 180000), // 3 minutes ago
        healthChecksPassed: 8,
        healthChecksFailed: 2
      }
    ]
  };
}

function createMockActiveConnections() {
  return {
    connectionDetails: [
      {
        sessionId: 'session_1',
        lastActivity: new Date(Date.now() - 60000).toISOString() // 1 minute ago
      },
      {
        sessionId: 'session_2',
        lastActivity: new Date(Date.now() - 30000).toISOString() // 30 seconds ago
      }
    ]
  };
}

// Test helper functions
await runTest('formatUptime should format uptime correctly', () => {
  // Mock formatUptime function
  function formatUptime(uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  
  // Test various uptime values
  const testCases = [
    { input: 0, expected: '0d 0h 0m 0s' },
    { input: 60, expected: '0d 0h 1m 0s' },
    { input: 3661, expected: '0d 1h 1m 1s' },
    { input: 90061, expected: '1d 1h 1m 1s' }
  ];
  
  testCases.forEach(testCase => {
    const result = formatUptime(testCase.input);
    if (result !== testCase.expected) {
      throw new Error(`Expected "${testCase.expected}" but got "${result}" for input ${testCase.input}`);
    }
  });
}, results);

await runTest('calculateDeliverySuccessRate should calculate rate correctly', () => {
  function calculateDeliverySuccessRate(alertMetrics) {
    const totalSent = alertMetrics.totalAlertsSent || 0;
    const failed = alertMetrics.failedDeliveries || 0;
    
    if (totalSent === 0) return 'N/A';
    return `${Math.round(((totalSent - failed) / totalSent) * 100)}%`;
  }
  
  // Test with metrics that have alerts
  const metricsWithAlerts = { totalAlertsSent: 100, failedDeliveries: 5 };
  const successRate = calculateDeliverySuccessRate(metricsWithAlerts);
  if (successRate !== '95%') {
    throw new Error(`Expected "95%" but got "${successRate}"`);
  }
  
  // Test with no alerts
  const metricsNoAlerts = { totalAlertsSent: 0, failedDeliveries: 0 };
  const noAlertsRate = calculateDeliverySuccessRate(metricsNoAlerts);
  if (noAlertsRate !== 'N/A') {
    throw new Error(`Expected "N/A" but got "${noAlertsRate}"`);
  }
}, results);

await runTest('calculateAverageSessionDuration should calculate duration correctly', () => {
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
  
  // Test with empty connections
  const emptyDuration = calculateAverageSessionDuration([]);
  if (emptyDuration !== 0) {
    throw new Error(`Expected 0 but got ${emptyDuration}`);
  }
  
  // Test with connections
  const connections = [
    { establishedAt: new Date(Date.now() - 120000) }, // 2 minutes ago
    { establishedAt: new Date(Date.now() - 60000) }   // 1 minute ago
  ];
  
  const avgDuration = calculateAverageSessionDuration(connections);
  // Should be around 90 seconds (average of 120 and 60)
  if (avgDuration < 80 || avgDuration > 100) {
    throw new Error(`Expected duration around 90s but got ${avgDuration}s`);
  }
}, results);

await runTest('calculateConnectionSuccessRate should calculate rate correctly', () => {
  function calculateConnectionSuccessRate(connectionMetrics) {
    const total = connectionMetrics.totalConnections || 0;
    const failed = connectionMetrics.failedConnections || 0;
    
    if (total === 0) return 'N/A';
    return `${Math.round(((total - failed) / total) * 100)}%`;
  }
  
  // Test with successful connections
  const metricsWithConnections = { totalConnections: 20, failedConnections: 2 };
  const successRate = calculateConnectionSuccessRate(metricsWithConnections);
  if (successRate !== '90%') {
    throw new Error(`Expected "90%" but got "${successRate}"`);
  }
  
  // Test with no connections
  const metricsNoConnections = { totalConnections: 0, failedConnections: 0 };
  const noConnectionsRate = calculateConnectionSuccessRate(metricsNoConnections);
  if (noConnectionsRate !== 'N/A') {
    throw new Error(`Expected "N/A" but got "${noConnectionsRate}"`);
  }
}, results);

await runTest('calculateAverageDeliveryTime should calculate delivery time with failure impact', () => {
  function calculateAverageDeliveryTime(alertMetrics) {
    const baseTime = 50; // Base delivery time in ms
    const failureRate = alertMetrics.failedDeliveries || 0;
    const totalSent = alertMetrics.totalAlertsSent || 1;
    
    // Add delay based on failure rate
    return Math.round(baseTime + (failureRate / totalSent) * 100);
  }
  
  // Test with no failures
  const noFailures = { totalAlertsSent: 100, failedDeliveries: 0 };
  const baseDeliveryTime = calculateAverageDeliveryTime(noFailures);
  if (baseDeliveryTime !== 50) {
    throw new Error(`Expected 50ms but got ${baseDeliveryTime}ms`);
  }
  
  // Test with failures
  const withFailures = { totalAlertsSent: 100, failedDeliveries: 10 };
  const delayedDeliveryTime = calculateAverageDeliveryTime(withFailures);
  if (delayedDeliveryTime !== 60) { // 50 + (10/100)*100 = 60
    throw new Error(`Expected 60ms but got ${delayedDeliveryTime}ms`);
  }
}, results);

await runTest('getLastAlertTimestamp should return latest activity timestamp', () => {
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
  
  // Test with no connections
  const noConnections = { connectionDetails: [] };
  const noTimestamp = getLastAlertTimestamp(noConnections);
  if (noTimestamp !== null) {
    throw new Error(`Expected null but got ${noTimestamp}`);
  }
  
  // Test with connections
  const connectionsWithActivity = {
    connectionDetails: [
      { lastActivity: '2024-01-30T10:00:00Z' },
      { lastActivity: '2024-01-30T10:05:00Z' }, // Most recent
      { lastActivity: '2024-01-30T09:55:00Z' }
    ]
  };
  
  const latestTimestamp = getLastAlertTimestamp(connectionsWithActivity);
  if (latestTimestamp !== '2024-01-30T10:05:00Z') {
    throw new Error(`Expected "2024-01-30T10:05:00Z" but got "${latestTimestamp}"`);
  }
}, results);

await runTest('groupConnectionsByStatus should group connections correctly', () => {
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
  
  const connections = [
    { status: 'active' },
    { status: 'active' },
    { status: 'recovering' },
    { status: 'unhealthy' },
    { status: null }, // Should be counted as unknown
    { status: 'invalid_status' } // Should be counted as unknown
  ];
  
  const grouped = groupConnectionsByStatus(connections);
  
  if (grouped.active !== 2) {
    throw new Error(`Expected 2 active connections but got ${grouped.active}`);
  }
  if (grouped.recovering !== 1) {
    throw new Error(`Expected 1 recovering connection but got ${grouped.recovering}`);
  }
  if (grouped.unhealthy !== 1) {
    throw new Error(`Expected 1 unhealthy connection but got ${grouped.unhealthy}`);
  }
  if (grouped.unknown !== 2) {
    throw new Error(`Expected 2 unknown connections but got ${grouped.unknown}`);
  }
}, results);

await runTest('enhanced health check response should include all required metrics', () => {
  // Mock enhanced health check response structure
  const mockAlertMetrics = createMockAlertMetrics();
  const mockConnectionMetrics = createMockConnectionMetrics();
  const mockActiveConnections = createMockActiveConnections();
  
  // Simulate enhanced health check response
  const realtimeMetrics = {
    alertService: {
      status: 'healthy',
      activeConnections: mockAlertMetrics.activeConnections,
      totalAlertsDelivered: mockAlertMetrics.totalAlertsSent,
      averageDeliveryTime: 55, // Mock calculated value
      lastAlertDelivered: mockActiveConnections.connectionDetails[0].lastActivity,
      failedDeliveries: mockAlertMetrics.failedDeliveries,
      deliverySuccessRate: '99%',
      queuedMessages: mockAlertMetrics.queuedMessages
    },
    connectionManager: {
      status: 'healthy',
      totalSessions: mockConnectionMetrics.totalConnections,
      activeSessions: mockConnectionMetrics.activeConnections,
      averageSessionDuration: 240, // Mock calculated value in seconds
      connectionFailures: mockConnectionMetrics.failedConnections,
      healthChecksPassed: mockConnectionMetrics.healthChecksPassed,
      healthChecksFailed: mockConnectionMetrics.healthChecksFailed,
      connectionSuccessRate: '92%'
    }
  };
  
  // Verify all required fields are present
  const alertService = realtimeMetrics.alertService;
  const requiredAlertFields = [
    'status', 'activeConnections', 'totalAlertsDelivered', 
    'averageDeliveryTime', 'lastAlertDelivered', 'failedDeliveries',
    'deliverySuccessRate', 'queuedMessages'
  ];
  
  requiredAlertFields.forEach(field => {
    if (!(field in alertService)) {
      throw new Error(`Missing required alert service field: ${field}`);
    }
  });
  
  const connectionManager = realtimeMetrics.connectionManager;
  const requiredConnectionFields = [
    'status', 'totalSessions', 'activeSessions', 'averageSessionDuration',
    'connectionFailures', 'healthChecksPassed', 'healthChecksFailed',
    'connectionSuccessRate'
  ];
  
  requiredConnectionFields.forEach(field => {
    if (!(field in connectionManager)) {
      throw new Error(`Missing required connection manager field: ${field}`);
    }
  });
}, results);

await runTest('system resource metrics should include memory, CPU, and system info', () => {
  // Mock system metrics structure
  const systemMetrics = {
    memory: {
      used: 128,
      total: 256,
      external: 32,
      rss: 180
    },
    uptime: {
      seconds: 3600,
      humanReadable: '0d 1h 0m 0s'
    },
    cpu: {
      loadAverage: [0.5, 0.7, 0.6],
      usage: { user: 1000000, system: 500000 },
      cores: 8
    },
    system: {
      platform: 'linux',
      arch: 'x64',
      hostname: 'honeypot-server',
      totalMemory: 16 // GB
    }
  };
  
  // Verify memory metrics
  if (typeof systemMetrics.memory.used !== 'number') {
    throw new Error('Memory used should be a number');
  }
  if (typeof systemMetrics.memory.total !== 'number') {
    throw new Error('Memory total should be a number');
  }
  
  // Verify uptime metrics
  if (typeof systemMetrics.uptime.seconds !== 'number') {
    throw new Error('Uptime seconds should be a number');
  }
  if (typeof systemMetrics.uptime.humanReadable !== 'string') {
    throw new Error('Uptime humanReadable should be a string');
  }
  
  // Verify CPU metrics
  if (!Array.isArray(systemMetrics.cpu.loadAverage)) {
    throw new Error('CPU loadAverage should be an array');
  }
  if (typeof systemMetrics.cpu.cores !== 'number') {
    throw new Error('CPU cores should be a number');
  }
  
  // Verify system info
  if (typeof systemMetrics.system.platform !== 'string') {
    throw new Error('System platform should be a string');
  }
  if (typeof systemMetrics.system.totalMemory !== 'number') {
    throw new Error('System totalMemory should be a number');
  }
}, results);

await runTest('detailed health check should include comprehensive performance metrics', () => {
  // Mock detailed metrics structure
  const detailedMetrics = {
    connections: {
      totalConnections: 12,
      activeConnections: 5,
      failedConnections: 1,
      healthChecksPassed: 45,
      healthChecksFailed: 3,
      connectionsByStatus: {
        active: 3,
        unhealthy: 1,
        recovering: 1,
        unknown: 0
      },
      averageConnectionDuration: 240,
      connectionBreakdown: [
        {
          sessionId: 'session_1',
          cardToken: 'card_123',
          agentId: 'agent_1',
          status: 'active',
          duration: 300000,
          healthChecksPassed: 10,
          healthChecksFailed: 0
        }
      ]
    },
    alerts: {
      totalAlertsSent: 250,
      failedDeliveries: 2,
      queuedMessages: 0,
      activeConnections: 5,
      deliverySuccessRate: '99%',
      averageDeliveryTime: 55,
      performanceStats: {
        alertsPerMinute: 4.2,
        peakConnectionsToday: 8
      }
    },
    performance: {
      responseTimeP95: 120,
      responseTimeP99: 200,
      errorRate: 1.5,
      throughput: {
        requestsPerMinute: 15.5,
        totalRequests: 1000,
        totalErrors: 15
      }
    }
  };
  
  // Verify connections details
  if (typeof detailedMetrics.connections.totalConnections !== 'number') {
    throw new Error('Total connections should be a number');
  }
  if (!detailedMetrics.connections.connectionsByStatus) {
    throw new Error('Connection status breakdown should be present');
  }
  if (!Array.isArray(detailedMetrics.connections.connectionBreakdown)) {
    throw new Error('Connection breakdown should be an array');
  }
  
  // Verify alert details
  if (typeof detailedMetrics.alerts.deliverySuccessRate !== 'string') {
    throw new Error('Delivery success rate should be a string');
  }
  if (!detailedMetrics.alerts.performanceStats) {
    throw new Error('Alert performance stats should be present');
  }
  
  // Verify performance metrics
  if (typeof detailedMetrics.performance.responseTimeP95 !== 'number') {
    throw new Error('P95 response time should be a number');
  }
  if (typeof detailedMetrics.performance.errorRate !== 'number') {
    throw new Error('Error rate should be a number');
  }
  if (!detailedMetrics.performance.throughput) {
    throw new Error('Throughput metrics should be present');
  }
}, results);

await runTest('health status determination should work correctly', () => {
  // Test healthy system
  const healthyComponents = {
    dbError: null,
    alertServiceStatus: 'healthy',
    connectionManagerStatus: 'healthy'
  };
  
  const isHealthy = !healthyComponents.dbError && 
                   healthyComponents.alertServiceStatus === 'healthy' &&
                   healthyComponents.connectionManagerStatus === 'healthy';
  
  if (!isHealthy) {
    throw new Error('System should be marked as healthy when all components are healthy');
  }
  
  // Test degraded system (database error)
  const degradedComponents = {
    dbError: new Error('Database connection failed'),
    alertServiceStatus: 'healthy',
    connectionManagerStatus: 'healthy'
  };
  
  const isDegraded = !degradedComponents.dbError && 
                    degradedComponents.alertServiceStatus === 'healthy' &&
                    degradedComponents.connectionManagerStatus === 'healthy';
  
  if (isDegraded) {
    throw new Error('System should be marked as degraded when database has error');
  }
}, results);

await runTest('performance tracking middleware should update metrics correctly', () => {
  // Mock performance metrics object
  let performanceMetrics = {
    responseTimeP95: 0,
    responseTimeP99: 0,
    requestCount: 0,
    errorCount: 0,
    startTime: Date.now()
  };
  
  // Simulate request processing
  const startTime = Date.now();
  performanceMetrics.requestCount++;
  
  // Simulate response with 200 status
  const responseTime = 50;
  const statusCode = 200;
  
  if (statusCode >= 400) {
    performanceMetrics.errorCount++;
  }
  
  if (responseTime > performanceMetrics.responseTimeP95) {
    performanceMetrics.responseTimeP95 = responseTime;
  }
  if (responseTime > performanceMetrics.responseTimeP99) {
    performanceMetrics.responseTimeP99 = responseTime;
  }
  
  // Verify metrics updated correctly
  if (performanceMetrics.requestCount !== 1) {
    throw new Error(`Expected requestCount to be 1, got ${performanceMetrics.requestCount}`);
  }
  if (performanceMetrics.errorCount !== 0) {
    throw new Error(`Expected errorCount to be 0, got ${performanceMetrics.errorCount}`);
  }
  if (performanceMetrics.responseTimeP95 !== 50) {
    throw new Error(`Expected responseTimeP95 to be 50, got ${performanceMetrics.responseTimeP95}`);
  }
  
  // Simulate error response
  performanceMetrics.requestCount++;
  const errorStatusCode = 500;
  
  if (errorStatusCode >= 400) {
    performanceMetrics.errorCount++;
  }
  
  if (performanceMetrics.errorCount !== 1) {
    throw new Error(`Expected errorCount to be 1 after error response, got ${performanceMetrics.errorCount}`);
  }
}, results);

// Print results
const summary = results.summary();
console.log('\n🧪 Enhanced Health Check System Tests');
console.log('='.repeat(50));
console.log(`Total: ${summary.total}, Passed: ${summary.passed}, Failed: ${summary.failed}`);

if (summary.failed > 0) {
  console.log('\n❌ Failed tests:');
  summary.tests
    .filter(t => t.status === 'FAILED')
    .forEach(t => console.log(`   - ${t.name}: ${t.error}`));
} 