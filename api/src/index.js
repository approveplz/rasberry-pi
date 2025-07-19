const express = require('express');
const cors = require('cors');
const axios = require('axios');
const QBittorrentService = require('./QBittorrentService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_PASSWORD = process.env.API_PASSWORD || 'defaultpassword';

// Service URLs from environment
const JACKETT_URL = process.env.JACKETT_URL || 'http://jackett:9117';
const JACKETT_API_KEY = process.env.JACKETT_API_KEY;

// Initialize qBittorrent service
let qbittorrentService = null;
try {
    qbittorrentService = new QBittorrentService({
        url: process.env.QBITTORRENT_URL || 'http://qbittorrent:8080',
        username: process.env.QBITTORRENT_USERNAME || 'admin',
        password: process.env.QBITTORRENT_PASSWORD,
        loginTimeout: 10000,
        requestTimeout: 15000,
    });
    console.log('✅ qBittorrent service initialized');
} catch (error) {
    console.warn('⚠️  qBittorrent service not available:', error.message);
    console.warn('   Download functionality will be disabled');
}

app.use(cors());
app.use(express.json());

// Password middleware
const requirePassword = (req, res, next) => {
    const password = req.query.password || req.body.password;
    if (password !== API_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    next();
};

// Helper function to search Jackett
async function searchJackett(query) {
    if (!JACKETT_API_KEY) {
        throw new Error(
            'JACKETT_API_KEY not configured. Please set it in your .env file.'
        );
    }

    try {
        console.log(`🔍 Searching Jackett for: "${query}"`);

        // Jackett API endpoint for searching all indexers
        const response = await axios.get(
            `${JACKETT_URL}/api/v2.0/indexers/all/results`,
            {
                params: {
                    apikey: JACKETT_API_KEY,
                    Query: query,
                    Category: 2000, // Movies category
                },
                timeout: 30000, // 30 second timeout
            }
        );

        const results = response.data.Results || [];
        console.log(`📊 Found ${results.length} results from Jackett`);

        // Filter for files between 2GB-15GB (720p-1080p range) and sort by seeders
        const filteredResults = results
            .filter((result) => {
                const sizeGB = result.Size
                    ? result.Size / (1024 * 1024 * 1024)
                    : 0;
                return sizeGB >= 2 && sizeGB <= 15; // Min 2GB (720p), Max 15GB (no 4K)
            })
            .sort((a, b) => (b.Seeders || 0) - (a.Seeders || 0));

        // Format results for our API
        return filteredResults.slice(0, 10).map((result) => ({
            title: result.Title,
            size: result.Size
                ? `${(result.Size / 1024 / 1024 / 1024).toFixed(2)} GB`
                : 'Unknown',
            seeders: result.Seeders || 0,
            peers: result.Peers || 0,
            magnetLink: result.MagnetUri || result.Link,
            indexer: result.Tracker,
            publishDate: result.PublishDate,
        }));
    } catch (error) {
        console.error('❌ Jackett search error:', error.message);

        if (error.response?.status === 401) {
            throw new Error('Invalid Jackett API key');
        } else if (error.code === 'ECONNREFUSED') {
            throw new Error(
                'Cannot connect to Jackett. Make sure it is running.'
            );
        } else {
            throw new Error(`Jackett search failed: ${error.message}`);
        }
    }
}

// Root endpoint - Basic API status
app.get('/', (req, res) => {
    res.json({
        message: 'Media Server API is running!',
        version: '1.0.0',
        endpoints: {
            'GET /': 'API status',
            'POST /search-download':
                'Search and download torrents (requires password)',
            'POST /download': 'Download magnet link (requires password)',
            'GET /torrents': 'List all torrents (requires password)',
            'GET /stream/:id': 'Stream movie by ID (requires password)',
        },
        timestamp: new Date().toISOString(),
    });
});

app.post('/search-download', requirePassword, async (req, res) => {
    const { query, autoDownload, downloadIndex } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const searchResults = await searchJackett(query);

        let downloadResult = null;

        // Handle download request
        if (
            (autoDownload || downloadIndex !== undefined) &&
            qbittorrentService
        ) {
            const indexToDownload =
                downloadIndex !== undefined ? downloadIndex : 0;

            if (
                indexToDownload < 0 ||
                indexToDownload >= searchResults.length
            ) {
                return res.status(400).json({
                    error: 'Invalid download index',
                    details: `Index must be between 0 and ${
                        searchResults.length - 1
                    }`,
                    results: searchResults,
                });
            }

            const selectedTorrent = searchResults[indexToDownload];

            if (!selectedTorrent.magnetLink) {
                return res.status(400).json({
                    error: 'Selected torrent has no magnet link',
                    selectedTorrent: selectedTorrent,
                    results: searchResults,
                });
            }

            try {
                console.log(`⬇️  Downloading: ${selectedTorrent.title}`);

                const result = await qbittorrentService.addTorrent(
                    selectedTorrent.magnetLink
                );

                downloadResult = {
                    success: true,
                    downloadedTorrent: {
                        title: selectedTorrent.title,
                        size: selectedTorrent.size,
                        seeders: selectedTorrent.seeders,
                        indexer: selectedTorrent.indexer,
                    },
                    downloadIndex: indexToDownload,
                    message: `Successfully added "${selectedTorrent.title}" to qBittorrent`,
                };
            } catch (downloadError) {
                downloadResult = {
                    success: false,
                    error: 'Download failed',
                    details: downloadError.message,
                    selectedTorrent: selectedTorrent,
                };
            }
        } else if (
            (autoDownload || downloadIndex !== undefined) &&
            !qbittorrentService
        ) {
            downloadResult = {
                success: false,
                error: 'Download unavailable',
                details: 'qBittorrent service not configured',
            };
        }

        res.json({
            message: `Found ${searchResults.length} results for "${query}"`,
            query: query,
            results: searchResults,
            download: downloadResult,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('❌ Search failed:', error.message);

        res.status(500).json({
            error: 'Search failed',
            details: error.message,
            query: query,
        });
    }
});

// Direct download endpoint
app.post('/download', requirePassword, async (req, res) => {
    const { magnetLink, title } = req.body;

    if (!magnetLink) {
        return res
            .status(400)
            .json({ error: 'magnetLink parameter is required' });
    }

    if (!qbittorrentService) {
        return res.status(500).json({
            error: 'Download service unavailable',
            details: 'qBittorrent service not configured',
        });
    }

    try {
        console.log(`⬇️  Adding torrent: ${title || 'Unknown'}`);

        const result = await qbittorrentService.addTorrent(magnetLink);

        res.json({
            message: 'Torrent successfully added to qBittorrent',
            torrent: {
                title: title || 'Unknown',
                magnetLink: magnetLink,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('❌ Download failed:', error.message);

        res.status(500).json({
            error: 'Download failed',
            details: error.message,
            magnetLink: magnetLink,
        });
    }
});

// Get torrent status endpoint
app.get('/torrents', requirePassword, async (req, res) => {
    if (!qbittorrentService) {
        return res.status(500).json({
            error: 'Service unavailable',
            details: 'qBittorrent service not configured',
        });
    }

    try {
        const filters = req.query;
        const torrents = await qbittorrentService.getTorrents(filters);

        res.json({
            message: `Found ${torrents.length} torrents`,
            torrents: torrents,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('❌ Failed to get torrents:', error.message);

        res.status(500).json({
            error: 'Failed to get torrents',
            details: error.message,
        });
    }
});

// Stream/download movie (mocked)
app.get('/stream/:id', requirePassword, (req, res) => {
    const { id } = req.params;
    console.log(`📺 Mock: Streaming movie ID: ${id}`);

    res.json({
        message: `Mock: Streaming movie ${id}`,
        streamUrl: `http://localhost:${PORT}/mock-stream/${id}`,
        status: 'ready',
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    if (qbittorrentService) {
        await qbittorrentService.logout();
    }
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`🚀 Media Server API running on port ${PORT}`);
    console.log(`🔑 API Password: ${API_PASSWORD}`);
    console.log(`📡 Endpoints available at http://localhost:${PORT}`);
});
