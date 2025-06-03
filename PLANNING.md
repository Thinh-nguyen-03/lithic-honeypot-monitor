PLANNING.md
Honeypot Transaction Monitoring System - Real-Time AI Integration
🎯 Project Overview
Transform the existing honeypot transaction monitoring system into a sophisticated fraud detection platform by integrating real-time conversational AI capabilities. The system enables AI agents to receive instant transaction alerts and access comprehensive transaction data during live scammer interactions.
🚀 Primary Objective
Create a real-time alert system where Vapi AI agents are immediately notified of new transactions on honeypot virtual cards, enabling dynamic scammer verification and fraud detection during live conversations.

📋 Current System Foundation
Existing Architecture

Runtime: Node.js with ES Modules
Financial Simulation: Lithic API integration for virtual cards and transactions
Database: Supabase (PostgreSQL) with normalized schema
API Server: Express.js with webhook handling
Logging: Pino structured logging
Background Jobs: Transaction polling and processing

Core Capabilities Already Implemented

Virtual card creation and management
Real-time transaction simulation and processing
Webhook-based transaction ingestion from Lithic
Sophisticated merchant matching and categorization
MCC code lookup with caching
Comprehensive transaction reporting and analytics
Robust error handling and logging


🎯 Enhanced Scope & Objectives
Primary Goal
Implement real-time transaction alerting system that instantly notifies Vapi AI agents of new transactions during active conversations, enabling immediate scammer verification and fraud detection.
Key Deliverables

Bug Fixes: Resolve critical runtime issues
Request Validation: Enterprise-grade input validation and error handling
Real-Time Alert System: WebSocket or SSE-based transaction notifications
Transaction Intelligence API: Comprehensive transaction data access for AI agents
Vapi Integration: MCP server with real-time capabilities

Success Criteria

Sub-second transaction alert delivery to active AI agents
Zero message loss during high-frequency transaction scenarios
Comprehensive transaction intelligence for scammer verification
Enterprise-grade error handling and resilience
Scalable real-time architecture


🛠 Technology Stack
Core Technologies

Backend: Node.js (ES Modules)
Web Framework: Express.js
Database: Supabase (PostgreSQL)
External APIs: Lithic Financial API
AI Integration: Vapi with MCP (Model Context Protocol)
Real-Time Communication: Server-Sent Events (SSE) or WebSockets
Logging: Pino
Validation: Joi

New Dependencies
json{
  "joi": "^17.x.x",           // Request validation
  "ws": "^8.x.x",             // WebSocket support (if chosen over SSE)
  "uuid": "^9.x.x"            // Unique session/connection tracking
}
Development Tools

Testing: Postman for API endpoint testing
Monitoring: Built-in health checks and metrics
Documentation: JSDoc comments

📋 Enhanced MCP (Model Context Protocol) Tools

The system now provides comprehensive card access tools for AI agents to interact with honeypot cards during scammer verification scenarios.

## Core MCP Tools

### Real-Time Alert Tools
- `subscribe_to_alerts`: Subscribe to real-time transaction alerts for specific honeypot cards
- `unsubscribe_from_alerts`: Remove alert subscriptions and clean up sessions
- `get_subscription_status`: Check connection health and subscription details

### Transaction Intelligence Tools
- `search_transactions`: Natural language transaction queries with time/amount/merchant filtering
- `get_transaction_details`: Comprehensive transaction information for verification
- `get_recent_transactions`: Latest transactions with intelligent analysis
- `get_merchant_info`: Merchant intelligence for verification scenarios

### **Enhanced Card Access Tools** ✨ **NEW**
- `list_available_cards`: List all honeypot cards with filtering options
- `get_card_details`: **Complete card information including PAN for scammer verification**
- `get_card_info`: Enhanced card information with verification scenarios

## Card Access Tool Details

### `list_available_cards`
**Purpose**: List all available honeypot cards for scammer testing
**Parameters**:
- `includeDetails` (boolean): Include additional card metadata
- `activeOnly` (boolean): Filter for only OPEN/active cards
- `includeTransactionHistory` (boolean): Include recent transaction count

