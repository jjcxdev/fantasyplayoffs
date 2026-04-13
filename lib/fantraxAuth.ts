/**
 * Fantrax session via the same `login` method the web app uses (POST /fxpa/req?lgnu=1).
 * Keeps you out of NOT_LOGGED_IN for private leagues when email/password succeed.
 *
 * Optional 2FA: set FANTRAX_TFA_CODE to a 6-digit code when the account requires it.
 */

const FANTRAX_LOGIN_URL = "https://www.fantrax.com/fxpa/req?lgnu=1";

/** Bundled Fantrax web `me.VERSION` — bump if login starts failing after their deploys */
const DEFAULT_CLIENT_VERSION = "179.0.1";

type LoginResponse = {
  pageError?: { code?: string; title?: string };
  responses?: Array<{
    data?: { userInfo?: unknown; tfa?: boolean; errors?: unknown };
    errors?: Array<{ code?: string; text?: string }>;
  }>;
};

function getSetCookieLines(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") {
    return h.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

/** Build `Cookie` header value from Set-Cookie lines (name=value only). */
export function cookieHeaderFromSetCookie(setCookieLines: string[]): string {
  const pairs: string[] = [];
  for (const line of setCookieLines) {
    const part = line.split(";")[0]?.trim();
    if (part && part.includes("=")) pairs.push(part);
  }
  return pairs.join("; ");
}

/**
 * Log in with email + password. Returns a Cookie header string for subsequent Fantrax requests.
 */
export async function fantraxLoginWithPassword(options: {
  email: string;
  password: string;
  /** 6-digit TFA if required */
  tfaCode?: string;
  /** reCAPTCHA v3 token — rarely needed; empty string works for many logins */
  recaptchaToken?: string;
}): Promise<string> {
  const email = options.email.trim();
  const password = options.password;
  const clientVersion =
    process.env.FANTRAX_CLIENT_VERSION?.trim() || DEFAULT_CLIENT_VERSION;

  const body = {
    msgs: [
      {
        method: "login",
        data: {
          u: email,
          p: password,
          t: options.recaptchaToken ?? "",
          v: 3,
          ...(options.tfaCode?.trim() ? { tfa: options.tfaCode.trim() } : {}),
        },
      },
    ],
    uiv: 3,
    refUrl: "https://www.fantrax.com/login",
    dt: "1",
    at: "0",
    av: "",
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    v: clientVersion,
  };

  const res = await fetch(FANTRAX_LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.fantrax.com",
      Referer: "https://www.fantrax.com/login",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });

  const setCookies = getSetCookieLines(res);
  const cookieHeader = cookieHeaderFromSetCookie(setCookies);

  const json = (await res.json()) as LoginResponse;

  if (!res.ok) {
    throw new Error(`Fantrax login HTTP ${res.status}: ${JSON.stringify(json)}`);
  }

  if (json.pageError?.code) {
    throw new Error(
      `Fantrax login pageError [${json.pageError.code}]: ${json.pageError.title || JSON.stringify(json.pageError)}`
    );
  }

  const first = json.responses?.[0];
  const errList = first?.errors ?? first?.data?.errors;
  const errs = Array.isArray(errList) ? errList : [];

  if (errs.length > 0) {
    const e = errs[0] as { code?: string; text?: string };
    const msg = e?.text || e?.code || JSON.stringify(errs);
    if (e?.code === "TFA_REQUIRED" || first?.data?.tfa) {
      throw new Error(
        "Fantrax requires 2FA. Set FANTRAX_TFA_CODE to the current 6-digit code and retry (or use FANTRAX_COOKIE from your browser)."
      );
    }
    throw new Error(`Fantrax login failed: ${msg}`);
  }

  if (!first?.data?.userInfo) {
    throw new Error(
      `Fantrax login: no userInfo in response. Cookies: ${cookieHeader ? "present" : "missing"}`
    );
  }

  if (!cookieHeader) {
    throw new Error("Fantrax login succeeded but no Set-Cookie headers returned — try FANTRAX_COOKIE from browser.");
  }

  return cookieHeader;
}
