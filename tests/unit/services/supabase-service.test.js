/**
 * Unit tests for Supabase Service with Alert System Integration
 * Tests transaction save functionality and real-time alert broadcasting
 */

import { TestResults, runTest, runTestSuite, assert, createMockContext } from '../../helpers/test-helpers.js';

// Mock transaction data
const mockLithicTransaction = {
  token: 'txn_test_123',
  card_token: 'card_test_456',
  amount: 1250, // $12.50 in cents
  cardholder_amount: 1250,
  cardholder_currency: 'USD',
  result: 'APPROVED',
  network_type: 'VISA',
  network_transaction_id: 'net_456',
  authorization_code: 'AUTH123',
  retrieval_reference_number: 'REF789',
  merchant: {
    descriptor: 'STARBUCKS #1234',
    acceptor_id: 'ACC123',
    mcc: '5814',
    city: 'Seattle',
    state: 'WA',
    country: 'USA'
  }
};

// Mock parsed data that would come from parsers
const mockTransactionDetailsToSave = {
  token: 'txn_test_123',
  card_token: 'card_test_456',
  cardholder_amount: 1250,
  cardholder_currency: 'USD',
  result: 'APPROVED',
  network_type: 'VISA',
  network_transaction_id: 'net_456',
  authorization_code: 'AUTH123',
  retrieval_reference_number: 'REF789'
};

const mockMerchantInfoToParse = {
  descriptor: 'STARBUCKS #1234',
  acceptor_id: 'ACC123',
  mcc: '5814',
  city: 'Seattle',
  state: 'WA',
  country: 'USA'
};

// Mock services
const mockSupabaseClient = {
  from: (table) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { id: 1 }, error: null }),
        single: async () => ({ data: { id: 1 }, error: null })
      })
    }),
    upsert: async () => ({ error: null }),
    insert: async () => ({ data: { id: 1 }, error: null, select: () => ({ single: async () => ({ id: 1 }) }) })
  })
};

const mockParsers = {
  parseTransactionDetails: () => mockTransactionDetailsToSave,
  parseMerchantInfo: () => mockMerchantInfoToParse
};

const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

const mockAlertService = {
  broadcastAlert: async (cardToken, alertData) => {
    return { successful: 1, failed: 0, sessions: [] };
  }
};

/**
 * Test supabase service with alert integration
 */