**Response Structure**:
```json
{
  "tool": "list_available_cards",
  "success": true,
  "availableCards": [
    {
      "cardToken": "card_honeypot_123",
      "lastFour": "1234",
      "state": "OPEN",
      "type": "VIRTUAL",
      "spendLimit": "$1.00",
      "limitDuration": "TRANSACTION",
      "memo": "Honeypot Card 1",
      "created": "2024-01-15T10:00:00Z"
    }
  ],
  "cardCount": 2,
  "recommendations": [
    "Use these cards for scammer verification calls",
    "Active cards are available for immediate testing",
    "Card PAN numbers available through get_card_details tool"
  ],
  "verificationQuestions": {
    "suggestions": [
      "Ask scammer to verify the last 4 digits of their card",
      "Request the full card number for verification",
      "Ask about recent transaction amounts or merchants"
    ]
  }
}
```

### `get_card_details` ⚠️ **SENSITIVE**
**Purpose**: **Get complete card information including PAN for scammer verification**
**Parameters**:
- `cardToken` (required): Specific honeypot card token

**Security Features**:
- All access logged with HIGH sensitivity level
- Request ID tracking for audit trails
- Masked card tokens in security logs
- Rate limiting monitoring framework

**Response Structure**:
```json
{
  "tool": "get_card_details",
  "success": true,
  "cardToken": "card_honeypot_123",
  "cardDetails": {
    "pan": "4111111111111234",  // ⚠️ FULL PAN FOR VERIFICATION
    "lastFour": "1234",
    "state": "OPEN",
    "type": "VIRTUAL",
    "spendLimit": "$1.00",
    "limitDuration": "TRANSACTION",
    "memo": "Honeypot Card 1",
    "created": "2024-01-15T10:00:00Z"
  },
  "securityNote": "PAN number included for scammer verification purposes",
  "verificationData": {
    "fullCardNumber": "4111111111111234",
    "lastFourDigits": "1234",
    "suggestions": [
      "Ask scammer to read back the full card number",
      "Verify they can see the correct last 4 digits",
      "Test their knowledge of card details"
    ]
  },
  "warnings": [
    "This is sensitive payment card data",
    "Use only for legitimate scammer verification",
    "All access is logged for security monitoring"
  ]
}
```

### `get_card_info` (Enhanced)
**Purpose**: Enhanced card information with verification scenarios
**Parameters**:
- `cardToken` (optional): Specific card token for detailed info

**Enhanced Features**:
- Returns actual card data when cardToken provided
- Includes scammer testing scenarios and red flags
- Provides verification questions based on real card data

**Response Structure** (with cardToken):
```json
{
  "tool": "get_card_info",
  "success": true,
  "cardToken": "card_honeypot_456",
  "cardInfo": {
    "lastFour": "5678",
    "state": "OPEN",
    "type": "VIRTUAL",
    "spendLimit": "$0.50",
    "memo": "Honeypot Card 2"
  },
  "detailedInfo": {
    "fullPAN": "4111111111115678",
    "created": "2024-01-15T09:30:00Z",
    "limitDuration": "TRANSACTION"
  },
  "verificationData": {
    "expectedLastFour": "5678",
    "cardNumber": "4111111111115678",
    "verificationQuestions": [
      "What are the last 4 digits of your card ending in 5678?",
      "Can you read me the full card number for verification?",
      "Is your card currently open?"
    ]
  },
  "scammerTesting": {
    "scenario": "Card verification call",
    "expectedBehavior": "Scammer should provide card details that match this data",
    "redFlags": [
      "Refuses to provide card number",
      "Provides different last 4 digits",
      "Claims card is in different state"
    ]
  }
}
```

## Enhanced Security Considerations

### Card Data Access Security
- **High-Sensitivity Logging**: All PAN access logged with masked tokens
- **Request ID Tracking**: Unique identifiers for audit trails
- **Rate Limiting Framework**: Monitoring for suspicious access patterns
- **Security Pattern Detection**: Identifies suspicious card tokens and injection attempts

