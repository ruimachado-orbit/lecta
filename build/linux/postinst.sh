#!/bin/bash
# Set SUID bit on chrome-sandbox so Electron can use the kernel sandbox
# when launched from the desktop. Required on Ubuntu 24.04+ where AppArmor
# restricts unprivileged user namespaces (apparmor_restrict_unprivileged_userns=1).
if [ -f /opt/Lecta/chrome-sandbox ]; then
  chown root:root /opt/Lecta/chrome-sandbox
  chmod 4755 /opt/Lecta/chrome-sandbox
fi
