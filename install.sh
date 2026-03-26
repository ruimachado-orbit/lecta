#!/bin/bash
set -euo pipefail

REPO="ruimachado-orbit/lecta"
APP_NAME="Lecta"

# ── Shared helpers ───────────────────────────────────────

fetch_latest_version() {
  echo "Fetching latest release..."
  VERSION=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
  if [ -z "$VERSION" ]; then
    echo "Failed to fetch latest version."
    exit 1
  fi
}

# ── macOS installer ──────────────────────────────────────

install_macos() {
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

  fetch_latest_version

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
}

# ── Linux installer ──────────────────────────────────────

install_linux() {
  # Detect architecture
  ARCH=$(uname -m)
  if [ "$ARCH" != "x86_64" ]; then
    echo "Unsupported architecture: $ARCH (only x86_64 is supported on Linux)"
    exit 1
  fi

  fetch_latest_version

  # Prefer .deb on Debian-based systems, fall back to AppImage
  if [ -f /etc/debian_version ]; then
    install_linux_deb
  else
    install_linux_appimage
  fi
}

install_linux_deb() {
  DEB_NAME="${APP_NAME}-${VERSION}-amd64.deb"
  DEB_URL="https://github.com/$REPO/releases/download/v${VERSION}/${DEB_NAME}"
  TMP_DEB="/tmp/${DEB_NAME}"

  echo "Downloading ${APP_NAME} v${VERSION} (.deb)..."
  curl -L --progress-bar -o "$TMP_DEB" "$DEB_URL"

  echo "Installing (requires sudo)..."
  sudo apt install -y "$TMP_DEB"

  rm -f "$TMP_DEB"

  echo ""
  echo "Lecta v${VERSION} installed successfully!"
  echo "Run 'lecta' from your terminal or find Lecta in your application launcher."
  echo "To uninstall: sudo apt remove lecta"
}

install_linux_appimage() {
  # Check for libfuse2 (required by AppImage on Ubuntu 22.04+)
  if ! ldconfig -p 2>/dev/null | grep -q libfuse.so.2; then
    echo "AppImage requires libfuse2, which is not installed."
    echo ""
    read -rp "Install it now? [Y/n] " answer
    case "${answer:-Y}" in
      [Yy]*|"")
        if command -v apt &>/dev/null; then
          sudo apt install -y libfuse2
        else
          echo "Please install libfuse2 manually and re-run this script."
          echo ""
          echo "  Fedora/RHEL:  sudo dnf install fuse-libs"
          echo "  Arch:         sudo pacman -S fuse2"
          echo "  openSUSE:     sudo zypper install libfuse2"
          exit 1
        fi
        ;;
      *)
        echo "Please install libfuse2 manually and re-run this script."
        exit 1
        ;;
    esac
  fi

  APPIMAGE_NAME="${APP_NAME}-${VERSION}-x86_64.AppImage"
  APPIMAGE_URL="https://github.com/$REPO/releases/download/v${VERSION}/${APPIMAGE_NAME}"
  TMP_APPIMAGE="/tmp/${APPIMAGE_NAME}"

  echo "Downloading ${APP_NAME} v${VERSION} (AppImage)..."
  curl -L --progress-bar -o "$TMP_APPIMAGE" "$APPIMAGE_URL"

  # Install to ~/.local/bin
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"

  INSTALL_PATH="${INSTALL_DIR}/lecta"
  mv "$TMP_APPIMAGE" "$INSTALL_PATH"
  chmod +x "$INSTALL_PATH"

  # Desktop integration — icon
  ICON_DIR="$HOME/.local/share/icons"
  mkdir -p "$ICON_DIR"
  ICON_URL="https://raw.githubusercontent.com/$REPO/main/build/icon.png"
  curl -sL -o "${ICON_DIR}/lecta.png" "$ICON_URL"

  # Desktop integration — .desktop file
  DESKTOP_DIR="$HOME/.local/share/applications"
  mkdir -p "$DESKTOP_DIR"
  cat > "${DESKTOP_DIR}/lecta.desktop" <<DESKTOP
[Desktop Entry]
Name=Lecta
Comment=Technical presentations with live code execution
Exec=${INSTALL_PATH} %U
Icon=${ICON_DIR}/lecta.png
Type=Application
Categories=Development;Office;Presentation;
Terminal=false
StartupWMClass=lecta
DESKTOP

  # Update desktop database if available
  if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  fi

  echo ""
  echo "Lecta v${VERSION} installed successfully!"
  echo "  Binary: ${INSTALL_PATH}"
  echo "  Desktop: ${DESKTOP_DIR}/lecta.desktop"

  # Check if ~/.local/bin is in PATH
  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo ""
    echo "Note: ${INSTALL_DIR} is not in your PATH."
    echo "Add it by appending this to your ~/.bashrc or ~/.zshrc:"
    echo ""
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "Then restart your terminal, or run: source ~/.bashrc"
  fi

  echo ""
  echo "Run 'lecta' from your terminal or find Lecta in your application launcher."
}

# ── Main ─────────────────────────────────────────────────

OS=$(uname -s)
case "$OS" in
  Darwin)
    install_macos
    ;;
  Linux)
    install_linux
    ;;
  *)
    echo "Unsupported operating system: $OS"
    echo "Lecta supports macOS and Linux."
    exit 1
    ;;
esac
