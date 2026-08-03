'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './taino.module.css';

type PresenceState = 'offline' | 'connecting' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
type TranscriptItem = { id: string; role: 'Tomas' | 'TAINO'; text: string };

const navItems = ['Dashboard','Executive Brief','Calendar','Email','Career OS','Applications','Interview Prep','Resume Builder','AnswerBrief AI','Atlas Capital','Family Hub','GitHub','Files & Drive','Automations','Reports','Settings'];
const priorities = [
  ['Career OS Production','Resolve Workday authentication','High'],
  ['AnswerBrief AI','Dashboard analytics improvements','High'],
  ['Atlas Capital','Review lender package','Medium'],
  ['Family','Orientation tomorrow 8:00 AM','Low'],
];
const systems = ['Career OS','AnswerBrief AI','Atlas Capital','GitHub','Automations'];

export default function TainoClient() {
  const [presence, setPresence] = useState<PresenceState>('offline');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([
    { id: 'welcome', role: 'TAINO', text: 'Good morning, Tomas. I’m ready. Tell me what we’re focusing on first, or say “continue” and I’ll take it from here.' },
  ]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const assistantDraftRef = useRef('');

  const [now, setNow] = useState<Date | null>(null);
  const statusLabel = useMemo(() => ({offline:'Standby',connecting:'Connecting',idle:'Online',listening:'Listening',thinking:'Thinking',speaking:'Speaking',error:'Attention required'}[presence]), [presence]);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => stopSession(), []);

  function addTranscript(role: TranscriptItem['role'], text: string) {
    const clean = text.trim();
    if (!clean) return;
    setTranscript((items) => [...items, { id: `${Date.now()}-${Math.random()}`, role, text: clean }].slice(-10));
  }

  function handleRealtimeEvent(event: MessageEvent<string>) {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'input_audio_buffer.speech_started') setPresence('listening');
      if (message.type === 'input_audio_buffer.speech_stopped' || message.type === 'response.created') setPresence('thinking');
      if (message.type === 'conversation.item.input_audio_transcription.completed') addTranscript('Tomas', message.transcript || '');
      if (['response.output_audio_transcript.delta','response.audio_transcript.delta'].includes(message.type)) {
        assistantDraftRef.current += message.delta || '';
        setPresence('speaking');
      }
      if (['response.output_audio_transcript.done','response.audio_transcript.done'].includes(message.type)) {
        addTranscript('TAINO', message.transcript || assistantDraftRef.current);
        assistantDraftRef.current = '';
      }
      if (message.type === 'response.done') {
        if (assistantDraftRef.current) addTranscript('TAINO', assistantDraftRef.current);
        assistantDraftRef.current = '';
        setPresence('idle');
      }
      if (message.type === 'error') throw new Error(message.error?.message || 'Realtime session error.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'TAINO received an unreadable realtime event.');
      setPresence('error');
    }
  }

  async function startSession() {
    if (!['offline','error'].includes(presence)) return;
    setError(''); setPresence('connecting');
    try {
      const pc = new RTCPeerConnection();
      const audio = new Audio(); audio.autoplay = true;
      pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const dc = pc.createDataChannel('oai-events');
      dc.onmessage = handleRealtimeEvent;
      dc.onopen = () => setPresence('idle');
      dc.onclose = () => setPresence('offline');
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const response = await fetch('/api/taino/realtime', { method:'POST', headers:{'Content-Type':'application/sdp'}, body:offer.sdp });
      if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error || 'Unable to start TAINO.'); }
      await pc.setRemoteDescription({ type:'answer', sdp:await response.text() });
      pcRef.current = pc; dcRef.current = dc; streamRef.current = stream; audioRef.current = audio;
    } catch (cause) {
      stopSession(); setError(cause instanceof Error ? cause.message : 'Unable to start TAINO.'); setPresence('error');
    }
  }

  function stopSession() {
    dcRef.current?.close(); pcRef.current?.close(); streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    dcRef.current = null; pcRef.current = null; streamRef.current = null; audioRef.current = null; setPresence('offline');
  }

  return (
    <main className={styles.shell} data-state={presence}>
      <div className={styles.matrix} aria-hidden="true" />
      <aside className={styles.sidebar}>
        <div className={styles.brand}><div className={styles.brandMark}>T</div><div><h1>TAINO OS</h1><p>Your AI Chief of Staff</p></div><span className={styles.onlineDot}>ONLINE</span></div>
        <nav>{navItems.map((item, i) => <button key={item} className={i===0 ? styles.activeNav : ''}><span>{String(i+1).padStart(2,'0')}</span>{item}{item==='Email' && <b>18</b>}{item==='Applications' && <b>12</b>}</button>)}</nav>
        <div className={styles.systemCard}><small>TAINO STATUS</small><strong>● All Systems Operational</strong></div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}><div><h2>TAINO</h2><p>CHIEF OF STAFF | ADVISOR | EXECUTOR</p></div><div className={styles.clock}><span>{now ? now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : '\u00a0'}</span><strong>{now ? now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '\u00a0'}</strong></div></header>
        <div className={styles.mainGrid}>
          <section className={styles.briefCard}>
            <h3>Good morning,<br/><em>Tomas.</em></h3>
            <p>I’ve reviewed everything while you were away.</p>
            <ul><li>18 new Director positions found</li><li>2 application confirmations</li><li>Career OS completed overnight run</li><li>Atlas Capital package ready</li><li>3 emails need your attention</li></ul>
            <div className={styles.topPriority}><small>Today’s Top Priority:</small><strong>Workday authentication expired.</strong><p>Reconnect Workday before starting production.</p></div>
            <button className={styles.outlineButton}>VIEW FULL BRIEF →</button>
          </section>

          <section className={styles.guardianStage}>
            <div className={styles.codeRain} />
            <img src="/taino-guardian.svg" alt="TAINO holographic guardian" className={styles.avatar} />
            <div className={styles.holoBase} />
            <div className={styles.conversation}>
              <article><small>YOU</small><p>Good morning TAINO.</p></article>
              {transcript.slice(-2).map((item) => <article key={item.id} className={item.role==='TAINO'?styles.tainoLine:''}><small>{item.role.toUpperCase()}</small><p>{item.text}</p></article>)}
              <div className={styles.waveform}>{Array.from({length:34}).map((_,i)=><span key={i}/>)}</div>
              <button className={styles.micButton} onClick={startSession} disabled={!['offline','error'].includes(presence)}>●</button>
              <p className={styles.micHint}>{presence==='offline'?'Click to speak or press ⌘K':statusLabel}</p>
              {presence!=='offline' && <button className={styles.stopButton} onClick={stopSession}>Stand by</button>}
              {error && <p className={styles.error}>{error}</p>}
            </div>
          </section>

          <aside className={styles.rightRail}>
            <div className={styles.voiceCard}><div className={styles.listenRing}/><div><strong>{statusLabel}...</strong><div className={styles.miniWave}>{Array.from({length:18}).map((_,i)=><span key={i}/>)}</div></div></div>
            <div className={styles.panel}><h4>TODAY’S PRIORITIES</h4>{priorities.map(([a,b,c],i)=><div className={styles.priorityRow} key={a}><span>{i+1}</span><div><strong>{a}</strong><small>{b}</small></div><em>{c}</em></div>)}</div>
            <div className={styles.panel}><h4>UPCOMING CALENDAR</h4><div className={styles.calendarRow}><span>10:00 AM</span><div><strong>Benefits Call</strong><small>Google Meet</small></div></div><div className={styles.calendarRow}><span>2:30 PM</span><div><strong>Networking Call</strong><small>Director Opportunity</small></div></div><div className={styles.calendarRow}><span>4:00 PM</span><div><strong>Atlas Capital Review</strong><small>Internal Review</small></div></div></div>
            <div className={styles.panel}><h4>SYSTEM HEALTH</h4>{systems.map((s)=><div className={styles.healthRow} key={s}><span>{s}</span><strong>Operational ●</strong></div>)}</div>
          </aside>
        </div>
      </section>
    </main>
  );
}
