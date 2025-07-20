const axios = require('axios');

/**
 * Simple Jellyfin API Service for personal media server
 *
 * Handles basic operations like authentication, library scanning,
 * and movie retrieval. Kept minimal for personal use.
 */
class JellyfinService {
    constructor(config) {
        this.baseUrl = config.url || 'http://jellyfin:8096';
        this.apiToken = config.token;
        this.timeout = config.timeout || 15000;
        // Hardcoded admin user ID for personal project
        this.userId = 'da4f2b23ac2b42799ba5dcbfccc4b649';

        if (!this.apiToken) {
            throw new Error('Jellyfin API token is required');
        }
    }

    /**
     * Get request headers with authentication
     */
    _getHeaders() {
        return {
            Authorization: `MediaBrowser Token="${this.apiToken}"`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Test connection to Jellyfin server
     */
    async testConnection() {
        try {
            console.log('[Jellyfin] Testing connection...');
            const response = await axios.get(`${this.baseUrl}/System/Info`, {
                headers: this._getHeaders(),
                timeout: this.timeout,
            });

            console.log(
                `[Jellyfin] Connected to ${response.data.ServerName} v${response.data.Version}`
            );
            return { success: true, info: response.data };
        } catch (error) {
            const errorMsg = `Connection failed: ${error.message}`;
            console.error(`[Jellyfin] ${errorMsg}`);
            throw new Error(errorMsg);
        }
    }

    /**
     * Get all libraries
     */
    async getLibraries() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/Library/VirtualFolders`,
                {
                    headers: this._getHeaders(),
                    timeout: this.timeout,
                }
            );

            return response.data;
        } catch (error) {
            console.error('[Jellyfin] Failed to get libraries:', error.message);
            throw new Error(`Failed to get libraries: ${error.message}`);
        }
    }

    /**
     * Scan all libraries for new content
     */
    async scanLibraries() {
        try {
            console.log('[Jellyfin] Starting library scan...');
            const response = await axios.post(
                `${this.baseUrl}/Library/Refresh`,
                {},
                {
                    headers: this._getHeaders(),
                    timeout: this.timeout,
                }
            );

            console.log('[Jellyfin] Library scan started successfully');
            return { success: true, message: 'Library scan started' };
        } catch (error) {
            console.error(
                '[Jellyfin] Failed to start library scan:',
                error.message
            );
            throw new Error(`Failed to scan libraries: ${error.message}`);
        }
    }

    /**
     * Get movies from library
     */
    async getMovies(limit = 50) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/Users/${this.userId}/Items`,
                {
                    headers: this._getHeaders(),
                    params: {
                        IncludeItemTypes: 'Movie',
                        Recursive: true,
                        Limit: limit,
                        Fields: 'BasicSyncInfo,Path,MediaSources',
                        SortBy: 'DateCreated',
                        SortOrder: 'Descending',
                    },
                    timeout: this.timeout,
                }
            );

            const movies = response.data.Items || [];

            return movies.map((movie) => ({
                id: movie.Id,
                name: movie.Name,
                year: movie.ProductionYear,
                overview: movie.Overview,
                path: movie.Path,
                dateAdded: movie.DateCreated,
                streamUrl: `${this.baseUrl}/Videos/${movie.Id}/stream?api_key=${this.apiToken}`,
            }));
        } catch (error) {
            console.error('[Jellyfin] Failed to get movies:', error.message);
            throw new Error(`Failed to get movies: ${error.message}`);
        }
    }

    /**
     * Get specific movie by ID
     */
    async getMovie(movieId) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/Users/${this.userId}/Items/${movieId}`,
                {
                    headers: this._getHeaders(),
                    timeout: this.timeout,
                }
            );

            const movie = response.data;
            return {
                id: movie.Id,
                name: movie.Name,
                year: movie.ProductionYear,
                overview: movie.Overview,
                path: movie.Path,
                dateAdded: movie.DateCreated,
                streamUrl: `${this.baseUrl}/Videos/${movie.Id}/stream?api_key=${this.apiToken}`,
                playbackUrl: `${this.baseUrl}/web/index.html#!/details?id=${movie.Id}`,
            };
        } catch (error) {
            console.error(
                `[Jellyfin] Failed to get movie ${movieId}:`,
                error.message
            );
            throw new Error(`Failed to get movie: ${error.message}`);
        }
    }
}

module.exports = JellyfinService;
