# Raspberry Pi Media Server with Overseerr

A complete Docker-based media server for requesting, downloading, and streaming movies with a beautiful web interface powered by Overseerr.

## 🎯 What This Creates

This Docker Compose stack creates a **fully automated media pipeline**:

1. **🎨 Request** - Beautiful web UI for requesting movies/TV shows via Overseerr
2. **🔍 Search** - Automatically search torrent sites via Jackett integration
3. **⬇️ Download** - Automatically download approved requests via qBittorrent
4. **📁 Organize** - Store completed downloads in organized library
5. **🎬 Stream** - Stream your movies via Plex media server
6. **🔄 Sync** - Automatic library scanning and status updates

## 🏗️ Architecture

**5 Docker Services Working Together:**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Overseerr  │    │   Radarr    │    │   Jackett   │    │ qBittorrent │    │    Plex     │
│   Web UI    │◄──►│   Movie     │◄──►│   Search    │    │  Download   │    │   Stream    │
│ (Requests)  │    │ Management  │    │   Engine    │    │   Client    │    │   Server    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                    │                  │                  │                  │
       └─────────── Complete Pipeline Automation ──────────────────────────────────────┘
```

## 🚀 Complete Pipeline Flow

```bash
# 1. Start all services
npm start

# 2. Access Overseerr web interface
open http://localhost:5055

# 3. Configure services in Overseerr:
#    - Add Plex server
#    - Add Radarr server (with Jackett integration)
#    - Configure user permissions and auto-approval

# 4. Request movies through the beautiful web UI
# 5. Approve requests (or set auto-approval)
# 6. Downloads start automatically
# 7. Radarr organizes files and they appear in Plex
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

# Start all services
npm start
```

### 2. **Configure Overseerr (REQUIRED)**

```bash
# Open Overseerr web interface
open http://localhost:5055

# Complete initial setup:
# 1. Create admin account
# 2. Add Jellyfin server (http://jellyfin:8096)
# 3. Add qBittorrent download client (http://qbittorrent:8080)
# 4. Add Jackett indexers (http://jackett:9117)
```

### 3. **Configure Jackett (REQUIRED)**

```bash
# Open Jackett web interface
open http://localhost:9117

# Add indexers: Click "Add Indexer" → Add public trackers
# Copy API key: Top-right corner → Copy API Key
# Add to Overseerr: Settings → Download Clients → Jackett
```

### 4. **Configure qBittorrent (REQUIRED)**

```bash
# Open qBittorrent web interface
open http://localhost:8080

# Login with: admin / <temporary-password-from-logs>
docker logs qbittorrent | grep "temporary password"

# Set permanent password in WebUI → Tools → Options → WebUI
# Add to Overseerr: Settings → Download Clients → qBittorrent
```

### 5. **Configure Radarr (REQUIRED for movie management)**

```bash
# Open Radarr web interface
open http://localhost:7878/web

# Complete initial setup: Create admin user, add movie library
# Point library to: /media/movies (your movie library)

# Get API key: Settings → General → Security → API Key
# Add to Overseerr: Settings → Services → Radarr
```

### 6. **Connect Radarr to Jackett (REQUIRED for searching)**

```bash
# In Radarr, go to Settings → Indexers
# Click "Add Indexer" → "Torznab"

# Configure the Torznab indexer:
# Name: Jackett
# URL: http://localhost:9117/api/v2.0/indexers/all/results/torznab
# API Key: (Copy from Jackett web interface - top right "Copy API Key" button)

# Enable all search options:
# ✅ Enable RSS
# ✅ Enable Automatic Search
# ✅ Enable Interactive Search

# Click "Test" to verify connection, then "Save"
```

### 7. **Connect Radarr to qBittorrent (REQUIRED for downloading)**

```bash
# In Radarr, go to Settings → Download Clients
# Click "Add" → "qBittorrent"

# Configure qBittorrent connection:
# Host: localhost (or qbittorrent)
# Port: 8080
# Username: admin
# Password: (your qBittorrent password)
# Category: movies (optional)

