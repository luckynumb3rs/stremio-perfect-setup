---
layout: guide
title: "🛠️ Additional Stuff"
---

# 🛠️ Additional Stuff

Most of the tips to address some issues are already included between the steps of the guide, but I am adding this section for any additional tweaks, explanations, or alternative configurations:


## Smart Stream Selection & Sorting

The **AIOStreams** template you used from this guide includes multiple optimizations highly recommended by the Stremio community to intelligently filter, score, and prioritize streams for a cleaner, easier, and more reliable viewing experience.

* The template includes a best practice filtering system called [**TamTaro's SELs**](https://github.com/Tam-Taro/SEL-Filtering-and-Sorting). This system intelligently scores available streams based on multiple quality factors such as resolution, reliability, cache status, release details, and more. It does not just sort the list, it actively filters out weaker results and surfaces only the strongest candidates. The result is a cleaner, more curated selection of streams, helping you avoid decision fatigue and quickly choose a high quality option with confidence.

* The template also integrates trusted pattern rules like [**Vidhin's Regexes**](https://github.com/Vidhin05/Releases-Regex), which analyze stream titles and detect important indicators such as reputable release groups, quality tags, and encoding formats. By accurately identifying these details, the system can better label, prioritize, or exclude certain streams. In simple terms, regex helps the system understand what each stream actually is before any scoring takes place.

* **Together**, these two systems work hand in hand. Regex identifies meaningful quality signals inside stream names, and SEL uses those signals, along with other factors, to score, filter, and rank the results. The combination creates a smarter, cleaner, and more reliable stream selection experience.

* **However**, if you are not satisfied with the results because you want more to choose from, or you feel they are malfunctioning somehow, you can remove them all by going to **Filters** in **AIOStreams**, then both in **Stream Expression** and **Regex** respectively, and delete all entries configured there (with the red *trash can* button to the right).

* Finally, the **Sorting** in the template is configured to show the streams in the following order by default:

   * *Cached/Uncached (if applicable)*
   * *SeaDex (for Anime)*
   * *Resolution*
   * *Quality*
   * *Stream Expressions*
   * *Stream Expressions Score*
   * *Seeders (if Uncached/P2P)*
   * *Language*
   * *Bitrate*

* When you load the **AIOStreams** template provided in this guide, you have the option to prioritize **Language** and **Seeders** if needed according to your preferences.

* **However**, if you want to fine-tune the **Sorting** order yourself, in **AIOStreams** go to **Sorting**, make sure you're on the **Global** tab, then in the **Split by Cache** section, arrange the order for the **Cached Streams** and **Uncached Streams** lists.


## Understanding Stream Information View

The formatting templates are designed to let you evaluate a stream easily before opening it. If you want to understand what all the icons on the stream information mean, here is how to read them:

**Main Line**
* ⚡ / ⏳ → [Debrid] Cached (instant playback) / Not Cached (may take longer)
* 🧲 / 🌐 / 📺 → Torrent (P2P) / Direct HTTP / Live Stream
* ▶️ / 🗄️ / ↗️ / 📊 / ℹ️ / ⛔ → YouTube / Archive / External / Statistics / Information / Error
* **UHD ⁴ᴷ / QHD ²ᴷ / FHD / 720P** → Resolution
* ⌜**QUALITY**⌟ → Source Quality (Remux, WEB, BluRay, etc.)
* ◆◆⬖◇◇ → Release Quality Score (based on [**Vidhin's Ranked Regexes**](https://github.com/Vidhin05/Releases-Regex), sorted after *Quality & Resolution*)

**Technical Details**
* ▶︎ / 🎬 → Edition (Director’s Cut, Extended, IMAX…)
* ▣ / 🎞️ → Video Encoding (x264, x265, HEVC…)
* ✦ / 🎥 → Visual Features (HDR, Dolby Vision, 10-bit…)
* ♬ / 🎵 → Audio Format (DTS, Atmos, TrueHD…)
* ☊ / 🎧 → Audio Channels (5.1, 7.1…)

**File & Availability**
* ◧ / 📦 or ⧉ / 🗃️ → Single File / Season Pack
* **Size** · **Bitrateᴹᵇᵖˢ** → File Size & Density (helps estimate quality vs bandwidth needs)
* ⟳ / 🕒 → Upload Age (newer is often better seeded)

**Provider & Delivery**
* ⛊ / ⛉ or 🛡️ / 🛠️ **[Provider] Addon** → Debrid Service (if applicable) & Scraper (proxied or unproxied)
* **TYPE** → Stream Type (P2P/HTTP/LIVE/USENET/NNTP/YOUTUBE/ARCHIVE/EXTERNAL/STATISTIC/INFO/ERROR)
* ⇋ **Seeders** 𖧧 / 🌱 → Number of seeders for torrents (higher = more reliable)

**Languages**
* ⚐ / 🔊 → Available Audio Languages

**Anime Curated Releases** (if applicable)
* » → SeaDex Indexed Release
* **[BEST]** → Highest-ranked Release
* **[ALT BEST]** → Strong Alternative (if the best fails)

**Additional**
* 🛈 / ℹ️ **MESSAGE** → Additional Informational Messages

👉 **Quick Tip:**
Prioritize streams that are ⚡ **cached**, high resolution, strong score (◆), and reasonably sized. This usually gives the fastest start and best quality. If on P2P configuration, prioritize streams with high number of seeders.


## Alternative Stream Information Icons

If you went with the ***Flat Monochrome Icons*** for the formatter and want instead more ***Colorful Icons*** on the stream information view, you can go to the **Formatter** tab in **AIOStreams**, and replace the text in the **Description Template** with this:

```
{stream.editions::exists["🎬  {stream.editions} "||""]}
{stream.encode::exists["🎞️  {stream.encode}  "||""]}{stream.visualTags::exists["🎥  {stream.visualTags::join(' · ')}  "||""]}
{stream.audioTags::exists["🎵  {stream.audioTags::join(' · ')}  "||""]}{stream.audioChannels::exists["🎧  {stream.audioChannels::join(' · ')} "||""]}
{stream.size::>0::and::stream.seasonPack::istrue["🗃️  "||""]}{stream.size::>0::and::stream.seasonPack::isfalse["📦  "||""]}{stream.size::>0["{stream.size::sbytes}"||""]}{stream.bitrate::exists[" · {stream.bitrate::sbitrate::replace('Mbps','ᴹᵇᵖˢ')::replace('Kbps','ᴷᵇᵖˢ')}  "||""]}{stream.message::~Download["{tools.removeLine}"||""]}{stream.age::exists["🕒 {stream.age}"||""]}
{stream.proxied::istrue["🛡️ "||"🛠️ "]}{service.shortName::exists["[{service.shortName}] "||""]}{addon.name}{stream.type::replace('debrid',' ')::exists[" · {stream.type::replace('debrid',' ')::replace('stremio-usenet','nntp')::smallcaps}"||""]}{service.cached::isfalse::or::stream.type::=p2p::and::stream.seeders::>0["  ⇋ {stream.seeders}🌱  "||""]}
{stream.languages::exists["🔊  {stream.languageEmojis::join(' · ')::replace('ᴅᴜᴀʟ ᴀᴜᴅɪᴏ','ᴅᴜᴀʟ')::replace('ᴅᴜʙʙᴇᴅ','ᴅᴜʙ')}  "||""]}{stream.seadex["»  "||""]}{stream.seadexBest::istrue["[ʙᴇsᴛ] "||""]}{stream.seadex::istrue::and::stream.seadexBest::isfalse["[ᴀʟᴛ ʙᴇsᴛ] "||""]}
{stream.message::exists["ℹ️ {stream.message::smallcaps}"||""]}
```

Alternatively, if you went for the ***Colorful Icons*** version and would prefer the ***Flat Monochrome Icons*** instead, replace the text in the **Description Template** with this:

```
{stream.editions::exists["▶︎  {stream.editions} "||""]}
{stream.encode::exists["▣  {stream.encode}  "||""]}{stream.visualTags::exists["✦  {stream.visualTags::join(' · ')}  "||""]}
{stream.audioTags::exists["♬  {stream.audioTags::join(' · ')}  "||""]}{stream.audioChannels::exists["☊  {stream.audioChannels::join(' · ')} "||""]}
{stream.size::>0::and::stream.seasonPack::istrue["⧉  "||""]}{stream.size::>0::and::stream.seasonPack::isfalse["◧  "||""]}{stream.size::>0["{stream.size::sbytes}"||""]}{stream.bitrate::exists[" · {stream.bitrate::sbitrate::replace('Mbps','ᴹᵇᵖˢ')::replace('Kbps','ᴷᵇᵖˢ')}  "||""]}{stream.message::~Download["{tools.removeLine}"||""]}{stream.age::exists["⟳ {stream.age}"||""]}
{stream.proxied::istrue["⛊ "||"⛉ "]}{service.shortName::exists["[{service.shortName}] "||""]}{addon.name}{stream.type::replace('debrid',' ')::exists[" · {stream.type::replace('debrid',' ')::replace('stremio-usenet','nntp')::smallcaps}"||""]}{service.cached::isfalse::or::stream.type::=p2p::and::stream.seeders::>0["  ⇋ {stream.seeders}𖧧  "||""]}
{stream.languages::exists["⚐  {stream.smallLanguageCodes::join(' · ')::replace('ᴅᴜᴀʟ ᴀᴜᴅɪᴏ','ᴅᴜᴀʟ')::replace('ᴅᴜʙʙᴇᴅ','ᴅᴜʙ')}  "||""]}{stream.seadex["»  "||""]}{stream.seadexBest::istrue["[ʙᴇsᴛ] "||""]}{stream.seadex::istrue::and::stream.seadexBest::isfalse["[ᴀʟᴛ ʙᴇsᴛ] "||""]}
{stream.message::exists["🛈 {stream.message::smallcaps}"||""]}
```


## Enriching Your Catalogs (Trakt Alternatives)

This guide uses **Trakt** as the default content tracker, mainly because it's also natively supported by Stremio. Through **Trakt Scrobbling** enabled in Stremio settings, Stremio sends watch history and progress to Trakt, which you then can use to create your own lists or as a personal library manager for your preferences. However, since Trakt recently has been enforcing strict rate limits, and also limiting free accounts more and more, there are alternatives that might allow you more flexibility, and also avoid any issues with Trakt errors that have been happening increasingly often.

This is totally optional, but if you're looking for Trakt alternatives, or simply looking for more choices that you can use alongside Trakt, and more curated lists to choose from, there are two other trackers that are becoming increasingly more preferred and AIOMetadata wonderfully supports: **MDBList** (especially good if you want curated catalogs from other users) and **Simkl** (similar to Trakt). Although in this case Stremio itself doesn't sync with them, AIOMetadata does. Once enabled there, when you open a stream, AIOMetadata marks it in these platforms using their *check-in* feature (meaning it marks them as started watching), and when the stream is finished, it marks it as watched. This way you get the same watch history as with Trakt (except for the specific progress inside the stream, that's not tracked). So if you want to go this route (you don't have to do both), here are the instructions:

* **MDBList**:
   1. Create an account on [**MDBList**](https://mdblist.com/) (*You can sign up with your existing Trakt account if you have one, this will allow MDBList to sync with your Trakt account too and continuously update it*).
   2. Click on your profile name on the top right, and select "**Connected Accounts**".
   3. On the **Preferences** page that will show, click on the "**API Access**" button from the menu list, and copy the **API Key** provided.
   4. Sign in to **AIOMetadata** with your **UUID** and **Password** and go to **Integrations** tab.
   5. Enter the **API Key** in the **MDBList API Key** field.
   6. In **General** tab, make sure the "**MDBList Watch Tracking**" toggle is enabled.
   7. Go to the **Catalogs** tab and click on the **MDBList** icon next to the Trakt icon.
   8. Enter the **API Key** there again.
   9. Optional, but recommended: If you want to add popular and curated catalogs from **MDBList**, you can scroll further down on this page to the "**Popular Lists from Featured Curators**" section, click on one of the users showing there (e.g. *Snoak* or *Dan Pyjama*), and their lists will load. Select the lists you are interested in, and click on "**Import Selected Lists**". *Some lists are similar to the Trakt lists already provided in the AIOMetadata configuration downloaded from this guide, specifically the **snoak** user lists (named "Latest..."), so if you add them from MDBList, disable the provided Trakt lists to avoid duplicates.*
   10. Click "**Save & Close**", arrange the newly added catalogs however you like, and don't forget to **Save** the changes by going to the **Configuration** tab.

![MDBList](../images/7.1.png)

* **Simkl**:
   1. Create an account on [**Simkl**](https://simkl.com/).
   2. You can import your **Trakt** history when asked if you want.
   3. Once your account is ready, sign in to **AIOMetadata** with your **UUID** and **Password**.
   4. In **General** tab, make sure the "**Simkl Checkin**" toggle is enabled.
   5. Go to the **Catalogs** tab and click on the **Simkl** icon next to the Trakt icon.
   6. Follow the instructions to connect your Simkl account.
   7. You can add any catalogs you want while still on the page once connected, and then click on "**Close**".
   8. Arrange the newly added catalogs however you like, and don't forget to **Save** the changes by going to the **Configuration** tab.

![Simkl](../images/7.2.png)


## Usenet

Usenet is a whole thing by itself, and definitely much more complex to understand and setup. It's beyond the scope of this guide for beginners, at least for the time being, because a proper Usenet setup requires a lot of components, but especially since the latest v5 release of Stremio supports **NNTP** playback natively (albeit still limited), I thought I would include this section to introduce the concept and provide you with two of the simplest approaches to get a basic setup going. It's totally optional of course, and not worth scratching your head about it if you're happy with the perfect setup from this guide :), but it might be worth giving it a try especially if you're having difficulties finding obscure, unpopular, or old content, and/or content in your specific language. It's worth mentioning that it is a more costly endeavour usually than using torrents or debrid, so you can stop reading if you don't/can't spend any more money on this.

Let's start with a short explanation of what Usenet is:

**Usenet** is a server-to-server distribution network where content is posted to "newsgroups" and then replicated across many provider backbones, so it ends up behaving like a huge distributed archive. When someone uploads a movie or show (or music, ebooks, etc.), it is split into many small segments (often thousands). Those segments are posted as individual articles, copied and distributed between servers, and kept for a certain time based on each provider’s retention. When you download, you are not pulling from other users like torrents. You are fetching those segments directly from your provider’s servers, then reassembling them into the original file.

In practice, most setups have three moving parts:

* **Usenet Provider**: The (paid) access layer that gives you a login to Usenet servers and lets you download the segments through the NNTP protocol. Retention and completion vary by provider/backbone. *Equivalent to a debrid service as your paid service provider, but it downloads from Usenet servers, not a torrent swarm.* There are many provider brands available to choose from, but most of them aggregate into around 10 different backbones globally. Usually all content is distributed throughout all of Usenet, meaning also among these backbones, but of course it's not a universal rule (just like with torrents and seeders). Some of the most popular providers are:
   * [**EasyNews**](https://www.easynews.com/) one of the most famous ones.
   * [**NewsHosting**](https://www.newshosting.com/) also very popular, in the same backbone as EasyNews.
   * [**Eweka**](https://www.eweka.nl/) is mainly popular in Europe.
   * [**TorBox**](https://torbox.app/subscription?referral=6e80077e-c232-4b71-8914-5b87202b9577) has a **Pro** plan that includes Usenet access, but it's not a traditional Usenet provider, as you will read further down.
   * ***👉 Quick Tip**: Watch out for **Black Friday** deals, that's when you can get the best deals. **NewsHosting** has currently a BF deal [**here**](https://www.newshosting.com/usenet-black-friday/) that even though it's way past BF, it's still active, and it includes an **EasyNews** account with it.*

* **NZB Indexer**: The search layer that finds releases and generates an NZB file. The NZB is a small “manifest” (like a map) that points to the exact message IDs and groups needed to fetch all segments. *Equivalent to the Stremio scraper addons or a torrent indexer.* There are a lot of indexers available that have varying content focuses. Some are free with limits, but most are paid, either subscription-based, or some also offer lifetime packages. I can't provide an exhaustive list here and I don't even know all of them myself, but for those who are interested in getting the best long-term deals like me, here are some of the indexers with the best price-performance ratio:
   * ***👉 Quick Tip**: I've included some of the best indexers according to my research, but also only those that have historically provided lifetime options at least at some point, so that if you decide to pay for any of these, you can really get the best value. That said, these deals are usually not active all the time, but just like with the providers, mainly during **Black Friday**, so don't complain to me for not finding any deals, just wait for the next BF and hope they have some good deals.*
   * [**NinjaCentral**](https://ninjacentral.co.za/) doesn't allow open registration regularly, but usually opens it during BF, and last time lifetime was around 60$.
   * [**NZBgeek**](https://www.nzbgeek.info/) also had its last lifetime BF deal at around 60$.
   * [**altHUB**](https://althub.co.za/) had its last lifetime BF deals for around $20, so wait around for the next deal.
   * [**Usenet Crawler**](https://www.usenet-crawler.com/) is currently for some time offering a lifetime promo for the "donation" price of $20.
   * **Honorary Mentions**:
      * [**DrunkenSlug**](https://drunkenslug.com/) is very popular, but it's invite-only, and has a limited free tier. You can monitor [**r/UsenetInvites**](https://www.reddit.com/r/UsenetInvites/) for people offering invites if you want one.
      * [**SceneNZBs**](https://scenenzbs.com/) is for the German-speaking users out there, being one of the most popular for German content. Costs around 15€ per year, and 10€ from the third year onward.

* **Downloader**: Takes the NZB, downloads all segments over NNTP, verifies them, and if some are missing it can often repair the gaps using PAR2 recovery blocks, then it rebuilds the final file. *Equivalent to a torrent client (which Stremio does natively), but with server downloads and built-in repair features.*

* **[OPTIONAL] Automation Tools**: The *\*arr* suite (**Sonarr** for TV, **Radarr** for Movies, **Lidarr** for Music, **Readarr** for Books, etc.) is the automation layer that monitors what you want, searches for releases, sends NZBs to your downloader, then imports and organizes the finished files. **NZBHydra2** or **Prowlarr** often sits in front of multiple NZB indexers as a single unified search endpoint, so you manage indexers once and let the *\*arr* apps query that instead of configuring each indexer everywhere. Together with a downloader like **SABnzbd** or **NZBGet**, they turn Usenet from a manual “find and download” workflow into an automated pipeline. Finally, tools like **NZBDav** or **AltMount** can sit on top of your downloader and expose completed or in-progress downloads as a streamable library, so Stremio can play them like a regular source. All of these tools however need self-hosting, which makes the entire setup more complicated, and thus out of scope for this guide.

In Stremio, Usenet is useful because it can give you fast, consistent playback that does not depend on torrent swarm health or peer availability. With the newer *native NNTP support*, Stremio can take an **NZB** (the "map" of all the file parts) and fetch those parts directly from your Usenet provider over NNTP, then stream the video as it assembles. You still need an **NZB Indexer** to find the release and generate the NZB, and you still need a **Usenet Provider** for the actual server access, but the big change is that Stremio can handle them directly just like it does with torrents, so it no longer has to rely on separate "bridge" tools to turn a Usenet download into something it can play.

Getting to the point, you can choose to do a proper Usenet setup and automate it to your liking, but for that you'll need to do some research yourself, because there is currently no all-in-one guide I can recommend you, and there are many options to even make that possible. However, you can do the basic approach if you're interested, which goes as follows:
1. Get an *API Key* from one or more indexers by creating an account and buying a subscription (or lifetime during promos).
2. In **AIOStreams**, go to **Addons**, then **Marketplace**, find the **Newznab** addon, and press configure.
3. You can change the name from *Newznab* to the name of the indexer to easily differentiate them later if you have more than one indexer. *Newznab is a standardized API (interface) that NZB indexers expose so apps can search them, filter results, and pull NZB links in a consistent way. Pretty much all indexers usually provide this access point.*
4. In **Newznab URL** you can select the indexer of your choice. The ones mentioned here are all available, but you can also add a *Custom* indexer if not on the list.
5. In **API Key** you need to paste the key from the indexer.
6. Check any other settings if you need to do some modifications, and click on **Install**.
7. You can repeat these steps for all indexers if you bought more than one (which is why you renamed Newznab to the indexer name earlier), just install additional **Newznab** addons.
8. Don't forget to save the **AIOStreams** configuration by pressing "**Save**" on the "**Save & Install**" tab.

![Newznab](../images/7.3.png)

What you just did is configure the indexers, meaning you are able to search for streams on Usenet. However, you still haven't configured the provider. For that, there are two approaches on how you can set it up:

* **TorBox**: The first one is by getting a *TorBox Pro* plan, which includes Usenet access, and doesn't even need the Stremio native NNTP feature. The way this works is similar to the caching approach for debrid. This means, after you have configured **Newznab** with the indexers you want to use, and considering the **TorBox** addon is already installed from the *AIOStreams* template of this guide if you are using TorBox as a debrid service, then the following happens:
   1. You search for a show on Stremio.
   2. If there are any streams available for that show on the indexer, they are shown on the streams list marked as "**[TB] Indexer · USENET**", which can show with a ⚡ icon, meaning it's already cached and you can open it directly, or most probably with a ⏳ icon as uncached.
   3. When you open an uncached Usenet stream, TorBox starts to download the file on their own servers for you. This should normally take a few seconds, but it's much faster than opening a torrent which depends on seeds, because it is downloaded from other servers.
   4. The stream should open normally in a bit. If it doesn't or gives an error, just wait a few seconds or minutes, and try opening it again.
   * *The normal Usenet approach, if you do the proper setup with the self-hosted tools and especially **NZBdav** or **AltMount**, would allow you to stream directly from the Usenet provider and not have to wait even a few seconds or minutes. But as mentioned, TorBox is not a traditional Usenet provider and doesn't currently provide NNTP access to allow that, but has to download the files on their servers first. It's a tradeoff, but also avoids having to self-host the tools.*

* **Stremio NNTP**: As mentioned in the beginning, Stremio v5 started supporting NNTP natively, just like torrents, which means Stremio is able to stream directly from Usenet providers. This avoids the need to self-host tools like **NZBdav** or **AltMount** which act as intermediaries, and use NZB files directly to connect to the Usenet providers. This is a great addition, it has however its limitations in the current form. It's only supported in the Windows app and the Android TV app version of Stremio at the moment, and it doesn't currently implement any health checks or any additional features that the usual more complex Usenet setup supports. It does work great however in its simple approach, and it should become available soon in all platforms, as announced by the Stremio developers. To configure this, it's only a few steps:
   1. In **AIOStreams**, go to the **Services** tab, find **Stremio NNTP**, enable the toggle, and click the gear icon to configure it.
   2. Press the server button to the right of the "*NNTP Servers*" section.
   3. Enter the NNTP information which you can get from your Usenet provider you selected earlier (except TorBox).
   4. Click "**Save**" on both tabs, and save the **AIOStreams** configuration on the "**Save & Install**" tab.
   5. Now when you open a show, if there are any streams available for that show on the indexer, they are shown on the streams list marked as "**[SN] Indexer · USENET**", which should show with a ⚡ icon. You can open them directly and they should normally start playing in just a few seconds.

![Stremio NNTP](../images/7.4.png)

>**WARNING**: When using an indexer, there are two communication steps happening: first the indexer is queried (**Search step**) for what you're trying to watch, and then when you select it from the streams list, the NZB file is downloaded from the indexer (**Grab step**) so that the downloader can use it to retrieve the file parts. With the basic Usenet setup described here, the search step is performed by the *AIOStreams* instance, and the grab step by either *TorBox* or *your local Stremio installation* depending on the approach chosen earlier. This causes the indexer to be contacted from two different IPs for each step, and there are indexers that do not allow that. This may consequently cause your indexer account to get flagged or banned. **SceneNZBs** for example explicitly disallows streaming usage with Stremio. **NinjaCentral** supposedly allows it as long as you're not sharing the account with others, but I can't confirm this. You'll need to check online or with the indexer whether they allow different IPs (if you contact them, don't mention that you want to stream on Stremio specifically, because that would probably get you banned). There are ways to configure it to use the same IP, but this cannot be done from a public AIOStreams instance and would require self-hosting it, which is as mentioned in th beginning, beyond the scope of this guide.

That's it! As mentioned, these are two of the simplest approaches to getting started with the Usenet ecosystem, but it might help you increase your chances on finding difficult to find content, and maybe to introduce you to the extensive world of Usenet.