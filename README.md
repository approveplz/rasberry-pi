# Raspberry Pi Media Server

Automated media pipeline running on a Raspberry Pi 4 (8GB). Search, download, organize, and stream movies and TV shows.

## How it works

```
Radarr (movies) ──┐
                   ├──→ Jackett (search) ──→ qBittorrent (download) ──→ Plex (stream)
Sonarr (TV shows) ─┘         ↑
                        FlareSolverr
                    (Cloudflare bypass)
```

1. Search for a movie/show in **Radarr** or **Sonarr**
2. They ask **Jackett** to search torrent indexers
3. **qBittorrent** downloads the best result
4. Radarr/Sonarr organize the files into `/media/movies` or `/media/tv`
5. **Plex** streams them to any device

## Quick start

### Fresh Pi setup

```bash
# One-command bootstrap (installs Docker, clones repo, creates directories)
curl -fsSL https://raw.githubusercontent.com/approveplz/rasberry-pi/master/scripts/setup-pi.sh | bash
```

### If already set up

```bash
cd ~/rasberry-pi
docker compose up -d    # start all services
npm run health          # verify everything is working
```

## Web UIs

| Service | URL | Purpose |
|---|---|---|
| Radarr | `http://<pi-ip>:7878` | Movie management |
| Sonarr | `http://<pi-ip>:8989` | TV show management |
| Jackett | `http://<pi-ip>:9117` | Torrent indexer config |
| qBittorrent | `http://<pi-ip>:8080` | Download client |
| Plex | `http://<pi-ip>:32400` | Media streaming |

## First-time configuration

After `docker compose up -d`, configure services in this order:

1. **Jackett** — Add indexers (e.g. 1337x). Copy the API key.
2. **qBittorrent** — Get temp password: `npm run qb-creds`. Set a permanent one.
3. **Radarr** — Settings → Indexers → add Jackett. Settings → Download Clients → add qBittorrent. Set root folder to `/media/movies`.
4. **Sonarr** — Same as Radarr, but root folder is `/media/tv`.
5. **Plex** — Claim server at plex.tv/claim, add `/media/movies` and `/media/tv` as libraries.

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
| `PLEX_CLAIM` | Claim token from https://plex.tv/claim (expires in 4 min) |
| `JACKETT_API_KEY` | Copy from Jackett UI after setup |
| `QBITTORRENT_USERNAME` | Default: `admin` |
| `QBITTORRENT_PASSWORD` | Set after first login |

## Memory budget (8GB Pi)

| Service | Limit |
|---|---|
| Radarr | 1 GB |
| Sonarr | 1 GB |
| qBittorrent | 1 GB |
| Plex | 1 GB |
| Jackett | 512 MB |
| FlareSolverr | 512 MB |
| **Total** | **~5 GB** |
| Pi OS + headroom | ~3 GB |

## Directory structure

```
rasberry-pi/
├── config/              # Auto-generated service configs (gitignored)
├── media/
│   ├── movies/          # Organized movie library
│   ├── tv/              # Organized TV library
│   └── downloads/       # Active downloads
├── scripts/
│   ├── setup-pi.sh      # Fresh Pi bootstrap
│   ├── health-check.sh  # Verify all services
│   └── get-qbittorrent-credentials.sh
├── docker-compose.yml
├── .env.template        # Environment variable template
└── .env                 # Your secrets (gitignored)
```
