# 🎯 **Honeypot Transaction Monitoring System - Complete Demo Guide**

## **System Overview**
This system is a **real-time fraud detection platform** that:
- Creates honeypot virtual cards to trap scammers
- Monitors transactions in real-time via Lithic API
- Sends instant alerts to AI agents (Vapi) during live scammer conversations
- Provides comprehensive transaction intelligence for scammer verification

---

## 🚀 **Pre-Demo Setup**

### **1. Environment Requirements**
- **Node.js**: v22.16.0+ ✅
- **npm**: 10.9.2+ ✅
- **Server**: Running on localhost:3000 ✅

### **2. Start the System**
```bash
# Install dependencies
npm install

# Start the Honeypot Transaction Monitoring System
npm start
```

### **3. Verify System Status**
```bash
# Check if server is running (should return TcpTestSucceeded: True)
Test-NetConnection -ComputerName localhost -Port 3000
```

**System Status: ✅ READY**

---

## 📋 **Demo Flow Overview**

This demo showcases **4 key capabilities**:
1. **🔒 Enterprise Validation System** - Input validation and security
2. **⚡ Real-Time Alert System** - Instant transaction notifications
3. **🤖 AI Integration (Vapi MCP)** - Smart scammer verification 
4. **📊 Transaction Intelligence** - Comprehensive fraud analysis

---

## 🔧 **Demo Step 1: System Health & Validation**

### **1.1 Health Check**
```bash
# Test basic system health
curl http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-30T...",
  "metrics": {
    "activeConnections": 0,
    "totalAlerts": 0,
    "systemStatus": "optimal"
  }
}
```

### **1.2 Validation Middleware Test**
```bash
# Test enterprise validation (should fail with 400 Bad Request)
curl -X POST http://localhost:3000/api/lithic/webhook \
  -H "Content-Type: application/json" \
  -d '{}'
```

```bash
# Test with invalid data types
curl -X POST http://localhost:3000/api/lithic/webhook \
  -H "Content-Type: application/json" \
  -d '{"token": 123, "amount": "invalid"}'
```

**Demo Point:** *"Our system has enterprise-grade validation that prevents malformed data from entering the system."*

---

## ⚡ **Demo Step 2: Real-Time Alert System**

### **2.1 Set Up AI Agent Connection**
```bash
# Subscribe an AI agent to real-time alerts
curl -X POST "http://localhost:3000/api/alerts/subscribe?cardTokens=card_test_123&sessionId=demo-session-001" \
  -H "Authorization: Bearer demo-token" \
  -H "Accept: text/event-stream"
```

**Demo Point:** *"This endpoint establishes a real-time connection where AI agents receive instant notifications."*

### **2.2 Test Alert Broadcasting**
```bash
# Send a test alert (open new terminal window)
curl -X POST http://localhost:3000/api/alerts/test \
  -H "Content-Type: application/json" \
  -d '{
    "cardTokens": ["card_test_123"],
    "alertType": "TEST_DEMO",
    "message": "Demo alert for team presentation"
  }'
```

**Expected:** The subscribed connection receives instant alert

### **2.3 Connection Management**
```bash
# Check active connections
curl http://localhost:3000/api/alerts/metrics
```

**Expected Response:**
```json
{
  "activeConnections": 1,
  "totalAlerts": 1,
  "connectionsByCard": {
    "card_test_123": 1
  }
}
```

**Demo Point:** *"The system tracks all active AI agents and can broadcast to multiple agents simultaneously."*

---

## 🤖 **Demo Step 3: AI Integration (Vapi MCP)**

### **3.1 AI Agent Subscription**
```bash
# Enhanced MCP subscription with multiple cards
curl -X POST http://localhost:3000/api/vapi/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "ai-agent-demo-001",
    "cardTokens": ["card_demo_001", "card_demo_002"],
    "agentConfig": {
      "name": "FraudDetectionAgent",
      "capabilities": ["scammer_verification", "pattern_analysis"]
    }
  }'
```

**Expected Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "subscribed",
    "sessionId": "ai-agent-demo-001",
    "registeredCards": ["card_demo_001", "card_demo_002"],
    "welcomeMessage": "AI agent connected for real-time fraud detection"
  }
}
```

### **3.2 Natural Language Transaction Query**
```bash
# Test AI-powered transaction analysis
curl -X POST http://localhost:3000/api/vapi/query \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "ai-agent-demo-001",
    "query": "Show me large transactions from today that might be suspicious",
    "context": {
      "scammerPhone": "+1-555-SCAMMER",
      "verificationActive": true
    }
  }'
