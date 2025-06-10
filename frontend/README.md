# 🍯 Honeypot Transaction Monitoring - Frontend

## Overview

This is the web interface for the Honeypot Transaction Monitoring System. It provides a comprehensive dashboard for AI agent simulation, transaction monitoring, and card access testing.

## Files

- **`index.html`** - Landing page with system overview
- **`simulation-interface.html`** - Main dashboard with full functionality

## Features

### 🤖 AI Agent Interface
- **Card Management**: List available cards, get card details (including PAN for scammer verification)
- **Transaction Intelligence**: Search transactions, get details, recent transactions
- **Real-time Alerts**: Subscribe to SSE streams for live transaction notifications
- **System Monitoring**: Health checks and system information

### 🎭 Transaction Simulator
- **Random Transaction Generator**: Creates suspicious transaction scenarios
- **Custom Transaction Builder**: Manual transaction creation with MCC codes
- **Real Lithic API Integration**: Actual transaction simulation via `/webhooks/simulate`

### 📊 Response Viewer
- **Live JSON Display**: Real-time formatted responses with syntax highlighting
- **Status Indicators**: Visual feedback for success/error states
- **Response History**: Last 10 responses with timestamps

## API Integration

The interface connects to the backend server using these endpoints:

### MCP (Model Context Protocol) Tools
- `POST /api/mcp/query` - Execute MCP tools
- Available tools: `list_available_cards`, `get_card_details`, `subscribe_to_alerts`, etc.

### Real-time Alerts
- `GET /alerts/stream/:cardToken` - Server-Sent Events for real-time notifications

### System Endpoints
- `GET /health` - System health check
- `GET /system/info` - System information
- `POST /webhooks/simulate` - Transaction simulation

### Transaction Simulation
- Uses Lithic API to create real transaction events
- Supports custom MCC codes and merchant data
- Triggers real-time alerts for connected AI agents

## Usage

1. **Start the Backend**: Ensure the Node.js server is running on port 3000
2. **Open Interface**: Navigate to `index.html` in a web browser
3. **Launch Dashboard**: Click "Launch Web Interface" to access the full dashboard
4. **Test Functionality**:
   - List available honeypot cards
   - Subscribe to real-time alerts
   - Generate and simulate suspicious transactions
   - Monitor responses in the live viewer

## Security Considerations

- **Sensitive Data**: Card details include PAN numbers for scammer verification
- **Logging**: All PAN access is logged with high sensitivity
- **Rate Limiting**: Backend monitors for suspicious access patterns
- **Audit Trails**: Complete request tracking with unique IDs

## Development

The frontend is built with:
- **Vanilla JavaScript** - No external frameworks for simplicity
- **Modern CSS** - Grid layouts, gradients, animations
- **Responsive Design** - Mobile-friendly interface
- **Inline Styles/Scripts** - Single-file deployment for reliability

## Status

✅ **PRODUCTION READY** - Fully functional with comprehensive testing

All buttons and functions are working correctly with proper error handling and user feedback. 