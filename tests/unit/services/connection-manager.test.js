/**
 * Unit tests for the Connection Manager
 * Run this file with: node tests/unit/services/connection-manager.test.js
 */

import { 
  runTestSuite, 
  assert, 
  createMockContext,
  sleep,
  generators,
  mockLogger
} from '../../helpers/test-helpers.js';

// Import the ConnectionManager directly for testing
import connectionManager from '../../../src/services/connection-manager.js';

// Mock alert service to avoid dependencies
const mockAlertService = {
  registerConnection: () => true,
  removeConnection: () => true
};

// Helper to create mock SSE response
function createMockSSEResponse() {
  const chunks = [];
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead: (status, headers) => {
      res.statusCode = status;
      res.headers = headers;
    },
    write: (chunk) => {
      chunks.push(chunk);
    },
    end: () => {
      res.writableEnded = true;
    },
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    json: (data) => {
      res.body = data;
      return res;
    },
    on: () => {},
    getChunks: () => chunks,
    clearChunks: () => { chunks.length = 0; }
  };
  return res;
}

// Helper to create mock request
function createMockRequest() {
  const listeners = {};
  return {
    get: (header) => {
      if (header === 'user-agent') return 'Test Agent';
      return null;
    },
    ip: '127.0.0.1',
    on: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    emit: (event, ...args) => {
      if (listeners[event]) {
        listeners[event].forEach(handler => handler(...args));
      }
    }
  };
}

