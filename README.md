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
# 1. Search torrent sites
curl -X POST http://localhost:3000/search-download \
  -d '{"query": "Inception 2010", "password": "your-password"}'

# 2. Auto-download best result
curl -X POST http://localhost:3000/search-download \
  -d '{"query": "Inception 2010", "autoDownload": true, "password": "your-password"}'

# 3. Monitor downloads
curl "http://localhost:3000/torrents?password=your-password"

# 4. Stream via Jellyfin
# → Files appear in Jellyfin automatically at http://localhost:8096
```

## 🛠️ Prerequisites

-   Docker & Docker Compose installed
-   ~2GB free space for services + downloads
-   Internet connection for torrent indexers

## ⚡ Quick Start

### 1. **Initial Setup**

```bash
git clone <your-repo>
cd rasberry-pi

# Copy environment template
cp env.example .env

# Edit .env and set your API_PASSWORD
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
npm run docker:restart
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
npm run docker:restart
```

### 5. **Test the API**

```bash
# Check API status
curl http://localhost:3000/

# Search for movies
curl -X POST http://localhost:3000/search-download \
  -H "Content-Type: application/json" \
  -d '{"query": "Dune", "password": "your-password"}'

# Check download status
curl "http://localhost:3000/torrents?password=your-password"

# Download a movie automatically
curl -X POST http://localhost:3000/search-download \
  -H "Content-Type: application/json" \
  -d '{"query": "Inception", "autoDownload": true, "password": "your-password"}'
```

## 📡 API Endpoints

### Core Functionality

| Endpoint | Method | Description             | Example                      |
| -------- | ------ | ----------------------- | ---------------------------- |
| `/`      | GET    | Service status & health | `curl http://localhost:3000` |

### Search & Download

| Endpoint           | Method | Description                          | Parameters                                             |
| ------------------ | ------ | ------------------------------------ | ------------------------------------------------------ |
| `/search-download` | POST   | Search torrents, optionally download | `query`, `password`, `autoDownload?`, `downloadIndex?` |
| `/download`        | POST   | Download specific magnet/torrent     | `magnetLink`, `password`, `title?`                     |

### Torrent Management

| Endpoint    | Method | Description                | Parameters                |
| ----------- | ------ | -------------------------- | ------------------------- |
| `/torrents` | GET    | List all torrents & status | `password`, query filters |

### Streaming (Planned)

| Endpoint      | Method | Description        | Parameters       |
| ------------- | ------ | ------------------ | ---------------- |
| `/stream/:id` | GET    | Stream movie by ID | `id`, `password` |

## 🔥 Usage Examples

### **Search Movies**

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

**Response:**

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

### **Download Specific Result**

```bash
curl -X POST http://localhost:3000/search-download \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Inception",
    "downloadIndex": 2,
    "password": "your-password"
  }'
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

| Command                  | Description                               |
| ------------------------ | ----------------------------------------- |
| `npm start`              | 🚀 Start entire stack (first time)        |
| `npm stop`               | 🛑 Stop all services                      |
| `npm run docker:restart` | 🔄 Restart + rebuild (after code changes) |
| `npm run docker:logs`    | 📋 View all logs                          |
| `npm run docker:rebuild` | 🔨 Rebuild containers                     |

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
├── movies/               # 🤖 AUTO-GENERATED - Organized library (gitignored, not implemented)
├── docker-compose.yml    # 🐳 Multi-container setup
└── .env                 # 🔐 Your secrets (gitignored)
```

## 🆕 New Service Architecture

The API now uses a clean **service-based architecture**:

-   **QBittorrentService** - Handles all torrent operations with session management
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
# Restart: npm run docker:restart
```

**❌ Jackett missing API key**

```bash
# Get API key from http://localhost:9117
# Add to .env: JACKETT_API_KEY=your-key
# Restart: npm run docker:restart
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

-   [ ] **Automatic file organization** (downloads → movies folder)
-   [ ] **Real-time download progress** via WebSocket
-   [ ] **Jellyfin API integration** for automatic library updates
-   [ ] **Download quality preferences** (1080p, 4K, etc.)
-   [ ] **Automated subtitle downloading**
-   [ ] **Mobile-friendly web interface**
-   [ ] **Multi-user support with individual libraries**

## 📝 License

This project is open source. Use responsibly and in accordance with your local laws regarding torrenting and media consumption.

---

**🎬 Ready to build your own Netflix? Start downloading!**

```bash
npm start
# Then visit http://localhost:3000
```
