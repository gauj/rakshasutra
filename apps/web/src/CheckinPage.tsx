import type { Alert } from "@rakshasutra/core";
import { BeeVoice } from "./BeeVoice";
import { Hero } from "./Hero";
import { Page } from "./Page";
import { SosCard } from "./SosCard";
import { api, clock12, type State } from "./state";

/** How is Adam right now? The status sentence, any alert (explained), and the plan. */
export function CheckinPage({ st, open }: { st: State; open?: Alert }) {
  const tz = st.child.tzOffsetMin;
  const cleared = !!open && st.tier === "safe";
  const planAct = (id: string, what: "confirm" | "reject") => api(`/api/plans/${id}/${what}`, { method: "POST" });
  const ack = (id: string, falseAlarm: boolean) => api(`/api/alerts/${id}/ack`, { method: "POST", body: JSON.stringify({ falseAlarm }) });
  const share = async () => {
    try {
      return (await api<{ url: string }>("/api/share", { method: "POST" })).url;
    } catch {
      return undefined;
    }
  };

  return (
    <Page title="Check-in" subtitle={`How ${st.child.name} is doing right now`} st={st} wide>
      <div className="stack">
        <Hero st={st} open={open} />
        <div className={`cols two ${open && !cleared ? "with-alert" : ""}`}>
          <div className="stack">
            {open && <SosCard alert={open} st={st} cleared={cleared} onAck={ack} onShare={share} />}
            {!(open && !cleared) && <BeeVoice st={st} onAct={planAct} />}
          </div>
          <div className="stack">
            {open && !cleared && <BeeVoice st={st} onAct={planAct} />}
            <section className="card">
              <h2>How we reached you</h2>
              {st.deliveries.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>Nothing yet. If something needs you, we message you on: {st.channels.map((c) => c.label).join(", ")}.</p>
              ) : (
                st.deliveries.slice(0, 6).map((d) => (
                  <div className="li small" key={d.id}>
                    <span><span className="tag">{d.kind}</span>{d.channelLabel}</span>
                    <span className="muted">{clock12(d.at, tz)} · {d.ok ? "sent" : "did not send"}</span>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      </div>
    </Page>
  );
}
