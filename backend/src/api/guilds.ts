import express, { Request, Response } from "express";
import { AllowedGuilds } from "../data/AllowedGuilds";
import { clientError, ok, serverError, unauthorized } from "./responses";
import { Configs } from "../data/Configs";
import { validateGuildConfig } from "../configValidator";
import yaml, { YAMLException } from "js-yaml";
import { apiTokenAuthHandlers } from "./auth";
import { ApiPermissions } from "@shared/apiPermissions";
import { hasGuildPermission, requireGuildPermission } from "./permissions";
import { ApiPermissionAssignments } from "../data/ApiPermissionAssignments";

import { guildPlugins } from "../plugins/availablePlugins";
import { ZeppelinGuildConfigSchema } from "../types";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import * as tjs from "typescript-json-schema";

// murder me please, i hate this whole thing but it somehow works

// tslint:disable: no-shadowed-variable
function formatConfigToTypeScript(schema, wrapInBraces: boolean = true) {
  if (schema._tag === "InterfaceType" || schema._tag === "PartialType") {
    return (
      (wrapInBraces ? `{\n` : "") +
      Object.entries(schema.props)
        .map(([k, value]) => `${k}?: ${formatConfigToTypeScript(value)}`, 2)
        .join("\n") +
      (wrapInBraces ? "\n}" : "")
    );
  } else if (schema._tag === "DictionaryType") {
    return "{\n" + `[key: string]: ${formatConfigToTypeScript(schema.codomain)}` + "\n}";
  } else if (schema._tag === "ArrayType") {
    return `(${formatConfigToTypeScript(schema.type)})[]`;
  } else if (schema._tag === "UnionType") {
    if (schema.name.startsWith("Nullable<")) {
      return `${formatConfigToTypeScript(schema.types[0])} | null`;
    } else if (schema.name.startsWith("Optional<")) {
      return `${formatConfigToTypeScript(schema.types[0])} | undefined`;
    } else {
      return schema.types.map(t => formatConfigToTypeScript(t)).join(" | ");
    }
  } else if (schema._tag === "IntersectionType") {
    return schema.types.map(t => formatConfigToTypeScript(t)).join(" & ");
  } else {
    return schema.name;
  }
}

const plugins = guildPlugins.map(p => {
  const config = formatConfigToTypeScript(p.configSchema);

  return `${p.name}: {
        config?: ${config},
        overrides?: (Override & {config: ${config}})[],
        replaceDefaultOverrides?: boolean,
      }`;
});

const configSchema = { ...ZeppelinGuildConfigSchema } as any;

delete configSchema.props.plugins;

const topLevel = formatConfigToTypeScript(configSchema, false);

const a = `
type tDelayString = string;
type TRegex = string;
type tColor = number;
type Integer = number;
type tValidTimezone = string;

interface Override {
  level?: string | string[];
  channel?: string | string[];
  category?: string | string[];
  role?: string | string[];
  user?: string | string[];
  any?: Override[];
  all?: Override[];
  not?: Override;
}

type ConfigSchema = {
  ${topLevel}

  plugins: {
    ${plugins.join("\n")},
  },
}
`;

const filename = `/tmp/schema_generator_${Date.now()}.ts`;

let schema: unknown = {};

try {
  writeFileSync(filename, a);
  const program = tjs.getProgramFromFiles([filename], require(resolve("./tsconfig.json")).compilerOptions);

  schema = tjs.generateSchema(program, "ConfigSchema");
} catch (e) {
  // tslint:disable-next-line:no-console
  console.error(e);

  throw new Error(e);
} finally {
  unlinkSync(filename);
}

const apiPermissionAssignments = new ApiPermissionAssignments();

export function initGuildsAPI(app: express.Express) {
  const allowedGuilds = new AllowedGuilds();
  const configs = new Configs();

  const guildRouter = express.Router();
  guildRouter.use(...apiTokenAuthHandlers());

  guildRouter.get("/available", async (req: Request, res: Response) => {
    const guilds = await allowedGuilds.getForApiUser(req.user!.userId);
    res.json(guilds);
  });

  guildRouter.get("/:guildId", async (req: Request, res: Response) => {
    if (!(await hasGuildPermission(req.user!.userId, req.params.guildId, ApiPermissions.ViewGuild))) {
      return unauthorized(res);
    }

    const guild = await allowedGuilds.find(req.params.guildId);
    res.json(guild);
  });

  guildRouter.post("/:guildId/check-permission", async (req: Request, res: Response) => {
    const permission = req.body.permission;
    const hasPermission = await hasGuildPermission(req.user!.userId, req.params.guildId, permission);
    res.json({ result: hasPermission });
  });

  guildRouter.get(
    "/:guildId/config",
    requireGuildPermission(ApiPermissions.ReadConfig),
    async (req: Request, res: Response) => {
      const config = await configs.getActiveByKey(`guild-${req.params.guildId}`);
      res.json({ config: config ? config.config : "", schema });
    },
  );

  guildRouter.post("/:guildId/config", requireGuildPermission(ApiPermissions.EditConfig), async (req, res) => {
    let config = req.body.config;
    if (config == null) return clientError(res, "No config supplied");

    config = config.trim() + "\n"; // Normalize start/end whitespace in the config

    const currentConfig = await configs.getActiveByKey(`guild-${req.params.guildId}`);
    if (currentConfig && config === currentConfig.config) {
      return ok(res);
    }

    // Validate config
    let parsedConfig;
    try {
      parsedConfig = yaml.safeLoad(config);
    } catch (e) {
      if (e instanceof YAMLException) {
        return res.status(400).json({ errors: [e.message] });
      }

      // tslint:disable-next-line:no-console
      console.error("Error when loading YAML: " + e.message);
      return serverError(res, "Server error");
    }

    if (parsedConfig == null) {
      parsedConfig = {};
    }

    const error = await validateGuildConfig(parsedConfig);
    if (error) {
      return res.status(422).json({ errors: [error] });
    }

    await configs.saveNewRevision(`guild-${req.params.guildId}`, config, req.user!.userId);

    ok(res);
  });

  guildRouter.get(
    "/:guildId/permissions",
    requireGuildPermission(ApiPermissions.ManageAccess),
    async (req: Request, res: Response) => {
      const permissions = await apiPermissionAssignments.getByGuildId(req.params.guildId);
      res.json(permissions);
    },
  );

  app.use("/guilds", guildRouter);
}
