import type { Metadata } from 'next';
import Image from 'next/image';
import styles from './tomas.module.css';

const CANONICAL_URL = 'https://tomasnieves.com';
const PAGE_TITLE = 'Tomas Nieves, Senior Product Manager, Enterprise Product Strategy';
const PAGE_DESCRIPTION =
  'Senior Product Manager with nearly 30 years of enterprise product leadership at Verizon, targeting Director Product Management, Senior Director Product, and Principal Product Manager roles in customer experience and digital transformation.';

const HERO_HEADLINE =
  'Senior Product Manager | Enterprise Product Strategy | Customer Experience | Digital Transformation';

const HERO_LEDE =
  'Nearly 30 years of enterprise product leadership at Verizon, spanning product strategy, customer experience, digital transformation, assisted digital platforms, and self-service. The technologies have changed across nearly three decades; the approach has stayed consistent: learn quickly, simplify complexity, align the right people, and turn ideas into customer-facing products and operational improvements. AI is the latest capability in that continuing pattern of adaptation.';

export const metadata: Metadata = {
  // Scoped to this route only -- does not touch the root layout's
  // metadataBase (still https://www.answer-brief.com for the rest of the
  // site). Next.js uses metadataBase to resolve the file-convention
  // opengraph-image.tsx into an absolute URL; without this override og:image
  // would resolve against answer-brief.com instead of tomasnieves.com.
  metadataBase: new URL(CANONICAL_URL),
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: CANONICAL_URL,
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: CANONICAL_URL,
    siteName: 'Tomas Nieves',
    type: 'profile',
    firstName: 'Tomas',
    lastName: 'Nieves',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Tomas Nieves',
  jobTitle: 'Senior Product Manager',
  url: CANONICAL_URL,
  email: 'mailto:tomas@nieves.com',
  sameAs: ['https://www.linkedin.com/in/tomas-nieves-843053171/'],
  alumniOf: {
    '@type': 'CollegeOrUniversity',
    name: 'University of Puerto Rico',
  },
  knowsAbout: [
    'Enterprise Product Strategy',
    'Customer Experience Modernization',
    'Digital Product Transformation',
    'Omnichannel Experiences',
    'Product Roadmap Development',
    'Cross-Functional Leadership',
  ],
  description: PAGE_DESCRIPTION,
};

const NAV_LINKS = [
  { href: '#top', label: 'Home' },
  { href: '#experience', label: 'Experience' },
  { href: '#highlights', label: 'Product Highlights' },
  { href: '#leadership', label: 'Leadership Approach' },
  { href: '#resume', label: 'Résumé' },
  { href: '#contact', label: 'Contact' },
];

const RESUME_PDF = '/tomas/Tomas-Nieves-Resume.pdf';
const RESUME_DOCX = '/tomas/Tomas-Nieves-Resume.docx';
const RECRUITER_BRIEF_PDF = '/tomas/Tomas-Nieves-Recruiter-Brief.pdf';
const LINKEDIN_URL = 'https://www.linkedin.com/in/tomas-nieves-843053171/';
const EMAIL = 'tomas@nieves.com';

type WhyCard = { title: string; what: string; why: string; evidence: string };

const whyCards: WhyCard[] = [
  {
    title: 'Enterprise Product Leadership',
    what: 'Owns product strategy and roadmap for enterprise-scale platforms end to end.',
    why: 'Enterprise organizations need product leaders who can run ambiguous, high-stakes problems without hand-holding.',
    evidence: 'Nearly 30 years owning Verizon product lines, from View Together through Consumer and Small Business Solutions.',
  },
  {
    title: 'Customer Experience Modernization',
    what: 'Leads assisted digital, co-browse, and self-service initiatives that simplify complex systems for the customer.',
    why: 'Customer experience modernization is a top priority across nearly every enterprise product organization.',
    evidence: 'View Together supports approximately 15 million annual customer interactions across retail and contact-center channels.',
  },
  {
    title: 'Digital and Omnichannel Transformation',
    what: 'Connects retail, contact-center, and digital self-service channels into one coherent customer journey.',
    why: 'Transformation requires unifying channels, not just shipping isolated features.',
    evidence: 'Verizon Assistant self-service platform and View Together’s cross-channel assisted experience.',
  },
  {
    title: 'Complex Cross-Functional Execution',
    what: 'Aligns engineering, UX, operations, legal, compliance, and executive stakeholders around one product direction.',
    why: 'Enterprise transformation stalls without someone who can coordinate across every function involved.',
    evidence: 'Drives launch readiness and governance for platform releases in partnership with legal, compliance, and operations.',
  },
  {
    title: 'Platform and Operational Simplification',
    what: 'Owns full product lifecycle and simplifies operational processes across a multi-product portfolio.',
    why: 'Operational complexity, not lack of ideas, is often the real blocker to shipping.',
    evidence: 'Full-lifecycle ownership of the Verizon.com email platform and portfolio-wide simplification in Consumer and Small Business Solutions.',
  },
  {
    title: 'Continuous Learning and AI Fluency',
    what: 'Builds practical AI-assisted workflow, research, and product-analysis skills on top of established product judgment.',
    why: 'Enterprise teams need product leaders who apply AI without losing product discipline.',
    evidence: 'Five completed AI certifications: Google AI Professional Certificate, Google AI Essentials, Azure AI-900, IBM AI Fundamentals, ISACA AI Fundamentals.',
  },
];

