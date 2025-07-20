# Raspberry Pi Media Server

A complete Docker-based media server for searching, downloading, and streaming movies with a powerful public API.

## 🎯 What This Creates

This Docker Compose stack creates a **fully automated media pipeline**:

1. **🔍 Search** - Find movies across multiple torrent sites via Jackett
2. **⬇️ Download** - Automatically download torrents via qBittorrent
3. **📁 Organize** - Store completed downloads in organized library
4. **🎬 Stream** - Stream your movies via Jellyfin media server
5. **🚀 API** - Control everything through REST endpoints with authentication

## 🏗️ Architecture

**4 Docker Services Working Together:**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Custom    │    │   Jackett   │    │ qBittorrent │    │  Jellyfin   │
│     API     │◄──►│   Search    │    │  Download   │    │   Stream    │
│ (Node.js)   │    │   Engine    │    │   Client    │    │   Server    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                    │                  │                  │
       └─────────── Complete Pipeline Automation ──────────────────┘
```

## 🚀 Complete Pipeline Flow

```bash
# 1. Search torrent sites (no download)
curl -X POST http://localhost:3000/search \
  -d '{"query": "Inception 2010", "password": "your-password"}'

# 2. Search and auto-download best result
curl -X POST http://localhost:3000/search-download \
  -d '{"query": "Inception 2010", "password": "your-password"}'

# 3. Monitor downloads
curl "http://localhost:3000/torrents?password=your-password"

# 4. Files are automatically organized every 30 seconds when downloads complete
# (or manually trigger organization if needed)
curl -X POST http://localhost:3000/organize \
  -d '{"password": "your-password"}'

# 5. Scan Jellyfin for new movies
curl -X POST http://localhost:3000/movies/scan \
  -d '{"password": "your-password"}'

# 6. Stream via Jellyfin at http://localhost:8096
```

## 🛠️ Prerequisites

-   **macOS (Apple Silicon)**: For development and testing
-   **Raspberry Pi 4/5 (8GB)**: For final deployment
-   Docker & Docker Compose installed
-   Colima + Docker Buildx (for ARM64 builds)
-   ~2GB free space for services + downloads
-   Internet connection for torrent indexers

## 🔧 Development Setup (Mac → Raspberry Pi)

This project uses **ARM64 Docker images** that work on both your Mac and Raspberry Pi. Follow these steps to set up the development environment:

### 1. **Install Colima + Buildx**

```bash
# Install via Homebrew
brew install colima docker docker-buildx

# Create CLI plugins directory
mkdir -p ~/.docker/cli-plugins

# Link Buildx plugin
ln -sf /opt/homebrew/bin/docker-buildx ~/.docker/cli-plugins/docker-buildx
```

### 2. **Start Colima (Pi-matching specs)**

```bash
# Start Colima with Raspberry Pi 4/5 matching specs:
# - 4 CPU cores (same as Pi)
# - 5GB RAM (leaving 3GB for Pi OS)
# - ARM64 architecture (native on both Mac and Pi)
colima start --cpu 4 --memory 5 --disk 30 --vm-type=vz --arch aarch64
```

### 3. **Configure ARM64 Builder**

```bash
# Create dedicated ARM64 builder
docker buildx create --name pibuilder --driver docker-container --platform linux/arm64

# Set as active builder
docker buildx use pibuilder

# Initialize builder
docker buildx inspect --bootstrap
```

## ⚡ Quick Start

### 1. **Project Setup**

```bash
git clone <your-repo>
cd rasberry-pi

# Ensure Colima is running (from Development Setup above)
colima status  # Should show "Running"

# The .env file is already configured with default values
# Edit .env and update your API_PASSWORD and other credentials as needed
nano .env
```

### 2. **Start All Services**

```bash
npm start              # Builds API + starts all 4 services
```

### 3. **Configure Jackett (REQUIRED)**

```bash
# Open Jackett web interface
open http://localhost:9117

