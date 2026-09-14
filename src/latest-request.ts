/** Superseded or unmounted requests may finish, but cannot publish their results. */
export function createLatestRequest() {
  let version = 0;
  return {
    begin() { const current = ++version; return () => current === version; },
    invalidate() { version++; }
  };
}
