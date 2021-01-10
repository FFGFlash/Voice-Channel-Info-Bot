require("dotenv").config();

const Token = process.env.BOT_TOKEN;
const Autosave_Interval = process.env.AUTOSAVE_INTERVAL || 5;
const Bot_Owners = process.env.BOT_OWNERS ? process.env.BOT_OWNERS.split(",") : [];

const fs = require("fs");
const request = require("request");

if (!Token) {
  throw new Error("No Token Provided.");
}

const Config = require("./config.json");

const Discord = require("discord.js");

const Client = new Discord.Client();

const Users = {};

function FastClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function Download(url, path, callback = () => undefined) {
  request.head(url, (err, _res, _body) => {
    if (err) throw err;
    request(url).pipe(fs.createWriteStream(path)).on("close", callback);
  });
}

function Clone(obj) {
  let _obj = {};
  for (let [key, value] in Object.entries(obj)) {
    if (typeof value == "object") {
      value = Clone(value);
    }
    _obj[key] = value;
  }
  return _obj;
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

Client.on("ready", async () => {
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

  (async function save() {
    fs.writeFile("./config.json", JSON.stringify(Config, null, 2), "utf8", err => {
      if (err) throw err;
      for (let [guildId, data] of Object.entries(Users)) {
        CreateDir(`./Output/${guildId}`);
        let users = Object.values(data);

        users.sort((a, b) => a.priority - b.priority);

        for (let i in users) {
          let user = users[i];
          CreateDir(`./Output/${guildId}/User${i}`);
          let oldUser = fs.existsSync(`./Output/${guildId}/User${i}/user.json`) ? JSON.parse(fs.readFileSync(`./Output/${guildId}/User${i}/user.json`)) : undefined;
          fs.writeFileSync(`./Output/${guildId}/User${i}/user.json`, JSON.stringify(user, null, 2), "utf8");
          if (!oldUser || user.name != oldUser.name) {
            fs.writeFileSync(`./Output/${guildId}/User${i}/name.txt`, `${user.name}`, "utf8");
          }
          if (!oldUser || user.discord != oldUser.discord) {
            fs.writeFileSync(`./Output/${guildId}/User${i}/discord.txt`, `${user.discord}`, "utf8");
          }
          if (!oldUser || user.avatarURLs != oldUser.avatarURLs) {
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
    Config.Guilds[guild.id] = FastClone(Config.Defaults);
  }
});

Client.on("guildDelete", async guild => {
  if (Config.Guilds[guild.id]) {
    delete Config.Guilds[guild.id];
  }
});

function getData(member) {
  let config = Config.Guilds[member.guild.id];
  return {
    id: member.id,
    priority: config.PriorityList[member.id] || 0,
    discord: member.user.tag,
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

Client.on("message", async msg => {
  let isBot = msg.author.bot;
  if (isBot) return;

  let inGuild = msg.guild != undefined;

  let config = inGuild ? Config.Guilds[msg.guild.id] : Config.Defaults;

  let content = msg.content;
  if (!content.startsWith(config.Prefix)) return;

  let args = content.split(" ");
  let command = args.shift().substr(config.Prefix.length);

  if (command == "watch") {
    if (!inGuild) return msg.reply("This command can only be used in a guild text channel.");
    let cid = args[0];
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

    msg.reply("Voice Channel Updated.");
  } else if (command == "setpriority") {
    if (!inGuild) return msg.reply("This command can only be used in a guild text channel.");
    let mid = args[0];
    if (!mid) return msg.reply("Please provide a valid MemberId.");

    let member = msg.guild.members.resolve(mid);
    if (!member) return msg.reply("Couldn't find a member with the provided id.");

    let priority = args[1];
    if (!priority || isNaN(priority)) return msg.reply("Please provide a valid priority.");

    Config.Guilds[msg.guild.id].PriorityList[member.id] = parseInt(priority);
    msg.reply("Updated Priority List.");
  } else if (command == "setprefix") {
    if (!inGuild) return msg.reply("This command can only be used in a guild text channel.");
    let prefix = args[0];
    if (!prefix) return msg.reply("Please provide a valid Prefix.");

    Config.Guilds[msg.guild.id].Prefix = prefix;
    msg.reply("Update Prefix.");
  }
});

Client.login(Token);
