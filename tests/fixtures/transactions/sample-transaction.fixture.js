/**
 * Sample transaction fixtures for testing
 */

export const sampleTransaction = {
  token: "txn_01234567890abcdef",
  card_token: "card_01234567890abcdef", 
  amount: 1250, // $12.50 in cents
  status: "APPROVED",
  network: "VISA",
  network_transaction_id: "534166510230471",
  authorization_code: "123456",
  acquirer_reference_number: "REF789",
  merchant: {
    descriptor: "Starbucks #1234",
    mcc: "5814",
    acceptor_id: "STAR123456789",
    city: "Seattle",
    state: "WA", 
    country: "USA"
  },
  merchant_info: {
    mcc_description: "Fast Food Restaurants",
    mcc_category: "Food & Dining"
  },
  created: "2024-01-15T10:30:00Z",
  settled_amount: 1250,
  currency: "USD"
};

export const scammerTransaction = {
  token: "txn_scammer123456789",
  card_token: "card_honeypot123456789",
  amount: 100, // $1.00 verification transaction
  status: "APPROVED", 
  network: "VISA",
  network_transaction_id: "999888777666555",
  authorization_code: "999888",
  acquirer_reference_number: "SCAM001",
  merchant: {
    descriptor: "Global Teleserv",
    mcc: "5966", // Scam-prone MCC
    acceptor_id: "SCAM987654321",
    city: "Lagos",
    state: "NG",
    country: "NGA"
  },
  merchant_info: {
    mcc_description: "Direct Marketing - Outbound Telemarketing",
    mcc_category: "Professional Services"
  },
  created: "2024-01-15T14:25:00Z",
  settled_amount: 100,
  currency: "USD",
  // Additional intelligence flags
  isFirstTransaction: true,
  merchantHistory: "New merchant for this card",
  geographicPattern: "Unusual location - Nigeria"
};

export const multipleTransactions = [
  {
    ...sampleTransaction,
    token: "txn_001",
    amount: 500,
    merchant: { ...sampleTransaction.merchant, descriptor: "McDonald's #5678" }
  },
  {
    ...sampleTransaction, 
    token: "txn_002",
    amount: 1000,
    merchant: { ...sampleTransaction.merchant, descriptor: "Shell Gas #9012" }
  },
  {
    ...scammerTransaction,
    token: "txn_003", 
    amount: 100
  }
];

export const failedTransaction = {
  ...sampleTransaction,
  token: "txn_failed123456789",
  status: "DECLINED",
  result: "CARD_CLOSED",
  amount: 2500
};

export const pendingTransaction = {
  ...sampleTransaction,
  token: "txn_pending123456789", 
  status: "PENDING",
  result: "AUTHORIZATION_PENDING",
  amount: 7500
}; 