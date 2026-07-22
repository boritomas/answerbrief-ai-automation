type JsonRecord = Record<string, unknown>;

export type CareerOsSourceCandidate = {
  ats: 'greenhouse' | 'workday' | 'lever' | 'ashby' | 'smartrecruiters' | 'icims' | 'phenom' | 'successfactors' | 'oracle' | 'company_hosted';
  board?: string;
  businessType: string;
  category: string;
  employer: string;
  priority: number;
  sourceUrl?: string;
  supported: boolean;
};

export type CareerOsDiscoveryPlan = {
  coverageSummary: {
    discoveryMode: string;
    supportedOfficialSources: number;
    totalEmployerCandidates: number;
    unsupportedSourceCandidates: number;
  };
  fingerprint: string;
  greenhouseBoards: string[];
  oracleSources: CareerOsSourceCandidate[];
  sourceCandidates: CareerOsSourceCandidate[];
  sourceRegistry: string[];
};

export const CAREER_OS_MARKET_UNIVERSE_VERSION = 'broader-product-management-market-2026-07-22-v4';

export const CAREER_OS_SOURCE_REGISTRY = [
  'Greenhouse official board API',
  'Workday official career portals when adapter evidence exists',
  'Lever official postings when adapter evidence exists',
  'Ashby official postings when adapter evidence exists',
  'SmartRecruiters official postings when adapter evidence exists',
  'iCIMS official postings when adapter evidence exists',
  'Phenom official portals when adapter evidence exists',
  'SuccessFactors official portals when adapter evidence exists',
  'Oracle Recruiting official portals when adapter evidence exists',
  'company-hosted official career portals',
  'dynamic employer records discovered from prior source runs and employer knowledge base',
];

export const CAREER_OS_EMPLOYER_UNIVERSE = [
  'U.S. wireless, telecom, broadband, fiber, cable, and connectivity employers',
  'networking, OSS/BSS, cloud communications, contact-center, and customer-experience platforms',
  'enterprise software, AI product, workflow automation, cybersecurity, and infrastructure platforms',
  'banking, fintech, payments, insurance, and regulated-industry product organizations',
  'retail, commerce, healthcare technology, transportation, logistics, energy, and utilities employers',
  'management consulting, digital transformation, customer-journey, and modernization practices',
  'major Dallas-Fort Worth and Texas employers with product-led roles',
  'Fortune 500 employers with product management, platform, AI adoption, and customer-experience scope',
];

export const CAREER_OS_ROLE_PRIORITIES = [
  'Product Manager',
  'Senior Product Manager',
  'Group Product Manager',
  'Principal Product Manager',
  'Lead Product Manager',
  'Product Lead',
  'Director of Product Management',
  'Senior Director of Product',
  'Senior Director of Product Management',
  'Product Portfolio Director',
  'Digital Product Director',
  'Customer Experience Product Director',
  'Platform Product Director',
  'AI Product Director',
  'Automation Product Director',
  'Product Operations Director',
  'Digital Transformation Director',
  'Customer Journey Director',
  'Enterprise Product Director',
  'Product Strategy Director',
];

