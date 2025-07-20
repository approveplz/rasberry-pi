// Node.js built-in modules
const fs = require('fs').promises;
const path = require('path');

// npm packages
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// Local modules
const QBittorrentService = require('./QBittorrentService');
const JellyfinService = require('./JellyfinService');

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

// Initialize Jellyfin service
let jellyfinService = null;
try {
    jellyfinService = new JellyfinService({
        url: process.env.JELLYFIN_URL || 'http://jellyfin:8096',
        token: process.env.JELLYFIN_TOKEN,
    });
    console.log('✅ Jellyfin service initialized');
} catch (error) {
    console.warn('⚠️  Jellyfin service not available:', error.message);
    console.warn('   Streaming functionality will be disabled');
}

// Auto-organization tracking
const processedTorrents = new Set(); // Track torrents we've already organized
let organizationRunning = false; // Prevent concurrent organization runs

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

// Helper function to organize completed downloads
async function organizeDownloads() {
    try {
        const downloadsDir = '/app/downloads';
        const moviesDir = '/app/movies';

        // Check if directories exist
        await fs.access(downloadsDir);
        await fs.access(moviesDir);

        // Get all items in downloads directory
        const downloadItems = await fs.readdir(downloadsDir, {
            withFileTypes: true,
        });
        const folders = downloadItems.filter((item) => item.isDirectory());

        if (folders.length === 0) {
            return { organized: [], errors: [] };
        }

        const organized = [];
        const errors = [];

        for (const folder of folders) {
            const sourcePath = path.join(downloadsDir, folder.name);

            // Create a cleaner movie folder name
            const cleanName = folder.name
                .replace(/\.(mkv|mp4|avi)$/i, '') // Remove video extensions
                .replace(/[\[\]()]/g, '') // Remove brackets
                .replace(/[._-]+/g, ' ') // Replace dots, underscores, dashes with spaces
                .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                .trim();

            const destPath = path.join(moviesDir, cleanName);

            try {
                // Check if destination already exists
                try {
                    await fs.access(destPath);
                    errors.push({
                        folder: folder.name,
                        error: 'Destination already exists',
                        destination: cleanName,
                    });
                    continue;
                } catch {
                    // Destination doesn't exist, good to proceed
                }

                // Copy the folder (cross-device move)
                await fs.cp(sourcePath, destPath, { recursive: true });
                // Remove the original after successful copy
                await fs.rm(sourcePath, { recursive: true, force: true });

                organized.push({
                    original: folder.name,
                    organized: cleanName,
                    path: destPath,
                });

                console.log(
                    `📁 Auto-organized: "${folder.name}" → "${cleanName}"`
                );
            } catch (moveError) {
                errors.push({
                    folder: folder.name,
                    error: moveError.message,
                    destination: cleanName,
                });
                console.error(
                    `❌ Failed to organize "${folder.name}":`,
                    moveError.message
                );
            }
        }

        return { organized, errors };
    } catch (error) {
        console.error('❌ Organization failed:', error.message);
        throw error;
    }
}

// Background service to check for completed torrents and auto-organize
async function checkForCompletedTorrents() {
    if (!qbittorrentService || organizationRunning) {
        return;
    }

    try {
        organizationRunning = true;

        // Get completed torrents
        const torrents = await qbittorrentService.getTorrents({
            filter: 'completed',
        });

        // Find new completed torrents we haven't processed yet
        const newCompletedTorrents = torrents.filter(
            (torrent) =>
                !processedTorrents.has(torrent.hash) && torrent.progress === 1
        );

        if (newCompletedTorrents.length > 0) {
            console.log(
                `🎉 Found ${newCompletedTorrents.length} newly completed torrents`
            );

            // Mark torrents as processed
            newCompletedTorrents.forEach((torrent) => {
                processedTorrents.add(torrent.hash);
                console.log(`✅ Completed: "${torrent.name}"`);
            });

            // Auto-organize downloads
            const organizeResult = await organizeDownloads();

            if (organizeResult.organized.length > 0) {
                console.log(
                    `📁 Auto-organized ${organizeResult.organized.length} items`
                );

                // Auto-scan Jellyfin libraries if available
                if (jellyfinService) {
                    try {
                        await jellyfinService.scanLibraries();
                        console.log(`🔄 Auto-triggered Jellyfin library scan`);
                    } catch (scanError) {
                        console.warn(
                            `⚠️  Failed to auto-scan Jellyfin: ${scanError.message}`
                        );
                    }
                }
            }

            if (organizeResult.errors.length > 0) {
                console.warn(
                    `⚠️  ${organizeResult.errors.length} organization errors occurred`
                );
            }
        }
    } catch (error) {
        console.error('❌ Auto-organization check failed:', error.message);
    } finally {
        organizationRunning = false;
    }
}

// Start auto-organization monitor (check every 30 seconds)
if (qbittorrentService) {
    console.log('🤖 Starting auto-organization monitor (every 30s)');
    setInterval(checkForCompletedTorrents, 30 * 1000);
}

