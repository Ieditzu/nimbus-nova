import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, baseUrl } from "../api";
import {
  createNovaClient,
  NovaError,
  type NovaClient,
  type PublicAccount,
} from "../api/client";
import { errorMessage } from "../lib/errors";
import { readToken, removeToken, saveToken } from "./storage";

type Session = { token: string; user: PublicAccount };
type AuthContextValue = {
  session: Session | null;
  restoring: boolean;
  notice: string;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  client: NovaClient;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [notice, setNotice] = useState("");
  const expire = useCallback(() => {
    setSession(null);
    setNotice("Sesiunea a expirat. Conectează-te din nou.");
    void removeToken().catch(() => {});
  }, []);
  const client = useMemo(() => {
    const current = createNovaClient(baseUrl, { token: session?.token ?? "" });
    async function authorized<T>(call: () => Promise<T>): Promise<T> {
      if (!session)
        throw new NovaError(
          401,
          "login_required",
          "Conectează-te pentru a continua.",
        );
      try {
        return await call();
      } catch (e) {
        if (e instanceof NovaError && e.status === 401) expire();
        throw e;
      }
    }
    return {
      ...current,
      getMyProfile: () => authorized(() => current.getMyProfile()),
      putMyProfile: (body: Parameters<NovaClient["putMyProfile"]>[0]) =>
        authorized(() => current.putMyProfile(body)),
      applyToTask: (id: string, body: { message: string }) =>
        authorized(() => current.applyToTask(id, body)),
      listMyApplications: () => authorized(() => current.listMyApplications()),
    };
  }, [session, expire]);
  const restore = useCallback(async () => {
    setRestoring(true);
    setNotice("");
    try {
      const token = await readToken();
      if (!token) return;
      const { user } = await api.me(token);
      if (user.role !== "worker") {
        await removeToken();
        setNotice(
          "Aplicația este pentru cei care caută sarcini. Conturile de organizator se folosesc pe site.",
        );
        return;
      }
      setSession({ token, user });
    } catch (e) {
      if (e instanceof NovaError && e.status === 401) {
        await removeToken().catch(() => {});
        setSession(null);
        setNotice("Sesiunea a expirat. Conectează-te din nou.");
      } else
        setNotice(
          `${errorMessage(e)}. Nu am putut verifica sesiunea. Poți reîncerca.`,
        );
    } finally {
      setRestoring(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return restore();
    });
    return () => {
      active = false;
    };
  }, [restore]);
  async function signIn(email: string, password: string) {
    const result = await api.login({ email: email.trim(), password });
    if (result.user.role !== "worker") {
      await api.logout(result.token).catch(() => {});
      throw new NovaError(
        403,
        "worker_required",
        "Aplicația este pentru cei care caută sarcini. Folosește contul de organizator pe site.",
      );
    }
    setNotice("");
    try {
      await saveToken(result.token);
    } catch {
      setNotice(
        "Ești conectat, dar sesiunea nu a putut fi salvată pe dispozitiv.",
      );
    }
    setSession(result);
  }
  async function signOut() {
    if (!session) return;
    try {
      await api.logout(session.token);
    } catch (e) {
      if (!(e instanceof NovaError && e.status === 401)) throw e;
    }
    try {
      await removeToken();
      setNotice("");
    } catch {
      setNotice(
        "Sesiunea a fost închisă, dar datele locale nu au putut fi șterse.",
      );
    }
    setSession(null);
  }
  return (
    <AuthContext.Provider
      value={{ session, restoring, notice, restore, signIn, signOut, client }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
