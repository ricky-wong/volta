const Discord = require('discord.js');
const RequestPromise = require('request-promise');
const cheerio = require('cheerio');
const config = require('config');

type Charger = {
  channelId: string;
  voltaId: string;
  isAvailable: boolean;
};

let chargersToCheck = [...config.get('chargersToCheck').map(c => Object.assign({}, c, { isAvailable: undefined }))];

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
  return client.channels
    .filter(channel => channel.name === channelId)
    .forEach(channel => {
      if (count) {
        channel.send(
          count +
            ` EV charger${
              count > 1 ? 's are' : ' is'
            } now available. Double-check with the Volta app before you rush to grab it. <:TFTI:537689355553079306>`
        );
      } else {
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

  return client.channels
    .filter(channel => channel.name === channelId)
    .forEach(channel => {
      channel
        .setTopic(`${nowString}: ${count}`)
        .then(updated => console.log(`Updated topic in ${updated.guild.name}/#${channelId}: ${updated.topic}`))
        .catch(error => console.error('Failed to update ' + channelId, error));
    });
}

function poll() {
  console.log('--> Retrieving data...');
  return RequestPromise({
    uri: 'https://api.voltaapi.com/v1/public-sites',
  })
    .catch(err => {
      console.error('promise catch', err);
    })
    .then(
      body => {
        let publicSites: VoltaApiResponse = [];
        try {
          publicSites = JSON.parse(body || '[]');
        } catch (e) {
          console.error('json parse', body, e);
        }

        chargersToCheck.forEach((chargerToCheck, index) => {
          const site = publicSites.find(publicSite => publicSite.id === chargerToCheck.voltaId);

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
      err => {
        console.error('then onRejected', err);
      }
    );
}

client.on('ready', () => {
  console.log('Connected');
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(client.user.username + ' - (' + client.user.id + ')');
});

client.on('error', console.error);

const DISCORD_BOT_TOKEN = config.get('discordBotToken');
if (!DISCORD_BOT_TOKEN) {
  console.error('Missing discordBotToken config key.');
  process.exit();
}
client.login(DISCORD_BOT_TOKEN).then(poll);
