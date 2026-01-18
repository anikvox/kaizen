import { Request, Response, NextFunction } from "express";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import * as core from "express-serve-static-core";
import prisma from "../lib/prisma";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export interface AuthRequest<
  P = core.ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = core.Query,
  Locals extends Record<string, any> = Record<string, any>
> extends Request<P, ResBody, ReqBody, ReqQuery, Locals> {
  auth?: {
    userId: string;
    authType: "clerk" | "device";
  };
}

// Verify device token and return userId if valid
async function verifyDeviceToken(token: string): Promise<string | null> {
  try {
    const deviceToken = await prisma.deviceToken.findUnique({
      where: { token },
      select: { userId: true, id: true },
    });

    if (deviceToken) {
      // Update lastUsedAt
      await prisma.deviceToken.update({
        where: { id: deviceToken.id },
        data: { lastUsedAt: new Date() },
      });
      return deviceToken.userId;
    }
    return null;
  } catch (error) {
    console.error("Device token verification error:", error);
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  // First, try device token authentication (for extension)
  // Device tokens start with "kz_" prefix
  if (token.startsWith("kz_")) {
    const userId = await verifyDeviceToken(token);
    if (userId) {
      req.auth = {
        userId,
        authType: "device",
      };
      return next();
    }
    return res.status(401).json({ error: "Invalid device token" });
  }

  // Fall back to Clerk JWT verification (for website)
  try {
    const sessionClaims = await clerkClient.verifyToken(token);
    
    if (!sessionClaims.sub) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.auth = {
      userId: sessionClaims.sub as string,
      authType: "clerk",
    };

    next();
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(401).json({ error: "Unauthorized" });
  }
};
