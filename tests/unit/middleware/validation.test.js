/**
 * Test suite for validation middleware.
 * Run this file directly with Node.js to test all validation scenarios.
 */

console.log('Starting validation middleware tests...');

import { 
  validateVapiRequest, 
  validateAlertRequest, 
  validateIntelligenceQuery,
  schemas 
} from '../../../src/middleware/validation.js';

// Mock logger to prevent actual logging during tests
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

// Test results collector
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Helper function to create mock request and response objects.
 * @param {Object} body - Request body.
 * @param {Object} query - Query parameters.
 * @param {string} method - HTTP method.
 * @returns {Object} Mock req, res, and next function.
 */
function createMockContext(body = {}, query = {}, method = 'POST') {
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
    }
  };
  
  const next = () => {};
  
  return { req, res, next, getResponse: () => ({ statusCode, responseData }) };
}

/**
 * Run a test and collect results.
 * @param {string} name - Test name.
 * @param {Function} testFn - Test function.
 */
async function runTest(name, testFn) {
  try {
    await testFn();
    testResults.passed++;
    testResults.tests.push({ name, status: 'PASSED' });
    console.log(`✅ ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name, status: 'FAILED', error: error.message });
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

/**
 * Assert helper function.
 * @param {boolean} condition - Condition to check.
 * @param {string} message - Error message if condition is false.
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ========== VAPI REQUEST VALIDATION TESTS ==========

async function testVapiValidRequests() {
  // Test valid get_transaction request
  const { req, res, next } = createMockContext({
    toolCallId: 'call_123',
    tool: 'get_transaction',
    parameters: {
      query: 'transaction_abc123',
      limit: 10
    }
  });
  
  await validateVapiRequest(req, res, next);
  assert(req.validatedData, 'Should have validated data');
  assert(req.validatedData.tool === 'get_transaction', 'Tool should be preserved');
  assert(req.validatedData.parameters.limit === 10, 'Limit should be preserved');
  assert(req.requestId, 'Should have request ID');
}

async function testVapiInvalidRequests() {
  // Test missing required field
  const { req, res, next, getResponse } = createMockContext({
    tool: 'get_transaction',
    parameters: { query: 'test' }
    // Missing toolCallId
  });
  
  await validateVapiRequest(req, res, next);
  const response = getResponse();
  assert(response.statusCode === 400, 'Should return 400 for missing field');
  assert(response.responseData.error === 'Validation Error', 'Should have correct error type');
  assert(response.responseData.field === 'toolCallId', 'Should identify missing field');
  assert(response.responseData.requestId, 'Should have request ID in error');
}

async function testVapiMaliciousInput() {
  // Test SQL injection attempt
  const { req, res, next } = createMockContext({
    toolCallId: 'call_123',
    tool: 'search_transactions',
    parameters: {
      query: "'; DROP TABLE transactions; --",
      limit: 5
    }
  });
  
  await validateVapiRequest(req, res, next);
  assert(req.validatedData, 'Should sanitize and accept');
  assert(!req.validatedData.parameters.query.includes("'"), 'Should remove SQL injection characters');
  assert(!req.validatedData.parameters.query.includes("--"), 'Should remove SQL comments');
}

async function testVapiOversizedPayload() {
  const { req, res, next, getResponse } = createMockContext({});
  req.get = (header) => {
    if (header === 'content-length') return '2000000'; // 2MB
    return null;
  };
  
  await validateVapiRequest(req, res, next);
  const response = getResponse();
  assert(response.statusCode === 413, 'Should return 413 for oversized payload');
  assert(response.responseData.details.includes('too large'), 'Should indicate payload too large');
}

// ========== ALERT REQUEST VALIDATION TESTS ==========

async function testAlertValidRequests() {
  // Test valid SSE subscription request
  const { req, res, next } = createMockContext({
    agentId: 'agent_123',
    cardTokens: ['card_abc', 'card_xyz'],
    connectionType: 'sse',
    metadata: {
      sessionId: 'session_123',
      conversationId: 'conv_456'
    }
  });
  
  await validateAlertRequest(req, res, next);
  assert(req.validatedData, 'Should have validated data');
  assert(req.validatedData.cardTokens.length === 2, 'Should preserve card tokens');
  assert(req.validatedData.connectionType === 'sse', 'Should preserve connection type');
}

async function testAlertQueryParams() {
  // Test GET request with query params
  const { req, res, next } = createMockContext(
    {}, 
    {
      agentId: 'agent_123',
      cardTokens: 'card_abc,card_xyz'
    },
    'GET'
  );
  
  await validateAlertRequest(req, res, next);
  assert(req.validatedData, 'Should parse query params');
  assert(Array.isArray(req.validatedData.cardTokens), 'Should parse comma-separated tokens');
  assert(req.validatedData.cardTokens.length === 2, 'Should have correct token count');
}

async function testAlertSemanticValidation() {
  // Test too many cards without admin permission
  const { req, res, next, getResponse } = createMockContext({
    agentId: 'agent_123',
    cardTokens: ['card_1', 'card_2', 'card_3', 'card_4', 'card_5', 'card_6']
  });
  
  await validateAlertRequest(req, res, next);
  const response = getResponse();
  assert(response.statusCode === 422, 'Should return 422 for semantic validation failure');
  assert(response.responseData.error === 'Semantic Validation Error', 'Should indicate semantic error');
}

// ========== INTELLIGENCE QUERY VALIDATION TESTS ==========

async function testIntelligenceValidRequests() {
  // Test valid pattern analysis request
  const { req, res, next } = createMockContext({
    queryType: 'pattern_analysis',
    filters: {
      cardToken: 'card_123',
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-01-31T23:59:59Z',
      minAmount: 10,
      maxAmount: 1000
    },
    options: {
      includePatterns: true,
      limit: 20
    }
  });
  
  await validateIntelligenceQuery(req, res, next);
  assert(req.validatedData, 'Should have validated data');
  assert(req.validatedData.queryType === 'pattern_analysis', 'Should preserve query type');
  assert(req.validatedData.options.limit === 20, 'Should preserve custom limit');
}

async function testIntelligenceDateValidation() {
  // Test date range too large
  const { req, res, next, getResponse } = createMockContext({
    queryType: 'transaction_history',
    filters: {
      cardToken: 'card_123',
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-06-01T00:00:00Z' // 151 days
    }
  });
  
  await validateIntelligenceQuery(req, res, next);
  const response = getResponse();
  assert(response.statusCode === 422, 'Should return 422 for date range too large');
  assert(response.responseData.details.includes('90 days'), 'Should mention 90 day limit');
}

async function testIntelligenceInvalidMCC() {
  // Test invalid MCC code format
  const { req, res, next, getResponse } = createMockContext({
    queryType: 'merchant_verification',
    filters: {
      mccCode: '12A4' // Invalid - contains letter
    }
  });
  
  await validateIntelligenceQuery(req, res, next);
  const response = getResponse();
  assert(response.statusCode === 400, 'Should return 400 for invalid MCC format');
  assert(response.responseData.field === 'filters.mccCode', 'Should identify MCC field');
}

// ========== ERROR RESPONSE FORMAT TESTS ==========

async function testErrorResponseFormat() {
  // Test that all error responses follow the correct format
  const { req, res, next, getResponse } = createMockContext({
    // Invalid request - missing all required fields
  });
  
  await validateVapiRequest(req, res, next);
  const response = getResponse();
  
  assert(response.responseData.error, 'Should have error field');
  assert(response.responseData.details, 'Should have details field');
  assert(response.responseData.field, 'Should have field identifier');
  assert(response.responseData.timestamp, 'Should have timestamp');
  assert(response.responseData.requestId, 'Should have request ID');
  
  // Verify timestamp is valid ISO string
  const timestamp = new Date(response.responseData.timestamp);
  assert(!isNaN(timestamp.getTime()), 'Timestamp should be valid ISO string');
}

// ========== PERFORMANCE TEST ==========

async function testPerformanceUnderLoad() {
  const iterations = 100;
  const start = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    const { req, res, next } = createMockContext({
      toolCallId: `call_${i}`,
      tool: 'get_transaction',
      parameters: {
        query: `transaction_${i}`,
        limit: 5
      }
    });
    
    await validateVapiRequest(req, res, next);
  }
  
  const duration = Date.now() - start;
  const avgTime = duration / iterations;
  
  console.log(`   Average validation time: ${avgTime.toFixed(2)}ms`);
  assert(avgTime < 10, `Average validation time should be under 10ms, got ${avgTime.toFixed(2)}ms`);
}

// ========== RUN ALL TESTS ==========

async function runAllTests() {
  console.log('\n🧪 Running Validation Middleware Tests\n');
  
  console.log('📋 Vapi Request Validation Tests:');
  await runTest('Valid Vapi requests', testVapiValidRequests);
  await runTest('Invalid Vapi requests', testVapiInvalidRequests);
  await runTest('Malicious input sanitization', testVapiMaliciousInput);
  await runTest('Oversized payload rejection', testVapiOversizedPayload);
  
  console.log('\n📋 Alert Request Validation Tests:');
  await runTest('Valid alert requests', testAlertValidRequests);
  await runTest('Query parameter parsing', testAlertQueryParams);
  await runTest('Semantic validation', testAlertSemanticValidation);
  
  console.log('\n📋 Intelligence Query Validation Tests:');
  await runTest('Valid intelligence queries', testIntelligenceValidRequests);
  await runTest('Date range validation', testIntelligenceDateValidation);
  await runTest('Invalid MCC code format', testIntelligenceInvalidMCC);
  
  console.log('\n📋 Error Response Format Tests:');
  await runTest('Error response format', testErrorResponseFormat);
  
  console.log('\n📋 Performance Tests:');
  await runTest('Performance under load', testPerformanceUnderLoad);
  
  console.log('\n📊 Test Summary:');
  console.log(`   Total Tests: ${testResults.passed + testResults.failed}`);
  console.log(`   ✅ Passed: ${testResults.passed}`);
  console.log(`   ❌ Failed: ${testResults.failed}`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.tests
      .filter(t => t.status === 'FAILED')
      .forEach(t => console.log(`   - ${t.name}: ${t.error}`));
  }
  
  return testResults.failed === 0;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
} 