const tests = [
  {
    name: 'should create SSE connection successfully',
    testFn: async () => {
      const req = createMockRequest();
      const res = createMockSSEResponse();
      const cardToken = generators.cardToken();
      
      // Mock alert service registration
      const originalRegister = connectionManager.alertService?.registerConnection;
      if (connectionManager.alertService) {
        connectionManager.alertService.registerConnection = () => true;
      }
      
      const result = await connectionManager.createConnection(req, res, cardToken, {
        agentId: 'test_agent_123'
      });
      
      assert(result.sessionId, 'Should return session ID');
      assert(result.cardToken === cardToken, 'Should return correct card token');
      assert(result.status === 'connected', 'Should have connected status');
      assert(res.statusCode === 200, 'Should set 200 status');
      assert(res.headers['Content-Type'] === 'text/event-stream', 'Should set SSE headers');
      
      // Check initial connection event was sent
      const chunks = res.getChunks();
      assert(chunks.length > 0, 'Should send initial event');
      assert(chunks[0].includes('event: connection'), 'Should send connection event');
      
      // Cleanup
      connectionManager.handleDisconnection(result.sessionId, 'test_cleanup');
      
      // Restore mock
      if (connectionManager.alertService && originalRegister) {
        connectionManager.alertService.registerConnection = originalRegister;
      }
    }
  },
  
  {
    name: 'should authenticate valid Bearer token',
    testFn: async () => {
      const validToken = 'Bearer test_token_123';
      const result = await connectionManager.authenticateConnection(validToken);
      
      assert(result === true, 'Should authenticate valid Bearer token');
    }
  },
  
  {
    name: 'should reject invalid authentication token',
    testFn: async () => {
      const invalidTokens = [
        null,
        '',
        'InvalidFormat',
        'Bearer ',
        123
      ];
      
      for (const token of invalidTokens) {
        const result = await connectionManager.authenticateConnection(token);
        assert(result === false, `Should reject invalid token: ${token}`);
      }
    }
  },
  
  {
    name: 'should get connection health information',
    testFn: async () => {
      const req = createMockRequest();
      const res = createMockSSEResponse();
      const cardToken = generators.cardToken();
      
      // Mock alert service
      const originalRegister = connectionManager.alertService?.registerConnection;
      if (connectionManager.alertService) {
        connectionManager.alertService.registerConnection = () => true;
      }
      
      const connection = await connectionManager.createConnection(req, res, cardToken);
      
      const health = connectionManager.getConnectionHealth(connection.sessionId);
      
      assert(health !== null, 'Should return health info');
      assert(health.sessionId === connection.sessionId, 'Should have correct session ID');
      assert(health.status === 'active', 'Should have active status');
      assert(health.timeSinceActivity >= 0, 'Should have valid time since activity');
      assert(health.healthChecksPassed >= 0, 'Should track health checks passed');
      
      // Cleanup
      connectionManager.handleDisconnection(connection.sessionId, 'test_cleanup');
      
      // Restore
      if (connectionManager.alertService && originalRegister) {
        connectionManager.alertService.registerConnection = originalRegister;
      }
    }
  },
  
  {
    name: 'should return null for non-existent connection health',
    testFn: async () => {
      const fakeSessionId = generators.sessionId();
      const health = connectionManager.getConnectionHealth(fakeSessionId);
      
      assert(health === null, 'Should return null for non-existent connection');
    }
  },
  
  {
    name: 'should update activity timestamp',
    testFn: async () => {
      const req = createMockRequest();
      const res = createMockSSEResponse();
      const cardToken = generators.cardToken();
      
      // Mock alert service
      const originalRegister = connectionManager.alertService?.registerConnection;
      if (connectionManager.alertService) {
        connectionManager.alertService.registerConnection = () => true;
      }
      
      const connection = await connectionManager.createConnection(req, res, cardToken);
      
      const initialHealth = connectionManager.getConnectionHealth(connection.sessionId);
      const initialActivity = initialHealth.lastActivity;
      
      // Wait a bit and update activity
      await sleep(10);
      connectionManager.updateActivity(connection.sessionId);
      
      const updatedHealth = connectionManager.getConnectionHealth(connection.sessionId);
      assert(updatedHealth.lastActivity > initialActivity, 'Should update activity timestamp');
      
      // Cleanup
      connectionManager.handleDisconnection(connection.sessionId, 'test_cleanup');
      
      // Restore
      if (connectionManager.alertService && originalRegister) {
        connectionManager.alertService.registerConnection = originalRegister;
      }
    }
  },
  
  {
    name: 'should update heartbeat timestamp',
    testFn: async () => {
      const req = createMockRequest();
      const res = createMockSSEResponse();
      const cardToken = generators.cardToken();
      
      // Mock alert service
      const originalRegister = connectionManager.alertService?.registerConnection;
      if (connectionManager.alertService) {
        connectionManager.alertService.registerConnection = () => true;
      }
      
      const connection = await connectionManager.createConnection(req, res, cardToken);
      
      const initialHealth = connectionManager.getConnectionHealth(connection.sessionId);
      const initialHeartbeat = initialHealth.lastHeartbeat;
      
      // Wait a bit and update heartbeat
      await sleep(10);
      connectionManager.updateHeartbeat(connection.sessionId);
      
      const updatedHealth = connectionManager.getConnectionHealth(connection.sessionId);
      assert(updatedHealth.lastHeartbeat > initialHeartbeat, 'Should update heartbeat timestamp');
      assert(updatedHealth.lastActivity > initialHealth.lastActivity, 'Should also update activity');
      
      // Cleanup
      connectionManager.handleDisconnection(connection.sessionId, 'test_cleanup');
      
      // Restore
      if (connectionManager.alertService && originalRegister) {
        connectionManager.alertService.registerConnection = originalRegister;
      }
    }
  },
  
  {
    name: 'should get all connections',
    testFn: async () => {
      const req1 = createMockRequest();
      const res1 = createMockSSEResponse();
      const req2 = createMockRequest();
      const res2 = createMockSSEResponse();
      const cardToken1 = generators.cardToken();
      const cardToken2 = generators.cardToken();
      
      // Mock alert service
      const originalRegister = connectionManager.alertService?.registerConnection;
      if (connectionManager.alertService) {
        connectionManager.alertService.registerConnection = () => true;
      }
      
      // Create two connections
      const conn1 = await connectionManager.createConnection(req1, res1, cardToken1);
      const conn2 = await connectionManager.createConnection(req2, res2, cardToken2);
      
      const allConnections = connectionManager.getAllConnections();
      
      assert(allConnections.length >= 2, 'Should have at least 2 connections');
      
      const foundConn1 = allConnections.find(c => c.sessionId === conn1.sessionId);
      const foundConn2 = allConnections.find(c => c.sessionId === conn2.sessionId);
      
      assert(foundConn1, 'Should find first connection');
      assert(foundConn2, 'Should find second connection');
      assert(foundConn1.cardToken === cardToken1, 'First connection should have correct card token');
      assert(foundConn2.cardToken === cardToken2, 'Second connection should have correct card token');
      
      // Cleanup
      connectionManager.handleDisconnection(conn1.sessionId, 'test_cleanup');
      connectionManager.handleDisconnection(conn2.sessionId, 'test_cleanup');
      
      // Restore
      if (connectionManager.alertService && originalRegister) {
        connectionManager.alertService.registerConnection = originalRegister;
      }
    }
  },
  
  {
    name: 'should handle client disconnect',
    testFn: async () => {
      const req = createMockRequest();
      const res = createMockSSEResponse();
      const cardToken = generators.cardToken();
      
      // Mock alert service
      const originalRegister = connectionManager.alertService?.registerConnection;
      const originalRemove = connectionManager.alertService?.removeConnection;
      if (connectionManager.alertService) {
        connectionManager.alertService.registerConnection = () => true;
        connectionManager.alertService.removeConnection = () => true;
      }
      
      const connection = await connectionManager.createConnection(req, res, cardToken);
      
      // Verify connection exists
      assert(connectionManager.getConnectionHealth(connection.sessionId) !== null, 'Connection should exist');
      
      // Simulate client disconnect
      req.emit('close');
      
      // Wait for event processing
      await sleep(10);
      
      // Verify connection was cleaned up
      assert(connectionManager.getConnectionHealth(connection.sessionId) === null, 'Connection should be removed');
      assert(res.writableEnded === true, 'Response should be ended');
      
      // Restore
      if (connectionManager.alertService) {
        if (originalRegister) connectionManager.alertService.registerConnection = originalRegister;
        if (originalRemove) connectionManager.alertService.removeConnection = originalRemove;
      }
    }
  },
  
  {
    name: 'should get service metrics',
    testFn: async () => {
      const metrics = connectionManager.getMetrics();
      
      assert(metrics.totalConnections >= 0, 'Should have total connections count');
      assert(metrics.activeConnections >= 0, 'Should have active connections count');
      assert(metrics.failedConnections >= 0, 'Should have failed connections count');
      assert(metrics.healthChecksPassed >= 0, 'Should have health checks passed count');
      assert(metrics.healthChecksFailed >= 0, 'Should have health checks failed count');
      assert(Array.isArray(metrics.connections), 'Should have connections array');
    }
  }
];

// Run the test suite
console.log('🧪 Starting Connection Manager Unit Tests...\n');

try {
  const results = await runTestSuite('Connection Manager', tests);
  
  const summary = results.summary();
  if (summary.failed === 0) {
    console.log('\n🎉 All Connection Manager tests passed!');
    
    // Clean shutdown
    connectionManager.shutdown();
    process.exit(0);
  } else {
    console.log(`\n❌ ${summary.failed} test(s) failed`);
    connectionManager.shutdown();
    process.exit(1);
  }
} catch (error) {
  console.error('💥 Test suite failed:', error);
  connectionManager.shutdown();
  process.exit(1);
} 