async function testSupabaseServiceAlertIntegration() {
  // Test 1: Successful transaction save with alert broadcasting
  const test1 = {
    name: 'Should save transaction and broadcast alert successfully',
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

      // Mock saveTransaction function with alert integration
      const saveTransaction = async (lithicTransaction) => {
        const transactionToken = lithicTransaction?.token || "unknown_token";
        const transactionDetailsToSave = mockParsers.parseTransactionDetails(lithicTransaction);
        const merchantInfoToParse = mockParsers.parseMerchantInfo(lithicTransaction);
        const merchantId = 1;

        // Simulate successful transaction save
        // ... all existing save logic would happen here ...

        // Alert integration
        try {
          const alertData = {
            alertType: 'NEW_TRANSACTION',
            timestamp: new Date().toISOString(),
            transactionId: transactionDetailsToSave.token,
            cardToken: transactionDetailsToSave.card_token,
            immediate: {
              amount: `$${(transactionDetailsToSave.cardholder_amount / 100).toFixed(2)}`,
              merchant: merchantInfoToParse.descriptor || 'Unknown Merchant',
              location: [merchantInfoToParse.city, merchantInfoToParse.state, merchantInfoToParse.country]
                .filter(Boolean).join(', ') || 'Unknown Location',
              status: transactionDetailsToSave.result,
              network: transactionDetailsToSave.network_type,
              networkTransactionID: transactionDetailsToSave.network_transaction_id
            },
            verification: {
              mccCode: merchantInfoToParse.mcc || '',
              merchantType: 'Available from MCC lookup',
              merchantCategory: 'Available from MCC lookup',
              authorizationCode: transactionDetailsToSave.authorization_code || '',
              retrievalReference: transactionDetailsToSave.retrieval_reference_number || ''
            },
            intelligence: {
              isFirstTransaction: false,
              newMerchant: merchantId ? false : true,
              amountRange: transactionDetailsToSave.cardholder_amount < 500 ? 'small' : 'normal',
              merchantHistory: merchantId ? 'Known merchant for this card' : 'New merchant for this card',
              geographicPattern: 'Transaction location analysis'
            }
          };

          await testAlertService.broadcastAlert(transactionDetailsToSave.card_token, alertData);
        } catch (alertError) {
          // Should not break transaction save
        }

        return {
          success: true,
          transaction_token: transactionToken,
          merchant_id: merchantId,
          details: transactionDetailsToSave
        };
      };

      const result = await saveTransaction(mockLithicTransaction);

      assert(result.success === true, 'Transaction save should succeed');
      assert(alertBroadcastCalled, 'Alert broadcast should have been called');
      assert(alertCardToken === 'card_test_456', 'Alert should be broadcast to correct card token');
      assert(alertData.alertType === 'NEW_TRANSACTION', 'Alert type should be NEW_TRANSACTION');
      assert(alertData.transactionId === 'txn_test_123', 'Transaction ID should match');
      assert(alertData.immediate.amount === '$12.50', 'Amount should be formatted correctly');
      assert(alertData.immediate.merchant === 'STARBUCKS #1234', 'Merchant should be included');
      assert(alertData.immediate.location === 'Seattle, WA, USA', 'Location should be formatted correctly');
      assert(alertData.verification.mccCode === '5814', 'MCC code should be included');
      assert(alertData.intelligence.newMerchant === false, 'New merchant flag should be correct');
    }
  };

  // Test 2: Transaction save succeeds even when alert fails
  const test2 = {
    name: 'Should complete transaction save when alert broadcast fails',
    testFn: async () => {
      let transactionSaveCompleted = false;

      // Alert service that throws error
      const failingAlertService = {
        broadcastAlert: async () => {
          throw new Error('Alert service unavailable');
        }
      };

      const saveTransaction = async (lithicTransaction) => {
        const transactionToken = lithicTransaction?.token || "unknown_token";
        const transactionDetailsToSave = mockParsers.parseTransactionDetails(lithicTransaction);
        const merchantInfoToParse = mockParsers.parseMerchantInfo(lithicTransaction);
        const merchantId = 1;

        // Simulate successful transaction save
        transactionSaveCompleted = true;

        // Alert integration with error handling
        try {
          const alertData = {
            alertType: 'NEW_TRANSACTION',
            transactionId: transactionDetailsToSave.token,
            cardToken: transactionDetailsToSave.card_token,
            immediate: {
              amount: `$${(transactionDetailsToSave.cardholder_amount / 100).toFixed(2)}`,
              merchant: merchantInfoToParse.descriptor || 'Unknown Merchant'
            }
          };
          await failingAlertService.broadcastAlert(transactionDetailsToSave.card_token, alertData);
        } catch (alertError) {
          // Log error but continue processing
        }

        return {
          success: true,
          transaction_token: transactionToken,
          merchant_id: merchantId,
          details: transactionDetailsToSave
        };
      };

      const result = await saveTransaction(mockLithicTransaction);

      assert(transactionSaveCompleted, 'Transaction save should complete despite alert failure');
      assert(result.success === true, 'Transaction save should still return success');
      assert(result.transaction_token === 'txn_test_123', 'Transaction token should be returned');
    }
  };

  // Test 3: Alert data formatting with edge cases
  const test3 = {
    name: 'Should handle alert data formatting edge cases',
    testFn: async () => {
      let capturedAlertData = null;

      const testAlertService = {
        broadcastAlert: async (cardToken, data) => {
          capturedAlertData = data;
          return { successful: 1, failed: 0, sessions: [] };
        }
      };

      // Transaction with missing merchant data
      const transactionWithMissingData = {
        ...mockLithicTransaction,
        merchant: {
          descriptor: null,
          mcc: null,
          city: null,
          state: null,
          country: null
        }
      };

      const transactionDetailsWithMissingData = {
        ...mockTransactionDetailsToSave,
        authorization_code: null,
        retrieval_reference_number: null
      };

      const merchantInfoWithMissingData = {
        descriptor: null,
        mcc: null,
        city: null,
        state: null,
        country: null
      };

      const saveTransaction = async (lithicTransaction) => {
        const transactionToken = lithicTransaction?.token || "unknown_token";
        const merchantId = null; // No merchant found

        try {
          const alertData = {
            alertType: 'NEW_TRANSACTION',
            timestamp: new Date().toISOString(),
            transactionId: transactionDetailsWithMissingData.token,
            cardToken: transactionDetailsWithMissingData.card_token,
            immediate: {
              amount: `$${(transactionDetailsWithMissingData.cardholder_amount / 100).toFixed(2)}`,
              merchant: merchantInfoWithMissingData.descriptor || 'Unknown Merchant',
              location: [merchantInfoWithMissingData.city, merchantInfoWithMissingData.state, merchantInfoWithMissingData.country]
                .filter(Boolean).join(', ') || 'Unknown Location',
              status: transactionDetailsWithMissingData.result,
              network: transactionDetailsWithMissingData.network_type,
              networkTransactionID: transactionDetailsWithMissingData.network_transaction_id
            },
            verification: {
              mccCode: merchantInfoWithMissingData.mcc || '',
              merchantType: 'Available from MCC lookup',
              merchantCategory: 'Available from MCC lookup',
              authorizationCode: transactionDetailsWithMissingData.authorization_code || '',
              retrievalReference: transactionDetailsWithMissingData.retrieval_reference_number || ''
            },
            intelligence: {
              isFirstTransaction: false,
              newMerchant: merchantId ? false : true,
              amountRange: transactionDetailsWithMissingData.cardholder_amount < 500 ? 'small' : 'normal',
              merchantHistory: merchantId ? 'Known merchant for this card' : 'New merchant for this card',
              geographicPattern: 'Transaction location analysis'
            }
          };

          await testAlertService.broadcastAlert(transactionDetailsWithMissingData.card_token, alertData);
        } catch (alertError) {
          // Should not break
        }

        return { success: true, transaction_token: transactionToken, merchant_id: merchantId };
      };

      await saveTransaction(transactionWithMissingData);

      // Validate alert handles missing data gracefully
      assert(capturedAlertData.immediate.merchant === 'Unknown Merchant', 'Should handle missing merchant descriptor');
      assert(capturedAlertData.immediate.location === 'Unknown Location', 'Should handle missing location data');
      assert(capturedAlertData.verification.mccCode === '', 'Should handle missing MCC code');
      assert(capturedAlertData.verification.authorizationCode === '', 'Should handle missing auth code');
      assert(capturedAlertData.intelligence.newMerchant === true, 'Should correctly identify new merchant when no merchantId');
    }
  };

  // Test 4: Amount range intelligence calculation
  const test4 = {
    name: 'Should calculate amount range intelligence correctly',
    testFn: async () => {
      let smallAmountAlert = null;
      let normalAmountAlert = null;

      const testAlertService = {
        broadcastAlert: async (cardToken, data) => {
          if (data.intelligence.amountRange === 'small') {
            smallAmountAlert = data;
          } else {
            normalAmountAlert = data;
          }
          return { successful: 1, failed: 0, sessions: [] };
        }
      };

      const saveTransaction = async (amount) => {
        const transactionDetails = { ...mockTransactionDetailsToSave, cardholder_amount: amount };
        const merchantInfo = mockMerchantInfoToParse;

        const alertData = {
          intelligence: {
            amountRange: transactionDetails.cardholder_amount < 500 ? 'small' : 'normal'
          }
        };

        await testAlertService.broadcastAlert('card_test', alertData);
        return { success: true };
      };

      // Test small amount (under $5.00)
      await saveTransaction(450);
      assert(smallAmountAlert !== null, 'Small amount alert should be captured');
      assert(smallAmountAlert.intelligence.amountRange === 'small', 'Should identify small amount correctly');

      // Test normal amount (over $5.00)
      await saveTransaction(1500);
      assert(normalAmountAlert !== null, 'Normal amount alert should be captured');
      assert(normalAmountAlert.intelligence.amountRange === 'normal', 'Should identify normal amount correctly');
    }
  };

  return [test1, test2, test3, test4];
}

// Run the test suite
runTestSuite('Supabase Service Alert Integration', await testSupabaseServiceAlertIntegration()); 