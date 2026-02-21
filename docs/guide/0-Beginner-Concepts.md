---
layout: guide
title: "🔰 Beginner Concepts"
---

# 🔰 Beginner Concepts

This guide assumes you are aiming for a Stremio setup that is **clean**, **reliable**, and **consistent across devices**. The concepts below explain what each component is doing, why it matters, and why the combination used in this guide tends to work better than a basic "single addon" setup.

## **What is Stremio?**
* Stremio is a media center that unifies **discovery** and **playback** under one interface. You search for a title once, and Stremio can show you the title page (metadata, seasons, episodes) and the available sources (streams) through addons.
* The important part is that Stremio is not "*the content source*". Stremio is the **client**. The actual catalogs, metadata, and streams come from the addons you install.
* Stremio is also **account-based**. Once you configure your setup and then log in on another device, your **addons and library state** are available there too. That is why you typically build the setup once and reuse it everywhere.

## **What platforms does Stremio support?**
* Windows, macOS, Linux, Android (phones/tablets), Android TV and TV boxes, Web (Stremio Web), and iPhone/iPad (currently via sideloading since it's not on the App Store anymore).
* The key point is not just availability. It is that your Stremio account acts as the "anchor" so your setup is portable across devices.

## **How does Stremio work, conceptually?**
* Stremio has three practical layers:
   * **Interface layer**: search, title pages, seasons/episodes, library, continue watching.
   * **Metadata layer**: posters, descriptions, cast, ratings, episode structure.
   * **Streams layer**: actual sources you can select and play.
* The interface is Stremio. The metadata and streams are mostly defined by the addons you choose (e.g. Cinemeta is integrated from the start and is for providing metadata). That is why two people using Stremio can have completely different experiences.

## **What does "synced everywhere" mean in Stremio?**
* Your Stremio account stores your core setup and usage state. When you sign in on another device, you generally inherit:
   * **Installed addons**
   * **Library and watchlist**
   * **Continue watching / progress inside Stremio**
* However, "synced" does not guarantee identical playback behavior. Device/platform constraints can matter, especially for torrent playback on some platforms.

## **What is the addon ecosystem? What do addons actually provide?**
* Addons are the extension mechanism. They can provide one or more of:
   * **Catalogs** (home screen rows and curated lists)
   * **Metadata** (title details, artwork, ratings, episode mapping)
   * **Streams** (playable links for a title)
* A basic setup often mixes these responsibilities without control. A strong setup separates concerns: you use dedicated addons for metadata/catalogs, and dedicated addons for stream aggregation and quality control.

## **What does "an addon instance" mean?**
* An addon is the software. An **instance** is a specific hosted deployment of that addon that Stremio communicates with.
* When you install an addon, you are effectively registering its **instance URL** in your Stremio account. When you browse a title or press play, Stremio queries that instance to retrieve catalogs, metadata, or streams.
* There can be multiple instances of the same addon hosted by different community providers. They are functionally similar but operationally independent:
   * Different uptime and performance
   * Different rate limits and load profiles
   * Different operational policies (maintenance, scaling, etc.)
* Important: configuration is not universal across instances. If an addon supports user configuration, that config is tied to the instance and your saved profile there. Switching instances often means reconfiguring or reinstalling via that instance.

## **Which addon instance should I choose?**
* Pick based on reliability first, then performance. If an instance is unstable, your experience will be unstable regardless of how good your configuration is.
* Use **[this](https://status.stremio-status.com/)** or **[this](https://status.dinsden.top/status/stremio-addons)** link to quickly verify outages and pick alternatives if a popular instance is having issues.
* In this guide, I link solid default instances, but you should treat them as "recommended", not permanent truths.

## **What is torrenting (P2P), and how does Stremio support it?**
* Torrenting is **peer-to-peer distribution**. A file is shared by a swarm of peers, and your client downloads pieces from multiple peers in parallel.
* In Stremio, torrent-based stream addons can return torrent sources. When you select one, playback depends on the availability and health of that swarm.
* The key tradeoff is reliability. Torrent playback quality is determined by peers. If a torrent has weak or unstable swarm health, buffering and failures are expected.
* This is why many setups prioritize cached sources (via debrid) and treat direct P2P as fallback.

## **What is a Debrid service, and why do people use it with Stremio?**
* A debrid service acts as an intermediate layer that can fetch torrents (and often hoster links) on its own infrastructure, then serve the result to you via standard HTTPS streaming.
* The practical benefit is caching. If a file is already cached on the debrid provider, you get fast start times and stable throughput that is not dependent on swarm health.
* In other words: instead of you relying on random peers, you rely on the debrid provider's servers. That usually improves consistency significantly.

## **Real-Debrid: what is it, and why would you pick it?**
* [**Real-Debrid**](http://real-debrid.com/?id=8801126) is one of the most widely used Debrid services and is known for having a very large **cache** (files already on their servers and ready to watch immediately).
* That "*large cache*" part matters because it often means you will find more sources that start instantly without waiting for anything to download first.
* Important limitation: Real-Debrid allows **one connection at a time**. That means you cannot watch simultaneously on two or more devices using the same Real-Debrid key. If you do, you can get warnings and risk a ban if it keeps happening.
* So Real-Debrid is good if you are a **single user** or you know you will not stream in parallel.

## **TorBox: what is it, and why would you pick it?**
* [**TorBox**](https://torbox.app/subscription?referral=6e80077e-c232-4b71-8914-5b87202b9577) is also a Debrid-style service, but it is very practical for **multiple simultaneous streams**.
* Even the basic paid tier supports **multiple parallel connections** (up to **3** in the Essential tier, and Pro tier up to **10** parallel streams).
* That matters if you want to use the same API key across **family members**, **friends**, or even **multiple Stremio accounts** streaming at the same time.
* **Tradeoff**: TorBox may not always have as large an "immediately cached" library as Real-Debrid. If something is not cached yet, you might see sources that require TorBox to fetch it first. In the stream list this shows up as an **hourglass icon**.
* That does not mean it will not work. It means it may need time to download the file first, and the speed depends on available **seeders**, though it is often reasonably fast. If there's enough seeders, it's a matter of seconds or minutes.
* In most cases, TorBox still has plenty of cached options. You only need one good cached source per title.
* Make sure to use my referral code when ordering: ***6e80077e-c232-4b71-8914-5b87202b9577*** to get 7 additional days for each month you buy (only for the first purchase, so I recommend you go big from the start and buy the yearly, it's a better value and you get 84 additional days for free). You can also buy the cheapest tier for a year initially to get the extra 3 months, and if you need a higher tier, you can upgrade along the way, it is possible. You can enter it when choosing the Plan, scroll down to the bottom and there you'll see it.

## **TorBox vs Real-Debrid: how to choose without overthinking it**
* If you are streaming mostly alone and you want the highest chance of "instant play" from a large cache: **Real-Debrid** is often a strong choice.
* If you want the same Debrid key to work safely for **multiple people/screens at the same time**: **TorBox** is usually the more practical and economical choice.
* Both are inexpensive enough that some people treat them like "coverage tools", not an either-or decision.

## **Why use both TorBox and Real-Debrid together?**
* Because they complement each other:
   * TorBox gives you **safe parallel streaming** (family-friendly) as a main provider.
   * Real-Debrid can act as a **backup cache** in case it has a source cached that TorBox does not have immediately.
* This is exactly how I use them: **TorBox as my main**, because my family can stream simultaneously, and **Real-Debrid as a backup**, because of its potentially larger cache.
* Important: if you use Real-Debrid as a backup, remember its **one-connection** rule. Keep it as a fallback, not something multiple people stream from at the same time.

## **How do you actually use both in this setup?**
* In **AIOStreams**, you can add **multiple Debrid services** at the same time.
* That means your stream list can include cached results from both providers, increasing the chance that at least one provider has a fast, stable source available right now.

## **What is Trakt, and why do people connect it to Stremio?**
* Trakt is a watch-state and history platform. It stores what you watched, where you stopped, and can keep progress consistent across devices and apps.
* In Stremio setups, Trakt is mainly used for:
   * **Progress syncing** across devices
   * **Library enrichment** (depending on the addon workflow)
   * **Recommendation-style catalogs** when an addon uses your Trakt data

## **What are scrapers, and why do you need multiple?**
* A scraper is an addon that searches one or more indexes/providers and returns stream candidates for a title.
* No scraper has perfect coverage. They differ by what they index, how they prioritize results, and how reliably they respond.
* Using multiple scrapers increases:
   * **Coverage** (more total candidates)
   * **Quality diversity** (more release groups, encodes, sources)
   * **Resilience** (one scraper can be down without killing your results)

## **What does AIOStreams do, and why is it the center of this setup?**
* AIOStreams is a stream aggregation and normalization layer. It pulls results from multiple scrapers and presents them as a single, consistent stream list.
* More importantly, it lets you control behavior that basic setups lack:
   * **Filtering** (remove junk, enforce language preferences, remove unwanted formats)
   * **Sorting** (cached-first, quality-first, reliability-first, or scoring-based)
   * **Formatting** (make the stream list readable and informative)
* This is how you avoid the classic Stremio problem where the stream list is a noisy mix of inconsistent labels and unreliable ordering.

## **What does AIOMetadata do, and why include it?**
* AIOMetadata is a metadata and catalog layer that gives you more control over what appears in Stremio's browsing experience.
* It can provide alternative metadata sources, richer artwork handling, and additional catalogs (including anime-focused flows depending on configuration).
* In practice: AIOStreams fixes the stream list, AIOMetadata improves the browsing layer and catalog structure.

## **What is Cinemeta, and why do people say AIOMetadata can replace it?**
* Cinemeta is Stremio's default metadata provider and it cannot be removed.
* "Replace" in practice means you keep Cinemeta installed, but you rely primarily on AIOMetadata catalogs/metadata for browsing. Cinemeta becomes the fallback, not the main layer.

## **What does Watchly do, and why is it good in this setup?**
* Watchly focuses on recommendations and discovery. It generates catalogs that feel closer to a personalized "what should I watch next" flow.
* It pairs well with AIOMetadata because it adds recommendation-driven catalogs, while AIOMetadata can cover broader metadata/catalog needs. Watchly also uses the metadata provided by AIOMetadata if the setup in this guide is followed, ensuring consistency throughout addons.

## **What are TMDB, TVDB, and RPDB, and why do they matter here?**
* These are external data sources that addons commonly use:
   * **TMDB**: IDs + metadata backbone for many movie/TV flows
   * **TVDB**: alternative metadata source focused (and recommended) on episode/series
   * **RPDB**: artwork/poster overlays (especially ratings overlays)
* They matter because correct IDs and high-quality metadata are what make catalogs accurate and browsing consistent. RPDB matters mainly for better looking posters with embedded rating context.

## **What is an API key, in plain English?**
* An API key is a credential that lets a service identify you and authorize requests. Many metadata and artwork providers require it to prevent abuse and apply usage limits.

## **What is a Gemini API key, what does it do, and why might it appear in Stremio-related setups?**
* A **Gemini** API key authorizes requests to Google's Gemini models.
* In this ecosystem, it is typically relevant when a tool/addon has AI-assisted features (specifically for AI-powered search through AIOMetadata).


