export const VERSION = '0.1.2'
export const GITHUB_REPO = 'ruimachado-orbit/lecta'
export const GITHUB_URL = 'https://github.com/ruimachado-orbit/lecta'
export const RELEASES_URL = `${GITHUB_URL}/releases`
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`

export function getDmgUrl(arch: 'arm64' | 'x64'): string {
  return `${RELEASES_URL}/download/v${VERSION}/Lecta-${VERSION}-${arch}.dmg`
}

export function getDebUrl(): string {
  return `${RELEASES_URL}/download/v${VERSION}/Lecta-${VERSION}-amd64.deb`
}

export function getAppImageUrl(): string {
  return `${RELEASES_URL}/download/v${VERSION}/Lecta-${VERSION}-x86_64.AppImage`
}
