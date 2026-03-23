import Nav from '@/components/Nav'
import { ContributorsProvider } from '@/components/ContributorsProvider'
import Hero from '@/components/Hero'
import Features from '@/components/Features'
import UnderHood from '@/components/UnderHood'
import ThemeShowcase from '@/components/ThemeShowcase'
import PresenterSection from '@/components/PresenterSection'
import ClaudeSection from '@/components/ClaudeSection'
import Contributors from '@/components/Contributors'
import CtaSection from '@/components/CtaSection'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <ContributorsProvider>
        <main>
          <Hero />
          <Features />
          <UnderHood />
          <ThemeShowcase />
          <PresenterSection />
          <ClaudeSection />
          <Contributors />
          <CtaSection />
        </main>
      </ContributorsProvider>
      <Footer />
    </>
  )
}
