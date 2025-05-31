# 🍯 Honeypot Transaction Monitoring System

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18+-blue.svg)](https://expressjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green.svg)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Active%20Development-orange.svg)]()

> **Enterprise-grade fraud detection platform with real-time AI integration for advanced scammer verification and transaction monitoring.**

## 🎯 **Overview**

The Honeypot Transaction Monitoring System is a sophisticated fraud detection platform that leverages Lithic virtual cards as honeypots to detect and analyze fraudulent activities in real-time. The system integrates with AI agents to enable dynamic scammer verification during live conversations, providing comprehensive transaction intelligence for effective fraud prevention.

### **Key Value Propositions**

- **🚨 Real-Time Fraud Detection**: Sub-second transaction alerts to AI agents during live scammer interactions
- **🧠 Advanced Transaction Intelligence**: Comprehensive merchant analysis, pattern recognition, and verification data
- **🔒 Enterprise Security**: Bank-grade security with comprehensive validation and error handling
- **⚡ High Performance**: Optimized for high-frequency transaction processing with <100ms response times
- **🔗 Seamless Integration**: REST APIs and Server-Sent Events for easy AI agent integration

---

## 🚀 **Features**

### **✅ Implemented (v1.0)**

#### **Core Transaction Processing**
- Virtual card creation and management via Lithic API
- Real-time transaction webhook processing
- Comprehensive merchant data matching and categorization
- MCC (Merchant Category Code) analysis and caching
- Transaction pattern analysis and intelligence

#### **Real-Time Alert System**
- **Server-Sent Events (SSE)** for instant transaction notifications
- **Connection Management** with health monitoring and auto-recovery
- **Multi-Agent Support** with concurrent AI agent connections
- **Intelligent Alert Formatting** with scammer verification data points
- **Enterprise Error Handling** with graceful degradation

#### **Data Intelligence**
- Advanced transaction parsing and normalization
- Merchant verification and categorization
- Geographic pattern analysis
- Transaction history and trend analysis
- Real-time risk assessment metrics

#### **Enterprise Infrastructure**
- **Comprehensive Validation** with Joi-based request sanitization
- **Structured Logging** with Pino for production monitoring
- **Health Monitoring** with detailed system metrics
- **Extensive Testing** with 40+ unit and integration tests
- **Background Processing** with automated transaction polling

### **🔄 In Development**

#### **Enhanced Vapi Integration** (Tasks 4.1-4.4)
- Advanced MCP (Model Context Protocol) server implementation
- Real-time alert subscription management for AI agents
- Transaction data query API with historical analysis
- Enhanced conversation context integration

#### **System Integration** (Tasks 5.1-5.3)
- Complete route integration and middleware configuration
- Advanced health monitoring and performance metrics
- Production-ready deployment configuration

---

## 🛠 **Technology Stack**

### **Backend Infrastructure**
- **Runtime**: Node.js 18+ with ES Modules
- **Framework**: Express.js 4.18+ with enterprise middleware
- **Database**: Supabase (PostgreSQL) with real-time capabilities
- **External APIs**: Lithic Financial API for virtual cards

### **Real-Time & Communication**
- **Alert Delivery**: Server-Sent Events (SSE)
- **Connection Management**: Custom connection pooling and health monitoring
- **AI Integration**: Vapi with Model Context Protocol (MCP)

### **Security & Validation**
- **Request Validation**: Joi with comprehensive schema validation
- **Error Handling**: Enterprise-grade error isolation and recovery
- **Logging**: Structured logging with Pino for production monitoring

### **Development & Quality**
- **Testing**: Comprehensive unit, integration, and E2E test suites
- **Code Quality**: ESLint, Prettier, and enterprise coding standards
- **Monitoring**: Built-in health checks and performance metrics

---

## 📋 **Prerequisites**

- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher
- **Supabase** account and project
- **Lithic** API account and credentials
- **Git** for version control

---

## ⚡ **Quick Start**

### **1. Clone and Install**

```bash
git clone https://github.com/your-org/honeypot-transaction-monitoring-system.git
cd honeypot-transaction-monitoring-system
npm install
```

### **2. Environment Configuration**

Create a `.env` file in the root directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Lithic API Configuration
LITHIC_API_KEY=your_lithic_api_key
LITHIC_WEBHOOK_SECRET=your_webhook_secret

# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Real-Time Configuration
MAX_CONNECTIONS=100
CONNECTION_TIMEOUT=300000
HEARTBEAT_INTERVAL=30000
```

### **3. Database Setup**

Ensure your Supabase database has the required tables:
- `transactions` - Transaction records with full merchant data
- `merchants` - Merchant information with MCC mappings
- `cards` - Virtual card management and tracking

### **4. Start the System**

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Start API server only
npm run start:api

# Start background worker only
npm run start:worker
```

### **5. Verify Installation**

```bash
# Health check
curl http://localhost:3000/health

# Expected response:
{
  "status": "healthy",
  "service": "honeypot-transaction-monitor-api",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 🔧 **Usage Examples**

### **Real-Time Transaction Monitoring**

#### **Connect AI Agent to Alert Stream**

```bash
curl -N -H "Authorization: Bearer your_session_token" \
  "http://localhost:3000/api/alerts/stream/card_abc123?agentId=agent_456"
```

**Response (Server-Sent Events):**
```
event: welcome
data: {"sessionId":"uuid","agentId":"agent_456","status":"connected"}

event: transaction
data: {
  "alertType": "NEW_TRANSACTION",
  "transactionId": "txn_abc123",
  "immediate": {
    "amount": "$12.45",
    "merchant": "Starbucks #1234",
    "location": "Seattle, WA, USA",
    "status": "APPROVED"
  },
  "verification": {
    "mccCode": "5814",
    "merchantType": "Coffee Shop",
    "authorizationCode": "123456"
  },
  "intelligence": {
    "isFirstTransaction": true,
    "merchantHistory": "New merchant for this card"
  }
}
```

#### **Simulate Transaction (Webhook)**

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_token": "txn_test123",
    "card_token": "card_test123",
    "status": "APPROVED",
    "amount": 1245,
    "merchant": {
      "descriptor": "STARBUCKS #1234",
      "city": "Seattle",
      "state": "WA",
      "country": "USA",
      "mcc": "5814"
    }
  }' \
  "http://localhost:3000/webhooks/lithic"
```

### **Connection Management**

#### **Monitor Connection Health**

```bash
curl "http://localhost:3000/api/alerts/connections/session_id/health"
```

#### **Get System Metrics**

```bash
curl "http://localhost:3000/api/alerts/metrics"

# Response:
{
  "activeConnections": 5,
  "totalAlertsSent": 1247,
  "averageResponseTime": "45ms",
  "systemUptime": "72h 15m"
}
```

### **Card Management**

#### **Create Honeypot Card**

```bash
npm run create-card
```

---

## 📡 **API Reference**

### **Webhook Endpoints**

#### **POST /webhooks/lithic**
Receives Lithic transaction webhooks and triggers real-time alerts.

**Request Body:**
```json
{
  "transaction_token": "string",
  "card_token": "string", 
  "status": "APPROVED|DECLINED",
  "amount": "number",
  "merchant": {
    "descriptor": "string",
    "city": "string",
    "state": "string",
    "country": "string",
    "mcc": "string"
  }
}
```

### **Real-Time Alert Endpoints**

#### **GET /api/alerts/stream/:cardToken**
Establishes SSE connection for real-time transaction alerts.

**Query Parameters:**
- `agentId` (required): Unique AI agent identifier
- `sessionId` (optional): Session tracking identifier

**Headers:**
- `Authorization: Bearer <session_token>`

#### **GET /api/alerts/connections/:sessionId/health**
Checks health status of specific connection.

#### **GET /api/alerts/metrics**
Returns system performance and connection metrics.

#### **POST /api/alerts/test**
Sends test alert to connected agents (development only).

### **System Endpoints**

#### **GET /health**
System health check with service status.

---

## 🧪 **Testing**

### **Run Test Suites**

```bash
# All tests
npm test

# Unit tests only
node tests/unit/services/alert-service.test.js
node tests/unit/controllers/alert-controller.test.js

# Integration tests
npm run test:integration

# Specific component tests
node tests/unit/services/connection-manager.test.js
node tests/unit/middleware/validation.test.js
```

### **Test Coverage**

- **Alert Service**: 10/10 tests ✅ (Connection management, broadcasting, formatting)
- **Connection Manager**: 10/10 tests ✅ (SSE connections, health monitoring) 
- **Alert Controller**: 9/9 tests ✅ (Authentication, error handling)
- **Webhook Integration**: 4/4 tests ✅ (Alert broadcasting, error isolation)
- **Validation Middleware**: Comprehensive input sanitization testing

### **End-to-End Testing**

```bash
# Start server
npm start

# Test real-time alert flow
curl -N -H "Authorization: Bearer test-session" \
  "http://localhost:3000/api/alerts/stream/card_test" &

# Trigger transaction
curl -X POST -d '{"transaction_token":"test","card_token":"card_test"}' \
  http://localhost:3000/webhooks/lithic
```

---

## 📊 **System Architecture**

### **High-Level Architecture**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Lithic API    │────│  Webhook Server  │────│  Alert Service  │
│ (Virtual Cards) │    │   (Express.js)   │    │ (Real-time SSE) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Transaction      │    │   AI Agents     │
                       │ Processor        │    │ (Vapi/MCP)      │
                       │ (Background)     │    │                 │
                       └──────────────────┘    └─────────────────┘
                                │                        │
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Supabase DB    │    │ Connection      │
                       │  (PostgreSQL)    │    │ Manager         │
                       └──────────────────┘    └─────────────────┘
```

### **Real-Time Alert Flow**

1. **Transaction Event**: Scammer uses honeypot card
2. **Lithic Webhook**: Instant notification to system
3. **Transaction Processing**: Parse, validate, and enhance data
4. **Database Storage**: Persist transaction with full merchant data
5. **Alert Broadcasting**: Real-time notification to connected AI agents
6. **Verification Questions**: AI agents use transaction data for scammer verification

### **Data Flow**

```
Scammer Transaction → Lithic Webhook → Transaction Parser → Supabase → Alert Service → AI Agent
                                                     ↓
                                              Transaction Intelligence ← Merchant DB ← MCC Service
```

---

## 🔄 **Project Status & Roadmap**

### **✅ Completed (Production Ready)**

- **Phase 1**: Core transaction processing and webhook integration
- **Phase 2**: Enterprise validation and error handling
- **Phase 3**: Real-time alert system with SSE connections *(Tasks 3.1-3.6)*

### **🚧 In Progress**

- **Phase 4**: Enhanced Vapi integration with MCP protocol *(Tasks 4.1-4.4)*
- **Phase 5**: Complete system integration and production optimization *(Tasks 5.1-5.3)*

### **📋 Planned Features**

- Advanced transaction intelligence with ML pattern recognition
- Enhanced analytics dashboard and reporting
- Multi-tenant support for enterprise deployments
- Advanced fraud detection algorithms
- Performance optimization for high-scale deployments

---

## 🤝 **Contributing**

### **Development Workflow**

1. **Fork** the repository
2. **Create** feature branch: `git checkout -b feat/amazing-feature`
3. **Commit** changes using [Conventional Commits](https://conventionalcommits.org/):
   ```bash
   git commit -m "feat(alerts): add real-time notification system"
   ```
4. **Push** to branch: `git push origin feat/amazing-feature`
5. **Submit** Pull Request with comprehensive description

### **Code Standards**

- **ES Modules**: Use import/export syntax
- **Error Handling**: Always use enterprise-grade error handling
- **Testing**: Maintain >90% test coverage for new features
- **Documentation**: Include JSDoc comments for all functions
- **Security**: Follow security best practices for financial data

### **Commit Message Format**

```
<type>[optional scope]: <description>

[optional body]
[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📞 **Support & Contact**

- **Documentation**: [Wiki](https://github.com/your-org/honeypot-transaction-monitoring-system/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-org/honeypot-transaction-monitoring-system/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/honeypot-transaction-monitoring-system/discussions)

---

## 🙏 **Acknowledgments**

- **Lithic** for providing robust virtual card infrastructure
- **Supabase** for real-time database capabilities
- **Vapi** for AI agent integration support
- Open source community for the foundational libraries

---

<div align="center">

**Made with ❤️ for fraud prevention and financial security**

[⭐ Star this repo](https://github.com/your-org/honeypot-transaction-monitoring-system) • [🐛 Report Bug](https://github.com/your-org/honeypot-transaction-monitoring-system/issues) • [💡 Request Feature](https://github.com/your-org/honeypot-transaction-monitoring-system/issues)

</div> 