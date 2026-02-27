import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Firebase CLI public OAuth credentials (from firebase-tools source code)
const FIREBASE_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// In-memory cache for the access token
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

interface FirebaseTokens {
  tokens: {
    refresh_token?: string;
    access_token?: string;
    expires_at?: number;
  };
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

/**
 * Returns the path to the Firebase CLI config file.
 */
function getFirebaseConfigPath(): string {
  return join(homedir(), ".config", "configstore", "firebase-tools.json");
}

/**
 * Reads the Firebase CLI config file and extracts the refresh token.
 * Throws a clear error if the file is missing or the token is absent.
 */
async function readRefreshToken(): Promise<string> {
  const configPath = getFirebaseConfigPath();

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      throw new Error(
        "Firebase CLI config not found. Run `firebase login` first to authenticate."
      );
    }
    throw new Error(
      `Failed to read Firebase CLI config at ${configPath}: ${error.message}`
    );
  }

  let config: FirebaseTokens;
  try {
    config = JSON.parse(raw) as FirebaseTokens;
  } catch {
    throw new Error(
      `Failed to parse Firebase CLI config at ${configPath}. The file may be corrupted. Try running \`firebase login\` again.`
    );
  }

  const refreshToken = config?.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error(
      "No refresh token found in Firebase CLI config. Run `firebase login` first to authenticate."
    );
  }

  return refreshToken;
}

/**
 * Exchanges a refresh token for a fresh access token via Google's OAuth2 endpoint.
 */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
  });

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err: unknown) {
    const error = err as Error;
    throw new Error(
      `Network error while refreshing access token: ${error.message}`
    );
  }

  if (!response.ok) {
    let errorMessage = `Token refresh failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as TokenErrorResponse;
      if (errorBody.error === "invalid_grant") {
        errorMessage =
          "Firebase token is invalid or expired. Run `firebase login` again to re-authenticate.";
      } else {
        errorMessage = `Token refresh failed: ${errorBody.error}${
          errorBody.error_description
            ? ` — ${errorBody.error_description}`
            : ""
        }`;
      }
    } catch {
      // Could not parse error body, use the generic message
    }
    throw new Error(errorMessage);
  }

  let tokenData: TokenResponse;
  try {
    tokenData = (await response.json()) as TokenResponse;
  } catch {
    throw new Error(
      "Failed to parse token response from Google OAuth2 endpoint."
    );
  }

  if (!tokenData.access_token) {
    throw new Error(
      "No access token returned from Google OAuth2 endpoint. Try running `firebase login` again."
    );
  }

  // Cache the token with a safety margin of 60 seconds before actual expiry
  cachedAccessToken = tokenData.access_token;
  tokenExpiresAt = Date.now() + (tokenData.expires_in - 60) * 1000;

  return tokenData.access_token;
}

/**
 * Returns a valid Firebase access token.
 *
 * - Reads the refresh token from the Firebase CLI config file
 * - Uses the in-memory cached access token if it's still valid
 * - Otherwise refreshes the token via Google's OAuth2 endpoint
 *
 * @throws Error if Firebase CLI is not logged in or the token cannot be refreshed
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const refreshToken = await readRefreshToken();
  return refreshAccessToken(refreshToken);
}
