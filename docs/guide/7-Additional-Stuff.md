# 🛠️ Additional Stuff
----------------------------------

Most of the tips to address some issues are already included in-between the steps of the guide, but I am adding this section for any additional tweaks, explanations, or alternative configurations.

## Alternative Color Stream Information

If you want a more colorful version of the stream information view than the one included, you can go to the **Formatter** tab in **AIOStreams**, and replace the text in the **Description Template** with this:

```
{stream.edition::exists["🎬  {stream.edition} "||""]}
{stream.encode::exists["🎞️  {stream.encode}  "||""]}{stream.visualTags::exists["🎥  {stream.visualTags::join(' · ')}  "||""]}
{stream.audioTags::exists["🎵  {stream.audioTags::join(' · ')}  "||""]}{stream.audioChannels::exists["🎧  {stream.audioChannels::join(' · ')} "||""]}
{stream.size::>0::and::stream.seasonPack::istrue["📦  "||""]}{stream.size::>0::and::stream.seasonPack::isfalse["📦  "||""]}{stream.size::>0["{stream.size::sbytes}"||""]}{stream.bitrate::exists[" · {stream.bitrate::sbitrate::replace('Mbps','ᴹᵇᵖˢ')::replace('Kbps','ᴷᵇᵖˢ')}  "||""]}{stream.message::~Download["{tools.removeLine}"||""]}{stream.age::exists["🕒 {stream.age}"||""]}
{stream.proxied::istrue["🛠️ "||"🛠️ "]}{service.shortName::exists["[{service.shortName}] "||""]}{addon.name}{stream.type::replace('debrid',' ')::exists[" · {stream.type::replace('debrid',' ')::smallcaps}"||""]}{service.cached::isfalse::or::stream.type::=p2p::and::stream.seeders::>0["  ⇋ {stream.seeders}🌱  "||""]}
{stream.languages::exists["🔊  {stream.languageEmojis::join(' · ')::replace('ᴅᴜᴀʟ ᴀᴜᴅɪᴏ','ᴅᴜᴀʟ')::replace('ᴅᴜʙʙᴇᴅ','ᴅᴜʙ')}  "||""]}{stream.seadex["»  "||""]}{stream.seadexBest::istrue["[ʙᴇsᴛ] "||""]}{stream.seadex::istrue::and::stream.seadexBest::isfalse["[ᴀʟᴛ ʙᴇsᴛ] "||""]}
```

## Understanding Stream Information View

The formatting templates are designed to let you evaluate a stream easily before opening it. If you want to understand what all the icons on the stream information mean, here is how to read them:

**Main Line**
* ⚡ / ⏳ → [Debrid] Cached (instant playback) / Not Cached (may take longer)
* 🧲 / 🌐 / 📺 → Torrent (P2P) / Direct HTTP / Live Stream
* UHD ⁴ᴷ / QHD ²ᴷ / FHD / 720P → Resolution
* ⌜QUALITY⌟ → Source Quality (Remux, WEB, BluRay, etc.)
* ◆◆⬖◇◇ → Release Quality Score (based on [**Vidhin's Ranked Regexes**](https://github.com/Vidhin05/Releases-Regex), sorted after *Quality & Resolution*)

**Technical Details**
* ▶︎ / 🎬 → Edition (Director’s Cut, Extended, IMAX…)
* ▣ / 🎞️ → Video Encoding (x264, x265, HEVC…)
* ✧ / 🎥 → Visual Features (HDR, Dolby Vision, 10-bit…)
* ♬ / 🎵 → Audio Format (DTS, Atmos, TrueHD…)
* ☊ / 🎧 → Audio Channels (5.1, 7.1…)

**File & Availability**
* ◧ / 📦 or ⧉ / 📦 → Single File / Season Pack
* **Size** · **Bitrateᴹᵇᵖˢ** → File Size & Density (helps estimate quality vs bandwidth needs)
* ⟳ / 🕒 → Upload Age (newer is often better seeded)

**Provider & Delivery**
* ⛊ / ⛉ / 🛠️ **[Provider] Addon** → Debrid Service (if applicable) & Scraper (proxied or unproxied)
* ⇋ **Seeders** 𖧧 / 🌱 → Number of seeders for torrents (higher = more reliable)

**Languages**
* ⚐ / 🔊 → Available Audio Languages

**Anime Curated Releases** (if applicable)
* » → SeaDex Indexed Release
* **[BEST]** → Highest-ranked release
* **[ALT BEST]** → Strong Alternative (if the best fails)

👉 **Quick Tip:**
Prioritize streams that are **⚡ cached**, high resolution, strong score (◆), and reasonably sized. This usually gives the fastest start and best quality.

## Sort Order

The sort order in the template is configured in the following order: 

* Cached/Uncached (if applicable)
* SeaDex (only for Anime)
* Resolution → Quality
* Stream Expressions
* Stream Expressions Score
* Seeders (if Uncached)
* Language
* Bitrate

If you want to change the sort order, in **AIOStreams** go to **Sorting**, select **Cached** or **Uncached** from **Sort Order Type** and change the order.

----------------------------------

[Other [Configuration Q&A] →](8-Configuration-QA.md)