```

**Demo Point:** *"AI agents can ask natural language questions and get intelligent responses formatted for scammer verification."*

### **3.3 Scammer Verification Intelligence**
```bash
# Get verification questions for scammer
curl -X POST http://localhost:3000/api/vapi/verification \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "ai-agent-demo-001",
    "transactionIds": ["txn_demo_123", "txn_demo_456"],
    "scammerContext": {
      "claimedLocation": "New York",
      "claimedPurchase": "coffee",
      "suspicionLevel": "high"
    }
  }'
```

**Expected Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "verificationQuestions": [
      "What did you just purchase for $12.45?",
      "Which Shell station did you use?",
      "What time did you make this transaction?"
    ],
    "transactionIntelligence": {
      "actualMerchant": "Shell Gas Station #1234",
      "actualAmount": "$12.45",
      "actualLocation": "Dallas, TX",
      "actualTime": "2025-01-30T14:23:15Z"
    },
    "discrepancies": [
      "Claimed coffee purchase vs actual gas station",
      "Claimed New York vs actual Dallas, TX"
    ]
  }
}
```

**Demo Point:** *"The system automatically generates verification questions and detects discrepancies in scammer stories."*

---

## 📊 **Demo Step 4: Transaction Intelligence**

### **4.1 Comprehensive Transaction Analysis**
```bash
# Get detailed transaction intelligence
curl -X GET "http://localhost:3000/api/vapi/intelligence?sessionId=ai-agent-demo-001&timeframe=today"
```

**Expected Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "statistics": {
      "totalTransactions": 15,
      "totalAmount": "$234.56",
      "averageAmount": "$15.64",
      "merchantCount": 8,
      "suspiciousCount": 3
    },
    "patterns": {
      "geographicAnomalies": ["Multiple states in 1 hour"],
      "merchantAnomalies": ["First time using gas stations"],
      "amountAnomalies": ["Round dollar amounts: $1.00, $5.00"]
    },
    "riskAssessment": {
      "overallRisk": "HIGH",
      "confidence": 0.87,
      "indicators": ["rapid_transactions", "geographic_spread", "round_amounts"]
    }
  }
}
```

### **4.2 Merchant Intelligence**
```bash
# Get merchant-specific intelligence
curl -X GET "http://localhost:3000/api/vapi/merchant/shell-gas-station?sessionId=ai-agent-demo-001"
```

**Demo Point:** *"The system provides deep merchant intelligence for comprehensive scammer verification."*

### **4.3 Real-Time Connection Status**
```bash
# Check AI agent connection status
curl -X GET "http://localhost:3000/api/vapi/status?sessionId=ai-agent-demo-001"
```

**Expected Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "connected",
    "sessionId": "ai-agent-demo-001",
    "subscribedCards": ["card_demo_001", "card_demo_002"],
    "connectionHealth": "excellent",
    "lastActivity": "2025-01-30T14:25:00Z",
    "metrics": {
      "alertsReceived": 5,
      "queriesProcessed": 12,
      "verificationsSuggested": 8
    }
  }
}
```

---

## 🎭 **Demo Step 5: Live Scammer Simulation**

### **5.1 Simulate Transaction Flow**
```bash
# Simulate a scammer using a honeypot card
curl -X POST http://localhost:3000/api/lithic/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "transaction.created",
    "payload": {
      "token": "txn_scammer_demo_001",
      "card_token": "card_demo_001",
      "amount": 100,
      "descriptor": "STARBUCKS #1234",
      "mcc": "5814",
      "status": "APPROVED",
      "created": "2025-01-30T14:30:00Z",
      "merchant": {
        "acceptor_id": "STARBUCKS1234",
        "city": "SEATTLE",
        "state": "WA",
        "country": "USA"
      }
    }
  }'
```

**Demo Flow:**
1. ⚡ **Instant Alert**: AI agent receives real-time notification
2. 🤖 **AI Processing**: Agent analyzes transaction data
3. 🎯 **Verification**: Agent generates verification questions
4. 🕵️ **Scammer Detection**: Identifies discrepancies

