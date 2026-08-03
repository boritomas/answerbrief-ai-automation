'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './taino.module.css';

type TranscriptLine = { id: string; role: 'you' | 'taino'; text: string };
type VoiceState = 'standby' | 'connecting' | 'listening' | 'speaking' | 'muted';
type NavItem = { label: string; href: string; icon: string; external?: boolean };

const navigation: Array<{ group: string; items: NavItem[] }> = [
  { group: 'COMMAND', items: [
    { label: 'Dashboard', href: '/taino', icon: '⌂' },
    { label: 'Executive Brief', href: '#brief', icon: '◈' },
    { label: 'Calendar', href: 'https://calendar.google.com', icon: '□', external: true },
    { label: 'Email', href: 'https://mail.google.com', icon: '✉', external: true },
  ] },
  { group: 'OPERATIONS', items: [
    { label: 'Career OS', href: '/career-os', icon: '◎' },
    { label: 'Applications', href: '/career-os#applications', icon: '▤' },
    { label: 'Interview Prep', href: '/intake', icon: '◇' },
    { label: 'Resume Builder', href: '/career-os', icon: '▧' },
    { label: 'AnswerBrief AI', href: '/', icon: 'A' },
    { label: 'Atlas Capital', href: '#atlas', icon: '△' },
    { label: 'Family Hub', href: '#family', icon: '⌘' },
  ] },
  { group: 'SYSTEMS', items: [
    { label: 'GitHub', href: 'https://github.com/boritomas/answerbrief-ai-automation', icon: '◉', external: true },
    { label: 'Google Drive', href: 'https://drive.google.com', icon: '▱', external: true },
    { label: 'Automations', href: '#automations', icon: '↻' },
    { label: 'Reports', href: '/founder-dashboard', icon: '⌁' },
    { label: 'Settings', href: '#settings', icon: '⚙' },
  ] },
];

const initialTranscript: TranscriptLine[] = [
  { id: 'welcome', role: 'taino', text: 'Good morning, Tomas. Your executive briefing is ready. What would you like to focus on?' },
];

