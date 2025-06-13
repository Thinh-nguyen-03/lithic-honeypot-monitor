REFACTOR_PLAN.md
1. Project Goal & Motivation
The goal of this refactoring is to restructure the Honeypot Transaction Monitoring System's backend, specifically the MCP (Model Context Protocol) server. The current implementation, while functional, has architectural issues that hinder maintainability and scalability.
This plan will guide the transformation of the codebase into a more robust, efficient, and logically structured application, adhering to standard API design and service-oriented architecture principles.

2. Diagnosis of Current Issues
Our review identified three primary architectural problems:
Bloated Controller: The vapi-mcp-controller.js file has grown to over 1,800 lines. It contains complex business logic for data filtering, formatting, and analysis that should reside in the service layer. This makes the controller difficult to read, test, and maintain.
Redundant & Confusing Endpoints: There are two separate ways for an AI agent to subscribe to real-time alerts: via the MCP tool (POST /api/mcp/query) and a direct REST endpoint (GET /alerts/stream/:cardToken). This creates ambiguity and potential for state-management conflicts.
Mixed Concerns: Logic is not clearly separated. The controller directly calls multiple services, performs data transformations, and contains business rules, violating the principle of separation of concerns.

3. The Refactoring Strategy
We will execute this plan in three distinct phases to ensure a smooth and verifiable transition.

Phase 1: Decouple Business Logic into Services. Move complex logic out of the controller and into the appropriate service files.
Phase 2: Consolidate and Simplify the API Layer. Unify the API endpoints to create a single, clear entry point for all MCP-related actions.

4. Detailed Step-by-Step Tasks
Phase 1: Service Layer Refactoring (Decoupling Logic)
The objective of this phase is to move all business logic from vapi-mcp-controller.js into the service layer.
Task 1.1: Enhance the Reporting Service
Goal: Move transaction searching, filtering, and classification logic into reporting-service.js.
Files to Modify:

src/services/reporting-service.js (Add new functions)
src/api/controllers/vapi-mcp-controller.js (Remove logic that is being moved)

Sub-Tasks:

Relocate the classifyQuery, extractTimeFilter, filterTransactionsByTime, extractAmountFilter, and filterTransactionsByAmount helper functions from the controller into the reporting-service.js.
Create a new exported function in reporting-service.js named processTransactionSearchQuery(query, limit, cardToken).
This new function will contain all the logic currently inside the handleTransactionSearch function in the controller. It will fetch, filter, and format the transactions, returning a clean data object.

Task 1.2: Enhance the Card Service
Goal: Move card-related logic for MCP tools into card-service.js.
Files to Modify:

src/services/card-service.js (Add new functions)
src/api/controllers/vapi-mcp-controller.js (Remove logic that is being moved)

Sub-Tasks:

Create a new function in card-service.js named getAvailableCardsForMcp(params). This will contain the logic from handleListAvailableCards, including filtering and formatting the response.
Create another new function named getCardDetailsForMcp(cardToken). This will contain the logic from handleGetCardDetails, including the security-sensitive PAN retrieval and the generation of verification data.

Task 1.3: Centralize Subscription Management
Goal: Ensure all real-time connection logic is cleanly handled by the connection-manager.js and alert-service.js.
Files to Modify:

src/services/connection-manager.js (Review and ensure it fully handles SSE setup)

Sub-Tasks:

Review the createConnection method in connection-manager.js. Confirm that it correctly sets all necessary SSE headers (Content-Type: text/event-stream, Cache-Control, Connection).
Ensure that createConnection also calls alertService.registerConnection as part of its setup process. This is already in place and is correct.

Phase 2: API Layer Consolidation (Simplifying Endpoints)
The objective of this phase is to create a single, logical, and consistent API for the MCP server.
Task 2.1: Deprecate and Remove the Redundant Alert Route
Goal: Eliminate the GET /alerts/stream/:cardToken endpoint to enforce a single subscription method via the MCP controller.
Files to Modify:

src/api/routes/alert-routes.js (Remove the route)
src/api/server.js (Remove the mounting of alert-routes.js)
src/api/controllers/alert-controller.js (Delete this file)

Sub-Tasks:

Delete the file src/api/controllers/alert-controller.js.
Delete the file src/api/routes/alert-routes.js.
In src/api/server.js, remove the line app.use("/alerts", alert_routes);.

Task 2.2: Slim Down the MCP Controller
Goal: Refactor vapi-mcp-controller.js to only handle request/response flow and delegate all logic to the services.
Files to Modify:

src/api/controllers/vapi-mcp-controller.js

Sub-Tasks:

Modify handleTransactionSearch to simply call reportingService.processTransactionSearchQuery and return its result.
Modify handleListAvailableCards to call cardService.getAvailableCardsForMcp.
Modify handleGetCardDetails to call cardService.getCardDetailsForMcp.
Update the subscribeToAlerts function to directly call connectionManager.createConnection. The controller should handle the request and pass req and res to the connection manager, which will manage the SSE stream.

Task 2.3: Standardize the MCP Tool Router
Goal: Clean up the main processQuery function to act as a clear and simple router.
Files to Modify:

src/api/controllers/vapi-mcp-controller.js

Sub-Tasks:

Refactor the processQuery function to use a switch statement.
Each case in the switch will correspond to a tool name (e.g., 'search_transactions').
Each case will call its respective lean handler function (e.g., handleTransactionSearch).

5. Expected Outcome
Upon completion of this plan, the Honeypot Monitoring System will have:

A lean and maintainable MCP controller
A clear and logical service layer with well-defined responsibilities
A single, unified API for all AI agent interactions
Robust test coverage that reflects the improved architecture
A solid foundation that is easier to extend with new features and tools