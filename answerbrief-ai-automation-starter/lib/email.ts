type NextStepsEmail = {
  to: string;
  packageName: string;
};

export async function sendNextStepsEmail({ to, packageName }: NextStepsEmail) {
  // MVP placeholder.
  // Replace with Resend, SendGrid, Gmail API, or another email provider.
  console.log(`Send next-steps email to ${to} for ${packageName}`);

  return {
    success: true,
  };
}
