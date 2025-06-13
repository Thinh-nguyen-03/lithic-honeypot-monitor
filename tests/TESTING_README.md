# Test Organization Structure

This directory contains all test files for the Honeypot Transaction Monitoring System, organized by test type and component.

## Directory Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── middleware/          # Middleware tests (validation, authentication, etc.)
│   ├── controllers/         # Controller tests (alert, webhook, mcp controllers)
│   ├── routes/              # Route tests (alert, mcp routes)
│   ├── services/           # Service layer tests (alert-service, supabase-service, etc.)
│   └── utils/              # Utility function tests (parsers, logger, etc.)
├── integration/            # Integration tests for end-to-end scenarios
├── e2e/                    # End-to-end tests for complete workflows
├── fixtures/               # Test data and mock objects
│   ├── transactions/       # Sample transaction data
│   ├── alerts/            # Sample alert payloads
│   ├── merchants/         # Sample merchant data
│   ├── cards/             # Sample card data
│   └── responses/         # Sample API responses
├── helpers/                # Shared test utilities and setup functions
└── README.md              # This file
```

## Test Types

### Unit Tests (`tests/unit/`)
- Test individual functions and components in isolation
- Mock external dependencies
- Fast execution, focused on specific functionality
- Examples: validation middleware, alert service methods, enhanced subscription system, MCP protocol compliance

### Integration Tests (`tests/integration/`)
- Test interaction between multiple components
- Use real or test databases/services
- Test API endpoints with actual request/response cycles
- Examples: webhook processing, transaction flow, MCP integration, end-to-end alert delivery

### End-to-End Tests (`tests/e2e/`)
- Test complete user workflows from start to finish
- Use production-like environment setup
- Test real scammer interaction scenarios
- Examples: full transaction alert flow, AI agent subscription lifecycle, scammer verification workflows

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### E2E Tests Only
```bash
npm run test:e2e
```

### Specific Test Files
```bash
# Alert system tests
node tests/unit/services/alert-service.test.js
node tests/unit/controllers/alert-controller.test.js
node tests/unit/routes/alert-routes.test.js

# Enhanced MCP system tests (20 comprehensive tests)
node tests/unit/controllers/mcp-controller.test.js
node tests/unit/routes/mcp-routes.test.js

# Server integration tests (15 comprehensive tests including Task 5.2)
node tests/unit/controllers/server-integration.test.js

# Integration tests
node tests/unit/controllers/lithic-webhook-controller.test.js
node tests/unit/services/supabase-service.test.js

# Validation and utilities
node tests/unit/middleware/validation.test.js
```

## Test File Naming Conventions

- Unit tests: `[component-name].test.js`
- Integration tests: `[feature-name].integration.test.js`
- E2E tests: `[workflow-name].e2e.test.js`
- Test fixtures: `[component-name].fixture.js`
- Test helpers: `[helper-name].helper.js`

## Writing New Tests

1. **Determine test type**: Unit, integration, or E2E based on scope
2. **Choose appropriate directory**: Place in correct subfolder
3. **Follow naming conventions**: Use descriptive names with proper suffixes
4. **Use shared fixtures**: Leverage `tests/fixtures/` for common test data
5. **Import test helpers**: Use `tests/helpers/` for common setup/teardown
6. **Add proper documentation**: Include JSDoc comments for complex test cases

### Enhanced Testing Patterns (Examples from Task 4.4)

**Multi-Component Testing:**
```javascript
// Test complex subscription scenarios with multiple cards
{
  name: 'should handle enhanced subscription with multiple cards',
  testFn: async () => {
    // Test registration of multiple cards simultaneously
    // Verify success rates and failure handling
    // Check comprehensive response structures
  }
}
```

**Error Scenario Testing:**
```javascript
// Test various failure modes and recovery
{
  name: 'should handle partial registration failures gracefully',
  testFn: async () => {
    // Simulate partial failures
    // Verify graceful degradation
    // Check error isolation
  }
}
```

**Parameter Validation Testing:**
```javascript
// Test comprehensive parameter validation
{
  name: 'should validate subscription parameters robustly',
  testFn: async () => {
    // Test various invalid parameter combinations
    // Verify proper error responses
    // Check MCP-compliant error codes
  }
}
```

**Real-Time Middleware Testing (Task 5.2):**
```javascript
// Test SSE middleware configuration
{
  name: 'should handle SSE middleware configuration correctly',
  testFn: async () => {
    // Test proper SSE headers for streaming endpoints
    // Verify Content-Type, Cache-Control, Connection headers
    // Check Nginx buffering disabled for optimal streaming
  }
}