const BASELINE_SOURCE_CANDIDATES: CareerOsSourceCandidate[] = [
  source('AT&T', 'company_hosted', 'U.S. wireless and telecom carriers', 'telecom carrier', 100),
  source('T-Mobile', 'company_hosted', 'U.S. wireless and telecom carriers', 'telecom carrier', 99),
  source('Verizon', 'workday', 'U.S. wireless and telecom carriers', 'telecom carrier', 98),
  source('UScellular', 'workday', 'U.S. wireless and telecom carriers', 'regional wireless carrier', 92),
  source('Dish Wireless', 'company_hosted', 'U.S. wireless and telecom carriers', 'wireless carrier', 90),
  source('Boost Mobile', 'company_hosted', 'U.S. wireless and telecom carriers', 'MVNO', 86),
  source('Consumer Cellular', 'company_hosted', 'U.S. wireless and telecom carriers', 'MVNO', 80),
  source('C Spire', 'company_hosted', 'U.S. wireless and telecom carriers', 'regional wireless carrier', 80),
  source('Comcast', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'broadband and cable', 96),
  source('Charter Communications / Spectrum', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'broadband and cable', 95),
  source('Cox Communications', 'workday', 'broadband, fiber, cable, and internet providers', 'broadband and cable', 94),
  source('Altice USA / Optimum', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'broadband and cable', 88),
  source('Frontier Communications', 'workday', 'broadband, fiber, cable, and internet providers', 'fiber broadband', 92),
  source('Lumen Technologies', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'fiber and enterprise connectivity', 91),
  source('Google Fiber', 'greenhouse', 'broadband, fiber, cable, and internet providers', 'fiber broadband', 96, 'googlefiber'),
  source('Brightspeed', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'fiber broadband', 85),
  source('Windstream / Kinetic', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'fiber broadband', 84),
  source('Consolidated Communications / Fidium Fiber', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'fiber broadband', 78),
  source('Metronet', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'fiber broadband', 76),
  source('Ziply Fiber', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'fiber broadband', 75),
  source('Ting Internet', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'fiber broadband', 72),
  source('Sonic', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'fiber broadband', 72),
  source('Astound Broadband', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'broadband and cable', 72),
  source('WOW!', 'company_hosted', 'broadband, fiber, cable, and internet providers', 'broadband and cable', 70),
  source('SpaceX / Starlink', 'greenhouse', 'satellite, fixed wireless, and connectivity', 'satellite connectivity', 94, 'spacex'),
  source('Amazon Project Kuiper', 'company_hosted', 'satellite, fixed wireless, and connectivity', 'satellite connectivity', 91),
  source('Viasat', 'company_hosted', 'satellite, fixed wireless, and connectivity', 'satellite connectivity', 86),
  source('HughesNet / EchoStar', 'company_hosted', 'satellite, fixed wireless, and connectivity', 'satellite connectivity', 84),
  source('Iridium', 'company_hosted', 'satellite, fixed wireless, and connectivity', 'satellite communications', 80),
  source('Globalstar', 'company_hosted', 'satellite, fixed wireless, and connectivity', 'satellite communications', 76),
  source('AST SpaceMobile', 'company_hosted', 'satellite, fixed wireless, and connectivity', 'satellite-to-mobile connectivity', 78),
  source('Cisco', 'phenom', 'networking, telecom equipment, and infrastructure', 'networking equipment', 98),
  source('Nokia', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'networking equipment', 94),
  source('Ericsson', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'networking equipment', 94),
  source('Samsung Networks', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'networking equipment', 88),
  source('Juniper Networks', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'networking equipment', 88),
  source('Ciena', 'greenhouse', 'networking, telecom equipment, and infrastructure', 'networking equipment', 86, 'ciena'),
  source('CommScope', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'network infrastructure', 84),
  source('Corning', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'fiber infrastructure', 80),
  source('Arista Networks', 'greenhouse', 'networking, telecom equipment, and infrastructure', 'networking equipment', 80, 'aristanetworks'),
  source('Extreme Networks', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'networking equipment', 78),
  source('Calix', 'greenhouse', 'networking, telecom equipment, and infrastructure', 'broadband software', 82, 'calix'),
  source('Adtran', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'broadband equipment', 78),
  source('Amdocs', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'OSS/BSS software', 80),
  source('Netcracker', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'OSS/BSS software', 78),
  source('Mavenir', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'private wireless software', 78),
  source('Radisys', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'telecom software', 72),
  source('Harmonic', 'company_hosted', 'networking, telecom equipment, and infrastructure', 'video and broadband software', 72),
  source('Crown Castle', 'company_hosted', 'towers, fiber infrastructure, and digital real estate', 'tower and fiber infrastructure', 88),
  source('American Tower', 'workday', 'towers, fiber infrastructure, and digital real estate', 'tower infrastructure', 86),
  source('SBA Communications', 'company_hosted', 'towers, fiber infrastructure, and digital real estate', 'tower infrastructure', 78),
  source('Zayo', 'company_hosted', 'towers, fiber infrastructure, and digital real estate', 'fiber infrastructure', 84),
  source('Equinix', 'company_hosted', 'towers, fiber infrastructure, and digital real estate', 'interconnection and data centers', 84),
  source('Digital Realty', 'company_hosted', 'towers, fiber infrastructure, and digital real estate', 'data centers', 78),
  source('CoreSite', 'company_hosted', 'towers, fiber infrastructure, and digital real estate', 'data centers', 75),
  source('QTS', 'company_hosted', 'towers, fiber infrastructure, and digital real estate', 'data centers', 75),
  source('CyrusOne', 'company_hosted', 'towers, fiber infrastructure, and digital real estate', 'data centers', 75),
  source('EdgeConneX', 'company_hosted', 'towers, fiber infrastructure, and digital real estate', 'edge data centers', 72),
  source('Twilio', 'greenhouse', 'cloud communications, contact center, and customer experience', 'cloud communications', 96, 'twilio'),
  source('Braze', 'greenhouse', 'cloud communications, contact center, and customer experience', 'customer engagement and AI messaging platform', 90, 'braze'),
  source('RingCentral', 'greenhouse', 'cloud communications, contact center, and customer experience', 'cloud communications', 88, 'ringcentral'),
  source('Five9', 'greenhouse', 'cloud communications, contact center, and customer experience', 'contact center', 92, 'five9'),
  source('NICE', 'greenhouse', 'cloud communications, contact center, and customer experience', 'contact center', 90, 'nice'),
  source('Genesys', 'company_hosted', 'cloud communications, contact center, and customer experience', 'contact center', 88),
  source('Zoom', 'greenhouse', 'cloud communications, contact center, and customer experience', 'cloud communications', 88, 'zoom'),
  source('Vonage', 'greenhouse', 'cloud communications, contact center, and customer experience', 'cloud communications', 88, 'vonage'),
  source('8x8', 'greenhouse', 'cloud communications, contact center, and customer experience', 'cloud communications', 82, '8x8'),
  source('Dialpad', 'greenhouse', 'cloud communications, contact center, and customer experience', 'cloud communications', 86, 'dialpad'),
  source('Bandwidth', 'greenhouse', 'cloud communications, contact center, and customer experience', 'cloud communications', 86, 'bandwidth'),
  source('Sinch', 'company_hosted', 'cloud communications, contact center, and customer experience', 'cloud communications', 78),
  source('Talkdesk', 'greenhouse', 'cloud communications, contact center, and customer experience', 'contact center', 82, 'talkdesk'),
  source('ServiceNow', 'smartrecruiters', 'enterprise SaaS and digital transformation', 'enterprise workflow platform', 86),
  source('Box', 'greenhouse', 'enterprise SaaS and digital transformation', 'enterprise content cloud and AI platform', 80, 'boxinc'),
  source('Salesforce', 'company_hosted', 'enterprise SaaS and digital transformation', 'CRM and AI platform', 84),
  source('Microsoft', 'company_hosted', 'enterprise SaaS and digital transformation', 'cloud and AI platform', 84),
  source('Google Cloud', 'company_hosted', 'enterprise SaaS and digital transformation', 'cloud and AI platform', 84),
  source('Amazon Web Services', 'company_hosted', 'enterprise SaaS and digital transformation', 'cloud and AI platform', 84),
  source('CoreWeave', 'greenhouse', 'enterprise SaaS and digital transformation', 'AI infrastructure platform', 82, 'coreweave'),
  source('Databricks', 'greenhouse', 'enterprise SaaS and digital transformation', 'data and AI platform', 84, 'databricks'),
  source('Elastic', 'greenhouse', 'enterprise SaaS and digital transformation', 'search, observability, and AI platform', 80, 'elastic'),
  source('Fivetran', 'greenhouse', 'enterprise SaaS and digital transformation', 'data movement and platform automation', 79, 'fivetran'),
  source('Airtable', 'greenhouse', 'enterprise SaaS and digital transformation', 'collaboration and workflow platform', 78, 'airtable'),
  source('Asana', 'greenhouse', 'enterprise SaaS and digital transformation', 'work management platform', 78, 'asana'),
  source('Scale AI', 'greenhouse', 'enterprise SaaS and digital transformation', 'AI model and workflow platform', 83, 'scaleai'),
  source('Samsara', 'greenhouse', 'enterprise SaaS and digital transformation', 'connected operations platform', 84, 'samsara'),
  source('Zscaler', 'greenhouse', 'enterprise SaaS and digital transformation', 'cloud security platform', 76, 'zscaler'),
  source('Glean', 'greenhouse', 'enterprise SaaS and digital transformation', 'enterprise AI search platform', 76, 'gleanwork'),
  source('Stripe', 'greenhouse', 'payments, digital commerce, and adjacent platforms', 'payments platform', 76, 'stripe'),
  source('Block', 'greenhouse', 'payments, digital commerce, and adjacent platforms', 'commerce and payments platform', 76, 'block'),
  source('Marqeta', 'greenhouse', 'payments, digital commerce, and adjacent platforms', 'card issuing and payments platform', 76, 'marqeta'),
  source('PayPal', 'workday', 'payments, digital commerce, and adjacent platforms', 'payments platform', 74),
  source('Toast', 'greenhouse', 'payments, digital commerce, and adjacent platforms', 'restaurant commerce platform', 82, 'toast'),
  source('Affirm', 'greenhouse', 'payments, digital commerce, and adjacent platforms', 'fintech platform', 82, 'affirm'),
  source('MongoDB', 'greenhouse', 'enterprise SaaS and digital transformation', 'database platform', 80, 'mongodb'),
  source('Adobe', 'company_hosted', 'enterprise SaaS and digital transformation', 'digital experience platform', 76),
  source('Intuit', 'company_hosted', 'payments, digital commerce, and adjacent platforms', 'financial software platform', 74),
  source('Capital One', 'workday', 'payments, digital commerce, and adjacent platforms', 'financial platform', 74),
  source('JPMorgan Chase', 'oracle', 'banking, payments, and enterprise platforms', 'banking and payments platform', 97, undefined, true, 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/jobs'),
  source('Bank of America', 'workday', 'banking, payments, and enterprise platforms', 'banking platform', 79),
  source('Wells Fargo', 'workday', 'banking, payments, and enterprise platforms', 'banking platform', 78),
  source('Citi', 'workday', 'banking, payments, and enterprise platforms', 'banking platform', 77),
  source('Fidelity', 'company_hosted', 'banking, payments, and enterprise platforms', 'financial platform', 76),
  source('Charles Schwab', 'workday', 'banking, payments, and enterprise platforms', 'financial platform', 75),
  source('USAA', 'workday', 'banking, payments, and enterprise platforms', 'insurance and financial platform', 78),
  source('PayPal', 'workday', 'banking, payments, and enterprise platforms', 'payments platform', 77),
  source('Visa', 'company_hosted', 'banking, payments, and enterprise platforms', 'payments platform', 76),
  source('Mastercard', 'workday', 'banking, payments, and enterprise platforms', 'payments platform', 76),
  source('American Express', 'company_hosted', 'payments, digital commerce, and adjacent platforms', 'payments platform', 72),
  source('Oracle', 'company_hosted', 'enterprise SaaS and digital transformation', 'enterprise software', 72),
  source('IBM', 'company_hosted', 'enterprise SaaS and digital transformation', 'enterprise software', 72),
  source('SAP', 'company_hosted', 'enterprise SaaS and digital transformation', 'enterprise software', 72),
  source('Snowflake', 'greenhouse', 'enterprise SaaS and digital transformation', 'data platform', 72, 'snowflake'),
  source('Datadog', 'greenhouse', 'enterprise SaaS and digital transformation', 'observability platform', 72, 'datadog'),
  source('Cloudflare', 'greenhouse', 'enterprise SaaS and digital transformation', 'network and security platform', 78, 'cloudflare'),
  source('Okta', 'greenhouse', 'enterprise SaaS and digital transformation', 'identity platform', 72, 'okta'),
  source('Palo Alto Networks', 'company_hosted', 'enterprise SaaS and digital transformation', 'cybersecurity platform', 72),
  source('CrowdStrike', 'greenhouse', 'enterprise SaaS and digital transformation', 'cybersecurity platform', 72, 'crowdstrike'),
  source('Rubrik', 'greenhouse', 'enterprise SaaS and digital transformation', 'cyber resilience and data security platform', 79, 'rubrik'),
  source('Verkada', 'greenhouse', 'enterprise SaaS and digital transformation', 'physical security and enterprise networking platform', 77, 'verkada'),
  source('Adobe', 'company_hosted', 'enterprise SaaS and digital transformation', 'digital experience platform', 76),
  source('Walmart', 'company_hosted', 'retail and commerce platforms', 'retail platform', 72),
  source('Target', 'company_hosted', 'retail and commerce platforms', 'retail platform', 71),
  source('Home Depot', 'company_hosted', 'retail and commerce platforms', 'retail platform', 71),
  source('Lowe’s', 'company_hosted', 'retail and commerce platforms', 'retail platform', 71),
  source('CVS Health', 'workday', 'healthcare technology and consumer platforms', 'healthcare platform', 72),
  source('UnitedHealth Group', 'workday', 'healthcare technology and consumer platforms', 'healthcare platform', 72),
  source('Accenture', 'workday', 'consulting and transformation', 'consulting and digital transformation', 74),
  source('Deloitte', 'company_hosted', 'consulting and transformation', 'consulting and digital transformation', 74),
  source('PwC', 'company_hosted', 'consulting and transformation', 'consulting and digital transformation', 72),
  source('EY', 'company_hosted', 'consulting and transformation', 'consulting and digital transformation', 72),
  source('KPMG', 'company_hosted', 'consulting and transformation', 'consulting and digital transformation', 71),
  source('Capgemini', 'company_hosted', 'consulting and transformation', 'consulting and digital transformation', 71),
  source('Cognizant', 'company_hosted', 'consulting and transformation', 'consulting and digital transformation', 71),
  source('Slalom', 'company_hosted', 'consulting and transformation', 'consulting and digital transformation', 71),
  source('Motive', 'greenhouse', 'transportation, logistics, and connected operations platforms', 'fleet, telematics, and AI operations platform', 80, 'gomotive'),
  source('Anduril Industries', 'greenhouse', 'satellite, autonomy, defense, and next-generation connectivity', 'autonomy and mission systems platform', 78, 'andurilindustries'),
  source('Vodafone', 'company_hosted', 'global companies with U.S. opportunities', 'global telecom carrier', 70),
  source('Deutsche Telekom', 'company_hosted', 'global companies with U.S. opportunities', 'global telecom carrier', 70),
  source('Telefonica', 'company_hosted', 'global companies with U.S. opportunities', 'global telecom carrier', 70),
  source('Orange', 'company_hosted', 'global companies with U.S. opportunities', 'global telecom carrier', 70),
  source('BT Group', 'company_hosted', 'global companies with U.S. opportunities', 'global telecom carrier', 70),
  source('Liberty Global', 'company_hosted', 'global companies with U.S. opportunities', 'global connectivity platform', 70),
  source('America Movil', 'company_hosted', 'global companies with U.S. opportunities', 'global telecom carrier', 70),
  source('Telus', 'company_hosted', 'global companies with U.S. opportunities', 'global telecom carrier', 70),
  source('Rogers', 'company_hosted', 'global companies with U.S. opportunities', 'global telecom carrier', 70),
  source('Bell Canada', 'company_hosted', 'global companies with U.S. opportunities', 'global telecom carrier', 70),
  source('NTT', 'company_hosted', 'global companies with U.S. opportunities', 'global technology services', 70),
  source('Tata Communications', 'company_hosted', 'global companies with U.S. opportunities', 'global connectivity provider', 70),
  source('Colt Technology Services', 'company_hosted', 'global companies with U.S. opportunities', 'global connectivity provider', 70),
];

export function buildCareerOsDiscoveryPlan(input: {
  applications?: JsonRecord[];
  extraGreenhouseBoards?: string[];
  employerRecords?: JsonRecord[];
  jobPostings?: JsonRecord[];
  platformProfiles?: JsonRecord[];
  previousSearchConfig?: JsonRecord;
  workflowEvents?: JsonRecord[];
} = {}): CareerOsDiscoveryPlan {
  const previousBoards = stringArray(input.previousSearchConfig?.boards);
  const profileBoards = stringArray(input.platformProfiles?.map((profile) => (
    asRecord(profile).greenhouse_board
    || asRecord(profile).board
    || asRecord(profile).board_slug
  )));
  const employerBoards = stringArray(input.employerRecords?.map((employer) => (
    asRecord(employer).greenhouse_board
    || asRecord(employer).board
    || asRecord(employer).board_slug
  )));
  const applicationBoards = extractGreenhouseBoardsFromRecords(input.applications || []);
  const postingBoards = extractGreenhouseBoardsFromRecords(input.jobPostings || []);
  const workflowBoards = extractGreenhouseBoardsFromRecords(input.workflowEvents || []);
  const dynamicBoardCandidates = uniqueStrings([
    ...previousBoards,
    ...profileBoards,
    ...employerBoards,
    ...applicationBoards,
    ...postingBoards,
    ...workflowBoards,
    ...(input.extraGreenhouseBoards || []),
  ]).map((board) => source(companyNameFromBoard(board), 'greenhouse', 'dynamic employer discovery', 'official Greenhouse source', 74, board, true));
  const sourceCandidates = dedupeSourceCandidates(BASELINE_SOURCE_CANDIDATES.concat(dynamicBoardCandidates))
    .sort((a, b) => b.priority - a.priority || a.employer.localeCompare(b.employer));
  const oracleSources = sourceCandidates
    .filter((candidate) => candidate.supported && candidate.ats === 'oracle');
  const greenhouseBoards = uniqueStrings(sourceCandidates
    .filter((candidate) => candidate.supported && candidate.ats === 'greenhouse' && candidate.board)
    .map((candidate) => candidate.board || ''));

  return {
    coverageSummary: {
      discoveryMode: 'broad_dynamic_supported_source_plan',
      supportedOfficialSources: greenhouseBoards.length + oracleSources.length,
      totalEmployerCandidates: sourceCandidates.length,
      unsupportedSourceCandidates: sourceCandidates.filter((candidate) => !candidate.supported).length,
    },
    fingerprint: simpleHash(sourceCandidates.map((candidate) => `${candidate.employer}:${candidate.ats}:${candidate.board || 'unsupported'}`).join('|')),
    greenhouseBoards,
    oracleSources,
    sourceCandidates,
    sourceRegistry: CAREER_OS_SOURCE_REGISTRY,
  };
}

export function careerOsSourceForBoard(plan: CareerOsDiscoveryPlan, board: string) {
  return plan.sourceCandidates.find((candidate) => candidate.board === board)
    || source(companyNameFromBoard(board), 'greenhouse', 'dynamic employer discovery', 'official Greenhouse source', 50, board, true);
}

function source(
  employer: string,
  ats: CareerOsSourceCandidate['ats'],
  category: string,
  businessType: string,
  priority: number,
  board?: string,
  supported = ats === 'greenhouse' && Boolean(board),
  sourceUrl?: string,
): CareerOsSourceCandidate {
  return { ats, board, businessType, category, employer, priority, sourceUrl, supported };
}

function dedupeSourceCandidates(candidates: CareerOsSourceCandidate[]) {
  const seen = new Map<string, CareerOsSourceCandidate>();
  for (const candidate of candidates) {
    const key = candidate.board ? `greenhouse:${candidate.board}` : `${compactKey(candidate.employer)}:${candidate.ats}`;
    const existing = seen.get(key);
    if (!existing || candidate.priority > existing.priority) seen.set(key, candidate);
  }
  return Array.from(seen.values());
}

function extractGreenhouseBoardsFromRecords(records: JsonRecord[]) {
  const boards: string[] = [];
  for (const record of records) {
    const raw = asRecord(record.raw_record);
    const values = [
      record.board,
      record.board_slug,
      record.greenhouse_board,
      record.canonical_url,
      record.application_url,
      record.evidence_url,
      record.source_url,
      raw.board,
      raw.board_slug,
      raw.greenhouse_board,
      raw.canonical_url,
      raw.application_url,
      raw.job_url,
      raw.source_url,
      asRecord(record.metadata).board,
      asRecord(record.metadata).greenhouse_board,
      asRecord(record.metadata).evidence_url,
    ];
    for (const value of values) {
      const board = greenhouseBoardFromValue(value);
      if (board) boards.push(board);
    }
  }
  return uniqueStrings(boards);
}

function greenhouseBoardFromValue(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^[a-z0-9][a-z0-9_-]{1,80}$/i.test(text) && !/^https?:/i.test(text)) {
    return text.toLowerCase();
  }
  const patterns = [
    /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i,
    /job-boards(?:\.[a-z]+)?\.greenhouse\.io\/([a-z0-9_-]+)\/jobs/i,
    /[?&]for=([a-z0-9_-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return '';
}

function stringArray(values: unknown) {
  const list = Array.isArray(values) ? values : typeof values === 'string' ? values.split(',') : [];
  return uniqueStrings(list.map((value) => String(value || '').trim()).filter(Boolean));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function companyNameFromBoard(board: string) {
  return String(board || '').split(/[-_]/).map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(' ');
}

function compactKey(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function simpleHash(value: unknown) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}
