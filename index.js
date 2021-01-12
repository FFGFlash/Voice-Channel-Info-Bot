/**
 * @author Drake Taylor
 * @description Voice Info Discord Bot made to store the data of discord users in text files for software such as OBS Studio.
 */

require("dotenv").config();

const Token = process.env.BOT_TOKEN;
const Autosave_Interval = process.env.AUTOSAVE_INTERVAL || 5;

const fs = require("fs");
const request = require("request");

if (!Token) {
  throw new Error("No Token Provided.");
}

const Config = fs.existsSync("./config.json") ? JSON.parse(fs.readFileSync("./config.json", "utf8")) : {
  "Defaults": {
    "Guild": {
      "Prefix": "~",
      "VoiceChannel": null,
      "PriorityList": {}
    },
    "User": {
      "Socials": {}
    }
  },
  "Socials": [
    "twitch",
    "twitter",
    "youtube",
    "instagram"
  ],
  "Guilds": {},
  "Users": {}
};

const Socials = {};

for (let social of Config.Socials) {
  Socials[social] = "";
}

const Discord = require("discord.js");

const Client = new Discord.Client();

const Users = {};
const Commands = {};

function RegisterCommand(name, display, callback, perms = new Discord.Permissions(0), guildOnly = true) {
  Commands[name] = {
    display: display,
    callback: callback,
    perms: perms,
    guildOnly: guildOnly
  };
  return Commands[name];
}

function FastClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function Download(url, path, callback = () => undefined) {
  request.head(url, (err, _res, _body) => {
    if (err) throw err;
    request(url).pipe(fs.createWriteStream(path)).on("close", callback);
  });
}

function sleep(time) {
  return new Promise((resolve, _reject) => {
    setTimeout(() => {
      resolve();
    }, time);
  });
}

function CreateDir(dir) {
  if (fs.existsSync(dir)) {
    return;
  }
  fs.mkdirSync(dir);
}

function getAvatarURLs(user, ...sizes) {
  let avatars = [];

  for (let size of sizes) {
    avatars.push({
      size: size,
      url: user.displayAvatarURL({size: size, dynamic: false, format: "png"})
    });
  }

  return avatars;
}

Client.on("ready", () => {
  console.log(Client);
  console.log(`${Client.user.tag} is online!`);
  Client.user.setPresence({
    status: "dnd",
    activity: {
      name: "Blaketato",
      type: "WATCHING",
      url: "https://twitch.tv/Blaketato"
    }
  });

  CreateDir("./Output");

  let guilds = Array.from(Client.guilds.cache.values());

  for (let guild of guilds) {
    if (guild.available) {
      let config = Config.Guilds[guild.id];
      if (!config) {
        config = Config.Guilds[guild.id] = FastClone(Config.Guilds.Defaults);
      }

      if (config.VoiceChannel) {
        let channel = guild.channels.resolve(config.VoiceChannel);
        if (!channel) continue;

        let members = Array.from(channel.members.values());

        for (let member of members) {
          if (!Users[guild.id]) Users[guild.id] = {};
          Users[guild.id][member.id] = getData(member);
        }
      }
    }
  }

  console.log(Users);

  (async function save() {
    fs.writeFile("./config.json", JSON.stringify(Config, null, 2), "utf8", err => {
      if (err) throw err;
      for (let [guildId, data] of Object.entries(Users)) {
        CreateDir(`./Output/${guildId}`);
        let users = Object.values(data);

        users.sort((a, b) => b.priority - a.priority);

        for (let i in users) {
          let user = users[i];
          CreateDir(`./Output/${guildId}/User${i}`);
          let oldUserData = fs.existsSync(`./Output/${guildId}/User${i}/user.json`) ? fs.readFileSync(`./Output/${guildId}/User${i}/user.json`) : "{}";
          let oldUser = JSON.parse(oldUserData);
          if (oldUserData != JSON.stringify(user)) {
            fs.writeFileSync(`./Output/${guildId}/User${i}/user.json`, JSON.stringify(user, null, 2), "utf8");
          }
          if (!oldUser || user.name != oldUser.name) {
            fs.writeFileSync(`./Output/${guildId}/User${i}/name.txt`, `${user.name}`, "utf8");
          }
          if (!oldUser || user.discord != oldUser.discord) {
            fs.writeFileSync(`./Output/${guildId}/User${i}/discord.txt`, `${user.discord}`, "utf8");
          }
          if (user.socials) {
            for (let [platform, name] of Object.entries(user.socials)) {
              if (!oldUser || !oldUser.socials || user.socials[platform] != oldUser.socials[platform]) {
                fs.writeFileSync(`./Output/${guildId}/User${i}/${platform}.txt`, `${name}`, "utf8");
              }
            }
          }
          if (!oldUser || JSON.stringify(user.avatarURLs) != JSON.stringify(oldUser.avatarURLs)) {
            for (let avatar of user.avatarURLs) {
              Download(avatar.url, `./Output/${guildId}/User${i}/${avatar.size}.png`);
            }
          }
        }
      }
      setTimeout(save, 1000 * Autosave_Interval);
    });
  })();
});

