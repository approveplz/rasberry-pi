#!/bin/bash
# Bootstrap a fresh Raspberry Pi for the media server stack
# Run this after flashing Raspberry Pi OS Lite and SSH-ing in:
#   curl -fsSL https://raw.githubusercontent.com/approveplz/rasberry-pi/master/scripts/setup-pi.sh | bash

set -e

echo "=== Raspberry Pi Media Server Setup ==="
echo ""

# 1. Update system
echo "--- Updating system packages ---"
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Docker
echo "--- Installing Docker ---"
if command -v docker &>/dev/null; then
    echo "Docker already installed: $(docker --version)"
else
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
    echo "Docker installed. You may need to log out and back in for group changes."
fi

# 3. Install Git if not present
echo "--- Checking Git ---"
if ! command -v git &>/dev/null; then
    sudo apt-get install -y git
fi

# 4. Clone the repo
REPO_DIR="$HOME/rasberry-pi"
echo "--- Cloning repo to $REPO_DIR ---"
if [ -d "$REPO_DIR" ]; then
    echo "Repo already exists, pulling latest..."
    cd "$REPO_DIR" && git pull
else
    git clone https://github.com/approveplz/rasberry-pi.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# 5. Create media directories
echo "--- Creating media directories ---"
mkdir -p "$REPO_DIR/media/movies" "$REPO_DIR/media/tv" "$REPO_DIR/media/downloads"

# 6. Create .env from template if it doesn't exist
if [ ! -f "$REPO_DIR/.env" ]; then
    echo "--- Creating .env from template ---"
    cp "$REPO_DIR/.env.template" "$REPO_DIR/.env"
    echo "Edit .env with your credentials after first startup."
fi

# 7. Set a static IP (optional, prompted)
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Log out and back in (so docker group takes effect):"
echo "     exit && ssh pi@$(hostname -I | awk '{print $1}')"
echo ""
echo "  2. Start the media stack:"
echo "     cd ~/rasberry-pi && docker compose up -d"
echo ""
echo "  3. Check service status:"
echo "     docker compose ps"
echo ""
echo "  4. Configure services via web UI from your Mac:"
PI_IP=$(hostname -I | awk '{print $1}')
echo "     Radarr:       http://$PI_IP:7878  (movies)"
echo "     Sonarr:       http://$PI_IP:8989  (TV shows)"
echo "     Jackett:      http://$PI_IP:9117  (indexers)"
echo "     qBittorrent:  http://$PI_IP:8080  (downloads)"
echo "     Plex:         http://$PI_IP:32400 (streaming)"