type TimelineItem = { role: string; scope: string; focus: string; contribution: string };

const timeline: TimelineItem[] = [
  {
    role: 'Senior Product Owner / Product Manager, View Together',
    scope: 'Assisted digital and co-browse, retail and contact-center channels',
    focus: 'Roadmap ownership, backlog prioritization, governance, launch readiness',
    contribution: 'Supports approximately 15 million annual customer interactions',
  },
  {
    role: 'Product Owner, Verizon Assistant',
    scope: 'Digital self-service, customer care and operations partnership',
    focus: 'Adoption and usage analytics driving roadmap prioritization',
    contribution: 'Reduced dependency on live support channels',
  },
  {
    role: 'Product Owner, Verizon.com Email Platform',
    scope: 'Consumer email platform, engineering and operations partnership',
    focus: 'Full product lifecycle ownership, reliability and continuity',
    contribution: 'Sustained a dependable communications experience',
  },
  {
    role: 'Product Manager, Consumer and Small Business Solutions',
    scope: 'Consumer and small-business digital product portfolio',
    focus: 'Investment prioritization, cross-functional stakeholder alignment',
    contribution: 'Simplified product and customer experience processes portfolio-wide',
  },
];

type HighlightCard = {
  title: string;
  role: string;
  challenge: string;
  scope: string;
  contribution: string;
  outcome: string;
  transferable: string;
};

const highlightCards: HighlightCard[] = [
  {
    title: 'View Together',
    role: 'Senior Product Owner / Product Manager',
    challenge:
      'Retail and contact-center customers needed a simpler, more transparent assisted-purchase and support experience.',
    scope: 'Engineering, UX, operations, retail, legal, compliance, and contact-center field teams.',
    contribution:
      'Owns product strategy and roadmap, leads backlog prioritization and cross-functional coordination, drives launch readiness and governance, and incorporates field feedback into production monitoring and defect prioritization.',
    outcome:
      'Supports approximately 15 million annual customer interactions across retail and contact-center channels, delivered on committed timelines with controlled rollout.',
    transferable:
      'Enterprise-scale platform ownership, cross-functional governance, and customer experience modernization that transfers to any large consumer-facing product organization.',
  },
  {
    title: 'Verizon Assistant',
    role: 'Product Owner',
    challenge: 'Customers needed to resolve account and service issues without relying on live support channels.',
    scope: 'Customer care and operations teams.',
    contribution:
      'Owned product strategy and roadmap for a digital self-service platform, using adoption and usage analytics to prioritize the capabilities with the greatest customer impact.',
    outcome: 'Reduced dependency on live support channels through prioritized self-service capabilities.',
    transferable:
      'Data-informed roadmap prioritization and self-service platform ownership, directly relevant to digital transformation and customer experience roles.',
  },
  {
    title: 'Verizon.com Email Platform',
    role: 'Product Owner',
    challenge: 'Verizon.com’s consumer email platform needed reliable, continuous service for customer communications.',
    scope: 'Engineering and operations teams.',
    contribution:
      'Owned full product lifecycle, coordinating cross-functional teams to manage platform stability and resolve customer-facing issues.',
    outcome: 'Sustained a dependable, always-on communications experience for consumer customers.',
    transferable:
      'Full-lifecycle platform ownership and operational reliability discipline, transferable to any platform or infrastructure product role.',
  },
  {
    title: 'Consumer and Small Business Solutions',
    role: 'Product Manager',
    challenge: 'A portfolio of consumer and small-business digital products needed disciplined investment prioritization.',
    scope: 'Business, technology, and operations stakeholders.',
    contribution:
      'Managed the digital product portfolio, prioritized investment based on customer need and business value, and aligned stakeholders to simplify product and customer experience processes.',
    outcome: 'Simplified product and customer experience processes across a multi-product portfolio.',
    transferable:
      'Portfolio-level prioritization and stakeholder alignment, applicable to Group or Principal Product Manager roles managing multiple products at once.',
  },
];

