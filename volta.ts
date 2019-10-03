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

function poll() {
  console.log('--> Retrieving data...');
  return RequestPromise({
    uri: 'https://api.voltaapi.com/v1/public-sites',
  })
    .catch(err => {
      console.error(err);
    })
    .then(body => {
      try {
        const publicSites: VoltaApiResponse = JSON.parse(body);
      } catch (e) {
        console.error(e);
      }

      chargersToCheck.forEach((chargerToCheck, index) => {
        const site = publicSites.find(publicSite => publicSite.id === chargerToCheck.voltaId);

        if (!site) {
          console.log('cant find site', chargerToCheck.voltaId);
          return;
        }

        const count = site.chargers[0].available;
        if (count > 0) {
          if (chargerToCheck.isAvailable === false) {
            notify(chargerToCheck.channelId, count);
            console.log(chargerToCheck.channelId + ` count=${count} isAvailable: ${chargerToCheck.isAvailable}->true`);
          }
          chargersToCheck[index].isAvailable = true;
        } else {
          if (chargerToCheck.isAvailable === true) {
            notify(chargerToCheck.channelId, count);
            console.log(chargerToCheck.channelId + ` count=${count} isAvailable: ${chargerToCheck.isAvailable}->false`);
          }
          chargersToCheck[index].isAvailable = false;
        }
        console.log(count, site.name, chargerToCheck.isAvailable);
      });

      setTimeout(poll, 60 * 1000);
    });
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
