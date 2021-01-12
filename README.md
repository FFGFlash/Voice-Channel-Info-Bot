# Voice Info Discord Bot
A simple discord bot made to store the data of discord users in text files for software such as OBS Studio.
#### Commissioned by Blaketato#6113
#### Developed by FFGFlash#9510

## Setup
1. Create a discord bot in the [Discord Developer Portal]("https://discord.com/developers/applications").
2. Download the latest executable.
3. Create a ``.env`` file in the same directory as the executable containing the following information
```env
BOT_TOKEN=<bot token>
AUTOSAVE_INTERVAL=<time in seconds>(defaults: 5)
```
4. Add the bot to your discord server using this link ``https://discord.com/api/oauth2/authorize?client_id=<client id>&permissions=76816&scope=bot``
5. Run the executable.

## Usage
1. Join the voice channel you want to get data from.
2. In a text channel type ``~watch``
3. (optional) Set your socials using ``~setSocial <twitch|twitter|youtube|instagram> <name>``
4. All of the data will be exported to ``./Output/<guild id>/User<#>/``
