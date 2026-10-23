import { useEffect, useState } from "react";
import { DayThread } from "./DayThread";
import { CountUp } from "./FxLayer";
import { Page } from "./Page";
import { Squiggle } from "./Squiggle";
import { api, type Report, type State } from "./state";

const RANGES = [
  { hours: 3, label: "3 h" },
  { hours: 12, label: "12 h" },
  { hours: 24, label: "24 h" },
];

/** The day in a few numbers, a short story, and the thread of where he has been. */
export function SummaryPage({ st }: { st: State }) {
  const [hours, setHours] = useState(12);
  const [report, setReport] = useState<Report>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await api<Report>(`/api/report?hours=${hours}`);
        if (live) {
          setReport(r);
          setFailed(false);
        }
      } catch {
        if (live) setFailed(true);
      }
    };
    void load();
    const id = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [hours]);

  const name = st.child.name;
  const hasData = st.day.timeline.length > 0;

  return (
    <Page title={`${name}'s Summary`} subtitle="The story of the day so far" st={st}>
      <div className="seg" role="tablist" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.hours} role="tab" aria-selected={hours === r.hours} className={hours === r.hours ? "on" : ""} onClick={() => setHours(r.hours)}>
            {r.label}
          </button>
        ))}
      </div>

      {failed && <p className="muted">I could not load the summary just now. Trying again.</p>}
      {!report && !failed && <Squiggle width={64} amp={4} wavelength={14} stroke={2.6} animated />}

      {report && hasData && (
        <>
          <div className="stats">
            <div className="stat s1"><b><CountUp value={report.distanceKm} decimals={1} /></b><span>km travelled</span></div>
            <div className="stat s2"><b><CountUp value={report.stays.length} /></b><span>{report.stays.length === 1 ? "place stayed at" : "places stayed at"}</span></div>
            <div className="stat s3"><b><CountUp value={report.incidents.length} /></b><span>{report.incidents.length === 1 ? "worry" : "worries"}</span></div>
            <div className="stat s4"><b><CountUp value={report.coveragePct} />%</b><span>signal coverage</span></div>
          </div>
          <section className="card">
            <p className="eyebrow">{report.headline}</p>
            <p className="story">{report.narrative}</p>
            {report.hr && !/heart rate/i.test(report.narrative) && <p className="muted small" style={{ margin: 0 }}>Heart rate averaged {report.hr.avg} bpm (from {report.hr.min} to {report.hr.max}).</p>}
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              Written by {report.narrativeEngine === "bedrock" ? "Amazon Bedrock" : "a simple template (turn on Bedrock for richer summaries)"}.
            </p>
          </section>
        </>
      )}
      {report && !hasData && (
        <section className="card">
          <p className="story">Nothing to tell yet. {name}'s story starts with the first check-in.</p>
        </section>
      )}

      <section className="card">
        <h2>{name}'s day</h2>
        <DayThread st={st} />
      </section>
    </Page>
  );
}
