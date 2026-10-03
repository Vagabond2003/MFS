import { createHash } from "node:crypto";
import { AVATAR_RULES, sniffFileSignature, validateAvatarFile } from "@/lib/validation";
import { ApiError } from "@/services/errors";
import { randomId } from "@/services/mock/crypto";
import type { UploadedFileRef } from "@/types/domain";
import { assignAvatar, avatarsReady, findAvatar, pruneAvatars, saveAvatar } from "./db-store";

/**
 * Profile pictures. The bytes live in the `avatars` table, outside the
 * per-request snapshot; users.avatar_id points at the current one and
 * GET /api/avatars/:id serves it to signed-in users.
 */

async function requireReady() {
  if (!(await avatarsReady())) {
    throw new ApiError("NOT_SUPPORTED", "Profile pictures aren't set up on this server yet. Run the profile-picture database migration.");
  }
}

/** Validates (type, size, magic bytes) and stores an upload. userId is null during registration. */
export async function storeAvatar(file: File, userId: string | null): Promise<UploadedFileRef> {
  const problem = validateAvatarFile(file);
  if (problem) throw new ApiError("VALIDATION", problem);
  const sniffed = await sniffFileSignature(file);
  if (!sniffed || sniffed !== file.type || !(AVATAR_RULES.mimeTypes as readonly string[]).includes(sniffed)) {
    throw new ApiError("VALIDATION", "The file's contents don't match its type. Upload a real JPG, PNG or WebP image.");
  }
  await requireReady();
  const data = new Uint8Array(await file.arrayBuffer());
  const id = randomId("avt");
  await saveAvatar({ id, userId, mimeType: sniffed, sizeBytes: data.byteLength, sha256: createHash("sha256").update(data).digest("hex"), data });
  return { uploadId: id, fileName: file.name.slice(0, 120), mimeType: sniffed, sizeBytes: data.byteLength };
}

/** A picture the caller uploaded, ready to become their profile picture. */
export async function ownAvatar(uploadId: string, userId: string) {
  await requireReady();
  const avatar = await findAvatar(uploadId);
  if (!avatar || avatar.userId !== userId) throw new ApiError("NOT_FOUND", "That picture could not be found. Please upload it again.");
  return avatar.id;
}

/** A picture uploaded during registration (not yet anyone's, and recent). */
export async function registrationAvatar(uploadId: string | null | undefined): Promise<string | null> {
  if (!uploadId) return null;
  await requireReady();
  const avatar = await findAvatar(uploadId);
  const fresh = avatar && Date.now() - Date.parse(avatar.createdAt) < 86_400_000;
  if (!avatar || avatar.userId !== null || !fresh) {
    throw new ApiError("VALIDATION", "The profile picture could not be found. Please choose it again.", { fieldErrors: { avatar: "Please choose the picture again" } });
  }
  return avatar.id;
}

/** After the account exists: hand the registration upload to it. */
export async function attachRegistrationAvatar(avatarId: string | null, userId: string) {
  if (!avatarId) return;
  await assignAvatar(avatarId, userId).catch((e) => console.warn("[avatars] could not assign:", e instanceof Error ? e.message : e));
}

/** Removes the user's replaced pictures (and stale unclaimed uploads). */
export async function cleanUpAvatars(userId: string, keep: string | null) {
  await pruneAvatars(userId, keep).catch((e) => console.warn("[avatars] cleanup failed:", e instanceof Error ? e.message : e));
}
