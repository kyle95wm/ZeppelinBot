import { Snowflake } from "discord.js";
import * as t from "io-ts";
import { GuildPluginData } from "knub";
import { canActOn } from "../../../pluginUtils";
import { renderTemplate, TemplateSafeValueContainer } from "../../../templateFormatter";
import { resolveMember } from "../../../utils";
import { ActionError } from "../ActionError";
import { CustomEventsPluginType, TCustomEvent } from "../types";

export const AddRoleAction = t.type({
  type: t.literal("add_role"),
  target: t.string,
  role: t.union([t.string, t.array(t.string)]),
});
export type TAddRoleAction = t.TypeOf<typeof AddRoleAction>;

export async function addRoleAction(
  pluginData: GuildPluginData<CustomEventsPluginType>,
  action: TAddRoleAction,
  values: TemplateSafeValueContainer,
  event: TCustomEvent,
  eventData: any,
) {
  const targetId = await renderTemplate(action.target, values, false);
  const target = await resolveMember(pluginData.client, pluginData.guild, targetId);
  if (!target) throw new ActionError(`Unknown target member: ${targetId}`);

  if (event.trigger.type === "command" && !canActOn(pluginData, eventData.msg.member, target)) {
    throw new ActionError("Missing permissions");
  }
  const rolesToAdd = (Array.isArray(action.role) ? action.role : [action.role]).filter(
    id => !target.roles.cache.has(id),
  );
  if (rolesToAdd.length === 0) {
    throw new ActionError("Target already has the role(s) specified");
  }
  await target.roles.add(rolesToAdd);
}
