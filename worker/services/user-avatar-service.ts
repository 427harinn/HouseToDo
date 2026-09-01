import { nowIso } from "../lib/date";
import { AppError, validationError } from "../lib/errors";
import { getImageLimits } from "../lib/image-limits";
import { readJpegDimensions } from "../lib/jpeg";
import { readWebpDimensions } from "../lib/webp";
import { HouseholdImageUsageRepository } from "../repositories/household-image-usage-repository";
import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { OrphanR2ObjectRepository } from "../repositories/orphan-r2-object-repository";
import { UserRepository } from "../repositories/user-repository";
import { HouseholdService } from "./household-service";
import type { User } from "../types/domain";

export const PROFILE_IMAGE_MAX_BYTES = 1024 * 1024;
export const PROFILE_IMAGE_MAX_DIMENSION = 1280;

export type ProfileImageUploadInput = {
  body: ArrayBuffer;
  contentType: string;
  width: number;
  height: number;
};

const invalidImage = (message: string) => validationError({ image: message }, message);

export const avatarContentTypeFor = (key: string): "image/webp" | "image/jpeg" =>
  key.toLowerCase().endsWith(".jpg") || key.toLowerCase().endsWith(".jpeg")
    ? "image/jpeg"
    : "image/webp";

export class UserAvatarService {
  private readonly users: UserRepository;
  private readonly households: HouseholdService;
  private readonly members: HouseholdMemberRepository;
  private readonly usage: HouseholdImageUsageRepository;
  private readonly orphans: OrphanR2ObjectRepository;

  constructor(
    private readonly db: D1Database,
    private readonly bucket: R2Bucket,
    private readonly env: Parameters<typeof getImageLimits>[0] = {}
  ) {
    this.users = new UserRepository(db);
    this.households = new HouseholdService(db);
    this.members = new HouseholdMemberRepository(db);
    this.usage = new HouseholdImageUsageRepository(db);
    this.orphans = new OrphanR2ObjectRepository(db);
  }

  async upload(userId: string, input: ProfileImageUploadInput): Promise<User> {
    if (input.contentType !== "image/webp" && input.contentType !== "image/jpeg")
      throw invalidImage("JPEGまたはWebP画像を指定してください。");
    if (input.body.byteLength > PROFILE_IMAGE_MAX_BYTES)
      throw invalidImage("JPEGまたはWebP画像のサイズまたは形式が不正です。");
    const dimensions = input.contentType === "image/jpeg"
      ? readJpegDimensions(input.body)
      : readWebpDimensions(input.body);
    if (!dimensions) throw invalidImage("JPEGまたはWebP画像のサイズまたは形式が不正です。");
    if (
      dimensions.width > PROFILE_IMAGE_MAX_DIMENSION ||
      dimensions.height > PROFILE_IMAGE_MAX_DIMENSION
    )
      throw invalidImage("画像の幅と高さは1280px以下にしてください。");
    if (input.width !== dimensions.width || input.height !== dimensions.height)
      throw invalidImage("申告された画像サイズと実際の画像サイズが一致しません。");
    const household = await this.households.requireCurrentHousehold(userId);
    const user = await this.users.findById(userId);
    if (!user)
      throw new AppError({
        code: "UNAUTHENTICATED",
        status: 401,
        message: "認証が必要です。"
      });
    const usage = await this.usage.resetDailyCounterIfNeeded(
      household.id,
      new Date().toISOString().slice(0, 10)
    );
    if (!usage) throw new Error("household image usage row was not created");
    const limits = getImageLimits(this.env);
    const oldSize = user.avatar?.sizeBytes ?? 0;
    const isCreate = !user.avatar;
    if (usage.activeCount + (isCreate ? 1 : 0) > limits.activeCount)
      throw new AppError({
        code: "IMAGE_COUNT_LIMIT_REACHED",
        status: 409,
        message: "Image count limit reached."
      });
    if (usage.activeBytes + input.body.byteLength - oldSize > limits.activeBytes)
      throw new AppError({
        code: "IMAGE_ACTIVE_BYTES_LIMIT_REACHED",
        status: 409,
        message: "Active image bytes limit reached."
      });
    if (
      usage.activeBytes +
        usage.reservedBytes +
        usage.pendingCleanupBytes +
        input.body.byteLength >
      limits.storedBytes
    )
      throw new AppError({
        code: "IMAGE_STORED_BYTES_LIMIT_REACHED",
        status: 409,
        message: "Stored image bytes limit reached."
      });
    if (usage.dailyUploadCount >= limits.dailyUploads)
      throw new AppError({
        code: "IMAGE_DAILY_UPLOAD_LIMIT_REACHED",
        status: 429,
        message: "Daily image upload limit reached."
      });

    const id = crypto.randomUUID();
    const storedContentType = input.contentType;
    const extension = storedContentType === "image/jpeg" ? "jpg" : "webp";
    const r2Key = `households/${household.id}/users/${userId}/avatar/${id}.${extension}`;
    const now = nowIso();
    await this.bucket.put(r2Key, input.body, {
      httpMetadata: { contentType: storedContentType }
    });
    try {
      const results = await this.db.batch([
        this.usage.prepareApplyAvatarUpdate({
          householdId: household.id,
          oldSizeBytes: oldSize,
          newSizeBytes: input.body.byteLength,
          isCreate,
          now,
          currentDate: now.slice(0, 10),
          activeBytesLimit: limits.activeBytes,
          activeCountLimit: limits.activeCount,
          storedBytesLimit: limits.storedBytes,
          dailyUploadLimit: limits.dailyUploads
        }),
        this.users.prepareUpdateAvatar(
          userId,
          user.avatar?.key ?? null,
          {
            key: r2Key,
            sizeBytes: input.body.byteLength,
            width: input.width,
            height: input.height
          },
          now
        )
      ]);
      if (
        (results[0]?.meta.changes ?? 0) === 0 ||
        (results[1]?.meta.changes ?? 0) === 0
      )
        throw new AppError({
          code: "CONFLICT",
          status: 409,
          message: "Profile image changed while uploading."
        });
    } catch (error) {
      await this.deleteOrQueue(
        r2Key,
        userId,
        household.id,
        input.body.byteLength,
        "profile image upload compensation"
      );
      throw error;
    }
    if (user.avatar)
      await this.deleteOrQueue(
        user.avatar.key,
        userId,
        household.id,
        user.avatar.sizeBytes,
        "old profile image after replacement"
      );
    return (await this.users.findById(userId))!;
  }

