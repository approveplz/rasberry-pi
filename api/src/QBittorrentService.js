const axios = require('axios');

/**
 * QBittorrent Web API Service
 *
 * A comprehensive service for interacting with qBittorrent's WebUI API v2.
 * Handles authentication, session management, and torrent operations with
 * automatic reconnection and robust error handling.
 *
 * @example
 * // Basic usage
 * const service = new QBittorrentService({
 *     url: 'http://localhost:8080',
 *     username: 'admin',
 *     password: 'your-password'
 * });
 *
 * // Add a torrent
 * await service.addTorrent('magnet:?xt=urn:btih:...');
 *
 * // Get all torrents
 * const torrents = await service.getTorrents();
 *
 * // Clean up when done
 * await service.logout();
 *
 * @class QBittorrentService
 * @author Media Server API
 * @version 1.0.0
 */
class QBittorrentService {
    /**
     * Creates a new QBittorrentService instance.
     *
     * @param {Object} config - Configuration object
     * @param {string} [config.url='http://qbittorrent:8080'] - Base URL of qBittorrent WebUI
     * @param {string} [config.username='admin'] - Username for authentication
     * @param {string} config.password - Password for authentication (REQUIRED)
     * @param {number} [config.loginTimeout=10000] - Login request timeout in milliseconds
     * @param {number} [config.requestTimeout=15000] - General request timeout in milliseconds
     *
     * @throws {Error} Throws an error if password is not provided
     *
     * @example
     * const service = new QBittorrentService({
     *     url: 'http://localhost:8080',
     *     username: 'admin',
     *     password: 'secretPassword123',
     *     loginTimeout: 5000,
     *     requestTimeout: 20000
     * });
     */
    constructor(config) {
        /** @type {string} Base URL for qBittorrent WebUI */
        this.baseUrl = config.url || 'http://qbittorrent:8080';

        /** @type {string} Username for authentication */
        this.username = config.username || 'admin';

        /** @type {string} Password for authentication */
        this.password = config.password;

        /** @type {string|null} Current session ID for authenticated requests */
        this.sessionId = null;

        /** @type {number} Timeout for login requests in milliseconds */
        this.loginTimeout = config.loginTimeout || 10000;

        /** @type {number} Timeout for general requests in milliseconds */
        this.requestTimeout = config.requestTimeout || 15000;

        if (!this.password) {
            throw new Error('QBittorrent password is required');
        }
    }

    /**
     * Authenticates with qBittorrent and establishes a session.
     *
     * This method performs the login process by sending credentials to qBittorrent's
     * auth endpoint and extracting the session ID (SID) from response cookies.
     * The session ID is stored for subsequent authenticated requests.
     *
     * @returns {Promise<string>} The session ID (SID) for authenticated requests
     *
     * @throws {Error} Throws if login fails due to:
     *   - Network connectivity issues
     *   - Invalid credentials
     *   - Missing response cookies
     *   - Timeout
     *
     * @example
     * try {
     *     const sessionId = await service.login();
     *     console.log('Logged in with session:', sessionId);
     * } catch (error) {
     *     console.error('Login failed:', error.message);
     * }
     */
    async login() {
        try {
            console.log(`[QBittorrent] Logging into ${this.baseUrl}`);

            const response = await axios.post(
                `${this.baseUrl}/api/v2/auth/login`,
                new URLSearchParams({
                    username: this.username,
                    password: this.password,
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Referer: this.baseUrl,
                    },
                    timeout: this.loginTimeout,
                }
            );

            // Extract SID cookie from response headers
            const cookies = response.headers['set-cookie'];
            if (!cookies) {
                throw new Error('No cookies received from qBittorrent');
            }

            const sidCookie = cookies.find((cookie) =>
                cookie.startsWith('SID=')
            );
            if (!sidCookie) {
                throw new Error('No SID cookie found in response');
            }

            this.sessionId = sidCookie.split('SID=')[1].split(';')[0];
            console.log('[QBittorrent] Successfully authenticated');
            return this.sessionId;
        } catch (error) {
            const errorMsg = this._formatError('Login failed', error);
            console.error(`[QBittorrent] ${errorMsg}`);
            throw new Error(errorMsg);
        }
    }

    /**
     * Ensures a valid session exists, creating one if necessary.
     *
     * This is a convenience method that checks if we have an active session.
     * If no session exists (sessionId is null), it automatically calls login().
     * This method is called internally by other methods that require authentication.
     *
     * @returns {Promise<string>} The current or newly created session ID
     *
     * @throws {Error} Throws if login fails (see login() method for details)
     *
     * @example
     * // This is typically used internally, but can be called manually:
     * await service.ensureSession();
     * // Now you're guaranteed to have a valid session
     */
    async ensureSession() {
        if (!this.sessionId) {
            await this.login();
        }
        return this.sessionId;
    }

