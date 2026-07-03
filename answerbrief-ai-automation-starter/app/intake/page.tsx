import { submitIntake } from './actions';

type IntakePageProps = {
  searchParams: {
    email?: string;
    error?: string;
    orderId?: string;
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
          Share the role, timeline, and prep context needed to build your AnswerBrief AI package.
        </p>
      </section>

      <section>
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
        <form action={submitIntake} className="intake-form">
          <input type="hidden" name="orderId" value={searchParams.orderId || ''} />
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" defaultValue={searchParams.email || ''} required />
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
            Resume file
            <input name="resumeFile" type="file" accept=".pdf,.doc,.docx,.txt" />
          </label>
          <label>
            Job posting file
            <input name="jobPostingFile" type="file" accept=".pdf,.doc,.docx,.txt" />
          </label>
          <label>
            Interview notes file
            <input name="notesFile" type="file" accept=".pdf,.doc,.docx,.txt" />
          </label>
          <p className="fine-print">Uploads are optional. PDF, Word, or text files work best. Maximum 10 MB per file.</p>
          <label>
            Notes
            <textarea
              name="notes"
              placeholder="Paste the public job posting link, interview format, concerns, and any non-confidential examples you want to prepare."
            />
          </label>
          <label className="checkbox-label">
            <input name="privacyAccepted" type="checkbox" required />
            <span>I will only share resumes, public job postings, and career notes I have permission to use.</span>
          </label>
          <button className="button primary" type="submit">Submit intake</button>
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

  return null;
}
