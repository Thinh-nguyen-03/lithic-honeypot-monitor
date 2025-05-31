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


🏗 Enhanced Architecture Overview
Real-Time System Flow
Scammer Uses Card → Lithic Webhook → Transaction Processor → Real-Time Alert System → Vapi AI Agent
                                                    ↓
                              Transaction Intelligence API ← AI Agent Query
Key Components

Real-Time Alert Manager: Manages active AI agent connections and transaction broadcasts
Transaction Intelligence Service: Comprehensive transaction data analysis and formatting
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


🧠 Transaction Data Framework
Scammer Verification Data Points
Based on current codebase capabilities, AI agents will know:
Transaction Basics

Exact amount and currency
Merchant name and descriptor
Merchant MCC code, description, and category
Complete address (city, state, country)
Transaction timestamp (precise to seconds)
Authorization code and retrieval reference
Payment network (Visa, Mastercard, etc.) and network specific transaction ID

Merchant Intelligence

Merchant MCC code and its matching description and category from the Supabase database
Merchant acceptor ID
Historical transaction patterns with this merchant
First-time merchant flag

Verification Questions Enabled

"What did you just buy?" (Test merchant recognition)
"How much was the transaction?" (Test amount accuracy)
"Where are you shopping?" (Test location awareness)
"What time did you make the purchase?" (Test timestamp accuracy)
"What type of business is that?" (Test merchant category knowledge)

🎪 Scammer Interaction Scenarios
Real-Time Verification Flow

Scammer uses honeypot card for $1 verification transaction
AI agent receives instant alert with full transaction data
Agent initiates verification with questions based on transaction data
Pattern analysis identifies discrepancies between scammer claims and actual transaction
Dynamic questioning based on real-time transaction patterns

Example Verification Scenario
[Transaction occurs: $1.00 at Shell Gas Station, Main St, Dallas, TX]

Agent: "I see you just made a transaction. Can you tell me what you purchased?"
Scammer: "I bought coffee at Starbucks"
Agent: [Knows it was gas station] "That's interesting. What location was that?"
Scammer: "The one on Broadway"
Agent: [Knows it was Main St] "Can you confirm the exact amount?"
Scammer: "About $5"
Agent: [Knows it was $1.00] "I'm seeing some inconsistencies..."

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