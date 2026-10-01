import express from "express";
import {
  Request,
  Response,
  NextFunction,
} from "express";

import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";

import { config } from "./config.js";

import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "./errors.js";

import {
  hashPassword,
  checkPasswordHash,
  makeJWT,
  validateJWT,
  getBearerToken,
  makeRefreshToken,
} from "./auth.js";

import {
  createUser,
  deleteAllUsers,
  getUserByEmail,
  updateUser,
  upgradeUserToChirpyRed,
} from "./db/queries/users.js";

import {
  createChirp,
  getAllChirps,
  getChirpById,
  deleteChirp,
} from "./db/queries/chirps.js";

import {
  createRefreshToken,
  getUserFromRefreshToken,
  revokeRefreshToken,
} from "./db/queries/refreshTokens.js";


// =======================
// Database Migrations
// =======================

const migrationClient = postgres(
  config.db.url,
  { max: 1 }
);

await migrate(
  drizzle(migrationClient),
  config.db.migrationConfig
);


// =======================
// Express App
// =======================

const app = express();

app.use(middlewareLogResponses);


// =======================
// API Routes
// =======================

app.get(
  "/api/healthz",
  handlerReadiness
);

app.post(
  "/api/polka/webhooks",
  handlerPolkaWebhook
);

app.post(
  "/api/users",
  handlerCreateUser
);

app.delete(
  "/api/chirps/:chirpId",
  handlerDeleteChirp
);

app.post(
  "/api/login",
  handlerLogin
);

app.post(
  "/api/refresh",
  handlerRefresh
);

app.put("/api/users", handlerUpdateUser);

app.post(
  "/api/revoke",
  handlerRevoke
);

app.post(
  "/api/chirps",
  handlerCreateChirp
);

app.get(
  "/api/chirps",
  handlerGetAllChirps
);

app.get(
  "/api/chirps/:chirpId",
  handlerGetChirpById
);


// =======================
// Admin Routes
// =======================

app.get(
  "/admin/metrics",
  handlerMetrics
);

app.post(
  "/admin/reset",
  handlerReset
);


// =======================
// Static Files
// =======================

app.use(
  "/app",
  middlewareMetricsInc,
  express.static("./src/app")
);


// =======================
// Error Handler
// =======================

app.use(errorHandler);


// =======================
// Start Server
// =======================

app.listen(config.api.port, () => {
  console.log(
    `Server is running at http://localhost:${config.api.port}`
  );
});


// =======================
// Health
// =======================

