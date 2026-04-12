# 🎬 [STREMIO FULL & EASY TOTAL BEGINNER'S GUIDE](https://luckynumb3rs.github.io/stremio-perfect-setup/)
**[⚡ DEBRID / 🧲 P2P / 🌐 HTTP]** (*v2.0*)


![img](xd3jbgpapmig1 "Homescreen (left) & Stream Source Selection (right)")

**✨ NEW: Check out the extended guide with screenshots [**HERE**](https://luckynumb3rs.github.io/stremio-perfect-setup/).**

**If this guide helps you, PLEASE UPVOTE this post so it remains relevant for others to find it and also benefit from it.** 😊

After a few iterations trying out what works and what doesn't for me, and testing various addons, I think I have reached the optimal Stremio setup. Of course it's a matter of taste and everyone has different preferences, but I will share my guide here for anyone interested, or at least get started easily and then modify in reverse whatever changes they want. So here it is completely from scratch:

**Don't be scared. Although it may look like a very long guide, it's actually just a few simple steps and very easy. I just wanted to be thorough and describe everything totally step-by-step so you understand what you're doing.**

>**NOTES**:
>* If you already followed this guide and would like to **update to the latest template** (check out the version number on the title), go to [**🔔 Updates**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/Updates) on the extended guide.
>* **If you followed this guide and are encountering issues or have configuration questions**, go to [**❓ Configuration Q&A**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/8-Configuration-QA) on the extended guide. If you're just starting, remember this for later in case you need it. **PLEASE avoid asking questions that are already answered there**.
>* **🙏 A very explicit special THANKS** to the **Stremio** developers which goes without saying, and all the community collaborators without which we wouldn't be able to enjoy any of it: [**TamTaro**](https://ko-fi.com/tamtaro) for the template base and SEL filters, [**Vidhin**](https://ko-fi.com/vidhin) for the Regexes, and the addon developers [**Viren**](https://ko-fi.com/Viren070) for AIOStreams, [**Cedya**](https://buymeacoffee.com/cedya) for AIOMetadata, [**Sanopandit**](https://ko-fi.com/timilsinabimal) for Watchly, [**Sonic**](https://ko-fi.com/sonicx161) for AIOManager, the public addon instance hosters which make everything so much simpler for most, and anyone else I may have failed to mention. All of these people continue to develop and improve them actively together with the Stremio community, so shout out to all of them for their wonderful work, and consider buying them a coffee if you agree with me! Since a few of you have also asked about tipping me for helping, even though I did it for fun and an very happy if my guide helped you, [**here**](https://ko-fi.com/luckynumb3rs) is my coffee link :)

In case you are wondering whether it's worth the effort, or you already have a Torrentio + RD setup and want to know what's better if you use this guide, here's a summary:

* **Cleaner Management**: instead of one scraper and a messy pile of addons, you use *two central addons* (AIOStreams + AIOMetadata) to keep everything *clean, consistent, and easy to manage*.
* **Better Results**: AIOStreams combines *multiple scrapers/providers*, so you usually get *more working sources* and better coverage.
* **Best Links First**: smart *sorting + filtering* pushes the most relevant options to the top (cache, quality, resolution, size, reliability signals), so less scrolling and fewer bad clicks.
* **Extra Quality Signals**: on top of general sorting, *Vidhin’s regexes* help *rate/identify quality releases and trusted groups* for even better ordering.
* **Cleaner Source Selection UI**: a *minimal, modern stream list view* with the info you actually need to choose fast.
* **Netflix-like Automation**: Trakt-driven *personal lists, watch tracking, and progress syncing* and a *full-blown suggestions engine with dynamic catalogs* based on what you watch and like, for a more “recommended and organized” experience.
* **Richer Browsing**: AIOMetadata gives *better catalogs + metadata integrations* (ratings, descriptions, artwork) and lets you *remove/replace Cinemeta clutter*.

**Before proceeding, it's also important to distinguish between the stream types this guide includes:**
* **⚡ DEBRID** is paid, but fast, safest and most reliable. Activated by selecting a Debrid service when you import the *AIOStreams* template.
* **🧲 P2P** is free, but slower and risky depending on the laws of your country. Activated automatically if you don't select a Debrid when you import the *AIOStreams* template.
* **🌐 HTTP** is free and safe, but slower and less reliable than Debrid. Activated if you enable the *HTTP Addons* option when you import the *AIOStreams* template.
* *In case **P2P** is an issue in your country: If you use **Debrid** (paid) or **HTTP** (free) streams, you are generally safe and don't need a VPN. **Debrid** however is still the safest and most reliable solution.*

So, now that you know, it's up to you, but if you're up for it, let's do it 💪:

---

# 🔰 Beginner Concepts

If you are a total beginner and are curious to understand the concepts around Stremio and how it works, go to [**🔰 Beginner Concepts**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/0-Beginner-Concepts) on the extended guide.

---

# 📝 1. Accounts Preparation

First, let's start by creating the accounts (those who already have them can skip these steps):

1. Obviously, start by creating a new free [**Stremio**](https://www.stremio.com) account.
2. Choose a Debrid service for caching the torrents, create an account on it, buy a subscription, and get the API key.
   * *This is optional, but HIGHLY recommended. This guide also works for free **P2P** and/or **HTTP** streams only, but Debrid works much better than both, if you can afford it.*
   * *For those who don't know, this is the only thing you will be paying for (about 32€ for Real-Debrid or $33 for TorBox for 12 months). It's used as an intermediary to serve the files to you from their servers, instead of relying on torrent which may be slow and inefficient. This means faster loading, almost no buffering, and more high-quality stream options. I would definitely recommend getting this.*
   * *I use mainly* [***TorBox***](https://torbox.app/subscription?referral=f7feee59-8c0d-4842-b53a-07738c37f7f1), as a backup I use [***Real-Debrid***](http://real-debrid.com/?id=12639093) *(these are referral links since we're at it :), two of the best platforms, with the best prices and very stable.*
   * *For **TorBox**, please make sure to use my referral code when ordering: **f7feee59-8c0d-4842-b53a-07738c37f7f1** to get 7 additional days for each month you buy (only for the first purchase, so I recommend you go big from the start and buy the yearly, it's a better value and you get 84 additional days for free). You can also buy the cheapest tier for a year initially to get the extra 3 months, and if you need a higher tier, you can upgrade along the way, it is possible. **IMPORTANT**: When you're on the subscription plans page, scroll down to the bottom and you'll see a field (not the "Coupon Code" field just below the plans, but to the very bottom of the page) where you can enter my code (not to be confused with the "Your referral code is:" part above it) and click **Submit**. Then you can proceed with buying your chosen plan. **ALSO**, if you pay with crypto, you can use coupon code **SIGMA30** in the "Coupon Code" field for a further 30% discount (only for the first purchase if you select the One-Time option).*
   * *To help you choose between Real-Debrid and TorBox:*
      * ***Real-Debrid** is one of the most widely used service, and has probably the largest cache (files already available on their servers and ready to watch) of shows and movies. However, they only allow one connection at a time, meaning that you can't watch on two or more devices simultaneously (you can log in to your Stremio account on as many devices you want, that's unrelated). So if you want to use it with friends or family or on multiple Stremio accounts to watch simultaneously, you can't: you'll get a warning and may risk getting banned if repeated. **HOWEVER**, if your devices are sharing the same internet connection, for example when on the same WiFi at home, you can watch from multiple devices connected to it because then Real-Debrid sees only one public IP address, regardless of how many devices are in your home network.*
      * ***TorBox** allows in it's most basic paid option up to 3 parallel connections, and has tiers with up to 10 parallel streams, which means that you can use the same API key for e.g. your entire family or friends, or multiple Stremio accounts. According to some users, and appears to be official, these parallel slots are only counted when downloading uncached content (⏳) that is not immediately available, whereas for cached content (⚡) already on TorBox, the only limit is bandwidth. This means that you can watch as many streams in parallel as you want in all tiers, but the speed may be capped at 1Gbps (or 80Gbps for Pro), although they are tolerant enough to allow even higher speeds if you don't abuse it. However, it may not have the large cache of readily available shows like Real-Debrid has, so it might happen that you cannot watch a show immediately because it needs to download it first (you see that in the source links marked with an hourglass icon. This may take time depending on the seeders available, but it's also usually fast). It usually has more than enough options cached for each show though, and you only need one :).*
      * *The choice is yours. TorBox would be very practical and cheaper for multiple screens or families, but Real-Debrid would MAYBE provide more immediately available options. I myself use **both** (you can enable both in AIOStreams, and considering the prices for both, it's still cheap): I use TorBox as my main, because my family can safely use it simultaneously, and I also keep a backup Real-Debrid, in case it may happen that Real-Debrid has a result that TorBox doesn't immediately have (always keeping in mind though that Real-Debrid only allows 1 connection, hence as a backup only).*
   * *ONLY AFTER you registered to one or both services from the links above and subscribed to a plan (and paid for it), you can get the **API key** while logged in to your account directly on [**this**](https://real-debrid.com/apitoken) link for Real-Debrid or [**here**](https://torbox.app/settings?section=account) for TorBox.*
3. Create a free [**Trakt**](http://www.trakt.tv) account.
   * *This is recommended for tracking what you watch, and getting some custom lists. Makes the Stremio experience more like Netflix. If your account is new, rate or mark as watched at least 10 movies and 10 shows, it will be good for creating custom lists later below, otherwise they won't work.*
4. Create a [**TMDB**](https://www.themoviedb.org/) account and get a free API key:
   * *TMDB is used for the metadata (descriptions, cast, etc.) of Movies.*
   1. Click on your profile icon on the top right and click on "**Settings**".
   2. Click "**API**".
   3. In the "**Request an API Key**" click on "*To generate a new API key, click here*".
   4. Click "**Yes**" when asked "*Is the intended use of our API for personal use?*".
   5. Fill the form with whatever info (doesn't have to be correct), and click "**Subscribe**".
   6. When successful, you will get taken to a page that reads "*You are currently on the Free Developer plan.*", and click on "**Access your API key details here**".
   7. Copy the "**API Read Access Token**" and the "**API Key**".
5. Create a [**TVDB**](https://www.thetvdb.com/) account and get a free API key:
   * *TVDB is used for the metadata (descriptions, cast, etc.) of Series.*
   1. After being logged in to the account, go to [**this**](https://www.thetvdb.com/api-information) page.
   2. Select any options from the checklist that shows and click "**Save**".
   3. Click "**Get Started**".
   4. Make sure "**Less than $50k per year**" is selected in "*Company / Project Revenue*", fill the rest with whatever info (doesn't have to be correct), and click "**Submit**".
   5. Copy the API key that is shown on the "*API Signup Success*" page.
6. Create a **Google/Gmail** account if you don't have one, and get a free **Gemini** API key:
   * *Optional, but recommended for AI searches, to search not only for movie or show names, but also e.g. "movies like Batman" or more complex searches.*
   1. When logged in to your Google account, go to [**Google AI Studio**](https://aistudio.google.com/api-keys).
   2. Accept the agreement if it's your first time opening it, by enabling the checkbox and clicking "**Continue**".
   3. An API key should normally get created automatically on the list, called "**Default Gemini API Key**".
   4. Click on the clickable link on the "**Key**" column, and copy the "**API Key**".
   * *If no key is created automatically, just create one by clicking "Create API Key" on the top right.*
7. (**Optional**) Totally optional and not a must at all, but if Trakt feels limiting with its rate limits or you want more curated lists, check out these friendly alternatives that work great with AIOMetadata:
   * **MDBList**: Perfect for discovering user-curated catalogs and tracking your watched content seamlessly.
   * **Simkl**: A Trakt-like experience with check-ins and watch history, plus extra flexibility.
   * You can use them alongside Trakt or as a replacement for a smoother, more personalized setup.
   * Head to [**🛠️ Additional Stuff**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff/#enriching-your-catalogs-trakt-alternatives) on the extended guide for easy setup steps.

---

# ⚙️ 2. Stremio Account Initialization

Second, let's prepare the Stremio account properly:

1. Open [**Stremio Web**](https://web.stremio.com) and **MAKE SURE** you're signed in with your account.
   * **IMPORTANT**: *Do not confuse* [*www.stremio.com*](https://www.stremio.com)*, which is for account management, with* [*web.stremio.com*](https://web.stremio.com)*, which you **MUST** be signed in to for removing/installing the addons. Being signed in to* [*www.stremio.com*](https://www.stremio.com) *does not automatically sign you in to* [*web.stremio.com*](https://web.stremio.com)*, and your addons will not install on your account.*
   * *Obviously you need a browser to configure everything on this guide, including using the **Web** version of Stremio to remove and install addons. Don't worry though, after you set everything up **ONCE**, you can use your setup everywhere you use Stremio (Smart TV, Android, iOS, Windows, everywhere).*
2. Go to "**Settings**" in [**Stremio Account**](https://www.stremio.com) and enable **Trakt Scrobbling** by connecting it to your Trakt account.
   * *This will allow Stremio to sync show progress and history with Trakt.*
3. Go to "**Addons**" and uninstall all addons.
   * *Also remove the **Trakt Integration** addon, it is separate from **Trakt Scrobbling** (which you need), and you don't need it because we will use something else for this.*
   * *Cinemeta and Local Files cannot be removed. Leave them, we will take care of this later.*

---

# 📚 3. AIOStreams [Find Streams]

**AIOStreams** is the stream aggregation engine in this setup. It combines multiple scraping sources into one consistent results list, and lets you apply filtering, sorting, and formatting so the best links appear first.

Select an **AIOStreams** instance from [**this**](https://uptime.ibbylabs.dev/aiostreams) or go directly to [**Midnight's**](https://aiostreamsfortheweebsstable.midnightignite.me/) or [**Yeb's/Nhyira**](https://aiostreams.fortheweak.cloud/) instance (two of the most popular ones) and:

>**WARNING:**
>* *If you want to understand more what an instance means, go to* [**🔰 Beginner Concepts**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/0-Beginner-Concepts/#what-does-an-addon-instance-mean) *on the extended guide.*
>* *You can choose an instance that says **Nightly**, and they work great, but they are instances that update very frequently and thus the steps described in this guide may not be up to date to match them. If you're a total beginner, you're probably better off with an instance that doesn't say **Nightly**.*
>* ***DON'T** choose the **ElfHosted** instance because Torrentio doesn't work there.*
>* *Choose one of the instances and stick with it, you will store your configuration here, and if you change to the other instance, you'll need to transfer your configuration because it's not automatically transferred*
>* *You can keep the monitoring links above for later to check the instance online status, if it happens that it's not working and might be temporarily down.*

1. Select "**Advanced**" on the welcome screen if it shows up.
2. Copy [**this**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOStreams.json) link (right-click and "*Copy link address*").
3. Go to the "**Save & Install**" tab on AIOStreams (sidebar menu on the left), click "**Import**", "**Import Template**", paste the link you copied and click on "**Go**".
4. Click "**Use this Template Now**".
5. On the "**Select Services**" page that is shown, enable the services you want to use and click "**Next**". If you're not using any services and want to proceed with the **P2P/HTTP** setup, click "**Skip**".
6. On the "**Template Options**" page, you'll be able to personalize the configuration to match your preferences:
   * **🎨 Formatter Options**:
      * **🖋️ Formatter Style**: Here you can choose the formatting of the stream information view.
         * **▶︎ *Flat Monochrome Icons*** has a cleaner look based on minimalistic white icons.
         * **🎬 *Colorful Icons*** contains a colored version with more graphical icons.
         * **🚫 *None*** retains your existing formatter (formatter will not be replaced, if you already have one configured).
      * **📝 Show Filename** toggles showing the filenames on the stream information view.
   * **🗣️ Language Options**:
      * **🔊 Preferred Languages**: Here you can select your preferred stream languages that you want to be sorted first when the streaming options are shown. *Original, Dual Audio, Multi, Dubbed, and Unknown* are automatically appended after your selections.
      * **🔒 Show Only Preferred Languages**: You can enable this option (recommended) to show only streams in the selected languages above (including *Original, Dual Audio, Multi, Dubbed, and Unknown*). This can help reduce clutter by filtering out streams in languages you don't prefer.
      * **💬 Preferred Subtitles**: Here you can select the subtitles that should be loaded when opening a stream.
   * **🧩 Addon Options**:
      * **🗡️ Anime Addons** (*not available without Debrid*): If enabled, additional anime-specific addons (SeaDex, AnimeTosho) will be installed.
      * **🧊 Debridio** (*not available without Debrid*): If enabled, [Debridio](https://debridio.com) will be added. You will need your *Debridio API key* from your account settings. Leave it disabled if you don't know what this is.
      * **🌐 HTTP Addons**: Select if you want addons for **HTTP** streams to be installed. These addons rely on free online hosters and generally have less reliable sources and speeds, but can be good backup options if you don't or can't use Debrid and/or P2P. You can select:
         * **🚫 None** to not include any HTTP addons at all.
         * **➕ Install Additional HTTP Addons** to install them in addition to the Debrid/P2P addons for extra results.
         * **🔒 Install Only HTTP Addons** to not include any Debrid/P2P addons but only use HTTP addons. **CHOOSE THIS IF P2P IS AN ISSUE IN YOUR COUNTRY AND YOU'RE NOT USING DEBRID**. If you only use these addons, it might be a good idea to increase the global timeout below, since they might sometimes take longer to return results. *Do not select this option if you ARE using a Debrid.*
      * **⏱️ Global Timeout**: Enter the time in ms that you're willing to wait for results before your scraper addons timeout. You can set it a bit higher if you have issues getting enough results or you want to make sure to get as many results as possible.
   * **↕️ Sorting Options**:
      * **🚩️ Language Priority**: This option can give priority to streams in your preferred languages by moving it up the sorting order. If you struggle to see your preferred languages in the results, even after adding it to the **Preferred Languages** list, try increasing the priority here. May rank lower-quality streams higher if your preferred languages are uncommon among the results, so use with caution.
      * **🌱 Seeders Priority** (*only for P2P*): Change this if you want highest seeders to be prioritized more on the sorting order, even if they have lower Resolution/Quality/SEL Scores. In most cases, low seeders will have already been filtered out by the internal filtering (SEL).
7. On the "**Enter Credentials**" page, enter all API keys you prepared earlier.
   * The **RPDB** key is "*t0-free-rpdb*" and it's already pre-entered.
8. Click on "**Load Template**".
9. **Optional**: At this point AIOStreams is ready, but you can keep configuring it however you like. For example, if you want to further configure the scrapers or subtitle languages, you can go to the "**Installed Addons**" tab.
   * *You can configure each of them with the Pencil button on the right if needed.*
   * Depending on what you selected during the template options (whether you used a Debrid service, P2P directly, or can't use either), different addons got installed for you. Here's a summary:
      1. **TorBox, Torrentio, Meteor, Comet, StremThru, MediaFusion, Knaben, PeerFlix** are the ***main scrapers*** finding the sources.
      2. **SeaDex and AnimeTosho** are ***for Anime*** and are available only when using a Debrid service.
      3. **Sootio, Nuvio Streams, WebStreamr, HD Hub** are ***HTTP scrapers*** that provide direct web streams. You can use these ***if you don't/can't use Debrid and/or torrents***. They may be more limited in quality and availability, but are a good alternative. You can also disable them if you use a Debrid, you don't normally need them.
      4. **Debridio** and **Watchtower** are additional scrapers for those of you who use the ***Debridio*** service.
      5. **Library** is an addon that can search through your own Debrid library (if you e.g. download something manually in Debrid).
      6. **OpenSubtitles V3 Pro** is ***for the subtitles***, you can edit the languages and any other subtitle preferences here.
   * *If you want to fine-tune how languages shound show on the results list, go to **Filters** tab, then **Language**, and add/remove your languages to the **Preferred Languages** list, and arrange them in the **Preference Order** list. You can also add the languages in the **Required Languages** if you want to ONLY show streams in that language, but keep in mind that streams that might have no language tags at all or tagged as "multi" will be filtered out.*
   * *If you want to take it a step further and totally prioritize your language, even before Quality and Resolution, then go to the **Sorting** tab, make sure you're in the **Global** tab, and on the **Split by Cache** section, move **Language** to the top or wherever you want to have it for both the **Cached Streams** and **Uncached Streams** lists.*
10. Go to the "**Save & Install**" tab, enter a password on the "**Create Configuration**" section, and click "**Create**".
   * **ALWAYS SAVE IN THIS TAB EVERY TIME YOU MAKE CHANGES LATER.**
   * *Copy and store the **UUID** that is shown and the **Password** you set for later to access the configuration again. This is basically your AIOStreams account.*
   * *If you get an error when saving that says "Failed to fetch manifest..." and/or "502 - Bad Gateway", it means the addons mentioned there are temporarily offline. Go to **Addons → Installed Addons**, disable the problematic addons mentioned, and proceed with saving. Go back at a later time to re-enable the addons and save again.*
11. Click "**Install**" and install the addon on **Stremio Web** (recommended, but you can also install on Stremio app if you want, but make sure you're signed in to your Stremio account wherever you install it).

>**NOTES FOR LATER:**
>* *If you use a Debrid service, and are in a country where you can't torrent, be careful to not open any links with the 🧲 icon. They should normally never appear if you have a Debrid configured, but just making sure you know.*
>* *If there are no streams for a show, you will see statistics instead (looking like [this](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/8-Configuration-QA/#there-are-some-numbers-being-shown-on-the-streams-list-instead-of-the-usual-details-and-i-am-being-redirected-to-github-when-i-click-them)), so that you can find out why. Do not click them, they are only informational and will take you to GitHub if you do.*
>* *If you see that you are getting results too slowly, try changing the fetching strategy. Go to **Addons**, scroll down to **Addon Fetching Strategy**. and select **Dynamic**. There should already be an exit condition pre-filled, which you can leave as is, and save the configuration. However, keep in mind that this might leave out relevant results, so try it yourself. On the other hand, if you feel you're not getting enough good results, do the opposite and select **Default** instead.*
>* *If you prefer results for a language other than English, and you are not happy with the results you're getting, try disabling matching. Go to **Filters**, then **Matching**, and switch off the **Enable** toggle in all three sections (Title Matching, Year Matching, Season/Episode Matching).*
>* ***AIOStreams** is a very powerful tool offering a lot of options. Although the template provided here for it should be more than enough for all kinds of normal usage, if you are interested in tinkering with it and customizing each detail, you can check out [**this**](https://docs.aiostreams.viren070.me/) guide directly from the developer, Viren, which is also very comprehensive and documents all configuration options for AIOStreams.*

---

# 🔎 4. AIOMetadata [Metadata & Catalogs]

**AIOMetadata** is the metadata and catalogs layer. It improves discovery by powering richer catalogs, search behavior, and integrations, so browsing titles in Stremio feels more complete and organized.

Select an **AIOMetadata** instance from [**this**](https://uptime.ibbylabs.dev/#group-aiometadata) or go directly to [**Viren's**](https://aiometadata.viren070.me/) or [**Midnight's**](https://aiometadatafortheweebs.midnightignite.me/) instance (two of the most popular ones) and:

>**WARNING:**
>* *If you want to understand more what an instance means, go to* [**🔰 Beginner Concepts**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/0-Beginner-Concepts/#what-does-an-addon-instance-mean) *on the extended guide.*
>* *Choose one of the instances and stick with it, you will store your configuration here, and if you change to the other instance, you'll need to transfer your configuration because it's not automatically transferred.*
>* *You can keep the monitoring links above for later to check the instance online status, if it happens that it's not working and might be temporarily down.*

1. Download my configuration file [**here**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata.json) (right-click, "*Save As*", and save it as `.json`, not `.txt`).
2. Go to the "**Configuration**" tab, click on "**Import Configuration**", and load my configuration file.
3. Go to the "**Integrations**" tab, and enter the API keys for Gemini, TMDB, TheTVDB, RPDB.
   * For **RPDB** enter "*t0-free-rpdb*".
4. Go to the "**Catalogs**" tab, and near the "Quick Add" button, you will see the **Trakt** icon. Click on it and follow the steps to connect your Trakt account.
   * *If you want some ready-to-use and well-maintained lists, while on the Trakt tab, search for the lists from user "snoak", and you will be able to import a lot of interesting lists. I have already included some of them in the catalog, but you can add more.*
   * **For Anime users**: *If you want to enable search for Anime, make sure to go to to the "Search" tab and enable both "Anime Search Engine" switches.*
   * **For other languages**: *If you want the metadata (descriptions, titles, etc.) to show in a different language than English, go to the "General" tab and change the "Display Language".*
   * **NOTES**: 
      * *If you encounter any issues with Trakt integration on AIOMetadata, it's probably because Trakt is rate limiting the instance you're using, or the instance provider has disabled it (if it says "Instance owner has not yet set up the Trakt integration."). In that case, try to do the AIOMetadata setup with another instance.*
      * *Alternatively, you can leave Trakt integration disabled, and hide the Trakt catalogs on the list (marked with a red **Trakt** tag on the right) by clicking the green eye icon for each. I know it's not ideal since you created a Trakt account already, but there's nothing we can do about it. You can still add other catalogs from the other sources there.*
      * *There are also good alternatives to Trakt if you disable it, both for watch history tracking, and curated catalogs, which you can check out in* [**🛠️ Additional Stuff**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff/#enriching-your-catalogs-trakt-alternatives) *on the extended guide.*
5. **Optional**: At this point AIOMetadata is ready, but you can keep configuring it however you like, but otherwise the configuration I provided is ready to be used. On the "**Catalogs**" tab you can add, remove, enable, disable catalogs depending on your preferences.
6. Go to the "**Configuration**" tab again and click on "**Save Configuration**".
   * **ALWAYS SAVE IN THIS TAB EVERY TIME YOU MAKE CHANGES LATER.**
   * *Copy and store the **UUID** that is shown and the **Password** you set for later to access the configuration again. This is basically your AIOMetadata account.*
7. Click "**Install**" and install the addon on **Stremio Web** (recommended, but you can also install on Stremio app if you want, but make sure you're signed in to your Stremio account wherever you install it).
   * *If you get a "AddonsPushedToAPI Max descriptor size reached" error when installing, you probably have too many catalogs on AIOMetadata. Disable some, save the configuration, and try to install it again.*
   * *If you didn't want to get an API key for Gemini, go to the **Search** tab and disable **AI-Powered Search** to be able to save.*

>**NOTES FOR LATER:**
>* *Keep in mind that if you want to change catalogs after you have installed AIOMetadata on Stremio, you need to refresh the installation, otherwise the catalogs with not show. You do that with Cinebye below.*

---

# 🧹 5. Cinebye [Clean-Up]

Go to [**this**](https://cinebye.elfhosted.com/) **Cinebye** instance and:

1. Sign in with your Stremio account details.
   1. OR if you don't want to use your credentials directly, there is a more complicated approach:
   2. Login to [**Stremio Web**](https://web.stremio.com/) using your credentials in your browser.
   3. Open the developer console (F12 on Chrome) and paste this code snippet: `JSON.parse(localStorage.getItem("profile")).auth.key`
   4. Take the output value and paste it in Cinebye where it says "*Paste Stremio AuthKey here...*".
   5. Press **Enter** or click **Login**.
2. Once authenticated and the options become available, in section "**2 - Options**" you can download a backup first just to be safe.
3. Enable all three patches: "**Remove Cinemeta Search**", "**Remove Cinemeta Catalogs**", and "**Remove Cinemeta Metadata**".
4. Scroll down to "**Manage Addons**" and change the order of the addons to this:
   1. *Cinemeta*
   2. *AIOMetadata*
   3. *AIOStreams*
   4. *Local Files*
5. Scroll back up to "**3 - Sync Addons**" and click on "**Sync to Stremio**".

>**NOTES FOR LATER:**
>* *Keep in mind for later that if you change catalog structure in AIOMetadata after you installed it on Stremio, or if you add the CouchMoney lists from Step 6 below, then come back to Cinebye, authenticate again with Stremio credentials, and click the **Refresh** icon to the right of AIOMetadata in the "**Manage Addons**" section.*

---

# 🤖 6. Personalized & Automated Lists

At this point you are done, YAY!, so you can start enjoying it already OR you can do one more step if you want proper custom lists that are specifically made for you (like Netflix suggestions):

**Watchly** is a full-blown recommendations addon that provides real Netflix-like suggestions, and multiple dynamic catalogs depending on what you watch and like. I would recommend this more if you want extensive suggestions, but these catalogs are only on Stremio, they are not Trakt lists, so in case you need the lists for some purpose outside Stremio, you can't. So here are the steps:

1. Go to [**this**](https://watchly.elfhosted.com/) **Watchly** instance.
2. Click on "**Get Started**".
3. Login with your Stremio account email and password (recommended), OR click on "**Login with Stremio**", sign in to your Stremio account, and click "**Accept**" to allow Watchly to connect to your account (the second approach may expire in the future and you may need to log in again).
4. You will then land on the Watchly "**Preferences**" page. Configure according to your personal preferences here.
5. Scroll down and enter the **RPDB**, **TMDB**, **Simkl** (Optional), and **Gemini** *API Keys* in the respective fields.
   * The **RPDB** key is "*t0-free-rpdb*".
6. Click on "**Next: Catalogs**" and configure catalogs here also according to your personal preferences.
7. Click on "**Next: Install**" and click on "**Save & Install**".
8. Click "**Install on Web**" and install the addon on Stremio.
* ***Notes:***
   * *If you want these Watchly catalogs to show on top (which you'll probably want), go to Cinebye again and change the order of the addons by putting Watchly second, after Cinemeta and before AIOMetadata.*
   * *If your Stremio account is new, it will not have a watch history yet, so you may get "Failed to fetch" or similar issues on the Watchly catalogs when showing on Stremio. Don't worry, they should show up properly once it has enough information to personalize your lists.*

**Recommended**:

**Watch Next** is a very cool and simple addon that can show similar/related content directly on the page of the current show you're watching, similar to e.g. Netflix's "*More Like This*" feature. It doesn't need any configuration, it just works as-is once you install it very easily:
* Open [**this**](https://099757617587-watch-next.baby-beamup.club/) link, click on "**Install Add-On**", and install on Stremio. That's it!
* If it doesn't work, maybe because you don't have the Stremio app installed and need to install it manually, then do this:
   1. Go directly to [**Addons in Stremio Web**](https://web.stremio.com/#/addons) or open your Stremio app and go to **Addons**.
   2. Click on "**Add Addon**" and paste [**this**](https://099757617587-watch-next.baby-beamup.club/manifest.json) link on the field.
   3. Click "**Add**" and that's it!
* Now, every time you open a show, beside the **AIOStreams** tab which will show the available streams for it, there will also be a "**Watch Next**" tab showing similar/related content that you might like.

And now you're really done! Check out the [**❓ Configuration Q&A**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/8-Configuration-QA) and [**🛠️ Additional Stuff**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff.md) if you want to tweak it further.

---

# 🛠️ Additional Stuff

If you want to:

* [understand how the streams are sorted, selected, and filtered out](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff/#smart-stream-selection--sorting),
* [be able to read what all the icons on the stream information view mean](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff/#understanding-stream-information-view),
* [have more colorful icons in the stream information view](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff/#alternative-stream-information-icons),
* [check out some Trakt alternatives](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff/#enriching-your-catalogs-trakt-alternatives),
* [explore Usenet because you've heard about it and want to learn about it](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff/#usenet),

then click the links directly or go to [**🛠️ Additional Stuff**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff) on the extended guide.

---

# ❓ Configuration Q&A

If you followed this guide and are encountering issues or have configuration questions, go to [**❓ Configuration Q&A**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/8-Configuration-QA) on the extended guide. If you're just starting, remember this for later in case you need it. **PLEASE avoid asking questions that are already answered there**.

---

# 🎛️ AIOManager [Power Users]

**AIOManager** is fully optional and intended for power users who want to push their setup further by creating redundant, resilient configurations. If you are looking to increase reliability, add fallback layers, or manage multiple Stremio accounts in a structured way, this chapter is for you. Go to [**🎛️ AIOManager [Power Users]**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/AIOManager-Setup) on the extended guide to learn more and how to set it up.

---

# 🔔 Updates

To do a regular update when a new version of the template for **AIOStreams** is announced/released on this guide (*you can check the version number on the title of the guide*), unless described otherwise in specific updates listed further down, you can simply load the template again by following the same steps on the AIOStreams setup section.

As for **AIOMetadata**, there's normally not as many changes as AIOStreams so you shouldn't need to perform any updates unless explicitly mentioned, but you can also load the configuration again when necessary.

Go to [**🔔 Updates**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/Updates) on the extended guide to learn more.

---

# 📜 Changelog

If you're interested in knowing the changes of each new version of the guide and templates on it, check out the [**📜 Changelog**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/Changelog).