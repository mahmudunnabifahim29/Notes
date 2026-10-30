import { createRemoteJWKSet, jwtVerify } from "jose";
import { firebaseConfig } from "./firebase-config";

const googleKeys = createRemoteJWKSet(new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
));

export async function verifyFirebaseToken(token: string) {
  const { payload } = await jwtVerify(token, googleKeys, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${firebaseConfig.projectId}`,
    audience: firebaseConfig.projectId,
    requiredClaims: ["exp", "iat", "sub", "auth_time"],
  });
  const time = Math.floor(Date.now() / 1000);
  if (payload.aud !== firebaseConfig.projectId || !payload.sub || payload.sub.length > 128 ||
      typeof payload.iat !== "number" || payload.iat > time ||
      typeof payload.auth_time !== "number" || payload.auth_time > time ||
      payload.email_verified !== true || typeof payload.email !== "string" || !payload.email) {
    throw new Error("A verified Firebase account is required.");
  }
  return {
    userId: `firebase:${payload.sub}`,
    email: payload.email,
    displayName: typeof payload.name === "string" ? payload.name : payload.email,
    fullName: typeof payload.name === "string" ? payload.name : null,
    expiresAt: payload.exp!,
  };
}
