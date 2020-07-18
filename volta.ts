import * as Discord from 'discord.js';
import * as RequestPromise from 'request-promise';
// Default import with config results in undefined
import * as config from 'config';

type Charger = {
  channelId: string;
  voltaId: string;
  isAvailable: boolean;
};

const configChargersToCheck: Array<Charger> = config.get('chargersToCheck');

const chargersToCheck = configChargersToCheck.map((c) => ({
  ...c,
  isAvailable: false,
}));

type ChargerLevel = {
  level: 'L2';
  available: number;
  total: number;
};

type VoltaPublicSite = {
  id: string;
  name: string;
  chargers: Array<ChargerLevel>;
};

type VoltaApiResponse = Array<VoltaPublicSite>;

// Initialize Discord Bot
const client = new Discord.Client();

function notify(channelId: string, count: number) {
  console.log('notifying');
  return client.channels.cache
    .filter((channel) => {
      // We know this is a TextChannel
      const textChannel = channel as Discord.TextChannel;
      return textChannel.name === channelId;
    })
    .forEach((channel) => {
      if (count) {
        // @ts-ignore `.send` works
        channel.send(
          count +
            ` EV charger${
              count > 1 ? 's are' : ' is'
            } now available. Double-check with the Volta app before you rush to grab it. <:TFTI:537689355553079306>`
        );
      } else {
        // @ts-ignore `.send` works
        channel.send('EV chargers are now all taken <:FeelsBadMan:482325542750650369>');
      }
    });
}

function setTopic(channelId: string, count: number) {
  const currentTime = new Date();
  const nowString = currentTime.toLocaleTimeString([], {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  });

  return client.channels.cache
    .filter((channel) => {
      // We know this is a TextChannel
      const textChannel = channel as Discord.TextChannel;
      return textChannel.name === channelId;
    })
    .forEach((channel) => {
      // We know this is a TextChannel
      const textChannel = channel as Discord.TextChannel;
      textChannel
        .setTopic(`${nowString}: ${count}`)
        .then((updated) => {
          // We know this is a TextChannel
          const updatedTextChannel = updated as Discord.TextChannel;
          console.log(`Updated topic in ${updated.guild.name}/#${channelId}: ${updatedTextChannel.topic}`);
        })
        .catch((error: any) => console.error('Failed to update ' + channelId, error));
    });
}

function poll() {
  console.log('--> Retrieving data...');
  return RequestPromise.get({
    uri: 'https://api.voltaapi.com/v1/public-sites',
  })
    .catch((err: any) => {
      console.error('promise catch', err);
    })
    .then(
      (body: string) => {
        let publicSites: VoltaApiResponse = [];
        try {
          publicSites = JSON.parse(body || '[]');
        } catch (e) {
          console.error('json parse', body, e);
        }

        chargersToCheck.forEach((chargerToCheck, index) => {
          const site = publicSites.find((publicSite) => publicSite.id === chargerToCheck.voltaId);

          if (!site) {
            console.error('cant find site', chargerToCheck.voltaId);
            return;
          }

          const count = site.chargers[0].available;
          if (count > 0) {
            if (chargerToCheck.isAvailable === false) {
              notify(chargerToCheck.channelId, count);
              console.log(
                chargerToCheck.channelId + ` count=${count} isAvailable: ${chargerToCheck.isAvailable}->true`
              );
            }
            chargersToCheck[index].isAvailable = true;
          } else {
            if (chargerToCheck.isAvailable === true) {
              notify(chargerToCheck.channelId, count);
              console.log(
                chargerToCheck.channelId + ` count=${count} isAvailable: ${chargerToCheck.isAvailable}->false`
              );
            }
            chargersToCheck[index].isAvailable = false;
          }
          setTopic(chargerToCheck.channelId, count);
          console.log(count, site.name, chargerToCheck.isAvailable);
        });

        setTimeout(poll, 60 * 1000);
      },
      (err: any) => {
        console.error('then onRejected', err);
      }
    );
}

client.on('ready', () => {
  console.log('Connected');
  console.log(`Logged in as ${client?.user?.tag}!`);
  console.log(client?.user?.username + ' - (' + client?.user?.id + ')');
});

client.on('error', console.error);

const DISCORD_BOT_TOKEN: string = config.get('discordBotToken');
if (!DISCORD_BOT_TOKEN) {
  console.error('Missing discordBotToken config key.');
  process.exit();
}
client.login(DISCORD_BOT_TOKEN).then(poll);
