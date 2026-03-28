# Raspberry Pi Media Server

Automated media pipeline running on a Raspberry Pi 4 (8GB). Search, download, organize, and stream movies and TV shows.

## How it works

```
                    OpenClaw (Telegram bot)
                         │ manages via API
                         ▼
Radarr (movies) ──┐
                   ├──→ Jackett (search) ──→ qBittorrent (download) ──→ Plex (stream)
Sonarr (TV shows) ─┘         ↑
                        FlareSolverr
                    (Cloudflare bypass)
```

1. Search for a movie/show in **Radarr** or **Sonarr**
2. They ask **Jackett** to search torrent indexers
3. **qBittorrent** downloads the best result
4. Radarr/Sonarr organize the files into `/media/movies` or `/media/tv` (on external 1TB Seagate drive)
5. **Plex** streams them to any device

## Quick start

### Fresh Pi setup (from scratch)

1. **Flash SD card** with Raspberry Pi OS Lite (64-bit) using Raspberry Pi Imager
   - In "Edit Settings": set username (`pi`), password, enable SSH with your public key
   - Your Mac's public key: `cat ~/.ssh/id_ed25519.pub`
2. **Boot the Pi**, wait 60 seconds, then run:
   ```bash
   # Bootstrap everything (installs Docker, clones repo, creates directories)
   ssh pi@<pi-ip> "curl -fsSL https://raw.githubusercontent.com/approveplz/rasberry-pi/master/scripts/setup-pi.sh | bash"
   ```
3. **Mount the external drive** (1TB Seagate):
   ```bash
   ssh pi@<pi-ip>
   sudo apt-get install -y exfat-fuse
   sudo mkdir -p /mnt/seagate
   sudo mount.exfat-fuse -o uid=1000,gid=1000,umask=000 /dev/sda2 /mnt/seagate
   # Add to fstab for auto-mount on boot:
   echo "/dev/sda2 /mnt/seagate exfat-fuse uid=1000,gid=1000,umask=000,nofail 0 0" | sudo tee -a /etc/fstab
   ```
4. **Log out and back in** (for Docker group), then start the stack:
   ```bash
   ssh pi@<pi-ip>
   cd ~/rasberry-pi && docker compose up -d
   ```
5. **Install Tailscale** for remote access (optional but recommended):
   ```bash
   ssh pi@<pi-ip>
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up --hostname=pi
   # Approve the auth URL in your browser
   ```
6. **Configure services** (see First-time configuration below)

### If already set up

```bash
cd ~/rasberry-pi
docker compose up -d    # start all services
npm run health          # verify everything is working
```

### Updating after code changes

```bash
# On the Pi
cd ~/rasberry-pi && git pull && docker compose up -d
```

## Web UIs

| Service | URL | Purpose |
|---|---|---|
| Radarr | `http://<pi-ip>:7878` | Movie management |
| Sonarr | `http://<pi-ip>:8989` | TV show management |
| Jackett | `http://<pi-ip>:9117` | Torrent indexer config |
| qBittorrent | `http://<pi-ip>:8080` | Download client |
| Plex | `http://<pi-ip>:32400` | Media streaming |
| OpenClaw | `http://<pi-ip>:18789` | AI assistant control UI |

## First-time configuration

After `docker compose up -d`, configure services in this order:

### 1. qBittorrent — set permanent password

```bash
# Get the temporary password (changes every restart until you set a permanent one!)
sudo docker logs qbittorrent | grep "temporary password"
```

Log in at `http://<pi-ip>:8080` with `admin` / `<temp password>`.

**Immediately set a permanent password:** Tools → Options → Web UI → Password.

> **Why this matters:** Radarr/Sonarr connect to qBittorrent using this password. If it keeps changing (temp passwords reset on every container restart), Radarr will get banned after too many failed auth attempts. See Troubleshooting below.

### 2. Jackett — add indexers

Open `http://<pi-ip>:9117`, click "Add Indexer", and add:
- **1337x** — general movies + TV
- **TheRARBG** — general movies + TV
- **YTS** — movies (small file sizes)
- **EZTV** — TV shows

Copy the **API key** from the top of the Jackett page.

### 3. Radarr — connect everything

Open `http://<pi-ip>:7878`:

- **Settings → Indexers:** Add each Jackett indexer individually as Torznab
  - URL: `http://jackett:9117/api/v2.0/indexers/<indexer-id>/results/torznab`
  - API Key: from Jackett
  - Categories: 2000-2060 (Movies)
  - **Do NOT use the `/all` endpoint** — newer Radarr versions block it
