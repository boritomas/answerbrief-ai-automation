type NextStepsEmail = {
  to: string;
  packageName: string;
  intakeUrl: string;
};

export async function sendNextStepsEmail({ to, packageName, intakeUrl }: NextStepsEmail) {
  // MVP placeholder.
  // Replace with Resend, SendGrid, Gmail API, or another email provider.
  console.log(`Send next-steps email to ${to} for ${packageName}`);
  console.log(`Intake form: ${intakeUrl}`);

  return {
    success: true,
  };
}
