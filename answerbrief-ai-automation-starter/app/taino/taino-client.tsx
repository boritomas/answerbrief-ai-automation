'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './taino.module.css';

type PresenceState = 'offline' | 'connecting' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
type TranscriptItem = { id: string; role: 'Tomas' | 'TAINO'; text: string };

const priorities = [
  ['Career OS', 'Production validation ready'],
  ['AnswerBrief AI', 'TAINO interface in progress'],
  ['Atlas Capital', 'Awaiting next review'],
];

export default function TainoClient() {
  const [presence, setPresence] = useState<PresenceState>('offline');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([
    { id: 'welcome', role: 'TAINO', text: 'System ready. Start TAINO, then say “Hey TAINO.”' },
  ]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const assistantDraftRef = useRef('');

  const statusLabel = useMemo(() => {
    const labels: Record<PresenceState, string> = {
      offline: 'Offline', connecting: 'Connecting', idle: 'Standing by', listening: 'Listening',
      thinking: 'Thinking', speaking: 'Speaking', error: 'Attention required',
    };
    return labels[presence];
  }, [presence]);

  useEffect(() => () => stopSession(), []);

  function addTranscript(role: TranscriptItem['role'], text: string) {
    const clean = text.trim();
    if (!clean) return;
    setTranscript((items) => [...items, { id: `${Date.now()}-${Math.random()}`, role, text: clean }].slice(-12));
  }

  function handleRealtimeEvent(event: MessageEvent<string>) {
    try {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'input_audio_buffer.speech_started':
          setPresence('listening');
          break;
        case 'input_audio_buffer.speech_stopped':
          setPresence('thinking');
          break;
        case 'conversation.item.input_audio_transcription.completed':
          addTranscript('Tomas', message.transcript || '');
          break;
        case 'response.created':
          assistantDraftRef.current = '';
          setPresence('thinking');
          break;
        case 'response.output_audio_transcript.delta':
        case 'response.audio_transcript.delta':
          assistantDraftRef.current += message.delta || '';
          setPresence('speaking');
          break;
        case 'response.output_audio_transcript.done':
        case 'response.audio_transcript.done':
          addTranscript('TAINO', message.transcript || assistantDraftRef.current);
          assistantDraftRef.current = '';
          break;
        case 'response.done':
          if (assistantDraftRef.current) addTranscript('TAINO', assistantDraftRef.current);
          assistantDraftRef.current = '';
          setPresence('idle');
          break;
        case 'error':
          setError(message.error?.message || 'Realtime session error.');
          setPresence('error');
          break;
      }
    } catch {
      setError('TAINO received an unreadable realtime event.');
      setPresence('error');
    }
  }

  async function startSession() {
    if (presence !== 'offline' && presence !== 'error') return;
    setError('');
    setPresence('connecting');

    try {
      const pc = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel('oai-events');
      dc.onmessage = handleRealtimeEvent;
      dc.onopen = () => setPresence('idle');
      dc.onclose = () => setPresence('offline');

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch('/api/taino/realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || 'Unable to start TAINO.');
      }

      const answer = { type: 'answer' as RTCSdpType, sdp: await response.text() };
      await pc.setRemoteDescription(answer);

      pcRef.current = pc;
      dcRef.current = dc;
      streamRef.current = stream;
      audioRef.current = audio;
    } catch (cause) {
      stopSession();
      setError(cause instanceof Error ? cause.message : 'Unable to start TAINO.');
      setPresence('error');
    }
  }

  function stopSession() {
    dcRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    audioRef.current = null;
    setPresence('offline');
  }

  return (
    <main className={styles.shell} data-state={presence}>
      <div className={styles.matrix} aria-hidden="true" />
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Executive intelligence environment</p>
          <h1>TAINO <span>OS</span></h1>
        </div>
        <div className={styles.status}><i /> {statusLabel}</div>
      </header>

      <section className={styles.grid}>
        <aside className={styles.panel}>
          <h2>Mission Control</h2>
          {priorities.map(([name, detail]) => (
            <div className={styles.priority} key={name}>
              <strong>{name}</strong><span>{detail}</span>
            </div>
          ))}
          <div className={styles.metric}><span>Cloud runtime</span><strong>Online</strong></div>
          <div className={styles.metric}><span>Voice layer</span><strong>{presence === 'offline' ? 'Standby' : 'Active'}</strong></div>
        </aside>

        <section className={styles.guardianStage}>
          <div className={styles.orbit} />
          <div className={styles.avatarWrap}>
            <img src="/taino-guardian.svg" alt="TAINO holographic guardian" className={styles.avatar} />
            <div className={styles.voiceBars} aria-hidden="true">
              {Array.from({ length: 11 }).map((_, index) => <span key={index} />)}
            </div>
          </div>
          <p className={styles.prompt}>
            {presence === 'offline' ? 'Start the session, then say “Hey TAINO.”' : `TAINO is ${statusLabel.toLowerCase()}.`}
          </p>
          <div className={styles.controls}>
            <button onClick={startSession} disabled={!['offline', 'error'].includes(presence)}>
              {presence === 'connecting' ? 'Connecting…' : 'Start TAINO'}
            </button>
            <button className={styles.secondary} onClick={stopSession} disabled={presence === 'offline'}>Stand by</button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </section>

        <aside className={`${styles.panel} ${styles.transcriptPanel}`}>
          <h2>Live Conversation</h2>
          <div className={styles.transcript} aria-live="polite">
            {transcript.map((item) => (
              <article key={item.id} className={item.role === 'TAINO' ? styles.tainoLine : styles.userLine}>
                <strong>{item.role}</strong><p>{item.text}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <footer className={styles.footer}>
        <span>Wake phrase: “TAINO” or “Hey TAINO”</span>
        <span>Realtime voice · interruption enabled · cloud validated</span>
      </footer>
    </main>
  );
}