# Add indexers: Click "Add Indexer" → Add public trackers
# Copy API key: Top-right corner → Copy API Key
# Update .env file:
echo "JACKETT_API_KEY=your-copied-api-key" >> .env

# Restart services
npm restart
```

### 4. **Configure qBittorrent (REQUIRED)**

```bash
# Open qBittorrent web interface
open http://localhost:8080

# Login with: admin / <temporary-password-from-logs>
docker logs qbittorrent | grep "temporary password"

# Set permanent password in WebUI → Tools → Options → WebUI
# Update .env file:
echo "QBITTORRENT_PASSWORD=your-permanent-password" >> .env

# Restart services
npm restart
```

### 5. **Configure Jellyfin (REQUIRED for streaming)**

```bash
# Open Jellyfin web interface
open http://localhost:8096

# Complete initial setup: Create admin user, add media libraries
# Point library to: /media/downloads (for new files) and /media/movies (organized files)

# Generate API key: Dashboard → Advanced → API Keys → Create new key
# Update .env file:
echo "JELLYFIN_TOKEN=your-api-key-here" >> .env

# Restart services
npm restart
```

### 6. **Test the API**

```bash
# Check API status
curl http://localhost:3000/

# Search for movies (no download)
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Dune", "password": "your-password"}'

# Search and optionally download movies
curl -X POST http://localhost:3000/search-download \
  -H "Content-Type: application/json" \
  -d '{"query": "Dune", "password": "your-password"}'

# Check download status
curl "http://localhost:3000/torrents?password=your-password"

# Search and automatically download best movie
curl -X POST http://localhost:3000/search-download \
  -H "Content-Type: application/json" \
  -d '{"query": "Inception", "password": "your-password"}'

# List movies in Jellyfin library
curl "http://localhost:3000/movies?password=your-password"

# Organize completed downloads (move from /downloads to /movies)
curl -X POST http://localhost:3000/organize \
  -H "Content-Type: application/json" \
  -d '{"password": "your-password"}'

# Scan Jellyfin libraries for new content
curl -X POST http://localhost:3000/movies/scan \
  -H "Content-Type: application/json" \
  -d '{"password": "your-password"}'
```

## 🚀 Deployment Workflow (Mac → Raspberry Pi)

Your development workflow creates **identical ARM64 images** that run on both Mac and Pi:

### **Development & Testing (Mac)**

```bash
# Build ARM64 images locally
npm run docker:build

# Test full stack on Mac
npm start

# Everything runs natively at ARM64 speed
```

### **Deploy to Raspberry Pi**

```bash
# Option 1: Export/Import (for offline Pi)
docker save media-api:arm64 | gzip > media-api-arm64.tar.gz
# Transfer file to Pi, then:
docker load < media-api-arm64.tar.gz

# Option 2: Registry (for connected Pi)
docker tag media-api:arm64 your-registry/media-api:arm64
docker push your-registry/media-api:arm64
# On Pi: docker pull your-registry/media-api:arm64

# Option 3: Rebuild on Pi (same commands work)
git pull && npm start
```

### **Benefits**

-   ✅ **Native Performance**: ARM64 on both Mac and Pi
-   ✅ **Identical Images**: No architecture surprises
-   ✅ **Fast Testing**: No emulation overhead
-   ✅ **Pi-Optimized**: Built with Pi memory constraints in mind

## 📡 API Endpoints

### Core Functionality

| Endpoint | Method | Description             | Example                      |
| -------- | ------ | ----------------------- | ---------------------------- |
| `/`      | GET    | Service status & health | `curl http://localhost:3000` |

### Search & Download

| Endpoint           | Method | Description                                    | Parameters                         |
| ------------------ | ------ | ---------------------------------------------- | ---------------------------------- |
| `/search`          | POST   | Search torrents with download preview metadata | `query`, `password`                |
| `/search-download` | POST   | Search and auto-download best torrent          | `query`, `password`                |
| `/download`        | POST   | Download specific magnet/torrent               | `magnetLink`, `password`, `title?` |