# Click "Test" to verify connection, then "Save"
```

### 8. **Configure Radarr Root Folder (REQUIRED for file organization)**

```bash
# In Radarr, go to Settings → Media Management
# Click "Add Root Folder"
# Path: /media/movies
# This tells Radarr where to store downloaded movies
```

### 9. **Configure Plex (REQUIRED for streaming)**

```bash
# Open Plex web interface
open http://localhost:32400

# Complete initial setup: Create admin user, add media libraries
# Point library to: /media/movies (your movie library)

# Add to Overseerr: Settings → Services → Plex
```

### 10. **Connect Overseerr to Radarr (REQUIRED for automation)**

```bash
# In Overseerr, go to Settings → Services
# Click "Add Service" → "Radarr"

# Configure Radarr connection:
# Server Name: radarr
# Hostname or IP Address: http://radarr (or http://localhost)
# Port: 7878
# API Key: (Copy from Radarr Settings → General → Security → API Key)
# Quality Profile: (Select your preferred quality, e.g., "Ultra-HD")
# Root Folder: /media/movies
# Minimum Availability: Released
# Enable Automatic Search: ✅

# Click "Test" to verify connection, then "Add Server"
```

### 11. **Test the Complete Pipeline**

```bash
# 1. Request a movie through Overseerr UI
# 2. Approve the request (or set auto-approval)
# 3. Overseerr sends request to Radarr
# 4. Radarr searches Jackett for torrents
# 5. Radarr sends best torrent to qBittorrent
# 6. Monitor download progress in qBittorrent
# 7. Radarr organizes the movie when download completes
# 8. Movie appears in Plex for streaming
```

## 🚀 Deployment Workflow (Mac → Raspberry Pi)

Your development workflow creates **identical ARM64 images** that run on both Mac and Pi:

### **Development & Testing (Mac)**

```bash
# Test full stack on Mac
npm start

# Everything runs natively at ARM64 speed
```

### **Deploy to Raspberry Pi**

```bash
# Option 1: Registry (for connected Pi)
docker tag sctx/overseerr:latest your-registry/overseerr:latest
docker push your-registry/overseerr:latest
# On Pi: docker pull your-registry/overseerr:latest

