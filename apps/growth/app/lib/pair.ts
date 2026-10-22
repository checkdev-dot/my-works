import fs from "fs";
import path from "path";
import crypto from "crypto";

/** The pairing token for the person's phone. Lives in data/.pair-token, created on first use. */
export function pairToken(): string {
  const file = path.join(process.cwd(), "data", ".pair-token");
  try {
    const t = fs.readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{32}$/.test(t)) return t;
  } catch {}
  const t = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(file, t);
  return t;
}