Client.on("guildCreate", async guild => {
  if (!Config.Guilds[guild.id]) {
    Config.Guilds[guild.id] = FastClone(Config.Defaults.Guild);
  }
});

Client.on("guildDelete", async guild => {
  if (Config.Guilds[guild.id]) {
    delete Config.Guilds[guild.id];
  }
});

function getData(member) {
  let guildConfig = Config.Guilds[member.guild.id];
  let userConfig = Config.Users[member.user.id];

  let socials = FastClone(Socials);
  if (userConfig && userConfig.Socials) {
    for (let [platform, name] of Object.entries(userConfig.Socials)) {
      socials[platform] = name;
    }
  }

  return {
    id: member.id,
    priority: guildConfig.PriorityList[member.id] || 0,
    discord: member.user.tag,
    socials: socials,
    name: member.nickname || member.user.username,
    avatarURLs: getAvatarURLs(member.user, 512)
  };
}

function updateUsers(guild) {
  let config = Config.Guilds[guild.id];
  let channel = guild.channels.resolve(config.VoiceChannel);
  let members = Array.from(channel.members.values());

  Users[guild.id] = {};

  for (let member of members) {
    Users[guild.id][member.id] = getData(member);
  }
}

Client.on("voiceStateUpdate", async (oldState, newState) => {
  let config = Config.Guilds[newState.guild.id];
  if (!config.VoiceChannel) return;
  let member = (newState || oldState).member;
  let guild = member.guild;
  if (!Users[guild.id]) Users[guild.id] = {};
  if (!oldState.channel && newState.channel) { // Joined Channel
    if (config.VoiceChannel != newState.channelID) return;
    Users[guild.id][member.id] = getData(member);
  } else if (!newState.channel) { // Left Channel
    if (config.VoiceChannel != oldState.channelID) return;
    delete Users[guild.id][member.id]
  } else if (oldState.channelID != newState.channelID) { // Changed Channel
    if (config.VoiceChannel == newState.channelID) {
      Users[guild.id][member.id] = getData(member);
    } else {
      delete Users[guild.id][member.id]
    }
  }

  console.log(Users);
});

Client.on("guildMemberUpdate", async (oldMember, newMember) => {
  let member = (oldMember || newMember);
  if (!Users[member.guild.id] || !Users[member.guild.id][member.id]) return;
  let oldName = (oldMember.nickname || oldMember.user.username);
  let newName = (newMember.nickname || newMember.user.username);
  if (oldMember.tag == newMember.tag && oldName == newName) return;

  if (oldName != newName) Users[member.guild.id][member.id].name = newName;
  if (oldMember.tag != newMember.tag) Users[member.guild.id][member.id].discord = newMember.tag;

  console.log(Users);
});

RegisterCommand("help", {
  description: "Displays the complete list of commands",
  arguments: ""
}, (msg) => {
  let config = msg.guild ? Config.Guilds[msg.guild.id] : Config.Defaults;

  let embed = new Discord.MessageEmbed({
    color: 8322935,
    timestamp: new Date()
  });

  embed.setTitle(`--=== Help ===--`);
  embed.setDescription(`Complete list of commands.`);

  for (let [command, {display}] of Object.entries(Commands)) {
    embed.addField(`${config.Prefix}${command} ${display.arguments}`, display.description);
  }

  msg.reply(embed);
});

