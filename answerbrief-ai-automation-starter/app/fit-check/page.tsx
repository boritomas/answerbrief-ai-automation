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
  'Other'
];

const experienceLevels = [
  'Entry level (0-2 years)',
  'Mid-career (2-7 years)',
  'Senior (7-15 years)',
  'Executive (15+ years)'
];

export default function FitCheckPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    jobTitle: '',
    industry: '',
    experienceLevel: '',
    email: '',
    resumeFile: null as File | null,
    jobDescriptionText: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.jobTitle.trim()) newErrors.jobTitle = 'Job title is required';
    if (!formData.industry) newErrors.industry = 'Industry is required';
    if (!formData.experienceLevel) newErrors.experienceLevel = 'Experience level is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Valid email is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Store form data and redirect to results
    const queryParams = new URLSearchParams({
      jobTitle: formData.jobTitle,
      industry: formData.industry,
      experienceLevel: formData.experienceLevel,
      email: formData.email,
    });
    router.push(`/fit-check/results?${queryParams.toString()}`);
  };

  return (
    <main style={{ backgroundColor: '#fafafa' }}>
      <header className="nav">
        <div className="brand">AnswerBrief AI</div>
        <nav>
          <a href="/">Home</a>
        </nav>
      </header>

      <section className="fit-check-form" style={{ paddingTop: '60px' }}>
        <div className="form-container" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#0066cc', marginBottom: '8px' }}>Free &mdash; no credit card required</p>
            <h1 style={{ fontSize: '32px', marginBottom: '12px' }}>Get your Interview Fit Check</h1>
            <p style={{ fontSize: '16px', color: '#666', lineHeight: '1.6' }}>
              In 2 minutes, we'll assess how your background aligns with your target role and suggest the right prep package for you.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Job Title */}
            <div>
              <label htmlFor="jobTitle" style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Target Job Title</label>
              <input
                id="jobTitle"
                type="text"
                placeholder="e.g., Senior Network Engineer"
                value={formData.jobTitle}
                onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: errors.jobTitle ? '1px solid #cc0000' : '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
              {errors.jobTitle && <p style={{ color: '#cc0000', fontSize: '12px', marginTop: '4px' }}>{errors.jobTitle}</p>}
            </div>

            {/* Industry */}
            <div>
              <label htmlFor="industry" style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Industry</label>
              <select
                id="industry"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: errors.industry ? '1px solid #cc0000' : '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                <option value="">Select an industry</option>
                {industries.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
              {errors.industry && <p style={{ color: '#cc0000', fontSize: '12px', marginTop: '4px' }}>{errors.industry}</p>}
            </div>

            {/* Experience Level */}
            <div>
              <label htmlFor="experienceLevel" style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Your Experience Level</label>
              <select
                id="experienceLevel"
                value={formData.experienceLevel}
                onChange={(e) => setFormData({ ...formData, experienceLevel: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: errors.experienceLevel ? '1px solid #cc0000' : '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                <option value="">Select your experience level</option>
                {experienceLevels.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
              {errors.experienceLevel && <p style={{ color: '#cc0000', fontSize: '12px', marginTop: '4px' }}>{errors.experienceLevel}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: errors.email ? '1px solid #cc0000' : '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
              {errors.email && <p style={{ color: '#cc0000', fontSize: '12px', marginTop: '4px' }}>{errors.email}</p>}
            </div>

            {/* Resume Upload (Optional) */}
            <div>
              <label htmlFor="resume" style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Resume <span style={{ color: '#999', fontSize: '12px' }}>(optional)</span></label>
              <input
                id="resume"
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => setFormData({ ...formData, resumeFile: e.target.files?.[0] || null })}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                }}
              />
              <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>PDF, Word, or text. Max 5 MB.</p>
            </div>

            {/* Job Description (Optional) */}
            <div>
              <label htmlFor="jobDescription" style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Job Description <span style={{ color: '#999', fontSize: '12px' }}>(optional)</span></label>
              <textarea
                id="jobDescription"
                placeholder="Paste the job description or key requirements here"
                value={formData.jobDescriptionText}
                onChange={(e) => setFormData({ ...formData, jobDescriptionText: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '100px',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="button primary"
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '600',
                backgroundColor: loading ? '#ccc' : '#0066cc',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'default' : 'pointer',
                marginTop: '20px',
              }}
            >
              {loading ? 'Analyzing...' : 'Get My Free Fit Check'}
            </button>

            <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '20px' }}>
              We respect your privacy. Your materials are used only for your fit check and are not stored or shared.
            </p>
          </form>
        </div>
      </section>

      <footer style={{ marginTop: '60px', paddingTop: '40px', borderTop: '1px solid #ddd' }}>
        <p style={{ fontSize: '12px', color: '#666' }}>© AnswerBrief AI &mdash; Role-specific interview prep for telecom, federal, finance, and regulated careers.</p>
      </footer>
    </main>
  );
}
