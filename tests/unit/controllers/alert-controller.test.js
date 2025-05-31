/**
 * Unit tests for the Alert Controller
 * Run this file with: node tests/unit/controllers/alert-controller.test.js
 */

import { 
  runTestSuite, 
  assert, 
  createMockContext,
  sleep,
  generators,
  mockLogger
} from '../../helpers/test-helpers.js';

// Import the controller functions - we'll mock dependencies at runtime
import {
  establishSSEConnection,
  authenticateAgent,
  handleConnectionError,
  healthCheck,
  getConnectionStats
} from '../../../src/api/controllers/alert-controller.js';

// Helper to create mock SSE response
function createMockSSEResponse() {
  const chunks = [];
  const res = {
    headersSent: false,
    writableEnded: false,
    statusCode: null,
    headers: {},
    writeHead: (status, headers) => {
      res.statusCode = status;
      res.headers = { ...res.headers, ...headers };
      res.headersSent = true;
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

// Helper to create mock request with authentication
function createMockAuthenticatedRequest(cardTokens = ['card_123'], agentId = 'test_agent') {
  const listeners = {};
  return {
    requestId: generators.sessionId(),
    method: 'GET',
    originalUrl: '/api/alerts/sse',
    ip: '127.0.0.1',
    query: {
      agentId,
      cardTokens: Array.isArray(cardTokens) ? cardTokens.join(',') : cardTokens,
      apiVersion: 'v1'
    },
    body: {},
    get: (header) => {
      if (header === 'authorization') return 'Bearer valid_token_123';
      if (header === 'user-agent') return 'Test Agent/1.0';
      if (header === 'x-client-version') return '1.0.0';
      return null;
    },
    headers: {
      authorization: 'Bearer valid_token_123'
    },
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
    name: 'should authenticate valid request successfully',
    testFn: async () => {
      const req = createMockAuthenticatedRequest(['card_123', 'card_456'], 'agent_789');
      
      const result = await authenticateAgent(req);
      
      assert(result.success === true, 'Should authenticate successfully');
      assert(result.agent.agentId === 'agent_789', 'Should extract agent ID');
      assert(result.agent.cardTokens.length === 2, 'Should extract multiple card tokens');
      assert(result.agent.cardTokens.includes('card_123'), 'Should include first card token');
      assert(result.agent.cardTokens.includes('card_456'), 'Should include second card token');
      assert(result.agent.metadata.apiVersion === 'v1', 'Should extract metadata');
    }
  },
  
  {
    name: 'should reject request without authorization header',
    testFn: async () => {
      const req = createMockAuthenticatedRequest();
      req.get = (header) => {
        if (header === 'user-agent') return 'Test Agent/1.0';
        return null; // No authorization header
      };
      
      const result = await authenticateAgent(req);
      
      assert(result.success === false, 'Should fail authentication');
      assert(result.reason === 'missing_authorization_header', 'Should have correct failure reason');
    }
  },
  
  {
    name: 'should reject invalid token format',
    testFn: async () => {
      const req = createMockAuthenticatedRequest();
      req.get = (header) => {
        if (header === 'authorization') return 'InvalidFormat token123';
        if (header === 'user-agent') return 'Test Agent/1.0';
        return null;
      };
      
      const result = await authenticateAgent(req);
      
      assert(result.success === false, 'Should fail authentication');
      assert(result.reason === 'invalid_authorization_format', 'Should reject non-Bearer format');
    }
  },
  
  {
    name: 'should reject empty token',
    testFn: async () => {
      const req = createMockAuthenticatedRequest();
      req.get = (header) => {
        if (header === 'authorization') return 'Bearer ';
        if (header === 'user-agent') return 'Test Agent/1.0';
        return null;
      };
      
      const result = await authenticateAgent(req);
      
      assert(result.success === false, 'Should fail authentication');
      assert(result.reason === 'empty_token', 'Should reject empty token');
    }
  },
  
  {
    name: 'should reject request without card tokens',
    testFn: async () => {
      const req = createMockAuthenticatedRequest();
      req.query = { agentId: 'test_agent' }; // No card tokens
      
      const result = await authenticateAgent(req);
      
      assert(result.success === false, 'Should fail authentication');
      assert(result.reason === 'no_card_tokens', 'Should require card tokens');
    }
  },
  
  {
    name: 'should handle single card token from query',
    testFn: async () => {
      const req = createMockAuthenticatedRequest();
      req.query = { 
        agentId: 'test_agent',
        cardToken: 'single_card_123' // Single card token
      };
      
      const result = await authenticateAgent(req);
      
      assert(result.success === true, 'Should authenticate successfully');
      assert(result.agent.cardTokens.length === 1, 'Should have one card token');
      assert(result.agent.cardTokens[0] === 'single_card_123', 'Should extract single card token');
    }
  },
  
  {
    name: 'should handle connection error gracefully',
    testFn: async () => {
      const res = createMockSSEResponse();
      const requestId = 'test_request_123';
      const error = new Error('Connection failed');
      
      handleConnectionError(error, res, requestId);
      
      assert(res.statusCode === 500, 'Should return 500 status');
      assert(res.body.error === 'Internal Server Error', 'Should return server error');
      assert(res.body.requestId === requestId, 'Should include request ID');
    }
  },
  
  {
    name: 'should handle authentication error in connection error',
    testFn: async () => {
      const res = createMockSSEResponse();
      const requestId = 'test_request_123';
      const error = new Error('authentication failed');
      
      handleConnectionError(error, res, requestId);
      
      assert(res.statusCode === 401, 'Should return 401 status');
      assert(res.body.error === 'Authentication Error', 'Should return auth error');
    }
  },
  
  {
    name: 'should handle SSE error when headers already sent',
    testFn: async () => {
      const res = createMockSSEResponse();
      res.headersSent = true; // Simulate headers already sent
      const requestId = 'test_request_123';
      const error = new Error('Connection failed');
      
      handleConnectionError(error, res, requestId);
      
      // Should try to send SSE error event
      const chunks = res.getChunks();
      assert(chunks.length > 0, 'Should send SSE error event');
      
      const errorEvent = chunks.find(chunk => chunk.includes('event: error'));
      assert(errorEvent, 'Should send error event through SSE');
    }
  }
];

// Run the test suite
console.log('🧪 Starting Alert Controller Unit Tests...\n');

try {
  const results = await runTestSuite('Alert Controller', tests);
  
  const summary = results.summary();
  if (summary.failed === 0) {
    console.log('\n🎉 All Alert Controller tests passed!');
    process.exit(0);
  } else {
    console.log(`\n❌ ${summary.failed} test(s) failed`);
    process.exit(1);
  }
} catch (error) {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
} 