export default function TainoDashboard() {
  const [time, setTime] = useState<Date | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('standby');
  const [error, setError] = useState('');
  const [lines, setLines] = useState<TranscriptLine[]>(initialTranscript);
  const peer = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setTime(new Date());
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    const saved = window.localStorage.getItem('taino-conversation-history');
    if (saved) {
      try { setLines(JSON.parse(saved)); } catch { window.localStorage.removeItem('taino-conversation-history'); }
    }
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('taino-conversation-history', JSON.stringify(lines.slice(-30)));
  }, [lines]);

  useEffect(() => () => teardown(), []);

  function teardown() {
    peer.current?.close();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (audio.current) audio.current.srcObject = null;
    peer.current = null;
    stream.current = null;
    channel.current = null;
    setVoiceState('standby');
  }

  function appendLine(role: TranscriptLine['role'], text: string) {
    const clean = text.trim();
    if (!clean) return;
    setLines((current) => [...current, { id: `${Date.now()}-${role}`, role, text: clean }].slice(-30));
  }

  async function connect() {
    if (voiceState !== 'standby') { teardown(); return; }
    setVoiceState('connecting');
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support secure microphone access.');
      const tokenResponse = await fetch('/api/taino/realtime', { method: 'POST' });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(token.error || 'Voice service unavailable.');
      const ephemeralKey = token.value || token.client_secret?.value;
      if (!ephemeralKey) throw new Error('Voice session could not be created.');

      const pc = new RTCPeerConnection();
      peer.current = pc;
      const output = new Audio();
      output.autoplay = true;
      audio.current = output;
      pc.ontrack = (event) => { output.srcObject = event.streams[0]; };
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) teardown();
      };

      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.current = microphone;
      microphone.getTracks().forEach((track) => pc.addTrack(track, microphone));

      const events = pc.createDataChannel('oai-events');
      channel.current = events;
      events.onopen = () => setVoiceState('listening');
      events.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(data);
          if (event.type === 'input_audio_buffer.speech_started') setVoiceState('listening');
          if (event.type === 'response.audio.delta') setVoiceState('speaking');
          if (event.type === 'response.done') setVoiceState('listening');
          if (event.type === 'conversation.item.input_audio_transcription.completed') appendLine('you', event.transcript || '');
          if (event.type === 'response.audio_transcript.done') appendLine('taino', event.transcript || '');
          if (event.type === 'error') setError(event.error?.message || 'The realtime session reported an error.');
        } catch {
          // Ignore non-JSON transport frames.
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!answer.ok) throw new Error('Realtime connection failed.');
      await pc.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
    } catch (reason) {
      teardown();
      setError(reason instanceof Error ? reason.message : 'Unable to start voice.');
    }
  }

  function toggleMute() {
    const muted = voiceState === 'muted';
    stream.current?.getAudioTracks().forEach((track) => { track.enabled = muted; });
    setVoiceState(muted ? 'listening' : 'muted');
  }

  function interrupt() {
    if (channel.current?.readyState !== 'open') return;
    channel.current.send(JSON.stringify({ type: 'response.cancel' }));
    channel.current.send(JSON.stringify({ type: 'output_audio_buffer.clear' }));
    setVoiceState('listening');
  }

  const isLive = !['standby', 'connecting'].includes(voiceState);
  const dayPart = time && time.getHours() < 12 ? 'morning' : time && time.getHours() < 18 ? 'afternoon' : 'evening';

  return (
    <main className={styles.shell}>
      <div className={styles.ambient} aria-hidden />
      <div className={styles.rain} aria-hidden>
        {Array.from({ length: 22 }, (_, i) => <i key={i}>10110{String(i).padStart(2, '0')}<br/>01101001<br/>TAÍNO<br/>01011010<br/>ᚹ ᛟ ᚱ<br/>101001</i>)}
      </div>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><div className={styles.mark}>T</div><div><b>TAINO</b><small>EXECUTIVE OS</small></div></div>
        <div className={styles.onlineBadge}><i /> ALL SYSTEMS ONLINE</div>
        <nav>{navigation.map((section) => <div className={styles.navGroup} key={section.group}><span>{section.group}</span>{section.items.map((item) => <Link className={item.label === 'Dashboard' ? styles.selected : ''} href={item.href} target={item.external ? '_blank' : undefined} rel={item.external ? 'noreferrer' : undefined} key={item.label}><i>{item.icon}</i>{item.label}</Link>)}</div>)}</nav>
        <div className={styles.profile}><div className={styles.avatar}>TN</div><div><b>Tomas Nieves</b><small>Executive Command</small></div><span>•••</span></div>
      </aside>
      <section className={styles.workspace}>
        <header id="brief"><div><span className={styles.eyebrow}>{time?.toLocaleDateString([], { weekday: 'long' }).toUpperCase() || 'TODAY'} · EXECUTIVE BRIEFING</span><h1>Good {dayPart || 'day'}, Tomas.</h1><p>Your command center is aligned. TAINO is standing by.</p></div><div className={styles.clock}><strong>{time?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '--:--'}</strong><span>{time?.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) || 'Synchronizing'}</span><i>● LIVE</i></div></header>
        <div className={styles.dashboard}>
          <section className={`${styles.glass} ${styles.command}`}>
            <div className={styles.cardTitle}><div><span>TAINO INTELLIGENCE CORE</span><h2>Executive Voice Command</h2></div><i className={isLive ? styles.online : ''}>{voiceState.toUpperCase()}</i></div>
            <div className={`${styles.guardian} ${isLive ? styles.guardianLive : ''}`} aria-label="Holographic Taino guardian online">
              <div className={styles.orbitOne}/><div className={styles.orbitTwo}/><div className={styles.halo}/>
              {Array.from({ length: 12 }, (_, i) => <i className={styles.particle} style={{ '--p': i } as React.CSSProperties} key={i}/>) }
              <div className={styles.crown}><i/><i/><i/><i/><i/></div><div className={styles.head}><i/><b/><span/></div><div className={styles.shoulders}><i/><b/></div>
              <div className={`${styles.wave} ${isLive ? styles.waveActive : ''}`}>{Array.from({ length: 43 }, (_, i) => <i key={i} style={{ '--h': `${10 + ((i * 19) % 46)}px`, '--d': `${(i % 9) * -.07}s` } as React.CSSProperties}/>)}</div>
            </div>
            <div className={styles.transcript} aria-live="polite">{lines.slice(-4).map((line) => <p key={line.id}><b>{line.role === 'you' ? 'YOU' : 'TAINO'}</b><span>{line.text}</span></p>)}</div>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.voiceControls}><button onClick={toggleMute} disabled={!isLive} aria-label={voiceState === 'muted' ? 'Unmute microphone' : 'Mute microphone'}>{voiceState === 'muted' ? '⊘' : '⌁'}<small>{voiceState === 'muted' ? 'UNMUTE' : 'MUTE'}</small></button><button onClick={connect} className={styles.mic} aria-label={isLive ? 'End conversation' : 'Start conversation'}><span>{voiceState === 'connecting' ? '…' : isLive ? '■' : '●'}</span><i/></button><button onClick={interrupt} disabled={!isLive} aria-label="Interrupt TAINO">↯<small>INTERRUPT</small></button></div>
            <small className={styles.hint}>{isLive ? 'Say “Hey TAINO” at any time · Tap center to end' : 'Tap to speak · Wake phrase: “Hey TAINO”'}</small>
          </section>
          <aside className={styles.rail}>
            <section className={`${styles.glass} ${styles.voiceStatus}`}><div><i className={isLive ? styles.statusLive : ''}/><span><small>VOICE STATUS</small><b>{isLive ? 'Secure channel active' : 'Ready when you are'}</b></span></div><em>{voiceState}</em></section>
            <section className={styles.glass}><div className={styles.cardTitle}><h3>Today&apos;s Priorities</h3><span>03</span></div><ul className={styles.priorities}><li><i>1</i><div><b>Review strategic opportunities</b><small>High priority · 9:30 AM</small></div></li><li><i>2</i><div><b>Executive network follow-ups</b><small>3 conversations pending</small></div></li><li><i>3</i><div><b>Refine weekly briefing</b><small>Due before 4:00 PM</small></div></li></ul><small className={styles.demoLabel}>DEMONSTRATION DATA</small></section>
            <section className={styles.glass}><div className={styles.cardTitle}><h3>Next on Calendar</h3><span className={styles.demo}>DEMO</span></div><div className={styles.event}><time><b>10:30</b><small>AM</small></time><div><b>Leadership Strategy Sync</b><small>45 min · Video call</small></div></div><div className={styles.event}><time><b>2:00</b><small>PM</small></time><div><b>Executive Advisory Call</b><small>30 min · Phone</small></div></div></section>
            <section id="automations" className={`${styles.glass} ${styles.mission}`}><div className={styles.cardTitle}><h3>Mission Control</h3><i>MONITORING</i></div><div className={styles.metrics}><span><b>Career OS</b><small>Integration available</small><i/></span><span><b>Automations</b><small>Status requires connection</small><i className={styles.idle}/></span><span><b>Deployment</b><small>Preview environment</small><i className={styles.idle}/></span></div></section>
            <section className={`${styles.glass} ${styles.health}`}><div className={styles.cardTitle}><h3>System Health</h3><i>AVAILABLE</i></div><div><span>Voice Engine <b>{isLive ? 'Connected' : 'Ready'}</b></span><span>Secure Transport <b>{isLive ? 'Active' : 'Standby'}</b></span><span>Local Memory <b>Synced</b></span></div></section>
          </aside>
        </div>
      </section>
    </main>
  );
}
