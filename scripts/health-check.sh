#!/bin/bash
# Health check script for the media server stack
# Run after deployment to verify everything is working:
#   ./scripts/health-check.sh

set -e

PI_IP=$(hostname -I | awk '{print $1}')
PASS=0
FAIL=0
WARN=0

check() {
    local name="$1"
    local url="$2"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null) || code="000"
    if [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; then
        echo "  [OK]   $name ($url) — HTTP $code"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $name ($url) — HTTP $code"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Media Server Health Check ==="
echo ""

# 1. Check Docker is running
echo "--- Docker ---"
if docker info &>/dev/null; then
    echo "  [OK]   Docker daemon is running"
    PASS=$((PASS + 1))
else
    echo "  [FAIL] Docker daemon is not running"
    FAIL=$((FAIL + 1))
    echo "Cannot continue without Docker. Exiting."
    exit 1
fi

# 2. Check all containers are running and healthy
echo ""
echo "--- Containers ---"
EXPECTED_SERVICES="radarr sonarr jackett qbittorrent flaresolverr plex"
for svc in $EXPECTED_SERVICES; do
    status=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null) || status="not found"
    health=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null) || health="n/a"
    if [ "$status" = "running" ] && [ "$health" = "healthy" ]; then
        echo "  [OK]   $svc — running (healthy)"
        PASS=$((PASS + 1))
    elif [ "$status" = "running" ]; then
        echo "  [WARN] $svc — running ($health) — may still be starting up"
        WARN=$((WARN + 1))
    else
        echo "  [FAIL] $svc — $status"
        FAIL=$((FAIL + 1))
    fi
done

# 3. Check web UIs are responding
echo ""
echo "--- Web UIs ---"
check "Radarr"       "http://localhost:7878/ping"
check "Sonarr"       "http://localhost:8989/ping"
check "Jackett"      "http://localhost:9117/health"
check "qBittorrent"  "http://localhost:8080"
check "FlareSolverr" "http://localhost:8191"
check "Plex"         "http://localhost:32400/identity"

# 4. Check containers can resolve each other (inter-service DNS)
echo ""
echo "--- Inter-Service DNS ---"
for target in radarr sonarr jackett qbittorrent flaresolverr plex; do
    result=$(docker exec radarr ping -c 1 -W 2 "$target" 2>&1) && {
        echo "  [OK]   radarr → $target"
        PASS=$((PASS + 1))
    } || {
        echo "  [FAIL] radarr → $target (DNS or network issue)"
        FAIL=$((FAIL + 1))
    }
done

# 5. Check disk space
echo ""
echo "--- Disk Space ---"
AVAIL=$(df -h /home | tail -1 | awk '{print $4}')
USE_PCT=$(df /home | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$USE_PCT" -lt 80 ]; then
    echo "  [OK]   $AVAIL available (${USE_PCT}% used)"
    PASS=$((PASS + 1))
elif [ "$USE_PCT" -lt 95 ]; then
    echo "  [WARN] $AVAIL available (${USE_PCT}% used) — getting low"
    WARN=$((WARN + 1))
else
    echo "  [FAIL] $AVAIL available (${USE_PCT}% used) — critically low!"
    FAIL=$((FAIL + 1))
fi

# 6. Check memory
echo ""
echo "--- Memory ---"
MEM_TOTAL=$(free -h | awk '/Mem:/ {print $2}')
MEM_AVAIL=$(free -h | awk '/Mem:/ {print $7}')
echo "  [INFO] Total: $MEM_TOTAL, Available: $MEM_AVAIL"

# Summary
echo ""
echo "=== Summary ==="
echo "  Passed: $PASS | Warnings: $WARN | Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "  Some checks failed. Run 'docker compose logs <service>' to debug."
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo ""
    echo "  All services running but some still starting. Re-run in 60 seconds."
    exit 0
else
    echo ""
    echo "  All checks passed! Access from your Mac:"
    echo "    Radarr:       http://$PI_IP:7878"
    echo "    Sonarr:       http://$PI_IP:8989"
    echo "    Jackett:      http://$PI_IP:9117"
    echo "    qBittorrent:  http://$PI_IP:8080"
    echo "    Plex:         http://$PI_IP:32400"
    exit 0
fi