- **Settings → Download Clients:** Add qBittorrent
  - Host: `qbittorrent`, Port: `8080`
  - Username: `admin`, Password: your permanent password
  - Category: `movies`
- **Settings → Media Management:** Add root folder `/media/movies`
- **Settings → Profiles:** Use **Ultra-HD** profile. Disable Remux-2160p. (See Quality & Custom Formats below)
- **Settings → Custom Formats:** Import custom formats (see below)

### 4. Sonarr — same as Radarr

Open `http://<pi-ip>:8989`. Same setup as Radarr but:
- Indexer categories: 5000-5080 (TV)
- Download client category: `tv`
- Root folder: `/media/tv`
- **Settings → Profiles:** Use **HD-1080p** profile. Disable Remux-1080p.
- **Settings → Custom Formats:** Import same custom formats as Radarr

### 5. Plex — claim via SSH tunnel

Plex requires the first login from localhost. Since it runs on the Pi, you need a tunnel:

```bash
# From your Mac
ssh -f -N -L 32400:localhost:32400 pi@<pi-ip>

# Then open in browser
open http://localhost:32400/web
```

Sign in with your Plex account, claim the server, and add libraries:
- Movies → `/media/movies`
- TV Shows → `/media/tv`

After claiming, you can access Plex directly at `http://<pi-ip>:32400`.

Kill the tunnel when done: `pkill -f "ssh -f -N -L 32400"`

### 6. OpenClaw — AI media assistant via Telegram

OpenClaw is an AI agent that manages the media stack through Telegram. Message it to search, download, and monitor movies/TV shows.

**Onboarding (one-time):**
```bash
cd ~/rasberry-pi
docker compose run --rm --no-deps --entrypoint '' openclaw-gateway \
  node dist/index.js onboard --mode local --no-install-daemon
```

During onboarding, select:
- **Provider:** OpenAI → API key
- **Channel:** Telegram → paste bot token from @BotFather

**After onboarding, start the gateway:**
```bash
docker compose up -d openclaw-gateway
```

**Pair your Telegram account:**
1. Message the bot in Telegram — it'll respond with a pairing code
2. Approve it: `docker compose exec openclaw-gateway node dist/index.js pairing approve telegram <CODE>`

**Custom skill:** The `radarr-sonarr` skill at `config/openclaw/workspace/skills/radarr-sonarr/SKILL.md` gives the bot access to Radarr and Sonarr APIs. It can search, add, list, and check download status for movies and TV shows.

> **Note:** OpenClaw is pinned to v2026.3.11 — later versions (3.12+) have memory leak issues on Pi 4. Check GitHub issues before upgrading.

## Important settings

### Storage — external drive (CRITICAL)

Media is stored on a **1TB Seagate USB drive** (exFAT) mounted at `/mnt/seagate/media-server`. Docker-compose maps this to `/media` inside containers. The SD card only holds the OS and service configs.

**The drive MUST be mounted with the FUSE driver** (`exfat-fuse`) so that UID 1000 (the container user) has write access. The kernel exfat driver ignores uid/gid options and mounts as root-only, which causes silent "Permission denied" errors in qBittorrent.

```bash
# Install FUSE driver (one-time)
sudo apt-get install -y exfat-fuse

# fstab entry (auto-mount on boot)
/dev/sda2 /mnt/seagate exfat-fuse uid=1000,gid=1000,umask=000,nofail 0 0
```

If torrents show "error" state with 0 downloads despite having seeds, check the qBittorrent log for "Permission denied":
```bash
sudo docker exec qbittorrent cat /config/qBittorrent/logs/qbittorrent.log | grep "Permission denied"
```

### qBittorrent save path

qBittorrent must save to `/media/downloads/` (not `/downloads/`). The container only has `/media` mounted.

Set in qBittorrent: Tools → Options → Downloads → Default Save Path → `/media/downloads/`

> **Note:** This setting resets if the qBittorrent container is recreated. The config file at `config/qbittorrent/qBittorrent/qBittorrent.conf` must have both `Session\DefaultSavePath=/media/downloads` and `Downloads\SavePath=/media/downloads/`.

### Quality profiles

**Movies (Radarr):** Ultra-HD profile
- Allowed: HDTV-2160p, WEB 2160p, Bluray-2160p
- Disabled: ~~Remux-2160p~~ (too large, 30-60GB)

