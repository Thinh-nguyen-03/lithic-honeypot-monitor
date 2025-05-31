/**
 * Unit tests for the Alert Service
 * Run this file with: node tests/unit/services/alert-service.test.js
 */

import { 
  runTestSuite, 
  assert, 
  createMockSSEConnection, 
  createMockWebSocketConnection,
  sleep,
  generators,
  validateAlertStructure
} from '../../helpers/test-helpers.js';
import { sampleTransaction, scammerTransaction } from '../../fixtures/transactions/sample-transaction.fixture.js';
import { sampleAlert, scammerAlert } from '../../fixtures/alerts/sample-alert.fixture.js';

// Import the AlertService class directly for testing
import alertService from '../../../src/services/alert-service.js';

const tests = [
  {
    name: 'should register new connection successfully',
    testFn: async () => {
      const sessionId = generators.sessionId();
      const cardToken = generators.cardToken();
      const connection = createMockSSEConnection(sessionId);
      
      const result = alertService.registerConnection(sessionId, cardToken, connection);
      
      assert(result === true, 'Should return true on successful registration');
      
      const stats = alertService.getActiveConnections();
      assert(stats.totalActive >= 1, 'Should have at least one active connection');
      assert(stats.byCard[cardToken] === 1, 'Should have one connection for the card');
      
      // Cleanup
      alertService.removeConnection(sessionId);
    }
  },
  
  {
    name: 'should remove connection successfully',
    testFn: async () => {
      const sessionId = generators.sessionId();
      const cardToken = generators.cardToken();
      const connection = createMockSSEConnection(sessionId);
      
      // Register and then remove
      alertService.registerConnection(sessionId, cardToken, connection);
      const result = alertService.removeConnection(sessionId);
      
      assert(result === true, 'Should return true on successful removal');
      
      const stats = alertService.getActiveConnections();
      assert(!stats.byCard[cardToken], 'Should not have any connections for the card');
    }
  },
  
  {
    name: 'should broadcast alert to registered connections',
    testFn: async () => {
      const sessionId1 = generators.sessionId();
      const sessionId2 = generators.sessionId();
      const cardToken = generators.cardToken();
      const connection1 = createMockSSEConnection(sessionId1);
      const connection2 = createMockSSEConnection(sessionId2);
      
      // Register two connections for the same card
      alertService.registerConnection(sessionId1, cardToken, connection1);
      alertService.registerConnection(sessionId2, cardToken, connection2);
      
      // Broadcast alert
      const result = await alertService.broadcastAlert(cardToken, sampleTransaction);
      
      assert(result.successful === 2, `Should deliver to 2 connections, got ${result.successful}`);
      assert(result.failed === 0, `Should have 0 failures, got ${result.failed}`);
      
      // Check that connections received data
      assert(connection1.writeCount === 1, 'Connection 1 should have received one message');
      assert(connection2.writeCount === 1, 'Connection 2 should have received one message');
      
      // Cleanup
      alertService.removeConnection(sessionId1);
      alertService.removeConnection(sessionId2);
    }
  },
  
  {
    name: 'should format transaction alert correctly',
    testFn: async () => {
      const formattedAlert = alertService.formatTransactionAlert(sampleTransaction);
      
      validateAlertStructure(formattedAlert, {
        alertType: 'NEW_TRANSACTION',
        transactionId: sampleTransaction.token,
        cardToken: sampleTransaction.card_token
      });
      
      assert(formattedAlert.immediate.amount === '$12.50', 'Should format amount correctly');
      assert(formattedAlert.immediate.network === 'VISA', 'Should preserve network');
      assert(formattedAlert.verification.mccCode === '5814', 'Should preserve MCC code');
    }
  },
  
  {
    name: 'should format scammer transaction alert with intelligence',
    testFn: async () => {
      const formattedAlert = alertService.formatTransactionAlert(scammerTransaction);
      
      validateAlertStructure(formattedAlert);
      
      assert(formattedAlert.immediate.amount === '$1.00', 'Should format scammer amount correctly');
      assert(formattedAlert.intelligence.isFirstTransaction === true, 'Should include first transaction flag');
      assert(formattedAlert.intelligence.geographicPattern.includes('Nigeria'), 'Should include geographic analysis');
    }
  },
  
  {
    name: 'should handle WebSocket connections',
    testFn: async () => {
      const sessionId = generators.sessionId();
      const cardToken = generators.cardToken();
      const wsConnection = createMockWebSocketConnection(sessionId);
      
      alertService.registerConnection(sessionId, cardToken, wsConnection);
      
      const result = await alertService.broadcastAlert(cardToken, sampleTransaction);
      
      assert(result.successful === 1, 'Should deliver to WebSocket connection');
      assert(wsConnection.messageCount === 1, 'WebSocket should have received message');
      
      // Parse the sent message
      const sentMessage = JSON.parse(wsConnection.lastMessage);
      validateAlertStructure(sentMessage);
      
      // Cleanup
      alertService.removeConnection(sessionId);
    }
  },
  
  {
    name: 'should return empty result when no connections for card',
    testFn: async () => {
      const nonExistentCard = generators.cardToken();
      
      const result = await alertService.broadcastAlert(nonExistentCard, sampleTransaction);
      
      assert(result.successful === 0, 'Should have 0 successful deliveries');
      assert(result.failed === 0, 'Should have 0 failed deliveries');
      assert(result.sessions.length === 0, 'Should have empty sessions array');
    }
  },
  
  {
    name: 'should track metrics correctly',
    testFn: async () => {
      const initialMetrics = alertService.getMetrics();
      const sessionId = generators.sessionId();
      const cardToken = generators.cardToken();
      const connection = createMockSSEConnection(sessionId);
      
      // Register connection
      alertService.registerConnection(sessionId, cardToken, connection);
      
      // Send alert
      await alertService.broadcastAlert(cardToken, sampleTransaction);
      
      const newMetrics = alertService.getMetrics();
      
      assert(newMetrics.totalConnections > initialMetrics.totalConnections, 'Should increment total connections');
      assert(newMetrics.totalAlertsSent > initialMetrics.totalAlertsSent, 'Should increment alerts sent');
      assert(newMetrics.activeConnections >= 1, 'Should track active connections');
      
      // Cleanup
      alertService.removeConnection(sessionId);
    }
  },
  
  {
    name: 'should handle connection errors gracefully',
    testFn: async () => {
      const sessionId = generators.sessionId();
      const cardToken = generators.cardToken();
      
      // Create a broken connection that throws on write
      const brokenConnection = {
        write: () => {
          throw new Error('Connection broken');
        }
      };
      
      alertService.registerConnection(sessionId, cardToken, brokenConnection);
      
      const result = await alertService.broadcastAlert(cardToken, sampleTransaction);
      
      assert(result.successful === 0, 'Should have 0 successful deliveries');
      assert(result.failed === 1, 'Should have 1 failed delivery');
      assert(result.sessions[0].status === 'failed', 'Should mark session as failed');
      
      // Cleanup
      alertService.removeConnection(sessionId);
    }
  },
  
  {
    name: 'should get active connections statistics',
    testFn: async () => {
      const sessionId1 = generators.sessionId();
      const sessionId2 = generators.sessionId();
      const cardToken1 = generators.cardToken();
      const cardToken2 = generators.cardToken();
      const connection1 = createMockSSEConnection(sessionId1);
      const connection2 = createMockSSEConnection(sessionId2);
      
      // Register connections for different cards
      alertService.registerConnection(sessionId1, cardToken1, connection1);
      alertService.registerConnection(sessionId2, cardToken2, connection2);
      
      const stats = alertService.getActiveConnections();
      
      assert(stats.totalActive >= 2, 'Should have at least 2 active connections');
      assert(stats.byCard[cardToken1] === 1, 'Should have 1 connection for card1');
      assert(stats.byCard[cardToken2] === 1, 'Should have 1 connection for card2');
      assert(stats.connectionDetails.length >= 2, 'Should have connection details');
      
      // Cleanup
      alertService.removeConnection(sessionId1);
      alertService.removeConnection(sessionId2);
    }
  }
];

// Run the test suite
console.log('🧪 Starting Alert Service Unit Tests...\n');

try {
  const results = await runTestSuite('Alert Service', tests);
  
  const summary = results.summary();
  if (summary.failed === 0) {
    console.log('\n🎉 All Alert Service tests passed!');
    process.exit(0);
  } else {
    console.log(`\n❌ ${summary.failed} test(s) failed`);
    process.exit(1);
  }
} catch (error) {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
} 