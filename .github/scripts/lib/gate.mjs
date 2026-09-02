/**
 * The spam gate. Submissions that pass validation publish themselves, so the
 * only thing standing between a throwaway account and the catalog is this.
 * Everything tunable lives in GATE.
 */
export const GATE = {
  /** Accounts younger than this wait for a maintainer's `approved` label. */
  minAccountAgeDays: 30,
  /** Auto-publishes allowed per account per rolling day. 0 disables the cap. */
  maxPerAccountPerDay: 0,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function githubJson(path, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "vibebob-marketplace",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
  return res.json();
}

/**
 * @returns {{ allowed: boolean, reason: string, accountAgeDays: number|null }}
 * Fails open on API errors: a GitHub outage should not silently freeze
 * publishing, and every other hard check has already run by this point.
 */
export async function checkAccountGate(login, token) {
  let user;
  try {
    user = await githubJson(`/users/${encodeURIComponent(login)}`, token);
  } catch (err) {
    return {
      allowed: true,
      reason: `could not read the account age (${err.message}) — gate skipped`,
      accountAgeDays: null,
    };
  }

  const created = Date.parse(user.created_at ?? "");
  if (Number.isNaN(created))
    return { allowed: true, reason: "account age unavailable — gate skipped", accountAgeDays: null };

  const ageDays = Math.floor((Date.now() - created) / DAY_MS);
  if (ageDays < GATE.minAccountAgeDays) {
    return {
      allowed: false,
      reason:
        `this GitHub account is ${ageDays} day${ageDays === 1 ? "" : "s"} old; ` +
        `auto-publishing needs ${GATE.minAccountAgeDays}+`,
      accountAgeDays: ageDays,
    };
  }
  return { allowed: true, reason: `account is ${ageDays} days old`, accountAgeDays: ageDays };
}