**TV (Sonarr):** HD-1080p profile
- Allowed: HDTV-1080p, WEB 1080p, Bluray-1080p
- Disabled: ~~Remux-1080p~~ (too large)

### Custom formats (the smart way to control file size)

Instead of blunt size limits, custom formats score releases by attributes. Create these in **both Radarr and Sonarr** (Settings → Custom Formats):

| Custom Format | What it matches | Score | Effect |
|---|---|---|---|
| **Lossless Audio** | DTS-HD MA, TrueHD, Atmos, FLAC, PCM | -10000 | Rejected (these bloat files 5-10x) |
| **Multi-Language** | MULTi4+, DUAL Audio, MULTiSUBS | -10000 | Rejected (adds 10-30GB of extra audio tracks) |
| **x265/HEVC** | x265, HEVC, h.265 | +100 | Preferred (modern codec, ~50% smaller than x264) |
| **AV1** (Radarr only) | AV1 | +150 | Most preferred (newest codec, smallest files) |

Then assign these scores in the quality profile: Settings → Profiles → edit profile → Custom Formats tab → set scores as above. Set "Minimum Custom Format Score" to **-5000** (rejects anything with lossless audio or multi-language).

### BitTorrent port

Uses **51413** (non-standard to avoid ISP throttling on default port 6881). Forward this port TCP+UDP to the Pi in your router if possible.

## NPM scripts

| Command | Description |
|---|---|
| `npm start` | Start all services |
| `npm stop` | Stop all services |
| `npm run health` | Run health checks on all services |
| `npm run status` | Show running containers and URLs |
| `npm run logs` | Tail all service logs |
| `npm run docker:pull` | Pull latest images |
| `npm run qb-creds` | Get qBittorrent temp password |

## Environment variables

Copy the template and fill in your values:

```bash
cp .env.template .env
```

| Variable | Description |
|---|---|
| `PLEX_CLAIM` | Claim token from https://plex.tv/claim (expires in 4 min, only needed once) |
| `JACKETT_API_KEY` | Copy from Jackett UI after setup |
| `QBITTORRENT_USERNAME` | Default: `admin` |
| `QBITTORRENT_PASSWORD` | **Set a permanent one immediately** (see configuration above) |
| `OPENAI_API_KEY` | OpenAI API key for OpenClaw (pay-as-you-go) |
| `OPENCLAW_GATEWAY_TOKEN` | Auto-generated during onboarding — used for control UI auth |

## Memory budget (8GB Pi)

| Service | Limit |
|---|---|
| Radarr | 1 GB |
| Sonarr | 1 GB |
| qBittorrent | 1 GB |
| Plex | 1 GB |
| Jackett | 512 MB |
| FlareSolverr | 512 MB |
| OpenClaw | 2 GB |
| **Total** | **~7 GB** |
| Pi OS + headroom | ~1 GB |

> Limits are set via `mem_limit` in docker-compose.yml. Verify with `docker stats --no-stream`.

## Troubleshooting

### Torrents show "Errored" with 0 seeds — nothing downloads

**Check these two things in order:**

**1. Permission denied on external drive (most common)**

The exFAT drive must be mounted with the FUSE driver for UID 1000 write access. If mounted with the kernel driver, qBittorrent connects to peers but can't write data to disk.

```bash
# Check for permission errors
sudo docker exec qbittorrent cat /config/qBittorrent/logs/qbittorrent.log | grep "Permission denied"

# Fix: remount with FUSE driver
cd ~/rasberry-pi && sudo docker compose down
sudo umount /mnt/seagate
sudo mount.exfat-fuse -o uid=1000,gid=1000,umask=000 /dev/sda2 /mnt/seagate
cd ~/rasberry-pi && sudo docker compose up -d
```

**2. qBittorrent banned Radarr/Sonarr's IP**

This happens when the qBittorrent password changes (e.g. temp password resets on container restart) and Radarr keeps trying the old password.

**How to check:**
```bash
sudo docker logs radarr | grep "banned"
# If you see "Your IP address has been banned after too many failed authentication attempts" — this is it.
```

**How to fix:**
```bash
# 1. Restart qBittorrent to clear the ban
sudo docker restart qbittorrent

# 2. Get the new temp password
sudo docker logs qbittorrent | grep "temporary password"

# 3. Log into qBittorrent UI and set a PERMANENT password

# 4. Update the password in Radarr and Sonarr:
#    Radarr → Settings → Download Clients → qBittorrent → edit password
#    Sonarr → Settings → Download Clients → qBittorrent → edit password
```

