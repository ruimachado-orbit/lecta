export const VERSION = '0.1.0'
export const GITHUB_URL = 'https://github.com/ruimachado-orbit/lecta'
export const RELEASES_URL = `${GITHUB_URL}/releases`
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`

export function getDmgUrl(arch: 'arm64' | 'x64'): string {
  return `${RELEASES_URL}/download/v${VERSION}/Lecta-${VERSION}-${arch}.dmg`
}
