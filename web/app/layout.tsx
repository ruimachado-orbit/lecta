import type { Metadata } from 'next'
import { Playfair_Display, Lora, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-body',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'lecta — Presentations that come to life',
  description:
    'An open-source desktop app for technical presentations with live code execution in JavaScript, Python, SQL, and native. Free for macOS.',
  openGraph: {
    title: 'lecta',
    description: 'Presentations that come to life.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${lora.variable} ${jetbrains.variable}`}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
