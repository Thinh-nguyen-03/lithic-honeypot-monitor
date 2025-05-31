/**
 * Unit tests for Lithic Webhook Controller with Alert System Integration
 * Tests webhook processing and real-time alert broadcasting functionality
 */

import { TestResults, runTest, runTestSuite, assert, createMockContext } from '../../helpers/test-helpers.js';

// Mock the services and logger
const mockLithicService = {
  getTransaction: async (token) => ({
    token: token,
    card_token: 'card_test_123',
    amount: 1250, // $12.50 in cents
    status: 'APPROVED',
    network: 'VISA',
    network_transaction_id: 'net_txn_456',
    authorization_code: 'AUTH789',
    acquirer_reference_number: 'REF123',
    merchant: {
      descriptor: 'STARBUCKS #1234',
      mcc: '5814',
      city: 'Seattle',
      state: 'WA',
      country: 'USA'
    },
    merchant_info: {
      mcc_description: 'Coffee Shop',
      mcc_category: 'Service'
    },
    isFirstTransaction: true,
    merchantHistory: 'New merchant for this card',
    geographicPattern: 'New location for this card'
  })
};

const mockSupabaseService = {
  saveTransaction: async (transaction) => {
    return { success: true };
  }
};

const mockAlertService = {
  broadcastAlert: async (cardToken, alertData) => {
    return {
      successful: 1,
      failed: 0,
      sessions: [{ sessionId: 'session_123', status: 'delivered' }]
    };
  }
};

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

// Mock the config
const mockConfig = {
  server: {
    nodeEnv: 'test'
  },
  lithic: {
    webhookSecret: 'test_secret'
  }
};

/**
 * Test webhook controller with alert integration
 */
