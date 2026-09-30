import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { Request } from "express";
import crypto from "crypto";
export async function hashPassword(
  password: string
): Promise<string> {
  return await argon2.hash(password);
}

export async function checkPasswordHash(
  password: string,
  hash: string
): Promise<boolean> {
  return await argon2.verify(hash, password);
}

export function makeJWT(
  userID: string,
  expiresIn: number,
  secret: string
): string {
  const iat = Math.floor(Date.now() / 1000);

  const payload: Pick<
    JwtPayload,
    "iss" | "sub" | "iat" | "exp"
  > = {
    iss: "chirpy",
    sub: userID,
    iat: iat,
    exp: iat + expiresIn,
  };

  return jwt.sign(payload, secret);
}

export function validateJWT(
  tokenString: string,
  secret: string
): string {
  const decoded = jwt.verify(tokenString, secret);

  if (
    typeof decoded === "string" ||
    !decoded.sub
  ) {
    throw new Error("Invalid token");
  }

  return decoded.sub;
}


export function getBearerToken(req: Request): string {
  const authHeader = req.get("Authorization");

  if (!authHeader) {
    throw new Error("Authorization header is missing");
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new Error("Invalid Authorization header");
  }

  return parts[1];
}


export function makeRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
