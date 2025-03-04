import { GuildMember, Snowflake } from "discord.js";
import { EventEmitter } from "events";
import { GuildArchives } from "../../data/GuildArchives";
import { GuildCases } from "../../data/GuildCases";
import { GuildLogs } from "../../data/GuildLogs";
import { GuildMutes } from "../../data/GuildMutes";
import { mapToPublicFn } from "../../pluginUtils";
import { CasesPlugin } from "../Cases/CasesPlugin";
import { LogsPlugin } from "../Logs/LogsPlugin";
import { zeppelinGuildPlugin } from "../ZeppelinPluginBlueprint";
import { ClearBannedMutesCmd } from "./commands/ClearBannedMutesCmd";
import { ClearMutesCmd } from "./commands/ClearMutesCmd";
import { ClearMutesWithoutRoleCmd } from "./commands/ClearMutesWithoutRoleCmd";
import { MutesCmd } from "./commands/MutesCmd";
import { ClearActiveMuteOnMemberBanEvt } from "./events/ClearActiveMuteOnMemberBanEvt";
import { ClearActiveMuteOnRoleRemovalEvt } from "./events/ClearActiveMuteOnRoleRemovalEvt";
import { ReapplyActiveMuteOnJoinEvt } from "./events/ReapplyActiveMuteOnJoinEvt";
import { muteUser } from "./functions/muteUser";
import { offMutesEvent } from "./functions/offMutesEvent";
import { onMutesEvent } from "./functions/onMutesEvent";
import { unmuteUser } from "./functions/unmuteUser";
import { ConfigSchema, MutesPluginType } from "./types";
import { onGuildEvent } from "../../data/GuildEvents";
import { clearMute } from "./functions/clearMute";

const defaultOptions = {
  config: {
    mute_role: null,
    move_to_voice_channel: null,
    kick_from_voice_channel: false,

    dm_on_mute: false,
    dm_on_update: false,
    message_on_mute: false,
    message_on_update: false,
    message_channel: null,
    mute_message: "You have been muted on the {guildName} server. Reason given: {reason}",
    timed_mute_message: "You have been muted on the {guildName} server for {time}. Reason given: {reason}",
    update_mute_message: "Your mute on the {guildName} server has been updated to {time}.",
    remove_roles_on_mute: false,
    restore_roles_on_mute: false,

    can_view_list: false,
    can_cleanup: false,
  },
  overrides: [
    {
      level: ">=50",
      config: {
        can_view_list: true,
      },
    },
    {
      level: ">=100",
      config: {
        can_cleanup: true,
      },
    },
  ],
};

const EXPIRED_MUTE_CHECK_INTERVAL = 60 * 1000;

export const MutesPlugin = zeppelinGuildPlugin<MutesPluginType>()({
  name: "mutes",
  showInDocs: true,
  info: {
    prettyName: "Mutes",
  },

  configSchema: ConfigSchema,
  dependencies: () => [CasesPlugin, LogsPlugin],
  defaultOptions,

  // prettier-ignore
  commands: [
    MutesCmd,
    ClearBannedMutesCmd,
    ClearMutesWithoutRoleCmd,
    ClearMutesCmd,
  ],

  // prettier-ignore
  events: [
    // ClearActiveMuteOnRoleRemovalEvt, // FIXME: Temporarily disabled for performance
    ClearActiveMuteOnMemberBanEvt,
    ReapplyActiveMuteOnJoinEvt,
  ],

  public: {
    muteUser: mapToPublicFn(muteUser),
    unmuteUser: mapToPublicFn(unmuteUser),
    hasMutedRole(pluginData) {
      return (member: GuildMember) => {
        const muteRole = pluginData.config.get().mute_role;
        return muteRole ? member.roles.cache.has(muteRole as Snowflake) : false;
      };
    },

    on: mapToPublicFn(onMutesEvent),
    off: mapToPublicFn(offMutesEvent),
    getEventEmitter(pluginData) {
      return () => pluginData.state.events;
    },
  },

  beforeLoad(pluginData) {
    pluginData.state.mutes = GuildMutes.getGuildInstance(pluginData.guild.id);
    pluginData.state.cases = GuildCases.getGuildInstance(pluginData.guild.id);
    pluginData.state.serverLogs = new GuildLogs(pluginData.guild.id);
    pluginData.state.archives = GuildArchives.getGuildInstance(pluginData.guild.id);

    pluginData.state.events = new EventEmitter();
  },

  afterLoad(pluginData) {
    pluginData.state.unregisterGuildEventListener = onGuildEvent(pluginData.guild.id, "expiredMute", mute =>
      clearMute(pluginData, mute),
    );
  },

  beforeUnload(pluginData) {
    pluginData.state.unregisterGuildEventListener?.();
    pluginData.state.events.removeAllListeners();
  },
});