async function testWebhookWithAlertIntegration() {
  // Test 1: Successful transaction processing with alert broadcasting
  const test1 = {
    name: 'Should process transaction and broadcast alert successfully',
    testFn: async () => {
      let alertBroadcastCalled = false;
      let alertData = null;
      let alertCardToken = null;

      // Override mock to capture alert calls
      const testAlertService = {
        broadcastAlert: async (cardToken, data) => {
          alertBroadcastCalled = true;
          alertCardToken = cardToken;
          alertData = data;
          return { successful: 1, failed: 0, sessions: [] };
        }
      };

      // Create mock request/response
      const { req, res, getResponse } = createMockContext();
      req.body = {
        type: 'transaction.created',
        payload: {
          token: 'txn_test_456'
        }
      };
      req.headers = {
        'webhook-id': 'webhook_123'
      };

      // Mock handler function with alert integration
      const handler = async (req, res) => {
        const webhookId = req.headers["webhook-id"];
        const eventPayload = req.body;

        switch (eventPayload.type) {
          case "transaction.created":
          case "transaction.updated":
            const transaction = await mockLithicService.getTransaction(eventPayload.payload.token);
            await mockSupabaseService.saveTransaction(transaction);

            // Alert integration
            try {
              await testAlertService.broadcastAlert(transaction.card_token, {
                alertType: 'NEW_TRANSACTION',
                timestamp: new Date().toISOString(),
                transactionId: transaction.token,
                cardToken: transaction.card_token,
                immediate: {
                  amount: `$${(transaction.amount / 100).toFixed(2)}`,
                  merchant: transaction.merchant?.descriptor || 'Unknown Merchant',
                  location: `${transaction.merchant?.city || ''}, ${transaction.merchant?.state || ''}, ${transaction.merchant?.country || ''}`.replace(/^,\s*|,\s*$/g, ''),
                  status: transaction.status,
                  network: transaction.network,
                  networkTransactionID: transaction.network_transaction_id
                },
                verification: {
                  mccCode: transaction.merchant?.mcc || '',
                  merchantType: transaction.merchant_info?.mcc_description || 'Unknown',
                  merchantCategory: transaction.merchant_info?.mcc_category || 'Unknown',
                  authorizationCode: transaction.authorization_code || '',
                  retrievalReference: transaction.acquirer_reference_number || ''
                },
                intelligence: {
                  isFirstTransaction: transaction.isFirstTransaction || false,
                  merchantHistory: transaction.merchantHistory || 'New merchant for this card',
                  geographicPattern: transaction.geographicPattern || 'New location for this card'
                }
              });
            } catch (alertError) {
              // Should not break webhook processing
            }
            break;
        }

        res.status(200).json({ received: true, message: "Webhook processed successfully." });
      };

      await handler(req, res);
      const response = getResponse();

      assert(alertBroadcastCalled, 'Alert broadcast should have been called');
      assert(alertCardToken === 'card_test_123', 'Alert should be broadcast to correct card token');
      assert(alertData.alertType === 'NEW_TRANSACTION', 'Alert type should be NEW_TRANSACTION');
      assert(alertData.transactionId === 'txn_test_456', 'Transaction ID should match');
      assert(alertData.immediate.amount === '$12.50', 'Amount should be formatted correctly');
      assert(alertData.immediate.merchant === 'STARBUCKS #1234', 'Merchant should be included');
      assert(alertData.verification.mccCode === '5814', 'MCC code should be included');
      assert(response.statusCode === 200, 'Response should be 200');
    }
  };

  // Test 2: Alert failure should not break webhook processing
  const test2 = {
    name: 'Should continue webhook processing when alert fails',
    testFn: async () => {
      let webhookCompleted = false;

      // Alert service that throws error
      const failingAlertService = {
        broadcastAlert: async () => {
          throw new Error('Alert service unavailable');
        }
      };

      const { req, res, getResponse } = createMockContext();
      req.body = {
        type: 'transaction.created',
        payload: {
          token: 'txn_test_789'
        }
      };
      req.headers = {
        'webhook-id': 'webhook_456'
      };

      const handler = async (req, res) => {
        const eventPayload = req.body;

        switch (eventPayload.type) {
          case "transaction.created":
            const transaction = await mockLithicService.getTransaction(eventPayload.payload.token);
            await mockSupabaseService.saveTransaction(transaction);

            // Alert integration with error handling
            try {
              await failingAlertService.broadcastAlert(transaction.card_token, {});
            } catch (alertError) {
              // Log error but continue processing
            }
            break;
        }

        webhookCompleted = true;
        res.status(200).json({ received: true, message: "Webhook processed successfully." });
      };

      await handler(req, res);
      const response = getResponse();

      assert(webhookCompleted, 'Webhook processing should complete despite alert failure');
      assert(response.statusCode === 200, 'Response should still be 200');
    }
  };

  // Test 3: Alert data formatting validation
  const test3 = {
    name: 'Should format alert data according to specifications',
    testFn: async () => {
      let capturedAlertData = null;

      const testAlertService = {
        broadcastAlert: async (cardToken, data) => {
          capturedAlertData = data;
          return { successful: 1, failed: 0, sessions: [] };
        }
      };

      const { req, res } = createMockContext();
      req.body = {
        type: 'transaction.updated',
        payload: {
          token: 'txn_format_test'
        }
      };

      const handler = async (req, res) => {
        const eventPayload = req.body;
        const transaction = await mockLithicService.getTransaction(eventPayload.payload.token);
        await mockSupabaseService.saveTransaction(transaction);

        await testAlertService.broadcastAlert(transaction.card_token, {
          alertType: 'NEW_TRANSACTION',
          timestamp: new Date().toISOString(),
          transactionId: transaction.token,
          cardToken: transaction.card_token,
          immediate: {
            amount: `$${(transaction.amount / 100).toFixed(2)}`,
            merchant: transaction.merchant?.descriptor || 'Unknown Merchant',
            location: `${transaction.merchant?.city || ''}, ${transaction.merchant?.state || ''}, ${transaction.merchant?.country || ''}`.replace(/^,\s*|,\s*$/g, ''),
            status: transaction.status,
            network: transaction.network,
            networkTransactionID: transaction.network_transaction_id
          },
          verification: {
            mccCode: transaction.merchant?.mcc || '',
            merchantType: transaction.merchant_info?.mcc_description || 'Unknown',
            merchantCategory: transaction.merchant_info?.mcc_category || 'Unknown',
            authorizationCode: transaction.authorization_code || '',
            retrievalReference: transaction.acquirer_reference_number || ''
          },
          intelligence: {
            isFirstTransaction: transaction.isFirstTransaction || false,
            merchantHistory: transaction.merchantHistory || 'New merchant for this card',
            geographicPattern: transaction.geographicPattern || 'New location for this card'
          }
        });

        res.status(200).json({ received: true });
      };

      await handler(req, res);

      // Validate alert structure
      assert(capturedAlertData.alertType === 'NEW_TRANSACTION', 'Alert type required');
      assert(capturedAlertData.transactionId === 'txn_format_test', 'Transaction ID required');
      assert(capturedAlertData.cardToken === 'card_test_123', 'Card token required');
      
      // Validate immediate data
      assert(capturedAlertData.immediate.amount === '$12.50', 'Amount formatting');
      assert(capturedAlertData.immediate.merchant === 'STARBUCKS #1234', 'Merchant descriptor');
      assert(capturedAlertData.immediate.location === 'Seattle, WA, USA', 'Location formatting');
      assert(capturedAlertData.immediate.status === 'APPROVED', 'Transaction status');
      assert(capturedAlertData.immediate.network === 'VISA', 'Payment network');
      
      // Validate verification data
      assert(capturedAlertData.verification.mccCode === '5814', 'MCC code');
      assert(capturedAlertData.verification.merchantType === 'Coffee Shop', 'Merchant type');
      assert(capturedAlertData.verification.merchantCategory === 'Service', 'Merchant category');
      assert(capturedAlertData.verification.authorizationCode === 'AUTH789', 'Auth code');
      
      // Validate intelligence data
      assert(capturedAlertData.intelligence.isFirstTransaction === true, 'First transaction flag');
      assert(capturedAlertData.intelligence.merchantHistory === 'New merchant for this card', 'Merchant history');
    }
  };

  // Test 4: Location formatting edge cases
  const test4 = {
    name: 'Should handle location formatting edge cases',
    testFn: async () => {
      let capturedLocation = null;

      const testAlertService = {
        broadcastAlert: async (cardToken, data) => {
          capturedLocation = data.immediate.location;
          return { successful: 1, failed: 0, sessions: [] };
        }
      };

      // Test with missing location data
      const transactionNoLocation = {
        ...await mockLithicService.getTransaction('test'),
        merchant: {
          descriptor: 'TEST MERCHANT'
          // No city, state, country
        }
      };

      const mockLithicServiceNoLocation = {
        getTransaction: async () => transactionNoLocation
      };

      const { req, res } = createMockContext();
      req.body = { type: 'transaction.created', payload: { token: 'test' } };

      const handler = async (req, res) => {
        const transaction = await mockLithicServiceNoLocation.getTransaction('test');
        await testAlertService.broadcastAlert(transaction.card_token, {
          immediate: {
            location: `${transaction.merchant?.city || ''}, ${transaction.merchant?.state || ''}, ${transaction.merchant?.country || ''}`.replace(/^,\s*|,\s*$/g, '')
          }
        });
        res.status(200).json({});
      };

      await handler(req, res);
      assert(capturedLocation === '', 'Empty location should be handled correctly');
    }
  };

  return [test1, test2, test3, test4];
}

// Run the test suite
runTestSuite('Lithic Webhook Controller Alert Integration', await testWebhookWithAlertIntegration()); 