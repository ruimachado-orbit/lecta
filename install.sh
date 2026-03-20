#!/bin/bash
set -euo pipefail

REPO="ruimachado-orbit/lecta"
APP_NAME="Lecta"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  DMG_ARCH="arm64"
elif [ "$ARCH" = "x86_64" ]; then
  DMG_ARCH="x64"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi

# Get latest version from GitHub
echo "Fetching latest release..."
VERSION=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')

if [ -z "$VERSION" ]; then
  echo "Failed to fetch latest version."
  exit 1
fi

DMG_NAME="${APP_NAME}-${VERSION}-${DMG_ARCH}.dmg"
DMG_URL="https://github.com/$REPO/releases/download/v${VERSION}/${DMG_NAME}"
TMP_DMG="/tmp/${DMG_NAME}"

echo "Downloading ${APP_NAME} v${VERSION} for ${ARCH}..."
curl -L --progress-bar -o "$TMP_DMG" "$DMG_URL"

echo "Mounting disk image..."
hdiutil attach "$TMP_DMG" -nobrowse -quiet
# Volume name uses space separator (e.g. "Lecta 0.1.0-arm64")
VOLUME_NAME="${APP_NAME} ${VERSION}-${DMG_ARCH}"
MOUNT_DIR="/Volumes/${VOLUME_NAME}"

# Wait briefly for mount to appear
for i in 1 2 3 4 5; do
  [ -d "$MOUNT_DIR" ] && break
  sleep 1
done

if [ ! -d "${MOUNT_DIR}/${APP_NAME}.app" ]; then
  # Fallback: find the volume by listing /Volumes
  MOUNT_DIR=$(find /Volumes -maxdepth 1 -name "${APP_NAME}*" -type d 2>/dev/null | head -1)
fi

if [ ! -d "${MOUNT_DIR}/${APP_NAME}.app" ]; then
  echo "Error: Could not find ${APP_NAME}.app in mounted volume."
  echo "Contents of ${MOUNT_DIR}:"
  ls -la "${MOUNT_DIR}" 2>/dev/null || echo "(mount not found)"
  exit 1
fi

echo "Installing to /Applications..."
rm -rf "/Applications/${APP_NAME}.app"
cp -R "${MOUNT_DIR}/${APP_NAME}.app" /Applications/

echo "Unmounting disk image..."
hdiutil detach "$MOUNT_DIR" -quiet

rm -f "$TMP_DMG"

# Clear Gatekeeper quarantine flag
echo "Clearing Gatekeeper quarantine..."
xattr -cr "/Applications/${APP_NAME}.app"

echo ""
echo "Lecta v${VERSION} installed successfully!"
echo "Open it from /Applications or run: open /Applications/Lecta.app"
