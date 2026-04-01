import gmail from "./images/gmail.png";
import slack from "./images/slack.png";
import discord from "./images/discord.png";
import whatsapp from "./images/whatsapp.png";
import telegram from "./images/telegram.png";
import notion from "./images/notion.png";
import x from "./images/x.png";
import reddit from "./images/reddit.png";
import linkedin from "./images/linkedin.png";
import messenger from "./images/messenger.png";

const serviceIcons: Record<string, string> = {
  "gmail.png": gmail,
  "slack.png": slack,
  "discord.png": discord,
  "whatsapp.png": whatsapp,
  "telegram.png": telegram,
  "notion.png": notion,
  "x.png": x,
  "reddit.png": reddit,
  "linkedin.png": linkedin,
  "messenger.png": messenger,
};

// Map service names to icons so older stored services (with emoji icons) still resolve
const serviceIconsByName: Record<string, string> = {
  gmail: gmail,
  slack: slack,
  discord: discord,
  whatsapp: whatsapp,
  telegram: telegram,
  notion: notion,
  "twitter / x": x,
  reddit: reddit,
  linkedin: linkedin,
  messenger: messenger,
};

export function resolveIcon(icon: string, name: string): string | undefined {
  if (icon.startsWith("custom:")) {
    const fileName = icon.slice(7);
    return `custom-icon://${encodeURIComponent(fileName)}`;
  }
  return serviceIcons[icon] || serviceIconsByName[name.toLowerCase()];
}

export default serviceIcons;
