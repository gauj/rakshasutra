// Root of the parent app: signs in, polls the server, watches for good-news moments and Bee conversations, and shows the home screen.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Alert } from "@rakshasutra/core";
import { DemoDrawer } from "./DemoDrawer";
import { TimeLapse } from "./TimeLapse";
import { FxLayer } from "./FxLayer";
import { celebrate } from "./fx";
import { Landing, type SheetId } from "./Landing";
import { Login } from "./Login";
import { api, AuthError, setCode, type State } from "./state";

// Which expanded view the address (#/checkin and so on) asks for, or the home screen.
type View = SheetId | "home";

// Reads the view from the address hash; anything unknown means home.
function viewFromHash(): View {
  const h = location.hash.replace(/^#\/?/, "");
  return h === "checkin" || h === "summary" || h === "ask" || h === "bee" || h === "setup" ? h : "home";
}

// Keeps the view in step with the address as it changes.
function useView(): View {
  const [view, setView] = useState<View>(viewFromHash());
  useEffect(() => {
    const on = () => setView(viewFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return view;
}

// A finished Bee conversation closes itself after 40 seconds.
const AUTO_RETURN_MS = 40_000;

/** Polls /api/state once a second and renders the home screen (plus the demo drawer in demo mode). */
export function App() {
  const view = useView();
  const [st, setSt] = useState<State>();
  const [err, setErr] = useState(false);
  const [auth, setAuth] = useState<"ok" | "needed" | "blocked">("ok");

  // Poll the server once a second, but only while signed in: hammering with a wrong code would lock the parent out.
  useEffect(() => {
    if (auth !== "ok") return;
    let live = true;
    const tick = async () => {
      try {
        const s = await api<State>("/api/state");
        if (live) {
          setSt(s);
          setErr(false);
          setAuth("ok");
        }
      } catch (e) {
        if (!live) return;
        if (e instanceof AuthError) setAuth(e.message === "429" ? "blocked" : "needed");
        else setErr(true);
      }
    };
    void tick();
    const id = setInterval(tick, 1000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [auth]);

  const open: Alert | undefined = useMemo(() => st?.alerts.find((a) => a.status === "open"), [st?.alerts]);

  // Good news gets a little party: a plan being saved, and Adam getting home as planned. Alerts never do.
  const planStatuses = useRef<Record<string, string> | undefined>(undefined);
  useEffect(() => {
    if (!st) return;
    const now: Record<string, string> = {};
    st.plans.forEach((p) => (now[p.id] = p.status));
    const prev = planStatuses.current;
    planStatuses.current = now;
    if (!prev) return; // do not celebrate things that happened before the page opened
    for (const p of st.plans) {
      const was = prev[p.id];
      if (was === "proposed" && p.status === "confirmed") celebrate({ confetti: 22, toast: "Plan saved. I'll watch the clock." });
      else if (was && was !== "completed" && p.status === "completed") celebrate({ confetti: 64, toast: `${st.child.name} is home, right on plan.` });
    }
  }, [st?.plans]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the guardian talks to their Bee about the child, the Bee view grows out of the pill at the top.
  const seenVoice = useRef<number | undefined>(undefined);
  const returnTo = useRef("#/");
  useEffect(() => {
    if (!st) return;
    const v = st.voice;
    if (seenVoice.current === undefined) {
      seenVoice.current = v?.id ?? 0; // a refresh must not replay an old conversation
      return;
    }
    if (v && v.id !== seenVoice.current) {
      seenVoice.current = v.id;
      if (location.hash !== "#/bee") returnTo.current = location.hash || "#/";
      location.hash = "#/bee";
    }
  }, [st]);

  const done = useCallback(() => {
    void api("/api/voice/dismiss", { method: "POST" }).catch(() => undefined);
    location.hash = returnTo.current === "#/bee" ? "#/" : returnTo.current;
  }, []);

  // A finished conversation closes itself after a while, unless a plan is still waiting for a yes.
  const v = st?.voice;
  const waitingForYes = !!v && v.kind === "plan" && st!.plans.find((p) => p.id === v.planId)?.status === "proposed";
  useEffect(() => {
    if (view !== "bee" || !v || v.status !== "done" || waitingForYes) return;
    const t = setTimeout(done, AUTO_RETURN_MS);
    return () => clearTimeout(t);
  }, [view, v?.id, v?.status, waitingForYes, done]);

  // If the conversation was closed somewhere else, don't sit on an empty Bee view.
  useEffect(() => {
    if (st && view === "bee" && !st.voice) location.hash = "#/";
  }, [st, view]);

  if (auth !== "ok") return <Login blocked={auth === "blocked"} onCode={(c) => { setCode(c); setAuth("ok"); }} />;

  if (!st) {
    return (
      <div className="boot">
        <p>{err ? "Cannot reach RakshaSutra. Start the server with npm run dev:server." : "Waking up…"}</p>
      </div>
    );
  }

  return (
    <>
      <Landing st={st} open={open} view={view} onCloseBee={done} />
      {st.mode === "demo" && <DemoDrawer st={st} />}
      {st.mode === "demo" && <TimeLapse st={st} />}
      <FxLayer />
    </>
  );
}
