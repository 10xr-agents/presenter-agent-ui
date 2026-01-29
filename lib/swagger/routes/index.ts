/**
 * @swagger
 * /api/health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Health check endpoint
 *     description: |
 *       Returns the health status of the application and its dependencies.
 *       Use this endpoint for monitoring and deployment verification.
 *     responses:
 *       200:
 *         description: All services healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/HealthStatus'
 *       503:
 *         description: One or more services unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/screen-agents:
 *   get:
 *     tags:
 *       - Screen Agents
 *     summary: List screen agents
 *     description: Retrieve a list of screen agents for the authenticated user or organization.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         description: Filter by organization ID
 *       - in: query
 *         name: teamId
 *         schema:
 *           type: string
 *         description: Filter by team ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, paused, archived]
 *         description: Filter by status
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [private, team, organization, public]
 *         description: Filter by visibility
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: List of screen agents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ScreenAgent'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 *
 *   post:
 *     tags:
 *       - Screen Agents
 *     summary: Create a screen agent
 *     description: Create a new AI screen agent for presentations.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateScreenAgentRequest'
 *     responses:
 *       201:
 *         description: Screen agent created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ScreenAgent'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Usage limit reached
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */

/**
 * @swagger
 * /api/screen-agents/{id}:
 *   get:
 *     tags:
 *       - Screen Agents
 *     summary: Get screen agent by ID
 *     description: Retrieve a specific screen agent by its ID.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Screen agent ID
 *     responses:
 *       200:
 *         description: Screen agent details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ScreenAgent'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     tags:
 *       - Screen Agents
 *     summary: Update screen agent
 *     description: Update an existing screen agent's properties.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Screen agent ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateScreenAgentRequest'
 *     responses:
 *       200:
 *         description: Screen agent updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ScreenAgent'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     tags:
 *       - Screen Agents
 *     summary: Delete screen agent
 *     description: Delete a screen agent (soft delete - archives the agent).
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Screen agent ID
 *     responses:
 *       200:
 *         description: Screen agent deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /api/screen-agents/{id}/publish:
 *   post:
 *     tags:
 *       - Screen Agents
 *     summary: Publish screen agent
 *     description: Change agent status from draft to active.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent published
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /api/screen-agents/{id}/pause:
 *   post:
 *     tags:
 *       - Screen Agents
 *     summary: Pause screen agent
 *     description: Temporarily pause an active screen agent.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent paused
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /api/api-keys:
 *   get:
 *     tags:
 *       - API Keys
 *     summary: List API keys
 *     description: List all API keys for the authenticated user.
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         description: Filter by organization
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ApiKey'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 *   post:
 *     tags:
 *       - API Keys
 *     summary: Create API key
 *     description: |
 *       Create a new API key. The full key is only returned once in this response.
 *       Store it securely as it cannot be retrieved again.
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateApiKeyRequest'
 *     responses:
 *       200:
 *         description: API key created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 key:
 *                   type: string
 *                   description: Full API key (only shown once)
 *                 keyPrefix:
 *                   type: string
 *                 scopes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 *   delete:
 *     tags:
 *       - API Keys
 *     summary: Revoke API key
 *     description: Revoke an API key by ID.
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID to revoke
 *     responses:
 *       200:
 *         description: API key revoked
 *       400:
 *         description: Key ID required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/knowledge:
 *   get:
 *     tags:
 *       - Knowledge
 *     summary: List knowledge documents
 *     description: List all knowledge documents for the organization.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: screenAgentId
 *         schema:
 *           type: string
 *         description: Filter by screen agent
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [pdf, video, audio, text, url]
 *         description: Filter by document type
 *     responses:
 *       200:
 *         description: List of knowledge documents
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 *   post:
 *     tags:
 *       - Knowledge
 *     summary: Create knowledge document
 *     description: Add a new knowledge document to the knowledge base.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - screenAgentId
 *               - documentType
 *               - originalFilename
 *               - storageLocation
 *               - fileSizeBytes
 *             properties:
 *               screenAgentId:
 *                 type: string
 *               documentType:
 *                 type: string
 *                 enum: [pdf, video, audio, text, url]
 *               originalFilename:
 *                 type: string
 *               storageLocation:
 *                 type: string
 *               fileSizeBytes:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Knowledge document created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/knowledge/{id}:
 *   get:
 *     tags:
 *       - Knowledge
 *     summary: Get knowledge document
 *     description: Retrieve a specific knowledge document.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Knowledge document details
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     tags:
 *       - Knowledge
 *     summary: Delete knowledge document
 *     description: Delete a knowledge document from the knowledge base.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Knowledge document deleted
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /api/presentations:
 *   get:
 *     tags:
 *       - Presentations
 *     summary: List presentation sessions
 *     description: List all presentation sessions for the organization.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: screenAgentId
 *         schema:
 *           type: string
 *         description: Filter by screen agent
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, live, completed, cancelled]
 *     responses:
 *       200:
 *         description: List of presentation sessions
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 *   post:
 *     tags:
 *       - Presentations
 *     summary: Create presentation session
 *     description: Create a new presentation session.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - screenAgentId
 *             properties:
 *               screenAgentId:
 *                 type: string
 *               viewerInfo:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   company:
 *                     type: string
 *     responses:
 *       201:
 *         description: Presentation session created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/analytics/dashboard:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Get dashboard analytics
 *     description: Retrieve aggregated analytics for the dashboard.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Dashboard analytics data
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/analytics/screen-agent/{id}:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Get screen agent analytics
 *     description: Retrieve detailed analytics for a specific screen agent.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Screen agent ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Screen agent analytics
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /api/billing/account:
 *   get:
 *     tags:
 *       - Billing
 *     summary: Get billing account
 *     description: Retrieve billing account details for the organization.
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Billing account details
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /api/billing/add-balance:
 *   post:
 *     tags:
 *       - Billing
 *     summary: Add balance
 *     description: Add credits/balance to the billing account.
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *               - amountCents
 *             properties:
 *               organizationId:
 *                 type: string
 *               amountCents:
 *                 type: integer
 *                 minimum: 100
 *                 description: Amount to add in cents
 *     responses:
 *       200:
 *         description: Balance added
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/usage:
 *   get:
 *     tags:
 *       - Usage
 *     summary: Get usage summary
 *     description: Retrieve usage summary for the organization.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Usage summary
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/usage/limits:
 *   get:
 *     tags:
 *       - Usage
 *     summary: Get usage limits
 *     description: Retrieve current usage limits and quotas.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usage limits
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/teams:
 *   get:
 *     tags:
 *       - Teams
 *     summary: List teams
 *     description: List all teams in the organization (Enterprise feature).
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of teams
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Enterprise feature not available
 *
 *   post:
 *     tags:
 *       - Teams
 *     summary: Create team
 *     description: Create a new team in the organization.
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - organizationId
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               organizationId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Team created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: List notifications
 *     description: List notifications for the authenticated user.
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *         description: Only return unread notifications
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of notifications
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     tags:
 *       - User
 *     summary: Get user profile
 *     description: Retrieve the authenticated user's profile.
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 *   patch:
 *     tags:
 *       - User
 *     summary: Update user profile
 *     description: Update the authenticated user's profile.
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/user/preferences:
 *   get:
 *     tags:
 *       - User
 *     summary: Get user preferences
 *     description: Retrieve the authenticated user's preferences.
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: User preferences
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 *   patch:
 *     tags:
 *       - User
 *     summary: Update user preferences
 *     description: Update the authenticated user's preferences.
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: [light, dark, system]
 *               emailNotifications:
 *                 type: boolean
 *               timezone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Preferences updated
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/pusher/auth:
 *   post:
 *     tags:
 *       - Realtime
 *     summary: Pusher/Sockudo channel auth
 *     description: |
 *       Authenticate a private channel subscription for real-time session updates.
 *       Used by the Chrome extension and web app when subscribing to `private-session-{sessionId}`.
 *       Client sends form data (socket_id, channel_name). Auth via Bearer token (extension) or session cookie (web).
 *       Returns 403 with code SESSION_NOT_FOUND if the session does not exist yet (e.g. before first interact).
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - socket_id
 *               - channel_name
 *             properties:
 *               socket_id:
 *                 type: string
 *                 description: Sockudo/Pusher socket ID
 *               channel_name:
 *                 type: string
 *                 description: Must be private-session-{sessionId}
 *     responses:
 *       200:
 *         description: Channel auth token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Missing socket_id or channel_name
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Forbidden (bad channel, session not found, or user mismatch). In development, body includes code (CHANNEL_FORBIDDEN, SESSION_NOT_FOUND, USER_MISMATCH).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: string
 *                   enum: [CHANNEL_FORBIDDEN, SESSION_NOT_FOUND, USER_MISMATCH]
 *                 message:
 *                   type: string
 *       503:
 *         description: Pusher/Sockudo unavailable
 */

/**
 * @swagger
 * /api/agent/interact:
 *   post:
 *     tags:
 *       - Sessions
 *     summary: Interact with agent
 *     description: Send a message or action to an active agent session.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - message
 *             properties:
 *               sessionId:
 *                 type: string
 *               message:
 *                 type: string
 *               context:
 *                 type: object
 *     responses:
 *       200:
 *         description: Agent response
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Session not found
 */

/**
 * @swagger
 * /api/session:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: List sessions
 *     description: List all agent sessions.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: screenAgentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, completed, failed]
 *     responses:
 *       200:
 *         description: List of sessions
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /api/session/{sessionId}:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: Get session details
 *     description: Retrieve details of a specific session.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session details
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /api/session/{sessionId}/messages:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: Get session messages
 *     description: Retrieve all messages from a session.
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session messages
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

export {}
