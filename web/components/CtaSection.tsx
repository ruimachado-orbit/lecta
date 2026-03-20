import Reveal from './ScrollReveal'
import DownloadButton from './DownloadButton'
import InstallSteps from './InstallSteps'

export default function CtaSection() {
  return (
    <section className="dark ctaSection" id="download">
      <div className="container">
        <Reveal><span className="secLabel">Get started</span></Reveal>
        <Reveal><h2 className="ctaTitle">Ready to present?</h2></Reveal>
        <Reveal>
          <DownloadButton variant="cream" />
        </Reveal>
        <Reveal>
          <InstallSteps variant="cream" />
        </Reveal>
      </div>
    </section>
  )
}
