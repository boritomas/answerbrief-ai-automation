'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const industries = [
  'Technology',
  'Finance & Banking',
  'Telecom',
  'Healthcare',
  'Government & Federal',
  'Energy & Utilities',
  'Consulting',
  'Operations',
  'Other',
];

const experienceLevels = [
  'Entry level (0-2 years)',
  'Mid-career (2-7 years)',
  'Senior (7-15 years)',
  'Executive (15+ years)',
];

export default function FitCheckPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company: '',
    email: '',
    experienceLevel: '',
    industry: '',
    jobDescriptionText: '',
    jobTitle: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.jobTitle.trim()) newErrors.jobTitle = 'Target job title is required';
    if (!formData.industry) newErrors.industry = 'Industry is required';
    if (!formData.experienceLevel) newErrors.experienceLevel = 'Experience level is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Valid email is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    const queryParams = new URLSearchParams({
      jobTitle: formData.jobTitle,
      industry: formData.industry,
      experienceLevel: formData.experienceLevel,
      email: formData.email,
    });

    if (formData.company) {
      queryParams.set('company', formData.company);
    }

    router.push(`/fit-check/results?${queryParams.toString()}`);
  };

  return (
    <main>
      <header className="nav">
        <a className="brand" href="/">AnswerBrief AI</a>
        <nav>
          <a href="/">Home</a>
          <a href="/sample-brief">Sample Brief</a>
        </nav>
      </header>

      <section className="hero compact">
        <p className="eyebrow">Free Interview Fit Check</p>
        <h1>See where your interview prep should focus first.</h1>
        <p className="subhead">
          In a few minutes, get a realistic preview of your readiness, likely strengths, potential gaps, and recommended next step. This is mock-based guidance, not a full resume parser.
        </p>
      </section>

      <section className="guided-form-section">
        <form onSubmit={handleSubmit} className="guided-form">
          <fieldset>
            <legend>1. Role details</legend>
            <label htmlFor="jobTitle">
              Target job title
              <input
                id="jobTitle"
                type="text"
                placeholder="Senior Network Engineer"
                value={formData.jobTitle}
                onChange={(event) => setFormData({ ...formData, jobTitle: event.target.value })}
                aria-invalid={Boolean(errors.jobTitle)}
              />
              {errors.jobTitle ? <span className="field-error">{errors.jobTitle}</span> : null}
            </label>
            <label htmlFor="company">
              Company <span>Optional</span>
              <input
                id="company"
                type="text"
                placeholder="Company name if known"
                value={formData.company}
                onChange={(event) => setFormData({ ...formData, company: event.target.value })}
              />
            </label>
            <label htmlFor="industry">
              Industry
              <select
                id="industry"
                value={formData.industry}
                onChange={(event) => setFormData({ ...formData, industry: event.target.value })}
                aria-invalid={Boolean(errors.industry)}
              >
                <option value="">Select an industry</option>
                {industries.map((industry) => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
              {errors.industry ? <span className="field-error">{errors.industry}</span> : null}
            </label>
          </fieldset>

          <fieldset>
            <legend>2. Candidate background</legend>
            <label htmlFor="experienceLevel">
              Experience level
              <select
                id="experienceLevel"
                value={formData.experienceLevel}
                onChange={(event) => setFormData({ ...formData, experienceLevel: event.target.value })}
                aria-invalid={Boolean(errors.experienceLevel)}
              >
                <option value="">Select your experience level</option>
                {experienceLevels.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
              {errors.experienceLevel ? <span className="field-error">{errors.experienceLevel}</span> : null}
            </label>
            <label htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email ? <span className="field-error">{errors.email}</span> : null}
            </label>
          </fieldset>

          <fieldset>
            <legend>3. Resume and job posting inputs</legend>
            <label htmlFor="resume">
              Resume upload <span>Optional</span>
              <input id="resume" type="file" accept=".pdf,.doc,.docx,.txt" />
            </label>
            <label htmlFor="jobDescriptionFile">
              Job description upload <span>Optional</span>
              <input id="jobDescriptionFile" type="file" accept=".pdf,.doc,.docx,.txt" />
            </label>
            <label htmlFor="jobDescription">
              Pasted job description <span>Optional</span>
              <textarea
                id="jobDescription"
                placeholder="Paste the public job posting, role requirements, or link."
                value={formData.jobDescriptionText}
                onChange={(event) => setFormData({ ...formData, jobDescriptionText: event.target.value })}
              />
            </label>
          </fieldset>

          <div className="privacy-callout">
            <strong>Privacy note</strong>
            <p>Use only resumes, public job postings, and career notes you have permission to share. Do not upload confidential employer files, client data, SSNs, passwords, bank details, or sensitive personal documents.</p>
          </div>

          <button type="submit" disabled={loading} className="button primary">
            {loading ? 'Preparing results...' : 'Get My Free Fit Check'}
          </button>
        </form>
      </section>
    </main>
  );
}
