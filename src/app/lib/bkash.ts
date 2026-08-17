import config from "../config";
import { redisClient } from "./redis";

const BKASH_ID_TOKEN_KEY = "Bkash:idToken";
const BKASH_REFRESH_TOKEN_KEY = "Bkash:refreshToken";

const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 28; // 28 days
const TOKEN_REFRESH_THRESHOLD = 60 * 10; // 10 minutes

const getBkashHeaders = () => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  username: config.bkash_username,
  password: config.bkash_password,
});

const saveBkashAccessToken = async (accessToken: string) => {
  await redisClient.set(BKASH_ID_TOKEN_KEY, accessToken, {
    expiration: {
      type: "EX",
      value: ACCESS_TOKEN_TTL,
    },
  });
};

const saveBkashRefreshToken = async (refreshToken: string) => {
  await redisClient.set(BKASH_REFRESH_TOKEN_KEY, refreshToken, {
    expiration: {
      type: "EX",
      value: REFRESH_TOKEN_TTL,
    },
  });
};

const refreshBkashAccessToken = async (
  refreshToken: string,
): Promise<string> => {
  const response = await fetch(
    `${config.bkash_sandbox_base_url}/tokenized/checkout/token/refresh`,
    {
      method: "POST",
      headers: getBkashHeaders(),
      body: JSON.stringify({
        app_key: config.bkash_app_key,
        app_secret: config.bkash_app_secret,
        refresh_token: refreshToken,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to refresh bKash access token");
  }

  const result = await response.json();

  if (!result.id_token) {
    throw new Error("bKash refresh response does not contain an access token");
  }

  await saveBkashAccessToken(result.id_token);

  return result.id_token;
};

const generateBkashAccessToken = async (): Promise<string> => {
  const response = await fetch(
    `${config.bkash_sandbox_base_url}/tokenized/checkouttoken/grant`,
    {
      method: "POST",
      headers: getBkashHeaders(),
      body: JSON.stringify({
        app_key: config.bkash_app_key,
        app_secret: config.bkash_app_secret,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to generate bKash access token");
  }

  const result = await response.json();

  if (!result.id_token || !result.refresh_token) {
    throw new Error("Invalid bKash token response");
  }

  await saveBkashAccessToken(result.id_token);
  await saveBkashRefreshToken(result.refresh_token);

  return result.id_token;
};

export const getBkashIdToken = async (): Promise<string> => {
  const [accessToken, accessTokenTtl, refreshToken, refreshTokenTtl] =
    await Promise.all([
      redisClient.get(BKASH_ID_TOKEN_KEY),
      redisClient.ttl(BKASH_ID_TOKEN_KEY),
      redisClient.get(BKASH_REFRESH_TOKEN_KEY),
      redisClient.ttl(BKASH_REFRESH_TOKEN_KEY),
    ]);

  // Access token is still valid.
  if (accessToken && accessTokenTtl > TOKEN_REFRESH_THRESHOLD) {
    return accessToken;
  }

  // Access token is expired/near expiry,
  // but refresh token is still usable.
  if (
    refreshToken &&
    refreshTokenTtl > TOKEN_REFRESH_THRESHOLD
  ) {
    return refreshBkashAccessToken(refreshToken);
  }

  // No usable access token or refresh token.
  return generateBkashAccessToken();
};