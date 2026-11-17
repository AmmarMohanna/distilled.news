import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageControl";
import { Mic, Square } from "lucide-react";

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function VoiceInput({ language, onText, label = "Describe by voice" }: { language: string; label?: string; onText: (text: string) => void }) {
  const { t } = useLanguage();
  const active = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => () => { if (active.current) { active.current.onresult = null; active.current.onerror = null; active.current.onend = null; active.current.abort(); } }, []);
  function start() {
    if (active.current) { active.current.stop(); return; }
    const browser = window as SpeechWindow;
    const Engine = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Engine) { setMessage("Voice input is unavailable in this browser. You can still type your interests."); return; }
    const recognition = new Engine(); active.current = recognition;
    recognition.lang = ({ en: "en-US", fr: "fr-FR", ar: "ar-LB" } as Record<string, string>)[language] ?? "en-US";
    recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = event => { const text = Array.from(event.results).map(result => result[0].transcript).join(" ").trim(); if (text) onText(text); };
    recognition.onerror = event => setMessage(event.error === "not-allowed" ? "Microphone access was denied. Allow it in your browser settings, or type instead." : "Could not hear your description. Try again or type it.");
    recognition.onend = () => { active.current = null; setListening(false); };
    setMessage(""); setListening(true);
    try { recognition.start(); } catch { active.current = null; setListening(false); setMessage("Could not start the microphone. Please type instead."); }
  }
  return <div className="voice-input"><button type="button" onClick={start} aria-label={t(listening ? "Stop listening" : label)} title={t(listening ? "Stop listening" : label)} aria-pressed={listening}>{listening ? <Square size={16}/> : <Mic size={16}/>}</button>{message && <small role="status">{t(message)}</small>}</div>;
}
