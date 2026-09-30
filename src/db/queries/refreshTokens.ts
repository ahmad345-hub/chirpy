import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "../index.js";
import {
  NewRefreshToken,
  refreshTokens,
  users,
} from "../schema.js";

export async function createRefreshToken(
  refreshToken: NewRefreshToken
) {
  const [result] = await db
    .insert(refreshTokens)
    .values(refreshToken)
    .returning();

  return result;
}

export async function getUserFromRefreshToken(
  token: string
) {
  const [result] = await db
    .select({
      user: users,
    })
    .from(refreshTokens)
    .innerJoin(
      users,
      eq(refreshTokens.userId, users.id)
    )
    .where(
      and(
        eq(refreshTokens.token, token),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date())
      )
    );

  return result?.user;
}

export async function revokeRefreshToken(
  token: string
) {
  const [result] = await db
    .update(refreshTokens)
    .set({
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(refreshTokens.token, token))
    .returning();

  return result;
}
