# News, blog & the AI writer

- **News** (`/news`): the Taiwan travel industry in general terms and Sanpu company news.
- **Travel blog** (`/blog`): guides, food and culture, Sanpu stories.

## AI writer
- Writes in original words only: no copied or closely paraphrased text, no quotes from real people, no invented statistics or dates of real events.
- Picks one **real photograph** from the site's own library (credited on `/credits`); it never generates images.
- Staff: **News & blog** → **Write with AI** (section, optional topic, publish now or draft).
- Bot: every hour it checks `ContentBot.IntervalHours` (24) and writes one news and one blog article; `ContentBot.AutoPublish` publishes at once or keeps drafts; `ContentBot.Enabled` turns it off.
- Uses the same AI keys as AI Travel (Gemini → ChatGPT → Claude).
