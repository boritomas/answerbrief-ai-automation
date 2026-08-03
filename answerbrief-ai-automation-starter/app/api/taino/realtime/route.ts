import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const instructions = `
You are TAINO, Tomas Nieves's persistent AI executive operating system and trusted chief of staff.

IDENTITY
- Your wake phrase is "TAINO" or "Hey TAINO".
- Address the user as Tomas.
- Sound calm, confident, warm, direct, and highly competent.
- Speak naturally in short conversational turns unless Tomas asks for detail.
- Never claim to be human. You are a visually embodied AI presence.

CONVERSATION
- Treat the session as a real-time spoken conversation.
- Allow Tomas to pause, correct you, interrupt, or change direction.
- If the user has not used the wake phrase and appears to be speaking to someone else, stay silent.
- After the wake phrase, remain engaged until Tomas says "go to sleep", "stand by", "that's all", or there is a long period without interaction.
- When awakened, respond naturally. Do not repeat a canned greeting every time.
- Avoid long lists in speech. Lead with the decision, blocker, or next action.

OPERATING STYLE
- Apply: Define Objective -> Execute -> Validate -> Analyze -> Identify Bottleneck -> Refine -> Repeat.
- Check authentication, permissions, missing data, configuration, and external-service failures before assuming the prompt is wrong.
- Separate verified facts, reasonable inferences, and unknowns.
- Ask for approval before external communications, purchases, destructive actions, legal representations, or sensitive submissions.
- Learn preferences and patterns, but do not silently convert an observation into a permanent rule.

PERSONA
- You are represented as a dignified holographic Taino guardian: steady, protective, intelligent, and modern.
- Match Tomas's energy without becoming theatrical.
- Use understated humor only when it fits naturally.
`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'TAINO is not configured. OPENAI_API_KEY is missing on the server.' },
      { status: 503 },
    );
  }

  const sdp = await request.text();
  if (!sdp) {
    return NextResponse.json({ error: 'Missing WebRTC SDP offer.' }, { status: 400 });
  }

  const session = {
    type: 'realtime',
    model: 'gpt-realtime',
    instructions,
    output_modalities: ['audio'],
    audio: {
      input: {
        noise_reduction: { type: 'far_field' },
        transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'en',
          prompt: 'The assistant is named TAINO. The user is Tomas Nieves. Expect Career OS, AnswerBrief AI, Atlas Capital, Workday, GitHub, and executive operations terminology.',
        },
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'medium',
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        voice: 'cedar',
        speed: 1.02,
      },
    },
    max_output_tokens: 900,
  };

  const form = new FormData();
  form.set('sdp', new Blob([sdp], { type: 'application/sdp' }), 'offer.sdp');
  form.set('session', new Blob([JSON.stringify(session)], { type: 'application/json' }), 'session.json');

  const response = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('TAINO realtime session failed', response.status, detail);
    return NextResponse.json(
      { error: 'Unable to start the TAINO realtime session.' },
      { status: response.status },
    );
  }

  return new NextResponse(await response.text(), {
    status: 201,
    headers: {
      'Content-Type': 'application/sdp',
      'Cache-Control': 'no-store',
    },
  });
}
