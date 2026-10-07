import { useState } from "react";
import type { User } from "../shared/model";
import { authenticate } from "./api";

/** Signs in to an existing account or creates a new one. */
export function SignIn({
  onSignedIn,
  report,
}: {
  onSignedIn: (user: User) => void;
  report: (message: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    try {
      const { user } = await authenticate(
        mode,
        String(data.get("username")),
        String(data.get("password")),
      );
      report("");
      onSignedIn(user);
    } catch (error) {
      report(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="sign-in"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <label>
        Username
        <input
          name="username"
          required
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9_.\-]+"
          autoComplete="username"
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
        />
      </label>
      <button className="primary" disabled={busy}>
        {mode === "register" ? "Create account" : "Sign in"}
      </button>
      <p className="hint">
        {mode === "register" ? "Already have an account? " : "New here? "}
        <button
          type="button"
          className="link"
          onClick={() => setMode(mode === "register" ? "login" : "register")}
        >
          {mode === "register" ? "Sign in instead" : "Create an account"}
        </button>
      </p>
    </form>
  );
}