const leadershipPrinciples = [
  'Moves from ambiguity to action.',
  'Learns unfamiliar systems quickly.',
  'Connects strategy to execution.',
  'Uses customer evidence to prioritize.',
  'Aligns business, technology, operations, design, and governance.',
  'Makes risks and tradeoffs visible.',
  'Builds repeatable processes.',
  'Uses AI to improve speed and decision quality without replacing judgment.',
];

const certifications = [
  'Google AI Professional Certificate, Google / Coursera, 7-course program (May 2026)',
  'Google AI Essentials',
  'Microsoft Azure AI Fundamentals (AI-900)',
  'IBM AI Fundamentals',
  'ISACA AI Fundamentals',
];

const learningNote =
  'Throughout nearly 30 years at Verizon, Tomas consistently adapted as technology, customer expectations, products, and operating models evolved. Today, that same approach includes AI-assisted research, workflow automation, product analysis, and modern engineering practices. AI is not a career change. It is the newest tool supporting an established pattern of learning, judgment, and execution.';

const targetRoles = [
  'Director, Product Management',
  'Senior Director, Product',
  'Principal Product Manager',
  'Group Product Manager',
  'Director, Digital Transformation',
  'Director, Customer Experience',
  'Director, Platform Strategy',
  'Director, AI-Enabled Product Operations',
];

const coreCompetencies = [
  'Enterprise Product Strategy',
  'Digital Product Transformation',
  'Customer Experience Modernization',
  'Roadmap Ownership & Backlog Prioritization',
  'Cross-Functional Leadership',
  'Product Governance & Launch Readiness',
  'Executive Stakeholder Alignment',
  'Risk, Dependency & Decision Management',
  'Engineering, UX & Architecture Partnership',
  'Product Operations',
  'Data-Informed Decision Making',
  'Applied AI Fluency',
];

