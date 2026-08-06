import type { Metadata } from 'next';
import styles from './tomas.module.css';

const CANONICAL_URL = 'https://tomasnieves.com';
const PAGE_TITLE = 'Tomas Nieves, Senior Product Manager, Enterprise Product Strategy';
const PAGE_DESCRIPTION =
  'Senior Product Manager with nearly 30 years of enterprise product leadership at Verizon, targeting Director Product Management, Senior Director Product, and Principal Product Manager roles in customer experience and digital transformation.';

export const metadata: Metadata = {
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

const capabilities = [
  'Moving ambiguous, cross-functional initiatives from strategy into disciplined execution.',
  'Product judgment grounded in customer impact, not just feature output.',
  'Cross-functional influence across engineering, UX, operations, legal, and executive stakeholders, without relying solely on formal authority.',
  'Roadmap and backlog prioritization discipline at enterprise scale.',
  'Connecting strategy, technology, operations, governance, and customer experience into one coherent plan.',
  'Current AI fluency used as a practical execution tool, not a topic studied from a distance.',
];

const certifications = [
  'Google AI Professional Certificate, Google / Coursera, 7-course program (May 2026)',
  'Google AI Essentials',
  'Microsoft Azure AI Fundamentals (AI-900)',
  'IBM AI Fundamentals',
  'ISACA AI Fundamentals',
];

const developmentNote =
  'Since leaving Verizon, Tomas has continued building practical skills in AI-assisted research, workflow automation, product analysis, and modern software delivery. This work supports his product leadership capabilities and demonstrates continued learning. It is not presented as a business, startup, or substitute for his Verizon career.';

export default function TomasPage() {
  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <div className={styles.shell}>
        {/* 1. Hero */}
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Senior Product Manager</p>
          <h1>Tomas Nieves</h1>
          <p className={styles.dek}>
            Enterprise Product Strategy &middot; Customer Experience &middot; Digital Transformation
            &middot; Omnichannel Experiences &middot; AI-Enabled Product Leadership
          </p>
          <div className={styles.heroButtons}>
            <a className={styles.buttonPrimary} href="mailto:tomas@nieves.com">
              tomas@nieves.com
            </a>
            <a
              className={styles.buttonSecondary}
              href="https://www.linkedin.com/in/tomas-nieves-843053171/"
              target="_blank"
              rel="noreferrer"
            >
              <LinkedInIcon /> LinkedIn
            </a>
          </div>
        </header>

        {/* 2. Professional Summary */}
        <section className={styles.block}>
          <h2>Professional Summary</h2>
          <p>
            Senior Product Manager and enterprise product leader with nearly 30 years of Verizon
            experience across product strategy, customer experience, digital transformation, assisted
            digital platforms, self-service, and complex cross-functional delivery. Currently pursuing
            Director and Senior Director Product Management, Digital Transformation, and Principal
            Product Manager opportunities where that scope of ownership carries forward.
          </p>
        </section>

        {/* 3. What Tomas Does Best */}
        <section className={styles.block}>
          <h2>What Tomas Does Best</h2>
          <ul className={styles.checkList}>
            {capabilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {/* 4. Verizon Career Progression */}
        <section className={styles.block}>
          <h2>Verizon Career Progression</h2>
          <div className={styles.experienceHeader}>
            <strong>Verizon</strong>
            <span>1996 &ndash; 2026</span>
          </div>
          <p>
            Nearly thirty years of enterprise product ownership at Verizon, moving through consumer
            digital platforms, self-service technology, and enterprise-scale customer experience and
            transformation initiatives.
          </p>
        </section>

        {/* 5. View Together */}
        <section className={styles.block}>
          <h2>View Together</h2>
          <p className={styles.roleNote}>Senior Product Owner / Product Manager</p>
          <p>
            Owns product strategy and roadmap for View Together, an assisted digital and co-browse
            customer experience platform supporting approximately 15 million annual customer
            interactions across retail and contact-center channels. Leads backlog prioritization and
            cross-functional coordination across engineering, UX, operations, and retail teams to
            modernize assisted purchasing and support journeys while maintaining platform stability.
          </p>
          <p>
            Drives launch readiness and governance for platform releases, partnering with legal,
            compliance, and operations to protect customer transparency and ensure controlled rollout.
            Incorporates field feedback from retail and contact-center teams into production monitoring
            and defect prioritization, and manages dependencies across product, engineering, and
            operations stakeholders to deliver enhancements on committed timelines.
          </p>
        </section>

        {/* 6. Verizon Assistant */}
        <section className={styles.block}>
          <h2>Verizon Assistant</h2>
          <p className={styles.roleNote}>Product Owner</p>
          <p>
            Owned product strategy and roadmap for Verizon Assistant, a digital self-service platform
            giving customers direct access to account support and service resolution. Partnered with
            customer care and operations teams to identify customer needs and prioritize self-service
            capabilities that reduced dependency on live support channels, using adoption and usage
            analytics to guide roadmap decisions toward the capabilities with the greatest customer
            impact.
          </p>
        </section>

        {/* 7. Verizon.com Email Platform */}
        <section className={styles.block}>
          <h2>Verizon.com Email Platform</h2>
          <p className={styles.roleNote}>Product Owner</p>
          <p>
            Owned full product lifecycle for Verizon.com&rsquo;s consumer email platform, partnering
            with engineering and operations to maintain reliability and service continuity for customer
            communications. Coordinated cross-functional teams to manage platform stability and resolve
            customer-facing issues, sustaining a dependable communications experience.
          </p>
        </section>

        {/* 8. Consumer and Small Business Solutions */}
        <section className={styles.block}>
          <h2>Consumer and Small Business Solutions</h2>
          <p className={styles.roleNote}>Product Manager</p>
          <p>
            Managed a digital product portfolio serving consumer and small-business customers,
            prioritizing investment across competing initiatives based on customer need and business
            value. Aligned business, technology, and operations stakeholders to simplify product and
            customer experience processes across the portfolio.
          </p>
        </section>

        {/* 9. Product Leadership Capabilities */}
        <section className={styles.block}>
          <h2>Product Leadership Capabilities</h2>
          <ul className={styles.skillList}>
            <li>Enterprise Product Strategy</li>
            <li>Digital Product Transformation</li>
            <li>Customer Experience Modernization</li>
            <li>Roadmap Ownership &amp; Backlog Prioritization</li>
            <li>Cross-Functional Leadership</li>
            <li>Product Governance &amp; Launch Readiness</li>
            <li>Executive Stakeholder Alignment</li>
            <li>Risk, Dependency &amp; Decision Management</li>
            <li>Engineering, UX &amp; Architecture Partnership</li>
            <li>Product Operations</li>
            <li>Data-Informed Decision Making</li>
            <li>Applied AI Fluency</li>
          </ul>
        </section>

        {/* 10. Current Professional Development */}
        <section className={styles.block}>
          <h2>Current Professional Development</h2>
          <p>{developmentNote}</p>
        </section>

        {/* 11. Education and Certifications */}
        <section className={styles.block}>
          <h2>Education and Certifications</h2>
          <p>Master of Science (M.S.), Microcomputing, University of Puerto Rico</p>
          <ul className={styles.certList}>
            {certifications.map((cert) => (
              <li key={cert}>{cert}</li>
            ))}
          </ul>
        </section>

        {/* 12. Target Opportunities */}
        <section className={styles.block}>
          <h2>Target Opportunities</h2>
          <p>
            Seeking Director Product Management, Senior Director Product, and Principal Product Manager
            opportunities in Customer Experience and Digital Transformation. These are target
            opportunities, not prior titles.
          </p>
        </section>

        {/* 13. Contact */}
        <footer className={styles.footer}>
          <p>If any of this is relevant to something you&rsquo;re hiring for, I&rsquo;d like to talk.</p>
          <div className={styles.heroButtons}>
            <a className={styles.buttonPrimary} href="mailto:tomas@nieves.com">
              tomas@nieves.com
            </a>
            <a
              className={styles.buttonSecondary}
              href="https://www.linkedin.com/in/tomas-nieves-843053171/"
              target="_blank"
              rel="noreferrer"
            >
              <LinkedInIcon /> LinkedIn
            </a>
          </div>
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
