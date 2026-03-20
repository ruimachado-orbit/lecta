'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  delay?: 1 | 2 | 3 | 4 | 5 | 6
}

export default function Reveal({ children, className = '', delay }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('vis'); obs.disconnect() } },
      { threshold: 0.1 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const delayClass = delay ? ` d${delay}` : ''
  return (
    <div ref={ref} className={`fu${delayClass}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