### Torrent Management

| Endpoint    | Method | Description                | Parameters                |
| ----------- | ------ | -------------------------- | ------------------------- |
| `/torrents` | GET    | List all torrents & status | `password`, query filters |

### File Organization

| Endpoint    | Method | Description                                         | Parameters |
| ----------- | ------ | --------------------------------------------------- | ---------- |
| `/organize` | POST   | Move completed downloads from /downloads to /movies | `password` |

### Jellyfin & Streaming

| Endpoint       | Method | Description                    | Parameters           |
| -------------- | ------ | ------------------------------ | -------------------- |
| `/movies`      | GET    | List all movies in library     | `password`, `limit?` |
| `/movies/:id`  | GET    | Get movie details              | `id`, `password`     |
| `/stream/:id`  | GET    | Stream movie by ID             | `id`, `password`     |
| `/movies/scan` | POST   | Scan libraries for new content | `password`           |

## 🔥 Usage Examples

### **Search Movies (No Download)**

```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Inception",
    "password": "your-password"
  }'
```

**Response includes download metadata:**

```json
{
    "message": "Found 10 results for \"Inception\"",
    "query": "Inception",
    "results": [
        {
            "title": "Inception 2010 UHD BluRay 2160p DTS HD MA 5 1 DV HEVC HYBRID REMU",
            "size": "66.30 GB",
            "seeders": 599,
            "peers": 143,
            "magnetLink": "magnet:?xt=urn:btih:...",
            "indexer": "TheRARBG"
        }
    ],
    "downloadMetadata": {
        "wouldDownload": {
            "index": 0,
            "result": {
                "title": "Inception 2010 UHD BluRay 2160p DTS HD MA 5 1 DV HEVC HYBRID REMU",
                "size": "66.30 GB",
                "seeders": 599,
                "peers": 143
            },
            "reason": "Highest seeders (results sorted by seeders descending)",
            "note": "This would be downloaded if using /search-download (always auto-downloads best result)"
        }
    }
}
```

### **Search and Auto-Download Best Result**

```bash
curl -X POST http://localhost:3000/search-download \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Inception",
    "password": "your-password"
  }'
```

**Response:**

```json
{
    "message": "Found 10 results for \"Inception\"",
    "query": "Inception",
    "results": [
        {
            "title": "Inception 2010 UHD BluRay 2160p DTS HD MA 5 1 DV HEVC HYBRID REMU",
            "size": "66.30 GB",
            "seeders": 0,
            "peers": 169,
            "magnetLink": "magnet:?xt=urn:btih:...",
            "indexer": "TheRARBG",
            "publishDate": "2025-06-25T13:35:07+00:00"
        },
        {
            "title": "Inception 2010 1080p MAX WEB-DL DDP 5 1 H 265-PiRaTeS",
            "size": "2.55 GB",
            "seeders": 599,
            "peers": 143,
            "indexer": "TheRARBG"
        }
        // ... 8 more results
    ]
}
```

### **Auto-Download Best Result**

```bash
curl -X POST http://localhost:3000/search-download \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Inception",
    "autoDownload": true,
    "password": "your-password"
  }'
```

### **Organize Completed Downloads**

After downloads finish, move them from `/downloads` to `/movies` for better organization and Jellyfin library management:

```bash
curl -X POST http://localhost:3000/organize \
  -H "Content-Type: application/json" \
  -d '{
    "password": "your-password"
  }'
```

**Response:**

```json
{
    "message": "Organized 1 items, 0 errors",
    "organized": [
        {
            "original": "Inception.2010.UHD.BluRay.2160p.DTS-HD.MA.5.1.DV.HEVC.HYBRID.REMUX-FraMeSToR",
            "organized": "Inception 2010 UHD BluRay 2160p DTS HD MA 5 1 DV HEVC HYBRID REMUX FraMeSToR",
            "path": "/app/movies/Inception 2010 UHD BluRay 2160p DTS HD MA 5 1 DV HEVC HYBRID REMUX FraMeSToR"
        }
    ],
    "timestamp": "2025-07-19T19:55:16.447Z"
}
```