RegisterCommand("info", {
  description: "Displays the info about this bot.",
  arguments: ""
}, (msg) => {
  let embed = new Discord.MessageEmbed({
    color: 8322935,
    timestamp: new Date()
  });

  embed.setTitle("--=== Info ===--");
  embed.setDescription("This discord bot allows for the host to store the information of users within a given voice channel for use in software such as OBS Studio.");
  embed.addField("Commissioned By", "Blaketato#6113", true);
  embed.addField("Developed By", "FFGFlash#9510");

  msg.reply(embed);
});

RegisterCommand("watch", {
  description: "Watch the Provided Voice Channel.",
  arguments: "[channel id]"
}, (msg, cid) => {
  if (!cid) {
    if (!msg.member.voice.channel) return msg.reply("Either Provide a VoiceChannelId or use this while in Voice Channel.");
    cid = msg.member.voice.channelID;
  }

  let channel = msg.guild.channels.resolve(cid);
  if (!channel) return msg.reply("Couldn't find a channel with the provided id.");
  if (!channel.type == "voice") return msg.reply("The provided channel isn't a voice channel.");

  Config.Guilds[msg.guild.id].VoiceChannel = cid;

  updateUsers(msg.guild);
  console.log(Users);

  return msg.reply("Voice Channel Updated.");
}, new Discord.Permissions(Discord.Permissions.FLAGS.ADMINISTRATOR));

RegisterCommand("setpriority", {
  description: "Set a member's priority level.",
  arguments: "<member id> <priority>"
}, (msg, mid, priority) => {
  if (!mid) return msg.reply("Please provide a valid MemberId.");

  let found_member = msg.guild.members.resolve(mid);
  if (!found_member) return msg.reply("Couldn't find a member with the provided id.");

  if (!priority || isNaN(priority)) return msg.reply("Please provide a valid priority.");

  Config.Guilds[msg.guild.id].PriorityList[found_member.id] = parseInt(priority);
  return msg.reply("Updated Priority List.");
}, new Discord.Permissions(Discord.Permissions.FLAGS.ADMINISTRATOR));

RegisterCommand("setprefix", {
  description: "Change the prefix for this guild.",
  arguments: "<prefix>"
}, (msg, prefix) => {
  if (!prefix) return msg.reply("Please provide a valid Prefix.");

  Config.Guilds[msg.guild.id].Prefix = prefix;
  return msg.reply("Update Prefix.");
}, new Discord.Permissions(Discord.Permissions.FLAGS.ADMINISTRATOR));

RegisterCommand("setsocial", {
  description: "Set your social media names.",
  arguments: `<${Object.keys(Socials).join("|")}> <name>`
}, (msg, platform, ...name) => {
  name = name.join(" ");
  if (!platform) return msg.reply("Please provide a valid Platform.");
  if (!name) return msg.reply("Please provide a valid Name");
  if (Object.keys(Socials).indexOf(platform) == -1) return msg.reply("Invalid Platform provided.");
  let user = msg.author;
  if (!Config.Users[user.id]) Config.Users[user.id] = FastClone(Config.Defaults.User);

  Config.Users[user.id].Socials[platform] = name;
  return msg.reply("Socials Updated.");
}, new Discord.Permissions(0), false);

Client.on("message", async msg => {
  let isBot = msg.author.bot;
  if (isBot) return;

  let inGuild = msg.guild != undefined;

  let config = inGuild ? Config.Guilds[msg.guild.id] : Config.Defaults;

  let content = msg.content;
  if (!content.startsWith(config.Prefix)) return;

  let args = content.split(" ");
  let cmdName = args.shift().substr(config.Prefix.length).toLowerCase();

  let command = Commands[cmdName];

  let member = msg.member;

  msg.delete();

  let output = (() => {
    if (!command) return msg.reply(`Command not found, try ${config.Prefix}help`);
    if (command.guildOnly && !inGuild) return msg.reply("This command can only be used in a guild text channel.");
    if (!member.hasPermission(command.perms)) return msg.reply("You don't have permission to run this command.");

    return command.callback(msg, ...args);
  })();

  if (output) {
    output.then(msg => {
      sleep(5000).then(() => msg.delete());
    });
  }
});

Client.login(Token);
