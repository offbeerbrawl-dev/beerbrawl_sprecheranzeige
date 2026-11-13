import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { DiscordCredentials } from "../config.js";
import type { IpcClient } from "./ipc.js";

const TOKEN_URL = "https://discord.com/api/oauth2/token";
const DAY = 24 * 60 * 60 * 1000;

/** Anmeldung endgültig gescheitert: nicht automatisch wiederholen, Meldung zeigen. */
export class AuthError extends Error {}

interface TokenCache {
  access_token: string;
  refresh_token?: string;
  /** Ablaufzeit in ms seit 1970. */
  expires_at: number;
  scopes: string[];
  client_id: string;
}

type Log = (msg: string) => void;

/**
 * Meldet die Verbindung bei Discord an. Nutzt den gespeicherten Token, erneuert
 * ihn bei Bedarf und fragt nur dann in Discord nach der Freigabe, wenn beides
 * nicht reicht.
 */
export async function authenticate(
  ipc: IpcClient,
  creds: DiscordCredentials,
  tokenFile: string,
  log: Log,
): Promise<any> {
  let cache = readCache(tokenFile, creds);

  if (cache) {
    if (cache.refresh_token && cache.expires_at - Date.now() < DAY) {
      cache = (await tryRefresh(cache, creds, tokenFile, log)) ?? cache;
    }
    try {
      return await ipc.request("AUTHENTICATE", { access_token: cache.access_token });
    } catch (err) {
      if (!ipc.connected) throw err;
      log(`Gespeicherter Token abgelehnt (${msg(err)}), versuche Erneuerung.`);
    }
    const fresh = cache.refresh_token ? await tryRefresh(cache, creds, tokenFile, log) : null;
    if (fresh) {
      try {
        return await ipc.request("AUTHENTICATE", { access_token: fresh.access_token });
      } catch (err) {
        if (!ipc.connected) throw err;
        log(`Auch der erneuerte Token wurde abgelehnt (${msg(err)}).`);
      }
    }
  }

  log("Discord fragt jetzt nach der Freigabe. Bitte in der Discord-App bestätigen.");
  try {
    const { code } = await ipc.request(
      "AUTHORIZE",
      { client_id: creds.clientId, scopes: creds.scopes, redirect_uri: creds.redirectUri },
      undefined,
      5 * 60_000,
    );
    const token = await tokenRequest(creds, {
      grant_type: "authorization_code",
      code,
      redirect_uri: creds.redirectUri,
    });
    writeCache(tokenFile, token, creds);
    return await ipc.request("AUTHENTICATE", { access_token: token.access_token });
  } catch (err) {
    if (!ipc.connected) throw err;
    throw new AuthError(`Anmeldung bei Discord gescheitert: ${msg(err)}`);
  }
}

async function tryRefresh(
  cache: TokenCache,
  creds: DiscordCredentials,
  tokenFile: string,
  log: Log,
): Promise<TokenCache | null> {
  try {
    const token = await tokenRequest(creds, {
      grant_type: "refresh_token",
      refresh_token: cache.refresh_token!,
    });
    log("Token erneuert.");
    return writeCache(tokenFile, token, creds);
  } catch (err) {
    log(`Token-Erneuerung gescheitert (${msg(err)}).`);
    return null;
  }
}

async function tokenRequest(creds: DiscordCredentials, params: Record<string, string>): Promise<any> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      ...params,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token-Endpunkt antwortet ${res.status}: ${text}`);
  return JSON.parse(text);
}

function readCache(file: string, creds: DiscordCredentials): TokenCache | null {
  if (!existsSync(file)) return null;
  try {
    const c = JSON.parse(readFileSync(file, "utf8")) as TokenCache;
    const sameScopes = [...creds.scopes].sort().join(" ") === [...(c.scopes ?? [])].sort().join(" ");
    return c.access_token && c.client_id === creds.clientId && sameScopes ? c : null;
  } catch {
    return null;
  }
}

function writeCache(file: string, token: any, creds: DiscordCredentials): TokenCache {
  const cache: TokenCache = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + (token.expires_in ?? 0) * 1000,
    scopes: creds.scopes,
    client_id: creds.clientId,
  };
  writeFileSync(file, JSON.stringify(cache, null, 2), { mode: 0o600 });
  return cache;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
