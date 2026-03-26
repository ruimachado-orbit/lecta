'use client'

import { useEffect, useState } from 'react'

export type Platform = 'mac' | 'linux' | 'other' | null

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(null)

  useEffect(() => {
    const ua = navigator.userAgent
    if (/Macintosh|Mac OS X/.test(ua)) {
      setPlatform('mac')
    } else if (/Linux/.test(ua) && !/Android/.test(ua)) {
      setPlatform('linux')
    } else {
      setPlatform('other')
    }
  }, [])

  return platform
}

export function detectPlatformSync(): Exclude<Platform, null> {
  const ua = navigator.userAgent
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac'
  if (/Linux/.test(ua) && !/Android/.test(ua)) return 'linux'
  return 'other'
}