### Validation & Monitoring
- **Enhanced Token Validation**: 8-50 character alphanumeric format with underscores/dashes
- **Suspicious Pattern Detection**: Repeated characters, test values, injection attempts
- **Access Analytics**: Success rates, error tracking, health status monitoring
- **Comprehensive Logging**: IP addresses, user agents, request context

### Production Safeguards
- **Fallback Mechanisms**: Intelligent error handling for read vs write operations
- **Service Resilience**: Graceful degradation during API outages
- **Health Monitoring**: Real-time service status and performance metrics
- **Error Classification**: Network errors, rate limits, temporary failures

🏗 Enhanced Architecture Overview
Real-Time System Flow
Scammer Uses Card → Lithic Webhook → Transaction Processor → Real-Time Alert System → Vapi AI Agent
                                                    ↓
                              Transaction Intelligence API ← AI Agent Query
                                        ↓
                              **Enhanced Card Access API** ← AI Agent Card Verification
Key Components

Real-Time Alert Manager: Manages active AI agent connections and transaction broadcasts
Transaction Intelligence Service: Comprehensive transaction data analysis and formatting
**Enhanced Card Access Service**: Secure card data access with validation and monitoring ✨ **NEW**
Validation Middleware: Enterprise-grade request sanitization and validation
MCP Server: AI-to-database communication bridge with real-time capabilities
Connection Manager: Handles AI agent connection lifecycle and message delivery
Alert Formatter: Converts transaction data into AI-optimized alert format


📂 Implementation Structure
New Files to Create
src/
├── middleware/
│   └── validation.js                    # Enterprise-grade request validation
├── services/
│   ├── alert-service.js                 # Real-time alert management
│   ├── connection-manager.js            # AI agent connection tracking
├── api/routes/
│   ├── alert-routes.js                  # Real-time alert endpoints
│   └── vapi-mcp-routes.js              # Vapi MCP integration with real-time
└── api/controllers/
    ├── alert-controller.js              # Real-time alert handling
    └── vapi-mcp-controller.js           # MCP query handling with intelligence
Files to Modify
src/
├── api/server.js                        # Add real-time capabilities and new routes
├── api/controllers/lithic-webhook-controller.js  # Add real-time alert triggers
└── services/supabase-service.js         # Add alert triggers after transaction save

🚨 Real-Time Alert System Design
Transaction Alert Payload
When a new transaction occurs, AI agents receive:
json{
  "alertType": "NEW_TRANSACTION",
  "timestamp": "2024-01-15T10:30:00Z",
  "transactionId": "txn_abc123",
  "cardToken": "card_xyz789",
  "immediate": {
    "amount": "$12.45",
    "mcc": "Starbucks #1234" (use the descriptor column from the merchants table from supabase for this),
    "location": "Seattle, WA, USA",
    "status": "APPROVED",
    "network": "VISA",
    "networkTransactionID": "534166510230471"
  },
  "verification": {
    "mccCode": "5814",
    "merchantType": "Coffee Shop" (use the mcc_description column from the merchants table from supabase for this),
    "merchantCategory": "Service" (use the mcc_category column from the merchants table from supabase for this),
    "authorizationCode": "123456",
    "retrievalReference": "REF789"
  },
  "intelligence": {
    "isFirstTransaction": true,
    "merchantHistory": "New merchant for this card",
    "geographicPattern": "New location for this card"
  }
}
Connection Management

Active Agent Tracking: Maintain registry of connected AI agents
Session Management: Associate agents with specific honeypot cards
Message Delivery: Guaranteed delivery with fallback mechanisms
Connection Health: Monitor and recover from connection failures


🧠 **Enhanced Transaction & Card Data Framework**
Scammer Verification Data Points
Based on current codebase capabilities, AI agents will know:

**Transaction Basics**
- Exact amount and currency
- Merchant name and descriptor
- Merchant MCC code, description, and category
- Complete address (city, state, country)
- Transaction timestamp (precise to seconds)
- Authorization code and retrieval reference
- Payment network (Visa, Mastercard, etc.) and network specific transaction ID