# Option 2: Rebuild on Pi (same commands work)
git pull && npm start
```

### **Benefits**

-   ✅ **Native Performance**: ARM64 on both Mac and Pi
-   ✅ **Identical Images**: No architecture surprises
-   ✅ **Fast Testing**: No emulation overhead
-   ✅ **Pi-Optimized**: Built with Pi memory constraints in mind

## 🌐 Web Interfaces

-   **Overseerr**: http://localhost:5055 (main request interface)
-   **qBittorrent**: http://localhost:8080 (download management)
-   **Jackett**: http://localhost:9117 (search configuration)
-   **Radarr**: http://localhost:7878 (movie management)
-   **Plex**: http://localhost:32400 (media streaming)

## 🛠️ NPM Scripts

| Command               | Description                       |
| --------------------- | --------------------------------- |
| `npm start`           | 🚀 Start entire stack             |
| `npm stop`            | 🛑 Stop all services              |
| `npm restart`         | 🔄 Restart all services           |
| `npm run setup`       | 🎯 Guided setup with instructions |
| `npm run docker:logs` | 📋 View all logs                  |
| `npm run docker:pull` | 📥 Pull latest images             |

## 📂 Directory Structure

```
rasberry-pi/
├── config/                # 🤖 AUTO-GENERATED (gitignored)
│   ├── overseerr/        # Overseerr settings and database
│   ├── radarr/           # Movie management settings
│   ├── jackett/          # Search indexer configs
│   ├── qbittorrent/      # Download client settings
│   └── plex/             # Media server database
├── downloads/             # 🤖 AUTO-GENERATED - Active downloads (gitignored)
├── movies/               # 🤖 AUTO-GENERATED - Organized library
├── docker-compose.yml    # 🐳 Multi-container setup
└── .env                 # 🔐 Your secrets (gitignored)
```

## 🔄 Complete Media Workflow

Your media server follows this **automated pipeline**:

1. **🎨 Request** - User requests movie/TV show through Overseerr web UI
2. **✅ Approve** - Admin approves request (or auto-approval enabled)
3. **📤 Send to Radarr** - Overseerr sends approved request to Radarr
4. **🔍 Search** - Radarr searches Jackett for best torrent
5. **⬇️ Download** - Radarr sends to qBittorrent for download
6. **📁 Organize** - Radarr automatically organizes files when downloads complete
7. **🔄 Scan** - Plex libraries are scanned for new content
8. **🎬 Stream** - Movie is available for streaming in Plex

## 🎯 Overseerr Features

### **Beautiful Web Interface**

-   Modern, responsive design
-   Movie/TV show discovery
-   Request management
-   User management and permissions

### **Automated Workflows**

-   Auto-approval for trusted users
-   Automatic download triggering
-   Library scanning integration
-   Status tracking and notifications

### **Multi-Service Integration**

-   Plex library management
-   Radarr movie management
-   qBittorrent download client
-   Jackett search indexers
-   Push notification support

## 🔧 Advanced Configuration

### Environment Variables

```bash
# PLEX_CLAIM: Get from https://www.plex.tv/claim/
# Update this in docker-compose.yml before starting services
PLEX_CLAIM=your-plex-claim-token
```

### Service Configuration

All other configuration is done through the web interfaces:

-   **Overseerr**: http://localhost:5055 (main configuration)
-   **Radarr**: http://localhost:7878 (movie management)
-   **Jackett**: http://localhost:9117 (search indexers)
-   **qBittorrent**: http://localhost:8080 (download client)
-   **Plex**: http://localhost:32400 (media server)

### Overseerr Settings

**Services Configuration:**

-   **Plex**: Add your Plex server for library management
-   **Radarr**: Configure movie management for automatic downloads
-   **Jackett**: Add indexers for torrent searching (configured in Radarr)

**User Management:**

-   Create user accounts with different permission levels
-   Set up auto-approval for trusted users
-   Configure request limits and restrictions

**Download Settings:**

-   Set download quality preferences in Radarr
-   Configure download paths and organization in Radarr
-   Set up notification preferences in Overseerr

## 🚨 Troubleshooting

### **Service Status Check**

```bash
# Check all services
npm run status

# View logs
npm run docker:logs
```

**Service Web Interfaces**:

-   Overseerr: http://localhost:5055
-   qBittorrent: http://localhost:8080
-   Jackett: http://localhost:9117
-   Jellyfin: http://localhost:8096

### Common Issues

**❌ Overseerr not accessible**

```bash
# Check if container is running
docker ps | grep overseerr

# View Overseerr logs
docker logs overseerr

# Restart Overseerr
docker-compose restart overseerr
```

**❌ Services not connecting in Overseerr**

```bash
# Verify service URLs in Overseerr settings:
# Plex: http://localhost:32400 (or http://plex:32400)
# Radarr: http://localhost:7878 (or http://radarr:7878)

# Check service logs
docker logs plex
docker logs radarr
docker logs qbittorrent
docker logs jackett
```

**❌ Downloads not starting**

```bash
# Check Radarr configuration in Overseerr
# Verify Radarr API credentials and connection
# Test Radarr service in Overseerr settings
# Check qBittorrent configuration in Radarr
```

### Debug Commands

```bash
# View all service logs
npm run docker:logs

# View specific service logs
docker logs overseerr --tail 50
docker logs radarr --tail 50
docker logs qbittorrent --tail 50
docker logs jackett --tail 50
docker logs plex --tail 50

# Restart problematic service
docker-compose restart overseerr
docker-compose restart radarr
docker-compose restart qbittorrent
docker-compose restart jackett
docker-compose restart plex
```

## 🔮 Future Enhancements

-   [x] **Overseerr integration** - ✅ **COMPLETED**
-   [x] **Beautiful web UI** - ✅ **COMPLETED**
-   [x] **Automated request workflow** - ✅ **COMPLETED**
-   [x] **Multi-user support** - ✅ **COMPLETED**
-   [ ] **Push notifications** (Discord, Slack, etc.)
-   [ ] **Mobile app integration**
-   [ ] **Advanced quality preferences**
-   [ ] **Automated subtitle downloading**
-   [ ] **Multi-language support**
