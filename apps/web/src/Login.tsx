import { useState } from "react";
import { Mark } from "./Hero";
import { Squiggle } from "./Squiggle";

/** Shown when the server wants a family code. Only the parent who ran the setup command has it. */
export function Login({ blocked, onCode }: { blocked: boolean; onCode: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <main className="login">
      <form
        className="card login-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onCode(code.trim());
        }}
      >
        <Mark size={36} />
        <h1>RakshaSutra</h1>
        <Squiggle width={92} amp={3.5} wavelength={14} stroke={3} color="var(--mauve)" />
        <p className="muted">Enter your family code to see how your child is doing. Only you have it.</p>
        <input className="input" type="password" autoComplete="current-password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Family code" aria-label="Family code" />
        {blocked && <p className="login-note">Too many wrong tries. Wait a minute and try again.</p>}
        {!blocked && <p className="small muted" style={{ margin: 0 }}>The code was printed when you ran the setup command, and is saved in the data folder on the computer running this app.</p>}
        <button className="btn primary" type="submit" disabled={!code.trim()}>Sign in</button>
      </form>
    </main>
  );
}