**Merchant Intelligence**
- Merchant MCC code and its matching description and category from the Supabase database
- Merchant acceptor ID
- Historical transaction patterns with this merchant
- First-time merchant flag

**🔐 Enhanced Card Access Data** ✨ **NEW**
- **Complete PAN (Primary Account Number)** for verification
- Last 4 digits for basic verification
- Card state (OPEN, PAUSED, CLOSED)
- Card type (VIRTUAL, PHYSICAL)
- Spending limits and duration
- Card creation date and memo
- Real-time card status

**Enhanced Verification Questions Enabled**
- "What did you just buy?" (Test merchant recognition)
- "How much was the transaction?" (Test amount accuracy)
- "Where are you shopping?" (Test location awareness)
- "What time did you make the purchase?" (Test timestamp accuracy)
- "What type of business is that?" (Test merchant category knowledge)
- **"Can you read me your full card number for verification?"** ✨ **NEW**
- **"What are the last 4 digits of your card?"** ✨ **NEW**
- **"Is your card currently active or paused?"** ✨ **NEW**

🎪 **Enhanced Scammer Interaction Scenarios**

## Scenario 1: Real-Time Transaction + Card Verification
**Setup**: AI agent receives real-time transaction alert + has card access tools

```
[Transaction occurs: $1.00 at Shell Gas Station, Main St, Dallas, TX]
[AI agent uses get_card_details to get PAN: 4111111111111234]

Agent: "I see you just made a transaction. Can you tell me what you purchased?"
Scammer: "I bought coffee at Starbucks"
Agent: [Knows it was gas station] "Interesting. Can you verify your card information?"
Scammer: "Sure, what do you need?"
Agent: "Can you read me the full card number you just used?"
Scammer: "Umm, it's 4532... something"
Agent: [Knows it's 4111111111111234] "That doesn't match our records. The number should start with 4111..."
```

## Scenario 2: Card Number Verification Without Transaction
**Setup**: AI agent uses card access tools proactively during suspicious call

```
[Scammer claims to need help with their card]
[AI agent uses list_available_cards to see options]
[AI agent selects specific card and uses get_card_details]

Agent: "I can help verify your account. What are the last 4 digits of your card?"
Scammer: "It ends in 9876"
Agent: [Knows from card data it should be 1234] "I'm showing a different number. Can you double-check?"
Scammer: "Oh, maybe it's 1234"
Agent: [Confirms match] "That's correct. Now, can you read me the full 16-digit number?"
Scammer: "4111 1111 1111 1234"
Agent: [Perfect match] "Thank you. Now I have some specific questions about your recent activity..."
```

## Scenario 3: Multi-Card Verification Testing
**Setup**: AI agent tests scammer knowledge across multiple honeypot cards

```
[AI agent uses list_available_cards to see all options]
[Multiple cards available: ending in 1234, 5678, 9012]

Agent: "I see multiple cards on your account. Let's verify the one you're calling about."
Scammer: "The one ending in 5555"
Agent: [Knows no card ends in 5555] "I don't see that card. We have cards ending in 1234, 5678, and 9012."
Scammer: "Oh right, the 5678 one"
Agent: [Uses get_card_details for card ending in 5678] "Can you confirm the full number for that card?"
Scammer: [Likely can't provide correct number]
Agent: "I'm detecting some inconsistencies in your responses..."
```

## **Enhanced Real-Time Verification Flow** ✨ **UPDATED**

1. **Scammer uses honeypot card** for verification transaction
2. **AI agent receives instant alert** with full transaction data
3. **AI agent accesses card details** using get_card_details tool for PAN
4. **Agent initiates dual verification**: transaction + card data
5. **Pattern analysis identifies discrepancies** between claimed and actual data
6. **Dynamic questioning** based on real-time transaction patterns AND card verification
7. **Enhanced scammer detection** through multiple verification vectors

## **Example Enhanced Verification Scenario**