    /**
     * Adds a torrent to qBittorrent using a magnet link or torrent file URL.
     *
     * This method accepts either magnet links (magnet:?xt=urn:btih:...) or
     * HTTP URLs pointing to .torrent files. It automatically handles session
     * management and will attempt to re-authenticate once if the session expires.
     *
     * @param {string} magnetOrUrl - Magnet link or HTTP URL to torrent file
     * @param {Object} [options={}] - Additional options for torrent addition
     * @param {string} [options.savepath] - Download path for the torrent
     * @param {string} [options.category] - Category to assign to the torrent
     * @param {string} [options.tags] - Tags to assign to the torrent (comma-separated)
     * @param {boolean} [options.paused] - Add torrent in paused state
     * @param {boolean} [options.skip_checking] - Skip hash checking
     * @param {string} [options.rename] - Rename the torrent
     *
     * @returns {Promise<Object>} Success result object
     * @returns {boolean} returns.success - Always true on successful addition
     * @returns {string} returns.message - Success message
     * @returns {string} returns.url - The original magnet/URL that was added
     *
     * @throws {Error} Throws if torrent addition fails due to:
     *   - Invalid magnet link or URL
     *   - Network connectivity issues
     *   - Authentication problems
     *   - qBittorrent internal errors
     *
     * @example
     * // Add a torrent with magnet link
     * const result = await service.addTorrent(
     *     'magnet:?xt=urn:btih:ABC123...',
     *     {
     *         savepath: '/downloads/movies',
     *         category: 'Movies',
     *         tags: 'action,2024'
     *     }
     * );
     * console.log(result); // { success: true, message: '...', url: '...' }
     *
     * // Add torrent from URL
     * await service.addTorrent('https://example.com/movie.torrent');
     */
    async addTorrent(magnetOrUrl, options = {}) {
        await this.ensureSession();

        try {
            console.log('[QBittorrent] Adding torrent...');

            const formData = new URLSearchParams({
                urls: magnetOrUrl,
                ...options,
            });

            const response = await axios.post(
                `${this.baseUrl}/api/v2/torrents/add`,
                formData,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Cookie: `SID=${this.sessionId}`,
                        Referer: this.baseUrl,
                    },
                    timeout: this.requestTimeout,
                }
            );