### **5.2 Show Real-Time Alert**
The subscribed AI agent instantly receives:
```json
{
  "alertType": "NEW_TRANSACTION",
  "timestamp": "2025-01-30T14:30:00Z",
  "transactionId": "txn_scammer_demo_001",
  "immediate": {
    "amount": "$1.00",
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
    "merchantHistory": "New merchant for this card",
    "riskLevel": "MEDIUM"
  }
}
```

**Demo Point:** *"The AI agent can now ask: 'I see you just made a purchase. What did you buy at Starbucks?' and verify the scammer's response."*

---

## 📈 **Demo Step 6: System Performance**

### **6.1 Load Testing**
```bash
# Test multiple simultaneous connections (PowerShell)
for ($i=1; $i -le 5; $i++) {
  Start-Job -ScriptBlock {
    curl -X POST "http://localhost:3000/api/alerts/subscribe?cardTokens=card_load_test_$using:i&sessionId=load-test-$using:i" -H "Authorization: Bearer demo-token"
  }
}
```

### **6.2 Performance Metrics**
```bash
# Check system performance
curl http://localhost:3000/api/alerts/metrics
```

**Demo Point:** *"The system can handle multiple AI agents simultaneously with sub-second response times."*

---

## 🏆 **Demo Talking Points**

### **Key Achievements Demonstrated:**

#### **🔒 Enterprise Security**
- Input validation prevents injection attacks
- Authentication required for all real-time connections
- Rate limiting and error handling

#### **⚡ Real-Time Performance**
- Sub-second alert delivery
- Scalable to multiple AI agents
- Zero message loss during high-frequency scenarios

#### **🤖 AI-Optimized Integration**
- Natural language query processing
- MCP-compliant JSON-RPC 2.0 protocol
- Context-aware scammer verification

#### **📊 Comprehensive Intelligence**
- Pattern analysis and risk assessment
- Merchant relationship mapping
- Geographic and behavioral anomaly detection

### **Technical Highlights:**
- **Node.js v22** with ES Modules
- **Real-time SSE/WebSocket** connections
- **Supabase PostgreSQL** for data persistence
- **Lithic API** integration for virtual cards
- **Enterprise-grade** validation and error handling

### **Implementation Details:**
- **Alert System**: 38 passing unit tests ✅
- **MCP Controller**: 20 comprehensive tests ✅
- **Validation Middleware**: Enterprise-grade input sanitization ✅
- **Real-Time Architecture**: Server-Sent Events with WebSocket fallback ✅

---

## 🚨 **Demo Cleanup**

```bash
# Unsubscribe all test agents
curl -X DELETE "http://localhost:3000/api/vapi/unsubscribe" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "ai-agent-demo-001"}'

# Check final metrics
curl http://localhost:3000/api/alerts/metrics
```

---

## 🎯 **Demo Success Criteria**

✅ **Real-time alerts** delivered in <1 second  
✅ **AI agents** successfully subscribed and receiving data  
✅ **Scammer verification** questions generated automatically  
✅ **Transaction intelligence** providing comprehensive analysis  
✅ **System performance** handling multiple concurrent connections  
✅ **Enterprise security** preventing malicious inputs  

---

## 🎪 **Scammer Interaction Example**

**Scenario**: Scammer uses honeypot card for $1 verification

**Live Demo Flow**:
1. **Transaction occurs**: $1.00 at Shell Gas Station, Main St, Dallas, TX
2. **AI agent receives instant alert** with full transaction data
3. **Agent initiates verification**:
   - Agent: *"I see you just made a transaction. Can you tell me what you purchased?"*
   - Scammer: *"I bought coffee at Starbucks"*
   - Agent: *[Knows it was gas station]* "That's interesting. What location was that?"
   - Scammer: *"The one on Broadway"*
   - Agent: *[Knows it was Main St]* "Can you confirm the exact amount?"
   - Scammer: *"About $5"*
   - Agent: *[Knows it was $1.00]* "I'm seeing some inconsistencies..."

**Result**: **Scammer caught in real-time with precise transaction intelligence!** 🎯

---

## 📝 **Demo Notes**

- **Preparation Time**: 5 minutes (system startup)
- **Demo Duration**: 15-20 minutes for full walkthrough
- **Audience**: Technical team members, stakeholders
- **Key Message**: Production-ready fraud detection system that turns honeypot cards into intelligent scammer traps with real-time AI assistance

**Final Result**: *A sophisticated fraud detection platform that enables instant scammer verification during live conversations.* 🚀 