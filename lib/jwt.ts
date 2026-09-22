import jwt, { JwtPayload } from "jsonwebtoken";

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined");
  }
  return secret;
};

export interface DecodedAdminToken extends JwtPayload {
  id: string;
}

export const signAccessToken = (userId: string | unknown): string => {
  return jwt.sign({ id: String(userId) }, getJwtSecret(), { expiresIn: "5m" });
};

export const signRefreshToken = (userId: string | unknown): string => {
  return jwt.sign({ id: String(userId) }, getJwtSecret(), { expiresIn: "7d" });
};

export const verifyToken = (token: string): DecodedAdminToken => {
  return jwt.verify(token, getJwtSecret()) as DecodedAdminToken;
};

/**
 * Helper to authenticate incoming requests from either:
 * 1. Authorization: Bearer <token> header (Mobile app or API clients)
 * 2. access_token cookie (Web browser)
 */
export const getAuthenticatedAdmin = (req: Request): DecodedAdminToken | null => {
  try {
    let token: string | null = null;

    // Check Authorization header first
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // Check custom access_token header if present
    if (!token) {
      token = req.headers.get("access_token");
    }

    // Fallback: Check Cookie header
    if (!token) {
      const cookieHeader = req.headers.get("cookie");
      if (cookieHeader) {
        const cookies = Object.fromEntries(
          cookieHeader.split("; ").map((c) => {
            const [key, ...v] = c.split("=");
            return [key, decodeURIComponent(v.join("="))];
          })
        );
        token = cookies["access_token"] || null;
      }
    }

    if (!token) return null;

    return verifyToken(token);
  } catch {
    return null;
  }
};
