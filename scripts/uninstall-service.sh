#!/bin/bash

# Disunday auto-start service uninstaller

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Disunday Service Uninstaller${NC}"
echo ""

OS="$(uname -s)"

uninstall_macos() {
    PLIST_NAME="com.disunday.bot.plist"
    PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"
    
    if [ -f "$PLIST_PATH" ]; then
        launchctl unload "$PLIST_PATH" 2>/dev/null || true
        rm "$PLIST_PATH"
        echo -e "${GREEN}✓ LaunchAgent removed${NC}"
    else
        echo -e "${YELLOW}LaunchAgent not found${NC}"
    fi
}

uninstall_linux() {
    SERVICE_NAME="disunday.service"
    SERVICE_PATH="$HOME/.config/systemd/user/$SERVICE_NAME"
    
    if [ -f "$SERVICE_PATH" ]; then
        systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
        systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
        rm "$SERVICE_PATH"
        systemctl --user daemon-reload
        echo -e "${GREEN}✓ systemd service removed${NC}"
    else
        echo -e "${YELLOW}systemd service not found${NC}"
    fi
}

case "$OS" in
    Darwin)
        uninstall_macos
        ;;
    Linux)
        uninstall_linux
        ;;
    *)
        echo -e "${RED}Unsupported OS: $OS${NC}"
        exit 1
        ;;
esac

echo ""
echo "Disunday service uninstalled."
