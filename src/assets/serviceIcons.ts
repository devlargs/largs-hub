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
import googlechat from "./images/googlechat.svg";
import todo from "./images/todo.svg";
import { builtInIconForName } from "../lib/iconEdit";

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
  "googlechat.svg": googlechat,
  "todo.svg": todo,
  // Pre-rename filename, still stored against existing services
  "pomodoro.svg": todo,
};

export function resolveIcon(icon: string, name: string): string | undefined {
  if (icon.startsWith("custom:")) {
    const fileName = icon.slice(7);
    return `custom-icon://${encodeURIComponent(fileName)}`;
  }
  // Stored icons that aren't a built-in file (older emoji icons, or none after
  // a custom icon was removed) fall back to the built-in icon for the name.
  return serviceIcons[icon] || serviceIcons[builtInIconForName(name)];
}

export default serviceIcons;
