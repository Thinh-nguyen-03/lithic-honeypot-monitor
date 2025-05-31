/**
 * Shared test utilities and helper functions
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Test results collector for custom test runner
 */
export class TestResults {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  addResult(name, status, error = null) {
    this.tests.push({ name, status, error });
    if (status === 'PASSED') {
      this.passed++;
    } else {
      this.failed++;
    }
  }

  summary() {
    return {
      total: this.passed + this.failed,
      passed: this.passed,
      failed: this.failed,
      tests: this.tests
    };
  }
}

/**
 * Run a test and collect results
 * @param {string} name - Test name
 * @param {Function} testFn - Test function
 * @param {TestResults} results - Results collector
 */
export async function runTest(name, testFn, results) {
  try {
    await testFn();
    results.addResult(name, 'PASSED');
    console.log(`✅ ${name}`);
  } catch (error) {
    results.addResult(name, 'FAILED', error.message);
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

/**
 * Assert helper function
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition is false
 */
export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Helper function to create mock request and response objects
 * @param {Object} body - Request body
 * @param {Object} query - Query parameters  
 * @param {string} method - HTTP method
 * @returns {Object} Mock req, res, and next function
 */
export function createMockContext(body = {}, query = {}, method = 'POST') {
  const req = {
    body,
    query,
    method,
    get: (header) => {
      if (header === 'content-length') return '1000';
      if (header === 'user-agent') return 'Test Agent';
      return null;
    },
    ip: '127.0.0.1',
    originalUrl: '/test',
    user: null
  };
  
  let responseData = null;
  let statusCode = null;
  
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
    write: (data) => {
      // Mock SSE write
      responseData = data;
    },
    end: () => {
      // Mock response end
    }
  };
  
  const next = () => {};
  
  return { req, res, next, getResponse: () => ({ statusCode, responseData }) };
}

/**
 * Create mock SSE connection for testing
 * @param {string} sessionId - Session identifier
 * @returns {Object} Mock SSE connection
 */
export function createMockSSEConnection(sessionId = null) {
  const connection = {
    sessionId: sessionId || uuidv4(),
    write: (data) => {
      connection.lastData = data;
      connection.writeCount = (connection.writeCount || 0) + 1;
    },
    end: () => {
      connection.ended = true;
    },
    writeCount: 0,
    lastData: null,
    ended: false
  };
  
  return connection;
}

/**
 * Create mock WebSocket connection for testing
 * @param {string} sessionId - Session identifier
 * @returns {Object} Mock WebSocket connection
 */
export function createMockWebSocketConnection(sessionId = null) {
  const connection = {
    sessionId: sessionId || uuidv4(),
    send: (data) => {
      connection.lastMessage = data;
      connection.messageCount = (connection.messageCount || 0) + 1;
    },
    close: () => {
      connection.closed = true;
    },
    messageCount: 0,
    lastMessage: null,
    closed: false
  };
  
  return connection;
}

/**
 * Create mock logger for testing (prevents actual logging)
 */
export const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => mockLogger
};

/**
 * Sleep helper for testing timing scenarios
 * @param {number} ms - Milliseconds to sleep
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate random test data
 */
export const generators = {
  sessionId: () => `session_${uuidv4()}`,
  cardToken: () => `card_${uuidv4()}`,
  transactionId: () => `txn_${uuidv4()}`,
  agentId: () => `agent_${uuidv4()}`,
  
  randomAmount: (min = 100, max = 10000) => Math.floor(Math.random() * (max - min) + min),
  randomMCC: () => ['5814', '5966', '4829', '6051'][Math.floor(Math.random() * 4)],
  randomMerchant: () => ['Starbucks', 'McDonald\'s', 'Shell Gas', 'Global Teleserv'][Math.floor(Math.random() * 4)]
};

/**
 * Test suite runner utility
 * @param {string} suiteName - Name of the test suite
 * @param {Array} tests - Array of test objects with name and testFn
 */
export async function runTestSuite(suiteName, tests) {
  console.log(`\n🧪 Running ${suiteName} test suite...`);
  console.log('='.repeat(50));
  
  const results = new TestResults();
  
  for (const test of tests) {
    await runTest(test.name, test.testFn, results);
  }
  
  const summary = results.summary();
  console.log('\n📊 Test Results:');
  console.log(`Total: ${summary.total}, Passed: ${summary.passed}, Failed: ${summary.failed}`);
  
  if (summary.failed > 0) {
    console.log('\n❌ Failed tests:');
    summary.tests
      .filter(t => t.status === 'FAILED')
      .forEach(t => console.log(`   - ${t.name}: ${t.error}`));
  }
  
  return results;
}

/**
 * Validate alert structure helper
 * @param {Object} alert - Alert object to validate
 * @param {Object} expectedProps - Expected properties
 */
export function validateAlertStructure(alert, expectedProps = {}) {
  assert(alert.alertType, 'Alert must have alertType');
  assert(alert.timestamp, 'Alert must have timestamp');
  
  if (alert.alertType === 'NEW_TRANSACTION') {
    assert(alert.transactionId, 'Transaction alert must have transactionId');
    assert(alert.cardToken, 'Transaction alert must have cardToken');
    assert(alert.immediate, 'Transaction alert must have immediate data');
    assert(alert.verification, 'Transaction alert must have verification data');
    assert(alert.intelligence, 'Transaction alert must have intelligence data');
  }
  
  // Check expected properties
  for (const [key, value] of Object.entries(expectedProps)) {
    assert(alert[key] === value, `Expected ${key} to be ${value}, got ${alert[key]}`);
  }
} 