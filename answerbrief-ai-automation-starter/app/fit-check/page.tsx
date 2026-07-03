import { submitIntake } from '../intake/actions';

type FitCheckPageProps = {
  searchParams: {
    error?: string;
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

export default function FitCheckPage({ searchParams }: FitCheckPageProps) {
  const errorMessage = getErrorMessage(searchParams.error);

  return (
    <main>
      <section className="hero compact">
        <p className="eyebrow">Free Interview Fit Check</p>
        <h1>See where your interview prep should focus.</h1>
        <p className="subhead">
          Send your resume details and target role. We&apos;ll send back a short review with 3 likely interview focus areas, 2 questions to prepare for, and 1 weak spot to tighten.
        </p>
      </section>

      <section className="fit-check-page">
        <div className="fit-check-panel">
          <h2>What to send</h2>
          <ul>
            <li>Your resume or a resume summary</li>
            <li>The target role or job posting link</li>
            <li>Any interview notes you already have</li>
          </ul>
          <p className="fine-print">
            Do not upload SSNs, passwords, bank data, sensitive personal documents, or confidential employer files unless you are allowed to use them.
          </p>
        </div>

        <div>
          {errorMessage ? <p className="error">{errorMessage}</p> : null}
          <form action={submitIntake} className="intake-form">
            <input type="hidden" name="packageName" value="Free Interview Fit Check" />
            <input type="hidden" name="errorPath" value="/fit-check" />
            <input type="hidden" name="successPath" value="/intake/thanks" />
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Target role
              <input name="targetRole" required />
            </label>
            <label>
              Target company
              <input name="targetCompany" />
            </label>
            <label>
              Interview date
              <input name="interviewDate" type="date" />
            </label>
            <label>
              Career lane
              <select name="careerLane" defaultValue="telecom" required>
                {careerLanes.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea
                name="notes"
                placeholder="Paste the public job posting link, interview format, and any non-confidential context that would help the fit check."
              />
            </label>
            <label className="checkbox-label">
              <input name="privacyAccepted" type="checkbox" required />
              <span>I will only share resumes, public job postings, and career notes I have permission to use.</span>
            </label>
            <button className="button primary" type="submit">Submit Free Fit Check</button>
          </form>
        </div>
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

  return null;
}
