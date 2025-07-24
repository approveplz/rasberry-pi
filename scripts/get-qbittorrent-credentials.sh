#!/bin/bash

# Script to extract qBittorrent WebUI credentials from Docker logs
# Usage: ./scripts/get-qbittorrent-credentials.sh

set -e

echo "🔍 Extracting qBittorrent WebUI credentials..."
echo

# Check if qBittorrent container is running
if ! docker ps --format '{{.Names}}' | grep -q "^qbittorrent$"; then
    echo "❌ qBittorrent container is not running!"
    echo "💡 Start it with: docker-compose up qbittorrent -d"
    exit 1
fi

# Extract username from logs
USERNAME=$(docker logs qbittorrent 2>&1 | grep "WebUI administrator username" | sed 's/.*username is: //')

# Extract password from logs (handling multi-line output)
# The password line might be followed by additional characters on the next line
PASSWORD_SECTION=$(docker logs qbittorrent 2>&1 | grep -A1 "temporary password is provided for this session:")
PASSWORD=$(echo "$PASSWORD_SECTION" | tail -2 | tr -d '\n' | sed 's/.*session: //' | sed 's/You should set.*//')

# Clean up any extra whitespace
PASSWORD=$(echo "$PASSWORD" | xargs)

# Display results
echo "🔐 qBittorrent WebUI Credentials:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 URL:      http://localhost:8080"
echo "👤 Username: $USERNAME"
echo "🔑 Password: $PASSWORD"
echo
echo "⚠️  This is a temporary password generated at container startup."
echo "💡 Set a permanent password in: WebUI → Tools → Options → WebUI"
echo

# Optional: Copy password to clipboard if pbcopy is available (macOS)
if command -v pbcopy >/dev/null 2>&1; then
    echo "$PASSWORD" | pbcopy
    echo "📋 Password copied to clipboard!"
fi 