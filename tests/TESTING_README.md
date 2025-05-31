# Test Organization Structure

This directory contains all test files for the Honeypot Transaction Monitoring System, organized by test type and component.

## Directory Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── middleware/          # Middleware tests (validation, authentication, etc.)
│   ├── services/           # Service layer tests (alert-service, supabase-service, etc.)
│   └── utils/              # Utility function tests (parsers, logger, etc.)
├── integration/            # Integration tests for end-to-end scenarios
├── e2e/                    # End-to-end tests for complete workflows
├── fixtures/               # Test data and mock objects
├── helpers/                # Shared test utilities and setup functions
└── README.md              # This file
```

## Test Types

### Unit Tests (`tests/unit/`)
- Test individual functions and components in isolation
- Mock external dependencies
- Fast execution, focused on specific functionality
- Examples: validation middleware, alert service methods, parser functions

### Integration Tests (`tests/integration/`)
- Test interaction between multiple components
- Use real or test databases/services
- Test API endpoints with actual request/response cycles
- Examples: webhook processing, transaction flow, MCP integration

### End-to-End Tests (`tests/e2e/`)
- Test complete user workflows from start to finish
- Use production-like environment setup
- Test real scammer interaction scenarios
- Examples: full transaction alert flow, AI agent integration

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

### Specific Test File
```bash
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

## Test Data and Fixtures

Test fixtures should be placed in `tests/fixtures/` and organized by component:

```
fixtures/
├── transactions/           # Sample transaction data
├── merchants/             # Sample merchant data
├── cards/                 # Sample card data
├── alerts/                # Sample alert payloads
└── responses/             # Sample API responses
```

## Testing Guidelines

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test data and reset state after tests
3. **Mocking**: Mock external dependencies in unit tests
4. **Coverage**: Aim for high test coverage, especially for critical paths
5. **Performance**: Keep unit tests fast, integration tests reasonable
6. **Reliability**: Tests should be deterministic and not flaky
7. **Documentation**: Document complex test scenarios and edge cases

## Continuous Integration

Tests are automatically run on:
- Pull requests
- Main branch commits
- Release preparations

All tests must pass before code can be merged to main branch. 