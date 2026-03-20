import Link from 'next/link'
import { GITHUB_URL, RELEASES_URL } from '@/lib/config'

export default function Footer() {
  return (
    <footer>
      <div className="footerInner">
        <Link href="/" className="footerWordmark">lecta</Link>
        <div className="footerLinks">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href={`${RELEASES_URL}`} target="_blank" rel="noopener noreferrer">Releases</a>
          <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer">Issues</a>
        </div>
        <span className="footerCopy">&copy; 2025 &mdash; MIT License</span>
      </div>
    </footer>
  )
}