  async remove(userId: string): Promise<void> {
    const household = await this.households.requireCurrentHousehold(userId);
    const user = await this.users.findById(userId);
    if (!user?.avatar) return;
    const now = nowIso();
    const results = await this.db.batch([
      this.users.prepareRemoveAvatar(userId, user.avatar.key, now),
      this.usage.prepareApplyAvatarRemoval({
        householdId: household.id,
        sizeBytes: user.avatar.sizeBytes,
        now
      })
    ]);
    if ((results[0]?.meta.changes ?? 0) === 0 || (results[1]?.meta.changes ?? 0) === 0)
      throw new AppError({
        code: "CONFLICT",
        status: 409,
        message: "Profile image changed while deleting."
      });
    await this.deleteOrQueue(
      user.avatar.key,
      userId,
      household.id,
      user.avatar.sizeBytes,
      "profile image deleted"
    );
  }

  async get(
    requesterId: string,
    targetId: string
  ): Promise<{ user: User; object: R2ObjectBody }> {
    const user = await this.users.findById(targetId);
    if (!user?.avatar)
      throw new AppError({
        code: "NOT_FOUND",
        status: 404,
        message: "対象が見つかりません。"
      });
    if (requesterId !== targetId) {
      const household = await this.households.requireCurrentHousehold(requesterId);
      if (!(await this.members.findMembership(household.id, targetId)))
        throw new AppError({
          code: "FORBIDDEN",
          status: 403,
          message: "この操作は許可されていません。"
        });
    }
    const object = await this.bucket.get(user.avatar.key);
    if (!object)
      throw new AppError({
        code: "NOT_FOUND",
        status: 404,
        message: "対象が見つかりません。"
      });
    return { user, object };
  }

  private async deleteOrQueue(
    key: string,
    sourceId: string,
    householdId: string,
    byteSize: number,
    reason: string
  ): Promise<void> {
    try {
      await this.bucket.delete(key);
    } catch {
      const now = nowIso();
      await this.orphans.enqueue({
        id: crypto.randomUUID(),
        r2Key: key,
        sourceType: "manual_reconciliation",
        sourceId,
        householdId,
        byteSize,
        reason,
        firstFailedAt: now,
        nextAttemptAt: new Date(Date.parse(now) + 30 * 86400000).toISOString(),
        now
      });
    }
  }
}