export default function TomasPage() {
  return (
    <main className={styles.page} id="top">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />

      <nav className={styles.nav} aria-label="Primary">
        <div className={styles.navInner}>
          <a className={styles.navBrand} href="#top">
            Tomas Nieves
          </a>
          <div className={styles.navLinks}>
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
          <a className={styles.navCta} href={RESUME_PDF} download="Tomas-Nieves-Resume.pdf">
            Download Résumé
          </a>
        </div>
      </nav>

      <div className={styles.shell}>
        {/* Hero */}
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroPhoto}>
              <Image
                src="/tomas/tomas-nieves-headshot.png"
                alt="Tomas Nieves"
                width={640}
                height={512}
                priority
                className={styles.heroPhotoImg}
              />
            </div>
            <div className={styles.heroText}>
              <p className={styles.eyebrow}>Senior Product Manager</p>
              <h1>Tomas Nieves</h1>
              <p className={styles.heroHeadline}>{HERO_HEADLINE}</p>
              <p className={styles.heroLede}>{HERO_LEDE}</p>
              <div className={styles.heroButtons}>
                <a className={styles.buttonPrimary} href={RESUME_PDF} download="Tomas-Nieves-Resume.pdf">
                  Download Résumé
                </a>
                <a className={styles.buttonSecondary} href="#highlights">
                  View Product Highlights
                </a>
                <a className={styles.buttonSecondary} href="#contact">
                  Contact Tomas
                </a>
              </div>
              <div className={styles.heroLinks}>
                <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
                <span aria-hidden="true">&middot;</span>
                <a href={LINKEDIN_URL} target="_blank" rel="noreferrer">
                  <LinkedInIcon /> LinkedIn
                </a>
              </div>
            </div>
          </div>
        </header>

        {/* Why Tomas */}
        <section className={styles.block}>
          <h2>Why Tomas</h2>
          <div className={styles.whyGrid}>
            {whyCards.map((card) => (
              <article key={card.title} className={styles.whyCard}>
                <h3>{card.title}</h3>
                <p>{card.what}</p>
                <p className={styles.whyWhy}>{card.why}</p>
                <p className={styles.whyEvidence}>{card.evidence}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Career at a Glance */}
        <section className={styles.block} id="experience">
          <h2>Career at a Glance</h2>
          <div className={styles.experienceHeader}>
            <strong>Verizon</strong>
            <span>1996 &ndash; 2026, reverse chronological</span>
          </div>
          <ol className={styles.timelineList}>
            {timeline.map((item) => (
              <li key={item.role} className={styles.timelineItem}>
                <p className={styles.timelineRole}>{item.role}</p>
                <dl className={styles.timelineFields}>
                  <div>
                    <dt>Scope</dt>
                    <dd>{item.scope}</dd>
                  </div>
                  <div>
                    <dt>Focus</dt>
                    <dd>{item.focus}</dd>
                  </div>
                  <div>
                    <dt>Selected contribution</dt>
                    <dd>{item.contribution}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </section>

        {/* Selected Product Highlights */}
        <section className={styles.block} id="highlights">
          <h2>Selected Product Highlights</h2>
          <div className={styles.highlightGrid}>
            {highlightCards.map((card) => (
              <article key={card.title} className={styles.highlightCard}>
                <h3>{card.title}</h3>
                <p className={styles.roleNote}>{card.role}</p>
                <p>
                  <strong>Challenge:</strong> {card.challenge}
                </p>
                <p>
                  <strong>Outcome:</strong> {card.outcome}
                </p>
                <details className={styles.highlightDetails}>
                  <summary>Leadership scope, contribution, and transferable value</summary>
                  <p>
                    <strong>Leadership Scope:</strong> {card.scope}
                  </p>
                  <p>
                    <strong>Product Contribution:</strong> {card.contribution}
                  </p>
                  <p>
                    <strong>Transferable Value:</strong> {card.transferable}
                  </p>
                </details>
              </article>
            ))}
          </div>
        </section>

        {/* How Tomas Leads */}
        <section className={styles.block} id="leadership">
          <h2>How Tomas Leads</h2>
          <ul className={styles.checkList}>
            {leadershipPrinciples.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {/* Continuous Learning and Modern Product Leadership */}
        <section className={styles.block}>
          <h2>Continuous Learning and Modern Product Leadership</h2>
          <p>{learningNote}</p>
          <ul className={styles.certList}>
            {certifications.map((cert) => (
              <li key={cert}>{cert}</li>
            ))}
          </ul>
        </section>

        {/* Target Opportunities */}
        <section className={styles.block}>
          <h2>Target Opportunities</h2>
          <p className={styles.sectionNote}>Target roles, not prior titles.</p>
          <ul className={styles.chipList}>
            {targetRoles.map((role) => (
              <li key={role}>{role}</li>
            ))}
          </ul>
          <p>Dallas, Texas (hybrid) and appropriate U.S. remote opportunities.</p>
        </section>

        {/* Recruiter Toolkit */}
        <section className={styles.block} id="resume">
          <h2>Recruiter Toolkit</h2>
          <div className={styles.toolkitGrid}>
            <div className={styles.toolkitDownloads}>
              <a className={styles.buttonPrimary} href={RESUME_PDF} download="Tomas-Nieves-Resume.pdf">
                Download ATS Résumé (PDF)
              </a>
              <a className={styles.buttonSecondary} href={RESUME_DOCX} download="Tomas-Nieves-Resume.docx">
                Download Résumé (DOCX)
              </a>
              <a className={styles.buttonSecondary} href={RESUME_PDF} target="_blank" rel="noreferrer">
                View Résumé Online
              </a>
              <a className={styles.buttonSecondary} href={RECRUITER_BRIEF_PDF} download="Tomas-Nieves-Recruiter-Brief.pdf">
                Download Recruiter Brief (PDF)
              </a>
            </div>
            <div className={styles.toolkitInfo}>
              <h3>Professional Summary</h3>
              <p>{HERO_LEDE}</p>
              <h3>Core Competencies</h3>
              <ul className={styles.chipList}>
                {coreCompetencies.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>Location and Work Arrangement</h3>
              <p>Dallas, Texas (hybrid) and appropriate U.S. remote opportunities.</p>
              <h3>Education</h3>
              <p>Master of Science (M.S.), Microcomputing, University of Puerto Rico</p>
              <h3>Certifications</h3>
              <ul className={styles.certList}>
                {certifications.map((cert) => (
                  <li key={cert}>{cert}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Contact */}
        <footer className={styles.footer} id="contact">
          <p>If any of this is relevant to something you&rsquo;re hiring for, I&rsquo;d like to talk.</p>
          <div className={styles.heroButtons}>
            <a className={styles.buttonPrimary} href={`mailto:${EMAIL}`}>
              Start a Conversation
            </a>
            <a className={styles.buttonSecondary} href={LINKEDIN_URL} target="_blank" rel="noreferrer">
              <LinkedInIcon /> LinkedIn
            </a>
          </div>
          <p className={styles.sectionNote}>{EMAIL}</p>
        </footer>
      </div>
    </main>
  );
}

function LinkedInIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.45 20.45h-3.56v-5.58c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.68H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  );
}
