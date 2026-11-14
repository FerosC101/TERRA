/**
 * Single switch between the mock service layer and a real backend.
 *
 * Set NEXT_PUBLIC_API_BASE_URL (e.g. http://localhost:8000) to send every
 * service call to the FastAPI backend. Leave it unset to use the local demo
 * implementation. The UI never knows which one answered.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
export const IS_DEMO = API_BASE_URL === "";

export async function request<T>(path: string, mock: () => T, init?: RequestInit): Promise<T> {
  if (IS_DEMO) return mock();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`TERRA API ${res.status} on ${path}`);
  return (await res.json()) as T;
}