async function handlerReadiness(
  req: Request,
  res: Response
): Promise<void> {
  res.set(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  res.send("OK");
}


// =======================
// Logging Middleware
// =======================

function middlewareLogResponses(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.on("finish", () => {
    if (
      res.statusCode < 200 ||
      res.statusCode >= 300
    ) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`
      );
    }
  });

  next();
}


// =======================
// Metrics Middleware
// =======================

function middlewareMetricsInc(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  config.api.fileserverHits++;
  next();
}


// =======================
// Admin Metrics
// =======================

function handlerMetrics(
  req: Request,
  res: Response
): void {
  res.set(
    "Content-Type",
    "text/html; charset=utf-8"
  );

  res.send(`
<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.api.fileserverHits} times!</p>
  </body>
</html>
  `);
}


// =======================
// Admin Reset
// =======================

async function handlerReset(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (config.api.platform !== "dev") {
      throw new ForbiddenError(
        "Reset is only allowed in dev environment"
      );
    }

    config.api.fileserverHits = 0;

    await deleteAllUsers();

    res.set(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    res.send("Hits reset to 0");
  } catch (error) {
    next(error);
  }
}


// =======================
// Create User
// =======================

function handlerCreateUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const parsedBody = JSON.parse(body);

      const hashedPassword =
        await hashPassword(
          parsedBody.password
        );

      const user = await createUser({
        email: parsedBody.email,
        hashedPassword,
      });

      if (!user) {
        throw new Error(
          "Could not create user"
        );
      }

      const {
        hashedPassword: _,
        ...userResponse
      } = user;

      res.status(201).json(
        userResponse
      );
    } catch (error) {
      next(error);
    }
  });
}


// =======================
// Login
// =======================

function handlerLogin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const parsedBody = JSON.parse(body);

      const user = await getUserByEmail(
        parsedBody.email
      );

      if (!user) {
        throw new UnauthorizedError(
          "incorrect email or password"
        );
      }

      let passwordMatches = false;

      try {
        passwordMatches = await checkPasswordHash(
          parsedBody.password,
          user.hashedPassword
        );
      } catch {
        throw new UnauthorizedError(
          "incorrect email or password"
        );
      }

      if (!passwordMatches) {
        throw new UnauthorizedError(
          "incorrect email or password"
        );
      }

      const token = makeJWT(
        user.id,
        60 * 60,
        config.api.jwtSecret
      );

      const refreshToken = makeRefreshToken();

      const expiresAt = new Date(
        Date.now() +
          60 * 24 * 60 * 60 * 1000
      );

      await createRefreshToken({
        token: refreshToken,
        userId: user.id,
        expiresAt,
        revokedAt: null,
      });

      const {
        hashedPassword: _,
        ...userResponse
      } = user;

      res.status(200).json({
        ...userResponse,
        token,
        refreshToken,
      });
    } catch (error) {
      next(error);
    }
  });
}
    


// =======================
// Refresh Access Token
// =======================

async function handlerRefresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refreshToken =
      getBearerToken(req);

    const user =
      await getUserFromRefreshToken(
        refreshToken
      );

    if (!user) {
      throw new UnauthorizedError(
        "Invalid refresh token"
      );
    }

    const token = makeJWT(
      user.id,
      60 * 60,
      config.api.jwtSecret
    );

    res.status(200).json({
      token,
    });
  } catch (error) {
    if (
      error instanceof
      UnauthorizedError
    ) {
      next(error);
      return;
    }

    next(
      new UnauthorizedError(
        "Invalid refresh token"
      )
    );
  }
}


// =======================
// Revoke Refresh Token
// =======================

async function handlerRevoke(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refreshToken =
      getBearerToken(req);

    await revokeRefreshToken(
      refreshToken
    );

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}


// =======================
// Create Chirp
// =======================

function handlerCreateChirp(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      let userId: string;

      try {
        const token =
          getBearerToken(req);

        userId = validateJWT(
          token,
          config.api.jwtSecret
        );
      } catch {
        throw new UnauthorizedError(
          "Invalid token"
        );
      }

      const parsedBody =
        JSON.parse(body);

      if (
        parsedBody.body.length > 140
      ) {
        throw new BadRequestError(
          "Chirp is too long. Max length is 140"
        );
      }

      const profaneWords = [
        "kerfuffle",
        "sharbert",
        "fornax",
      ];

      const words =
        parsedBody.body.split(" ");

      const cleanedWords =
        words.map(
          (word: string) => {
            if (
              profaneWords.includes(
                word.toLowerCase()
              )
            ) {
              return "****";
            }

            return word;
          }
        );

      const cleanedBody =
        cleanedWords.join(" ");

      const chirp =
        await createChirp({
          body: cleanedBody,
          userId,
        });

      res.status(201).json(chirp);
    } catch (error) {
      next(error);
    }
  });
}


// =======================
// Get All Chirps
// =======================

async function handlerGetAllChirps(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const chirps =
      await getAllChirps();

    res.status(200).json(chirps);
  } catch (error) {
    next(error);
  }
}


// =======================
// Get Chirp By ID
// =======================

async function handlerGetChirpById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const chirpId =
      req.params.chirpId;

    const chirp =
      await getChirpById(
        chirpId
      );

    if (!chirp) {
      throw new NotFoundError(
        "Chirp not found"
      );
    }

    res.status(200).json(chirp);
  } catch (error) {
    next(error);
  }
}


// =======================
// Error Handler
// =======================

function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.log(err);

  if (
    err instanceof
    BadRequestError
  ) {
    res.status(400).json({
      error: err.message,
    });

    return;
  }

  if (
    err instanceof
    UnauthorizedError
  ) {
    res.status(401).json({
      error: err.message,
    });

    return;
  }

  if (
    err instanceof
    ForbiddenError
  ) {
    res.status(403).json({
      error: err.message,
    });

    return;
  }

  if (
    err instanceof
    NotFoundError
  ) {
    res.status(404).json({
      error: err.message,
    });

    return;
  }

  res.status(500).json({
    error:
      "Something went wrong on our end",
  });
}


function handlerUpdateUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      let userId: string;

      try {
        const token = getBearerToken(req);

        userId = validateJWT(
          token,
          config.api.jwtSecret
        );
      } catch {
        throw new UnauthorizedError(
          "Invalid token"
        );
      }

      const parsedBody = JSON.parse(body);

      const hashedPassword = await hashPassword(
        parsedBody.password
      );

      const user = await updateUser(
        userId,
        parsedBody.email,
        hashedPassword
      );

      if (!user) {
        throw new UnauthorizedError(
          "Invalid token"
        );
      }

      const {
        hashedPassword: _,
        ...userResponse
      } = user;

      res.status(200).json(userResponse);
    } catch (error) {
      next(error);
    }
  });
}


async function handlerDeleteChirp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let userId: string;

    try {
      const token = getBearerToken(req);

      userId = validateJWT(
        token,
        config.api.jwtSecret
      );
    } catch {
      throw new UnauthorizedError(
        "Invalid token"
      );
    }

    const chirpId = req.params.chirpId;

    const chirp = await getChirpById(
      chirpId
    );

    if (!chirp) {
      throw new NotFoundError(
        "Chirp not found"
      );
    }

    if (chirp.userId !== userId) {
      throw new ForbiddenError(
        "You cannot delete this chirp"
      );
    }

    await deleteChirp(chirpId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}


function handlerPolkaWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const parsedBody = JSON.parse(body);

      if (parsedBody.event !== "user.upgraded") {
        res.status(204).send();
        return;
      }

      const user = await upgradeUserToChirpyRed(
        parsedBody.data.userId
      );

      if (!user) {
        throw new NotFoundError(
          "User not found"
        );
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });
}
