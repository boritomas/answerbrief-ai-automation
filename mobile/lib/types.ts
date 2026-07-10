export type ApiResponse<T> = T & {
  error?: string;
  ok: boolean;
};

export type User = {
  email: string;
  role: 'customer' | 'admin';
};

export type OrderSummary = {
  briefStatus: string;
  createdAt: string;
  deliveryDate?: string;
  deliveryStatus: string;
  id: string;
  intakeStatus: string;
  packageName: string;
  paymentStatus: string;
  status: string;
  updatedAt: string;
};

export type OrderDetail = OrderSummary & {
  generatedBriefUrl?: string;
  intakeSubmittedAt?: string;
};

export type OrderEvent = {
  at: string;
  event: string;
  id: string;
  message?: string;
  severity: 'info' | 'warning' | 'error';
};

export type FitCheckResult = {
  alignment: string;
  gaps: string[];
  recommendedPackage: string;
  recommendedPackageName: string;
  score: number;
  strengths: string[];
  purchaseAvailableInMobile: false;
};

export type IntakeInput = {
  careerLane: 'telecom' | 'federal' | 'finance' | 'audit' | 'compliance' | 'operations' | 'product' | 'leadership' | 'other';
  interviewDate?: string;
  jobPostingText?: string;
  name: string;
  notes?: string;
  targetCompany?: string;
  targetRole: string;
};

export type BriefResponse = {
  brief: {
    generatedBriefMode?: string;
    generatedBriefUrl?: string;
    status: string;
  };
};

