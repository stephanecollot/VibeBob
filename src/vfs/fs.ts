import LightningFS from "@isomorphic-git/lightning-fs";

const fs = new LightningFS("vibebob");
export const pfs = fs.promises;
export const lfs = fs;

export const ROOT = "/mods";

export async function ensureDir(path: string): Promise<void> {
  try {
    await pfs.mkdir(path);
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== "EEXIST") throw err;
  }
}

export async function ensureRoot(): Promise<void> {
  await ensureDir(ROOT);
}