// Root endpoint - Basic API status
app.get('/', (req, res) => {
    res.json({
        message: 'Media Server API is running!',
        version: '1.0.0',
        endpoints: {
            'GET /': 'API status',
            'POST /search': 'Search torrents with download preview metadata',
            'POST /search-download': 'Search and auto-download best torrent',
            'POST /download': 'Download magnet link',
            'GET /torrents': 'List all torrents',
            'GET /movies': 'List all movies from Jellyfin',
            'GET /movies/:id': 'Get movie details',
            'GET /stream/:id': 'Stream movie by ID',
            'POST /movies/scan': 'Scan Jellyfin libraries',
            'POST /organize': 'Organize downloads to movies library',
        },
        timestamp: new Date().toISOString(),
    });
});

// Search endpoint - Search torrents without downloading
app.post('/search', requirePassword, async (req, res) => {
    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const searchResults = await searchJackett(query);

        // Add metadata about which file would be auto-downloaded
        const autoDownloadMetadata =
            searchResults.length > 0
                ? {
                      wouldDownload: {
                          index: 0,
                          result: searchResults[0],
                          reason: 'Highest seeders (results sorted by seeders descending)',
                          note: 'This would be downloaded if using /search-download (always auto-downloads best result)',
                      },
                  }
                : {
                      wouldDownload: null,
                      note: 'No results available for download',
                  };

        res.json({
            message: `Found ${searchResults.length} results for "${query}"`,
            query: query,
            results: searchResults,
            downloadMetadata: autoDownloadMetadata,
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

app.post('/search-download', requirePassword, async (req, res) => {
    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const searchResults = await searchJackett(query);

        let downloadResult = null;

        // Always attempt to download best result (index 0)
        if (qbittorrentService && searchResults.length > 0) {
            const selectedTorrent = searchResults[0];

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
        } else if (!qbittorrentService) {
            downloadResult = {
                success: false,
                error: 'Download unavailable',
                details: 'qBittorrent service not configured',
            };
        } else if (searchResults.length === 0) {
            downloadResult = {
                success: false,
                error: 'No results to download',
                details: 'Search returned no results',
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

// Get all movies from Jellyfin
app.get('/movies', requirePassword, async (req, res) => {
    if (!jellyfinService) {
        return res.status(500).json({
            error: 'Streaming service unavailable',
            details: 'Jellyfin service not configured',
        });
    }

    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;
        const movies = await jellyfinService.getMovies(limit);

        res.json({
            message: `Found ${movies.length} movies`,
            movies: movies,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('❌ Failed to get movies:', error.message);
        res.status(500).json({
            error: 'Failed to get movies',
            details: error.message,
        });
    }
});

// Get specific movie by ID
app.get('/movies/:id', requirePassword, async (req, res) => {
    if (!jellyfinService) {
        return res.status(500).json({
            error: 'Streaming service unavailable',
            details: 'Jellyfin service not configured',
        });
    }

    try {
        const { id } = req.params;
        const movie = await jellyfinService.getMovie(id);

        res.json({
            message: `Movie details for ${movie.name}`,
            movie: movie,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error(
            `❌ Failed to get movie ${req.params.id}:`,
            error.message
        );
        res.status(500).json({
            error: 'Failed to get movie',
            details: error.message,
        });
    }
});

// Stream/redirect to movie
app.get('/stream/:id', requirePassword, async (req, res) => {
    if (!jellyfinService) {
        return res.status(500).json({
            error: 'Streaming service unavailable',
            details: 'Jellyfin service not configured',
        });
    }

    try {
        const { id } = req.params;
        const movie = await jellyfinService.getMovie(id);

        // Redirect to Jellyfin's direct stream URL
        res.redirect(movie.streamUrl);
    } catch (error) {
        console.error(
            `❌ Failed to stream movie ${req.params.id}:`,
            error.message
        );
        res.status(500).json({
            error: 'Failed to stream movie',
            details: error.message,
        });
    }
});

// Scan Jellyfin libraries
app.post('/movies/scan', requirePassword, async (req, res) => {
    if (!jellyfinService) {
        return res.status(500).json({
            error: 'Streaming service unavailable',
            details: 'Jellyfin service not configured',
        });
    }

    try {
        const result = await jellyfinService.scanLibraries();

        res.json({
            message: 'Library scan initiated',
            result: result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('❌ Failed to scan libraries:', error.message);
        res.status(500).json({
            error: 'Failed to scan libraries',
            details: error.message,
        });
    }
});

// Organize downloaded movies endpoint (manual trigger)
app.post('/organize', requirePassword, async (req, res) => {
    try {
        console.log('📁 Manual organization triggered');
        const result = await organizeDownloads();

        res.json({
            message: `Organized ${result.organized.length} items, ${result.errors.length} errors`,
            organized: result.organized,
            errors: result.errors.length > 0 ? result.errors : undefined,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('❌ Manual organization failed:', error.message);
        res.status(500).json({
            error: 'Organization failed',
            details: error.message,
        });
    }
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