// Test performance optimization middleware
{
  name: 'should handle performance optimization middleware correctly',
  testFn: async () => {
    // Test compression disabled for SSE endpoints
    // Verify chunked encoding for optimal streaming
    // Check response headers flushed immediately
  }
}

// Test enhanced CORS configuration
{
  name: 'should handle enhanced CORS configuration correctly',
  testFn: async () => {
    // Test real-time endpoint CORS headers
    // Verify timeout configuration (5-minute for SSE)
    // Check authentication header support
  }
}

// Test server timeout configuration
{
  name: 'should handle server timeout configuration correctly',
  testFn: async () => {
    // Test keep-alive timeout (65s)
    // Verify headers timeout (66s)
    // Check SSE timeout (2 minutes)
  }
}

// Test real-time error handling
{
  name: 'should handle real-time error handling correctly',
  testFn: async () => {
    // Test connection reset handling (499 status)
    // Verify timeout error handling (408 status)
    // Check SSE-specific error handling (500 status)
  }
}
```

## Test Data and Fixtures

Test fixtures should be placed in `tests/fixtures/` and organized by component:

```
fixtures/
├── transactions/           # Sample transaction data for scammer scenarios
├── merchants/             # Sample merchant data for verification testing
├── cards/                 # Sample honeypot card data
├── alerts/                # Sample alert payloads for AI agents
└── responses/             # Sample API responses (MCP, webhook, etc.)
```

### Enhanced Test Data Examples

**Alert Fixtures:**
- `sampleAlert`: Standard transaction alert for AI agents
- `scammerAlert`: Scammer detection alert with verification data
- `suspiciousAlert`: High-risk transaction alert
- `connectionStatusAlert`: Connection status notifications
- `subscriptionWelcome`: Welcome message for new subscriptions

**Transaction Fixtures:**
- `scammerTransaction`: Verification transaction examples
- `multipleTransactions`: Arrays for pattern testing
- `failedTransaction`: Declined transaction scenarios
- `pendingTransaction`: Authorization pending examples

## Testing Guidelines

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test data and reset state after tests
3. **Mocking**: Mock external dependencies in unit tests
4. **Coverage**: Aim for high test coverage, especially for critical paths
5. **Performance**: Keep unit tests fast, integration tests reasonable
6. **Reliability**: Tests should be deterministic and not flaky
7. **Documentation**: Document complex test scenarios and edge cases
8. **Error Scenarios**: Test failure modes, partial failures, and recovery
9. **MCP Compliance**: Ensure JSON-RPC 2.0 compliance for all MCP responses
10. **Enterprise Patterns**: Test comprehensive error handling and monitoring

### Advanced Testing Considerations

**Health Monitoring Tests:**
- Test connection health scoring algorithms
- Verify session lifecycle tracking
- Check cleanup and recovery mechanisms

**Multi-Card Subscription Tests:**
- Test simultaneous card registrations
- Verify partial failure handling
- Check registration success rate calculations

**MCP Protocol Tests:**
- Verify JSON-RPC 2.0 compliance

**Real-Time Middleware Tests (Task 5.2):**
- Test SSE header configuration for optimal streaming
- Verify performance optimization for real-time endpoints
- Check enhanced CORS configuration for cross-origin requests
- Test server-level timeout configuration
- Verify real-time error handling with specific HTTP status codes

**Enterprise Middleware Patterns:**
- Test connection lifecycle management
- Verify graceful error handling with proper status codes
- Check performance optimization for streaming data
- Test timeout configuration for production reliability
- Verify CORS configuration for security and compatibility

## Continuous Integration

Tests are automatically run on:
- Pull requests
- Main branch commits
- Release preparations

All tests must pass before code can be merged to main branch.

### Current Test Coverage
- **Total Unit Tests**: 74+ tests across all components
- **Alert System**: 10 tests (connection management, broadcasting)
- **Enhanced MCP Controller**: 20 tests (subscription system, query processing)
- **Integration Tests**: 8 tests (webhook integration, service integration)
- **Success Rate**: 98.7% (comprehensive coverage with enterprise-grade patterns) 