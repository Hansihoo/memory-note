import { API_BASE_URL } from "../config";

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
}

interface ServerUser {
  id: number;
  username: string;
  displayName?: string | null;
}

interface ServerToken {
  token: string;
  user: ServerUser;
}

export class MobileApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
  }
}

export interface MobileApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null | Promise<string | null>;
  fetchImpl?: typeof fetch;
}

function mapUser(user: ServerUser): UserProfile {
  return {
    id: String(user.id),
    username: user.username,
    displayName: user.displayName || user.username
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  return (await response.text().catch(() => "")) || response.statusText || `Request failed with ${response.status}`;
}

export function createMobileApiClient(options: MobileApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? API_BASE_URL).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const getToken = options.getToken ?? (() => null);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new MobileApiError(await readErrorMessage(response), response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    getApiBaseUrl() {
      return baseUrl;
    },
    async login(payload: { username: string; password: string }) {
      const result = await request<ServerToken>("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return { token: result.token, user: mapUser(result.user) };
    },
    async register(payload: { username: string; password: string }) {
      const result = await request<ServerToken>("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return { token: result.token, user: mapUser(result.user) };
    },
    async me() {
      return mapUser(await request<ServerUser>("/me"));
    },
    async logout() {
      await request<void>("/auth/logout", { method: "POST" });
    }
  };
}

export type MobileApiClient = ReturnType<typeof createMobileApiClient>;
