#!/bin/bash

# Disunday auto-start service installer
# Supports: macOS (LaunchAgent), Linux (systemd)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DISCORD_DIR="$PROJECT_DIR/discord"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Disunday Auto-Start Service Installer${NC}"
echo ""

# Detect OS
OS="$(uname -s)"

install_macos() {
    echo -e "${YELLOW}Installing macOS LaunchAgent...${NC}"
    
    PLIST_NAME="com.disunday.bot.plist"
    PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"
    LOG_DIR="$HOME/.disunday/logs"
    
    mkdir -p "$HOME/Library/LaunchAgents"
    mkdir -p "$LOG_DIR"
    
    # Create plist file
    cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.disunday.bot</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which pnpm)</string>
        <string>dev</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$DISCORD_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/disunday.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/disunday.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$HOME/.local/bin</string>
    </dict>
</dict>
</plist>
EOF

    # Load the service
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    launchctl load "$PLIST_PATH"
    
    echo -e "${GREEN}✓ LaunchAgent installed!${NC}"
    echo ""
    echo "Service will auto-start on login."
    echo ""
    echo "Commands:"
    echo "  Start:   launchctl start com.disunday.bot"
    echo "  Stop:    launchctl stop com.disunday.bot"
    echo "  Logs:    tail -f $LOG_DIR/disunday.log"
    echo "  Uninstall: $SCRIPT_DIR/uninstall-service.sh"
}

install_linux() {
    echo -e "${YELLOW}Installing systemd user service...${NC}"
    
    SERVICE_DIR="$HOME/.config/systemd/user"
    SERVICE_NAME="disunday.service"
    SERVICE_PATH="$SERVICE_DIR/$SERVICE_NAME"
    
    mkdir -p "$SERVICE_DIR"
    
    # Find pnpm path
    PNPM_PATH="$(which pnpm)"
    
    # Create systemd service file
    cat > "$SERVICE_PATH" << EOF
[Unit]
Description=Disunday Discord Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=$DISCORD_DIR
ExecStart=$PNPM_PATH dev
Restart=always
RestartSec=10
Environment=PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin

[Install]
WantedBy=default.target
EOF

    # Reload and enable service
    systemctl --user daemon-reload
    systemctl --user enable "$SERVICE_NAME"
    systemctl --user start "$SERVICE_NAME"
    
    echo -e "${GREEN}✓ systemd service installed!${NC}"
    echo ""
    echo "Service will auto-start on login."
    echo ""
    echo "Commands:"
    echo "  Status:  systemctl --user status disunday"
    echo "  Start:   systemctl --user start disunday"
    echo "  Stop:    systemctl --user stop disunday"
    echo "  Logs:    journalctl --user -u disunday -f"
    echo "  Uninstall: $SCRIPT_DIR/uninstall-service.sh"
}

case "$OS" in
    Darwin)
        install_macos
        ;;
    Linux)
        install_linux
        ;;
    *)
        echo -e "${RED}Unsupported OS: $OS${NC}"
        echo "Supported: macOS (Darwin), Linux"
        exit 1
        ;;
esac
