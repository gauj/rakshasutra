import { useState } from "react";
import { Beera } from "./Beera";
import { sentence } from "./Hero";
import { Page } from "./Page";
import { Squiggle } from "./Squiggle";
import { agoText, api, type State } from "./state";

interface Msg {
  from: "you" | "bee";
  text: string;
}

/** Quick questions are answered instantly from what we already know; anything else goes to the server. */
function localAnswer(q: string, st: State): string | undefined {
  const s = sentence(st);
  if (/\bwhere\b/i.test(q)) {
    if (!st.now_state?.last) return `I have not had a check-in from ${st.child.name} yet.`;
    const open = st.alerts.find((a) => a.status === "open");
    const place = open?.sos.locationContext ?? st.now_state.zone;
    const age = st.now_state.lastPingAgeMin;
    return `${place ? `Last seen: ${place}.` : "I have a position but no place name for it."}${age !== undefined ? ` That was ${agoText(age)}.` : ""} ${s.title}`;
  }
  if (/\bhow('?s| is)\b|\bokay\b|\bok\b|\bright now\b|\bdoing\b/i.test(q)) return `${s.title} ${s.sub}`;
  if (/\bunusual\b|\bwrong\b|\balert\b|\bworr(y|ied)\b/i.test(q)) {
    const n = st.alerts.length;
    return n === 0 ? `Nothing unusual so far. ${s.title}` : `There ${n === 1 ? "has been 1 alert" : `have been ${n} alerts`} today. Open Check-in to see why.`;
  }
  return undefined;
}

export function AskPage({ st }: { st: State }) {
  const name = st.child.name;
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "bee", text: `Hi. Ask me anything about ${name}'s day.` }]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (text = q) => {
    const t = text.trim();
    if (!t || busy) return;
    setQ("");
    setMsgs((m) => [...m, { from: "you", text: t }]);
    const quick = localAnswer(t, st);
    if (quick) {
      setMsgs((m) => [...m, { from: "bee", text: quick }]);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ text: string }>("/api/ask", { method: "POST", body: JSON.stringify({ question: t }) });
      setMsgs((m) => [...m, { from: "bee", text: r.text }]);
    } catch {
      setMsgs((m) => [...m, { from: "bee", text: "I could not reach my brain just now. Try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={`Ask About ${name}`} subtitle="I only know what the band and your plans tell me" st={st}>
      <div className="chat" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.from}`}>
            {m.from === "bee" ? (
              <div className="with-avatar">
                <Beera size={30} />
                <div className="bubble bee">{m.text}</div>
              </div>
            ) : (
              <div className="bubble you">{m.text}</div>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg bee">
            <div className="with-avatar">
              <Beera mood="listening" size={30} />
              <div className="bubble bee"><Squiggle width={44} amp={3.5} wavelength={12} stroke={2.4} color="var(--subtext0)" animated /></div>
            </div>
          </div>
        )}
      </div>

      <div className="chips">
        {[`Where is ${name} now?`, "Has anything unusual happened?", `How is ${name} doing?`].map((x) => (
          <button key={x} onClick={() => ask(x)}>{x}</button>
        ))}
      </div>

      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask about ${name}`} aria-label={`Ask about ${name}`} />
        <button className="btn primary" type="submit" disabled={busy}>Send</button>
      </form>
    </Page>
  );
}