**Response (automatically downloads best result):**

```json
{
  "message": "Found 10 results for \"Inception\"",
  "results": [...],
  "download": {
    "success": true,
    "downloadedTorrent": {
      "title": "Inception 2010 UHD BluRay 2160p DTS HD MA 5 1 DV HEVC HYBRID REMU",
      "size": "66.30 GB",
      "seeders": 0,
      "indexer": "TheRARBG"
    },
    "downloadIndex": 0,
    "message": "Successfully added \"Inception 2010 UHD BluRay 2160p DTS HD MA 5 1 DV HEVC HYBRID REMU\" to qBittorrent"
  }
}
```

### **Monitor Downloads**

```bash
# List all active torrents and their status
curl "http://localhost:3000/torrents?password=your-password"
```

**Response:**

```json
{
    "message": "Found 2 torrents",
    "torrents": [
        {
            "name": "Inception 2010 UHD BluRay...",
            "size": 71140086723,
            "progress": 0,
            "state": "missingFiles",
            "eta": 8640000,
            "downloaded": 7526392796,
            "uploaded": 3398155
        }
    ],
    "timestamp": "2025-07-19T18:44:49.358Z"
}
```

**Alternative**: Use qBittorrent web interface directly at http://localhost:8080

### **Direct Magnet Download**

```bash
curl -X POST http://localhost:3000/download \
  -H "Content-Type: application/json" \
  -d '{
    "magnetLink": "magnet:?xt=urn:btih:...",
    "title": "My Movie",
    "password": "your-password"
  }'
```

## 🌐 Web Interfaces

-   **API Dashboard**: http://localhost:3000 (your REST API)
-   **qBittorrent**: http://localhost:8080 (download management)
-   **Jackett**: http://localhost:9117 (search configuration)
-   **Jellyfin**: http://localhost:8096 (media streaming)

## 🛠️ NPM Scripts

| Command                 | Description                                |
| ----------------------- | ------------------------------------------ |
| `npm start`             | 🚀 Start entire stack (builds ARM64 first) |
| `npm stop`              | 🛑 Stop all services                       |
| `npm restart`           | 🔄 Restart + rebuild (after code changes)  |
| `npm run docker:build`  | 🔨 Build ARM64 API image                   |
| `npm run docker:logs`   | 📋 View all logs                           |
| `npm run docker:export` | 📦 Export ARM64 image for Pi deployment    |

## 📂 Directory Structure

```
rasberry-pi/
├── api/                    # 🎯 Your Node.js API
│   ├── src/
│   │   ├── index.js       # Main API endpoints
│   │   └── QBittorrentService.js  # 🆕 Service class
│   ├── package.json
│   └── Dockerfile
├── config/                # 🤖 AUTO-GENERATED (gitignored)
│   ├── jackett/          # Search indexer configs
│   ├── qbittorrent/      # Download client settings
│   └── jellyfin/         # Media server database
├── downloads/             # 🤖 AUTO-GENERATED - Active downloads (gitignored)
├── movies/               # 🤖 AUTO-GENERATED - Organized library (use /organize to populate)
├── docker-compose.yml    # 🐳 Multi-container setup
└── .env                 # 🔐 Your secrets (gitignored)
```

## 🔄 Complete Media Workflow

Your media server follows this **automated pipeline**:

1. **🔍 Search & Download** - Find and download movies via `/search-download`
2. **📁 Organize Files** - Automatically move completed downloads every 30s (or manually via `/organize`)
3. **🔄 Scan Library** - Automatically scan Jellyfin libraries when files are organized
4. **🎬 Stream** - Watch your organized movies via Jellyfin UI

