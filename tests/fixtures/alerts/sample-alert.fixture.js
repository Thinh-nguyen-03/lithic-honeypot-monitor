/**
 * Sample alert fixtures for testing the alert service
 */

export const sampleAlert = {
  alertType: "NEW_TRANSACTION",
  timestamp: "2024-01-15T10:30:00Z",
  transactionId: "txn_01234567890abcdef",
  cardToken: "card_01234567890abcdef",
  immediate: {
    amount: "$12.50",
    merchant: "Starbucks #1234",
    location: "Seattle, WA, USA",
    status: "APPROVED",
    network: "VISA",
    networkTransactionId: "534166510230471"
  },
  verification: {
    mccCode: "5814",
    merchantType: "Fast Food Restaurants",
    merchantCategory: "Food & Dining",
    authorizationCode: "123456",
    retrievalReference: "REF789"
  },
  intelligence: {
    isFirstTransaction: false,
    merchantHistory: "Previous transactions at this merchant",
    geographicPattern: "Normal location for this card"
  }
};

export const scammerAlert = {
  alertType: "NEW_TRANSACTION",
  timestamp: "2024-01-15T14:25:00Z", 
  transactionId: "txn_scammer123456789",
  cardToken: "card_honeypot123456789",
  immediate: {
    amount: "$1.00",
    merchant: "Global Teleserv",
    location: "Lagos, NG, NGA",
    status: "APPROVED",
    network: "VISA", 
    networkTransactionId: "999888777666555"
  },
  verification: {
    mccCode: "5966",
    merchantType: "Direct Marketing - Outbound Telemarketing", 
    merchantCategory: "Professional Services",
    authorizationCode: "999888",
    retrievalReference: "SCAM001"
  },
  intelligence: {
    isFirstTransaction: true,
    merchantHistory: "New merchant for this card",
    geographicPattern: "Unusual location - Nigeria"
  }
};

export const suspiciousAlert = {
  alertType: "NEW_TRANSACTION",
  timestamp: "2024-01-15T16:45:00Z",
  transactionId: "txn_suspicious789",
  cardToken: "card_honeypot123456789", 
  immediate: {
    amount: "$0.01",
    merchant: "Win Big Promo",
    location: "Unknown Location",
    status: "APPROVED",
    network: "MASTERCARD",
    networkTransactionId: "111222333444555"
  },
  verification: {
    mccCode: "5966",
    merchantType: "Direct Marketing - Outbound Telemarketing",
    merchantCategory: "Professional Services", 
    authorizationCode: "111222",
    retrievalReference: "SUS001"
  },
  intelligence: {
    isFirstTransaction: true,
    merchantHistory: "High-risk merchant category",
    geographicPattern: "Location verification failed"
  }
};

export const connectionStatusAlert = {
  alertType: "CONNECTION_STATUS",
  timestamp: "2024-01-15T10:00:00Z",
  sessionId: "session_abc123",
  cardToken: "card_honeypot123456789",
  status: "CONNECTED",
  details: {
    agentId: "agent_vapi_001", 
    connectionType: "SSE",
    connectedAt: "2024-01-15T10:00:00Z"
  }
};

export const heartbeatAlert = {
  alertType: "HEARTBEAT", 
  timestamp: "2024-01-15T10:05:00Z",
  sessionId: "session_abc123",
  cardToken: "card_honeypot123456789",
  metrics: {
    activeConnections: 3,
    queuedMessages: 0,
    lastActivity: "2024-01-15T10:04:30Z"
  }
}; 