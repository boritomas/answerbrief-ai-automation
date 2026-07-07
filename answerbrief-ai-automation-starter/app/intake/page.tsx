import { submitIntake } from './actions';

type IntakePageProps = {
  searchParams: {
    email?: string;
    error?: string;
    orderId?: string;
    token?: string;
  };
};

const careerLanes = [
  ['telecom', 'Telecom'],
  ['federal', 'Federal'],
  ['finance', 'Finance'],
  ['audit', 'Audit'],
  ['compliance', 'Compliance'],
  ['operations', 'Operations'],
  ['product', 'Product'],
  ['leadership', 'Leadership'],
  ['other', 'Other'],
] as const;

export default function IntakePage({ searchParams }: IntakePageProps) {
  const errorMessage = getErrorMessage(searchParams.error);

  return (
    <main>
      <section className="hero compact">
        <p className="eyebrow">Customer intake</p>
        <h1>Send your interview prep details.</h1>
        <p className="subhead">
          Share the role, timeline, resume, and job posting details needed to build your AnswerBrief AI package.
        </p>
      </section>

      <section className="form-shell">
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
        <form action={submitIntake} className="intake-form">
          <input type="hidden" name="orderId" value={searchParams.orderId || ''} />
          <input type="hidden" name="token" value={searchParams.token || ''} />

          <fieldset>
            <legend>1. Role details</legend>
            <label>
              Target job title
              <input name="targetRole" placeholder="Senior Network Engineer" required />
            </label>
            <label>
              Target company <span>Optional</span>
              <input name="targetCompany" placeholder="Company name if known" />
            </label>
            <label>
              Interview date <span>Optional</span>
              <input name="interviewDate" type="date" />
            </label>
            <label>
              Industry / career lane
              <select name="careerLane" defaultValue="telecom" required>
                {careerLanes.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>2. Candidate background</legend>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Email
              <input name="email" type="email" defaultValue={searchParams.email || ''} required />
            </label>
            <label>
              Notes <span>Optional</span>
              <textarea
                name="notes"
                placeholder="Interview format, role concerns, career context, and non-confidential work examples you want to prepare."
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>3. Resume and job posting inputs</legend>
            <label>
              Resume upload <span>Optional</span>
              <input accept=".pdf,.doc,.docx,.txt" name="resumeFile" type="file" />
            </label>
            <label>
              Job description upload <span>Optional</span>
              <input accept=".pdf,.doc,.docx,.txt" name="jobDescriptionFile" type="file" />
            </label>
            <label>
              Pasted job description <span>Optional</span>
              <textarea
                name="jobPostingText"
                placeholder="Paste the public job posting, role requirements, or link."
              />
            </label>
          </fieldset>

          <label className="checkbox-label">
            <input name="privacyAccepted" type="checkbox" required />
            <span>I will only share resumes, public job postings, and career notes I have permission to use. I will not upload confidential employer files, SSNs, passwords, bank details, or sensitive personal documents.</span>
          </label>
          <button className="button primary" type="submit">Submit intake</button>
          <p className="fine-print">
            Your materials are used to prepare your brief. We do not sell your information, and you can request deletion by contacting support.
          </p>
        </form>
      </section>
    </main>
  );
}

function getErrorMessage(error?: string) {
  if (error === 'privacy') {
    return 'Please confirm the privacy warning before submitting.';
  }

  if (error === 'validation') {
    return 'Please complete the required fields with valid information.';
  }

  if (error === 'file') {
    return 'Please upload only PDF, DOC, DOCX, or TXT files under 8 MB.';
  }

  if (error === 'token') {
    return 'This secure intake link could not be verified. Please use the latest link from your order email or contact support.';
  }

  return null;
}