### Automatic Organization

-   **Automatic**: Files are organized every 30 seconds when downloads complete
-   **Manual**: You can still call `/organize` manually if needed
-   **Integrated**: Auto-triggers Jellyfin library scan after organizing files
-   **Best Practice**: Let the system handle it automatically, or manually run organize → check movies

## 🆕 Service Architecture

The API uses a clean **service-based architecture**:

-   **QBittorrentService** - Handles all torrent operations with session management
-   **JellyfinService** - Manages media library and streaming integration
-   **Automatic organization** - Monitors downloads every 30s and organizes completed files
-   **Automatic reconnection** - Handles session timeouts gracefully
-   **Comprehensive error handling** - Detailed error messages and recovery

## 🔧 Advanced Configuration

### Environment Variables

```bash
# Core API
API_PASSWORD=your-secure-password
PORT=3000

# Service URLs (auto-configured in docker-compose)
JACKETT_URL=http://jackett:9117
QBITTORRENT_URL=http://qbittorrent:8080
JELLYFIN_URL=http://jellyfin:8096

# Required API Keys & Credentials
JACKETT_API_KEY=your-jackett-api-key
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your-qbittorrent-password
JELLYFIN_TOKEN=your-jellyfin-api-token
```

### Custom Download Options

```bash
# Download with custom options
curl -X POST http://localhost:3000/download \
  -H "Content-Type: application/json" \
  -d '{
    "magnetLink": "magnet:?xt=urn:btih:...",
    "title": "My Movie",
    "savepath": "/downloads/movies/",
    "category": "movies",
    "password": "your-password"
  }'
```

## 🚨 Troubleshooting

### **Service Status Check**

```bash
# Check API status
curl http://localhost:3000/
# Returns: {"message":"Media Server API is running!"}
```

**Service Web Interfaces**:

-   qBittorrent: http://localhost:8080
-   Jackett: http://localhost:9117
-   Jellyfin: http://localhost:8096

### Common Issues

**❌ qBittorrent not configured**

```bash
# Check qBittorrent logs for temporary password
docker logs qbittorrent | grep "password"

# Set permanent password via http://localhost:8080
# Update .env with QBITTORRENT_PASSWORD=your-password
# Restart: npm restart
```

**❌ Jackett missing API key**

```bash
# Get API key from http://localhost:9117
# Add to .env: JACKETT_API_KEY=your-key
# Restart: npm restart
```

**❌ Search timeouts**

```bash
# Check Jackett has working indexers
open http://localhost:9117
# Test indexers individually
# Remove broken ones, add working alternatives
```

**❌ Downloads not starting**

```bash
# Test direct download endpoint
curl -X POST http://localhost:3000/download \
  -d '{"magnetLink": "magnet:?xt=urn:btih:example", "password": "your-password"}'

# Check qBittorrent WebUI for errors
open http://localhost:8080
```

### Debug Commands

```bash
# View API logs
docker logs media-api --tail 50

# View all service logs
npm run docker:logs

# Test individual services
curl http://localhost:9117/api/v2.0/indexers  # Requires API key
curl http://localhost:8080/api/v2/app/version # Requires login

# Restart problematic service
docker-compose restart qbittorrent
docker-compose restart jackett
```

## 🔮 Future Enhancements

-   [x] **File organization** (downloads → movies folder) - ✅ **COMPLETED**
-   [x] **Jellyfin API integration** - ✅ **COMPLETED**
-   [x] **ARM64 Docker builds** (Mac → Pi deployment) - ✅ **COMPLETED**
-   [x] **Automated organization** (trigger organize after downloads complete) - ✅ **COMPLETED**
-   [ ] **Real-time download progress** via WebSocket
-   [ ] **Download quality preferences** (1080p, 4K, etc.)
-   [ ] **Automated subtitle downloading**
-   [ ] **Mobile-friendly web interface**
-   [ ] **Multi-user support with individual libraries**
