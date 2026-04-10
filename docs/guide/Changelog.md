---
layout: guide
title: "📜 Changelog"
---

# Changelog

## 2.0.3 (2026-04-06)

- Added **HD Hub** addon for additional HTTP streams.
- Added automatic exclusion of **P2P** stream type if Debrid or only HTTP selected.
- Disabled **Statistics** which were apparently active automatically if not set.
- [AIOMetadata] Enabled **Hide Watched Trakt/MDBList** option to avoid showing already watched content on lists.

## 2.0.2 (2026-04-06)

- Enabled **Digital Release** and strict **Matching** filters again to avoid mixed results from others shows to be included.

## 2.0.1 (2026-04-03)

- Disabled **Service Wrap** since it may cause some issues with the stream results.
- Fixed **Colorful Formatter** to show subtitle languages also with flags.
- Replaced **SubHero** with **OpenSubtitles V3 Pro** because it was down very often.

## 2.0.0 (2026-03-31)

- **Initial changelog-tracked release.** A lot of changes have been happening since posting the guide for the first time on Reddit, and I never expected it to become so popular. I didn't even plan on expanding and improving it this far, it just happened. But since I haven't kept track of everything until now, this is going to be a fresh start. Everyone that used the guide until now, it might be a good idea to re-import the AIOStreams template one more time over your configuration to get the latest changes. If you made modifications after you used the template before, make sure to check and reapply them in case re-importing this template overrides them. Even better, if you totally want to start fresh and make sure there's no conflicts with your current configuration, import the template on an empty AIOStreams environment and create a new **UUID** and **Password**.