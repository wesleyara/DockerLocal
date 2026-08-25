const BASE_URL = "/api";

export function createSseClient(path: string): EventSource {
  return new EventSource(`${BASE_URL}${path}`);
}