            if (response.status === 200) {
                console.log('[QBittorrent] Torrent added successfully');
                return {
                    success: true,
                    message: 'Torrent added to qBittorrent',
                    url: magnetOrUrl,
                };
            } else {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`
                );
            }
        } catch (error) {
            const errorMsg = this._formatError('Failed to add torrent', error);
            console.error(`[QBittorrent] ${errorMsg}`);

            // Try to re-login once on auth error
            if (this._isAuthError(error)) {
                console.log(
                    '[QBittorrent] Session expired, attempting re-login...'
                );
                this.sessionId = null;
                return await this.addTorrent(magnetOrUrl, options);
            }

            throw new Error(errorMsg);
        }
    }

    /**
     * Retrieves a list of all torrents from qBittorrent.
     *
     * This method fetches comprehensive information about all torrents in qBittorrent,
     * including their status, progress, speeds, and metadata. Optional filters can
     * be applied to narrow down the results.
     *
     * @param {Object} [filters={}] - Optional filters to apply
     * @param {string} [filters.filter] - Filter by torrent state (all|downloading|completed|paused|active|inactive|resumed|stalled|stalled_uploading|stalled_downloading|errored)
     * @param {string} [filters.category] - Filter by category name
     * @param {string} [filters.tag] - Filter by tag name
     * @param {string} [filters.sort] - Sort field (name|priority|size|progress|dlspeed|upspeed|ratio|eta|added_on|completed_on)
     * @param {boolean} [filters.reverse] - Reverse sort order
     * @param {number} [filters.limit] - Maximum number of torrents to return
     * @param {number} [filters.offset] - Number of torrents to skip
     *
     * @returns {Promise<Array<Object>>} Array of torrent objects with properties:
     *   - hash: Torrent hash
     *   - name: Torrent name
     *   - size: Total size in bytes
     *   - progress: Download progress (0-1)
     *   - dlspeed: Download speed in bytes/sec
     *   - upspeed: Upload speed in bytes/sec
     *   - state: Current state (downloading, completed, etc.)
     *   - eta: Estimated time remaining
     *   - And many more fields...
     *
     * @throws {Error} Throws if request fails due to network or authentication issues
     *
     * @example
     * // Get all torrents
     * const allTorrents = await service.getTorrents();
     *
     * // Get only downloading torrents
     * const downloading = await service.getTorrents({ filter: 'downloading' });
     *
     * // Get torrents sorted by download speed
     * const fastest = await service.getTorrents({
     *     sort: 'dlspeed',
     *     reverse: true,
     *     limit: 10
     * });
     *
     * console.log(`Found ${allTorrents.length} torrents`);
     */
    async getTorrents(filters = {}) {
        await this.ensureSession();

        try {
            const params = new URLSearchParams(filters);
            const response = await axios.get(
                `${this.baseUrl}/api/v2/torrents/info?${params}`,
                {
                    headers: {
                        Cookie: `SID=${this.sessionId}`,
                        Referer: this.baseUrl,
                    },
                    timeout: this.requestTimeout,
                }
            );

            return response.data || [];
        } catch (error) {
            const errorMsg = this._formatError('Failed to get torrents', error);
            console.error(`[QBittorrent] ${errorMsg}`);
            throw new Error(errorMsg);
        }
    }

    /**
     * Retrieves version information for qBittorrent application and Web API.
     *
     * This method fetches both the qBittorrent application version and the
     * Web API version. This is useful for compatibility checking and debugging.
     * This method does not require authentication.
     *
     * @returns {Promise<Object>} Version information object
     * @returns {string} returns.application - qBittorrent application version (e.g., "v4.6.2")
     * @returns {string} returns.webapi - Web API version (e.g., "2.9.3")
     *
     * @throws {Error} Throws if version info cannot be retrieved (usually connectivity issues)
     *
     * @example
     * const version = await service.getVersion();
     * console.log(`qBittorrent ${version.application} (API ${version.webapi})`);
     *
     * // Check API compatibility
     * if (parseFloat(version.webapi) >= 2.9) {
     *     console.log('API version is compatible');
     * }
     */
    async getVersion() {
        try {
            const [appVersion, apiVersion] = await Promise.all([
                axios.get(`${this.baseUrl}/api/v2/app/version`),
                axios.get(`${this.baseUrl}/api/v2/app/webapiVersion`),
            ]);

            return {
                application: appVersion.data,
                webapi: apiVersion.data,
            };
        } catch (error) {
            const errorMsg = this._formatError(
                'Failed to get version info',
                error
            );
            console.error(`[QBittorrent] ${errorMsg}`);
            throw new Error(errorMsg);
        }
    }

    /**
     * Tests the connection to qBittorrent without throwing errors.
     *
     * This method attempts to connect to qBittorrent by fetching version info.
     * It's designed for health checks and connection validation. Unlike other
     * methods, this one catches errors and returns a boolean instead of throwing.
     *
     * @returns {Promise<boolean>} True if connection successful, false otherwise
     *
     * @example
     * if (await service.testConnection()) {
     *     console.log('qBittorrent is reachable');
     *     // Proceed with operations
     * } else {
     *     console.log('qBittorrent is not available');
     *     // Handle offline state
     * }
     *
     * // Use in health check endpoint
     * app.get('/health', async (req, res) => {
     *     const qbOk = await service.testConnection();
     *     res.json({ qbittorrent: qbOk ? 'up' : 'down' });
     * });
     */
    async testConnection() {
        try {
            await this.getVersion();
            return true;
        } catch (error) {
            console.error(
                '[QBittorrent] Connection test failed:',
                error.message
            );
            return false;
        }
    }

    /**
     * Logs out from qBittorrent and invalidates the current session.
     *
     * This method should be called when you're done using the service to properly
     * clean up the session on the qBittorrent side. It gracefully handles cases
     * where no session exists or the logout request fails, always ensuring the
     * local sessionId is cleared.
     *
     * @returns {Promise<void>} Resolves when logout is complete (or skipped if no session)
     *
     * @example
     * // Always logout when done
     * try {
     *     await service.addTorrent(magnetLink);
     *     console.log('Torrent added successfully');
     * } finally {
     *     await service.logout(); // Clean up session
     * }
     *
     * // In Express.js cleanup
     * process.on('SIGINT', async () => {
     *     await service.logout();
     *     process.exit(0);
     * });
     */
    async logout() {
        if (!this.sessionId) return;

        try {
            await axios.post(
                `${this.baseUrl}/api/v2/auth/logout`,
                {},
                {
                    headers: {
                        Cookie: `SID=${this.sessionId}`,
                        Referer: this.baseUrl,
                    },
                }
            );
            console.log('[QBittorrent] Logged out successfully');
        } catch (error) {
            console.warn('[QBittorrent] Logout failed:', error.message);
        } finally {
            this.sessionId = null;
        }
    }

    /**
     * Formats error messages consistently with context information.
     *
     * This private method provides standardized error formatting that includes
     * HTTP status codes, connection details, and timeout information. It helps
     * create meaningful error messages for debugging and user feedback.
     *
     * @private
     * @param {string} message - Base error message
     * @param {Error} error - Original error object
     * @returns {string} Formatted error message with additional context
     */
    _formatError(message, error) {
        if (error.response) {
            return `${message}: HTTP ${error.response.status} - ${error.response.statusText}`;
        } else if (error.code === 'ECONNREFUSED') {
            return `${message}: Cannot connect to qBittorrent at ${this.baseUrl}`;
        } else if (error.code === 'ETIMEDOUT') {
            return `${message}: Connection timeout`;
        } else {
            return `${message}: ${error.message}`;
        }
    }

    /**
     * Checks if an error is authentication-related.
     *
     * This private method identifies HTTP 401 (Unauthorized) and 403 (Forbidden)
     * responses, which typically indicate session expiration or invalid credentials.
     * Used internally to trigger automatic re-authentication attempts.
     *
     * @private
     * @param {Error} error - Error object to check
     * @returns {boolean} True if error indicates authentication failure
     */
    _isAuthError(error) {
        return (
            error.response &&
            (error.response.status === 401 || error.response.status === 403)
        );
    }
}

module.exports = QBittorrentService;