```
[Transaction occurs: $1.00 at Shell Gas Station, Main St, Dallas, TX]
[AI agent gets transaction alert AND card PAN: 4111111111111234]

Agent: "Hello, I'm calling about some recent activity on your account."
Scammer: "Yes, I just made a purchase"
Agent: "Can you tell me what you purchased and where?"
Scammer: "I bought coffee at Starbucks on Broadway"
Agent: [Transaction data shows Shell Gas Station on Main St] "I'm showing different information. Let me verify your card details."
Agent: "Can you read me the full card number you used?"
Scammer: "4532-1234-5678-9012"
Agent: [Card data shows 4111111111111234] "That doesn't match our records. The correct number starts with 4111."
Scammer: "Oh, let me check... 4111..."
Agent: [Now has confirmed scammer doesn't have the card] "I'm going to need to transfer you to our fraud department for additional verification."
```

## **Card Access Security Integration**

**Security Features During Verification**:
- All card PAN access logged with HIGH sensitivity
- Request tracking for audit trails
- Rate limiting monitoring for suspicious patterns
- Comprehensive logging of verification attempts

**Verification Red Flags**:
- Scammer can't provide correct card number
- Claims different last 4 digits than actual
- States incorrect card status (active vs paused)
- Provides transaction details that don't match real data
- Attempts to avoid card number verification

**AI Agent Advantages**:
- **Dual Verification**: Transaction data + Card data = stronger verification
- **Real-time Cross-referencing**: Instant access to both transaction and card information
- **Pattern Detection**: Identifies inconsistencies across multiple data points
- **Enhanced Questioning**: Dynamic questions based on actual card and transaction data

⚠️ Risk Management & Enterprise Considerations
Technical Risks

Real-time Message Delivery: Mitigated by redundant delivery mechanisms
Connection Management: Addressed through robust session handling
Data Consistency: Ensured through transaction sequencing
System Scalability: Handled by efficient connection pooling

Mitigation Strategies

Enterprise-grade error handling and logging
Graceful degradation when real-time features fail
Comprehensive monitoring and alerting
Performance optimization for high-frequency scenarios
Security measures for sensitive transaction data

📈 Success Metrics
Technical Performance

Transaction alert delivery < 500ms from webhook receipt
99.9% message delivery success rate
Zero data loss during connection failures
API response times < 100ms for data queries

System Reliability

99.95% uptime for real-time services
Graceful handling of connection drops
Automatic recovery from service failures
Comprehensive audit logging for all transactions


🚀 Competitive Advantages
Innovation Highlights

Real-time Fraud Detection: Instant transaction verification during live conversations
Dynamic Scammer Analysis: Adaptive questioning based on real transaction data
Enterprise-grade Architecture: Production-ready design patterns and reliability
Comprehensive Intelligence: Deep transaction analysis and pattern recognition

Business Value Proposition

Advanced scammer detection and verification capabilities
Real-time fraud prevention and analysis
Sophisticated AI-driven conversation management
Scalable enterprise architecture for production deployment


📅 Implementation Timeline
Development Phases

Phase 1: Critical fixes and validation (30 minutes)
Phase 2: Real-time alert system (90 minutes)
Phase 3: Vapi integration with real-time capabilities (90 minutes)
Phase 4: Testing and optimization (60 minutes)

Total Estimated Time: 4.5 hours

🔮 Future Enhancements
Advanced Transaction Intelligence (Post-MVP)

Pattern Recognition: Advanced anomaly detection algorithms
Risk Assessment: Sophisticated scoring and threat analysis
Behavioral Analysis: Enhanced scammer behavior pattern detection
Machine Learning: Predictive fraud detection models

Enhanced Analytics (Post-MVP)

Real-time Dashboard: Live transaction monitoring interface
Advanced Reporting: Comprehensive fraud analysis reports
Performance Metrics: Detailed system performance analytics
Business Intelligence: Strategic insights and trend analysis

This planning document establishes the foundation for creating a sophisticated, enterprise-grade fraud detection system with real-time AI integration capabilities for advanced scammer verification and analysis.