import express from "express";
import { Request, Response, NextFunction } from "express";
import postgres from "postgres";
import {
  createChirp,
  getAllChirps,
  getChirpById,
} from "./db/queries/chirps.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  createUser,
  deleteAllUsers,
  getUserByEmail,
} from "./db/queries/users.js";
import {
  hashPassword,
  checkPasswordHash,
} from "./auth.js";

import { config } from "./config.js";
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "./errors.js";

// Run database migrations automatically
const migrationClient = postgres(config.db.url, { max: 1 });

await migrate(
  drizzle(migrationClient),
  config.db.migrationConfig
);

const app = express();

// Middleware
app.use(middlewareLogResponses);

// API routes
app.get("/api/healthz", handlerReadiness);
app.get("/api/chirps/:chirpId", handlerGetChirpById);
app.post("/api/login", handlerLogin);
app.post("/api/chirps", handlerCreateChirp);
app.get("/api/chirps", handlerGetAllChirps);
app.post("/api/users", handlerCreateUser);
// Admin routes
app.get("/admin/metrics", handlerMetrics);
app.post("/admin/reset", handlerReset);

// Static files
app.use(
  "/app",
  middlewareMetricsInc,
  express.static("./src/app")
);

// Error handler
app.use(errorHandler);

// Start server
app.listen(config.api.port, () => {
  console.log(
    `Server is running at http://localhost:${config.api.port}`
  );
});

function handlerReadiness(
  req: Request,
  res: Response
): void {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("OK");
}

function middlewareLogResponses(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`
      );
    }
  });

  next();
}

function middlewareMetricsInc(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  config.api.fileserverHits++;
  next();
}

function handlerMetrics(
  req: Request,
  res: Response
): void {
  res.set("Content-Type", "text/html; charset=utf-8");

  res.send(`
<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.api.fileserverHits} times!</p>
  </body>
</html>
  `);
}

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

    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send("Hits reset to 0");
  } catch (error) {
    next(error);
  }
}

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
      const parsedBody = JSON.parse(body);

      if (parsedBody.body.length > 140) {
        throw new BadRequestError(
          "Chirp is too long. Max length is 140"
        );
      }

      const profaneWords = [
        "kerfuffle",
        "sharbert",
        "fornax",
      ];

      const words = parsedBody.body.split(" ");

      const cleanedWords = words.map((word: string) => {
        if (profaneWords.includes(word.toLowerCase())) {
          return "****";
        }

        return word;
      });

      const cleanedBody = cleanedWords.join(" ");

      const chirp = await createChirp({
        body: cleanedBody,
        userId: parsedBody.userId,
      });

      res.status(201).json(chirp);
    } catch (error) {
      next(error);
    }
  });
}

 

function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.log(err);

  if (err instanceof BadRequestError) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof UnauthorizedError) {
    res.status(401).json({ error: err.message });
    return;
  }

  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  res.status(500).json({
    error: "Something went wrong on our end",
  });
}


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

      const hashedPassword = await hashPassword(
        parsedBody.password
      );

      const user = await createUser({
        email: parsedBody.email,
        hashedPassword: hashedPassword,
      });

      if (!user) {
        throw new Error("Could not create user");
      }

      const {
        hashedPassword: _,
        ...userResponse
      } = user;

      res.status(201).json(userResponse);
    } catch (error) {
      next(error);
    }
  });
}
 


async function handlerGetAllChirps(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const chirps = await getAllChirps();

    res.status(200).json(chirps);
  } catch (error) {
    next(error);
  }
}


async function handlerGetChirpById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const chirpId = req.params.chirpId;

    const chirp = await getChirpById(chirpId);

    if (!chirp) {
      throw new NotFoundError("Chirp not found");
    }

    res.status(200).json(chirp);
  } catch (error) {
    next(error);
  }
}



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

      const user = await getUserByEmail(parsedBody.email);

      if (!user) {
        throw new UnauthorizedError(
          "incorrect email or password"
        );
      }

      const passwordMatches = await checkPasswordHash(
        parsedBody.password,
        user.hashedPassword
      );

      if (!passwordMatches) {
        throw new UnauthorizedError(
          "incorrect email or password"
        );
      }

      const {
        hashedPassword: _,
        ...userResponse
      } = user;

      res.status(200).json(userResponse);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        next(error);
        return;
      }

      next(
        new UnauthorizedError(
          "incorrect email or password"
        )
      );
    }
  });
}