**Prevention:** Always set a permanent password in qBittorrent immediately after first startup.

### qBittorrent save path wrong — downloads fail silently

If qBittorrent's save path is `/downloads/` instead of `/media/downloads/`, torrents will error because the path doesn't exist in the container.

**Fix:** Tools → Options → Downloads → Default Save Path → `/media/downloads/`

### Radarr/Sonarr grabs huge files (30-60GB)

Usually caused by lossless audio (DTS-HD MA, TrueHD) or multi-language packs.

**Fix:** Set up custom formats (see "Custom formats" section above). The `-10000` score on Lossless Audio and Multi-Language will reject these automatically. Also make sure REMUX is disabled in the quality profile.

### Radarr rejects Jackett `/all` endpoint

Newer Radarr/Sonarr versions don't support `http://jackett:9117/api/v2.0/indexers/all/results/torznab`. Add each indexer individually:
- `http://jackett:9117/api/v2.0/indexers/1337x/results/torznab`
- `http://jackett:9117/api/v2.0/indexers/therarbg/results/torznab`
- etc.

### Plex shows "Not authorized"

Plex must be claimed from localhost on first setup. Use the SSH tunnel method described in the configuration section above.

### Port 5353 conflict on startup

Plex's mDNS port conflicts with the Pi's Avahi daemon. We've removed 5353 from docker-compose.yml — this shouldn't happen, but if Plex fails to start, check `docker logs plex` for port conflicts.

### SD card corruption (Pi won't boot, green LED flickers then dies)

Caused by pulling the SD card while the Pi is running. **Always shut down first:**
```bash
ssh pi@<pi-ip> "sudo shutdown -h now"
# Wait for green LED to stop, then remove card
```

To recover: re-flash the SD card with Raspberry Pi Imager and follow the Fresh Pi setup above.

### Can't mount SD card on Mac (Kandji blocks it)

If your Mac has Kandji MDM, it blocks USB storage. Use a personal laptop to flash/mount SD cards.

## Remote access (Tailscale)

Tailscale lets you access the Pi and all services from anywhere (not just your home WiFi). It creates a WireGuard mesh VPN that punches through CGNAT — no port forwarding needed.

**Install (one-time, on the Pi):**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=pi
# Opens an auth URL — approve it in your browser
```

Once connected, the Pi gets a stable Tailscale IP (e.g. `100.x.y.z`). Use it exactly like the local IP:
```bash
ssh pi@<tailscale-ip>
open http://<tailscale-ip>:7878   # Radarr from anywhere
open http://<tailscale-ip>:32400  # Plex from anywhere
```

Tailscale runs as a native systemd service — it auto-starts on boot and reconnects after power loss.

> **Note:** Tailscale must also be installed on the device you're connecting from (Mac, iPhone, iPad). Install from https://tailscale.com/download and sign in with the same account.

## Network notes

- **CGNAT:** Your ISP uses CGNAT (`100.64.x.x` hop in traceroute). Incoming connections are blocked, but **Tailscale bypasses this entirely** — see Remote access section above.
- **Eero router:** Managed via phone app only (no web admin at 192.168.4.1). Set IP reservation and port forwarding in the Eero app.

## Directory structure

```
~/rasberry-pi/                      # On the Pi (cloned from GitHub)
├── config/                         # Auto-generated service configs (gitignored)
├── scripts/
│   ├── setup-pi.sh                 # Fresh Pi bootstrap
│   ├── health-check.sh             # Verify all services
│   └── get-qbittorrent-credentials.sh
├── docker-compose.yml
├── .env.template                   # Environment variable template
├── .env                            # Your secrets (gitignored)
└── config/openclaw/                # OpenClaw state (gitignored)
    ├── openclaw.json               # Main config (provider, channels, gateway)
    └── workspace/skills/           # Custom skills
        └── radarr-sonarr/SKILL.md  # Media server integration skill

/mnt/seagate/media-server/          # External 1TB Seagate USB drive
├── movies/                         # Organized movie library (4K)
├── tv/                             # Organized TV library (1080p)
└── downloads/                      # Active downloads
    ├── incomplete/                 # In-progress torrents
    ├── radarr/                     # Completed movie downloads
    └── tv-sonarr/                  # Completed TV downloads
```

> Docker-compose maps `/mnt/seagate/media-server` → `/media` inside all containers.
