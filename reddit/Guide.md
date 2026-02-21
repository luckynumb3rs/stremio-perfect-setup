# 🎬 [STREMIO FULL & EASY TOTAL BEGINNER'S GUIDE](https://luckynumb3rs.github.io/stremio-perfect-setup/) (v1.1)

![img](xd3jbgpapmig1 "Homescreen (left) & Stream source selection (right)")

**✨ NEW: Check out the extended guide with screenshots [**HERE**](https://luckynumb3rs.github.io/stremio-perfect-setup/).**

After a few iterations trying out what works and what doesn't for me, and testing various add-ons, I think I have reached the optimal Stremio setup. Of course it's a matter of taste and everyone has different preferences, but I will share my guide here for anyone interested, or at least get started easily and then modify in reverse whatever changes they want. So here it is completely from scratch:

**Don't be scared. Although it may look like a very long guide, it's actually just a few simple steps and very easy. I just wanted to be thorough and describe everything totally step-by-step so you understand what you're doing.**

**If this guide helps you, please upvote this post so it remains relevant for others to find it and also benefit from it. 😊**

>**NOTES**:
>* *If you already followed this guide and would like to **update to the latest template** (check out the version number on the title), go to [**🔔 Updates**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/Updates) on the extended guide.*
>* ***If you followed this guide and are encountering issues or have configuration questions**, go to [**❓ Configuration Q&A**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/8-Configuration-QA) on the extended guide. If you're just starting, remember this for later in case you need it. **PLEASE avoid asking questions that are already answered there**.*

In case you are wondering whether it's worth the effort, or you already have a Torrentio + RD setup and want to know what's better if you use this guide, here's a summary:

* **Cleaner Management**: instead of one scraper and a messy pile of addons, you use *two central addons* (AIOStreams + AIOMetadata) to keep everything *clean, consistent, and easy to manage*.
* **Better Results**: AIOStreams combines *multiple scrapers/providers*, so you usually get *more working sources* and better coverage.
* **Best Links First**: smart *sorting + filtering* pushes the most relevant options to the top (cache, quality, resolution, size, reliability signals), so less scrolling and fewer bad clicks.
* **Extra Quality Signals**: on top of general sorting, *Vidhin’s regexes* help *rate/identify quality releases and trusted groups* for even better ordering.
* **Cleaner Source Selection UI**: a *minimal, modern stream list view* with the info you actually need to choose fast.
* **Netflix-like Automation**: Trakt-driven *personal lists, watch tracking, and progress syncing* and a *full-blown suggestions engine with dynamic catalogs* based on what you watch and like, for a more “recommended and organized” experience.
* **Richer Browsing**: AIOMetadata gives *better catalogs + metadata integrations* (ratings, descriptions, artwork) and lets you *remove/replace Cinemeta clutter*.

So, now that you know, it's up to you, but if you're up for it, let's do it:

---

# 🔰 Beginner Concepts

If you are a total beginner and are curious to understand the concepts around Stremio and how it works, go to [**🔰 Beginner Concepts**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/0-Beginner-Concepts) on the extended guide.

---

# 📝 1. Accounts Preparation

First, let's start by creating the accounts (those who already have them can skip these steps):

1. Obviously, start by creating a new free [**Stremio**](https://www.stremio.com) account.
2. Choose a Debrid service for caching the torrents, create an account on it, buy a subscription, and get the API key.
   * *This is optional, but HIGHLY recommended.*
   * *For those who don't know, this is the only thing you will be paying for (about 32€ for Real-Debrid or $33 for TorBox for 12 months). It's used as an intermediary to serve the files to you from their servers, instead of relying on torrent which may be slow and inefficient. This means faster loading, almost no buffering, and more high-quality stream options. I would definitely recommend getting this.*
   * *I use mainly* [***TorBox***](https://torbox.app/subscription?referral=6e80077e-c232-4b71-8914-5b87202b9577), as a backup I use [***Real-Debrid***](http://real-debrid.com/?id=8801126) *(these are referral links since we're at it :), two of the best platforms, with the best prices and very stable.*
   * *For* ***TorBox***, *please make sure to use my referral code when ordering:* ***6e80077e-c232-4b71-8914-5b87202b9577*** *to get 7 additional days for each month you buy (only for the first purchase, so I recommend you go big from the start and buy the yearly, it's a better value and you get 84 additional days for free). You can also buy the cheapest tier for a year initially to get the extra 3 months, and if you need a higher tier, you can upgrade along the way, it is possible. You can enter it when choosing the Plan, scroll down to the bottom and there you'll see it.*
   * *To help you choose between Real-Debrid and TorBox:*
      * ***Real-Debrid*** *is one of the most widely used service, and has probably the largest cache (files already available on their servers and ready to watch) of shows and movies. However, they only allow one connection at a time, meaning that you can't watch on two or more devices simultaneously (you can log in to your Stremio account on as many devices you want, that's unrelated). So if you want to use it with friends or family or on multiple Stremio accounts to watch simultaneously, you can't: you'll get a warning and may risk getting banned if repeated.*
      * ***TorBox*** *allows in it's most basic paid option up to 3 parallel connections, and has tiers with up to 10 parallel streams, which means that you can use the same API key for e.g. your entire family or friends, or multiple Stremio accounts. However, it may not have the large cache of readily available shows like Real-Debrid has, so it might happen that you cannot watch a show immediately because it needs to download it first (you see that in the source links marked with an hourglass icon. This may take time depending on the seeders available, but it's also usually fast). It usually has more than enough options cached for each show though, and you only need one :).*
      * *The choice is yours. TorBox would be very practical and cheaper for multiple screens or families, but Real-Debrid would MAYBE provide more immediately available options. I myself use both (you can enable both in AIOStreams, and considering the prices for both, it's still cheap): I use TorBox as my main, because my family can safely use it simultaneously, and I also keep a backup Real-Debrid, in case it may happen that Real-Debrid has a result that TorBox doesn't immediately have (always keeping in mind though that Real-Debrid only allows 1 connection, hence as a backup only).*
   * *ONLY AFTER you registered to one or both services from the links above, you can get the ***API key*** while logged in to your account directly on [***this***](https://real-debrid.com/apitoken) link for Real-Debrid or [***here***](https://torbox.app/settings?section=account) for TorBox.*
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
   * Head to [**🛠️ Additional Stuff**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff/) on the extended guide for easy setup steps.

---

# ⚙️ 2. Stremio Account Initialization

Second, let's prepare the Stremio account properly:

1. Open [**Stremio Web**](https://web.stremio.com) and **MAKE SURE** you're signed in with your account.
   * **IMPORTANT**: *Do not confuse* [*www.stremio.com*](https://www.stremio.com)*, which is for account management, with* [*web.stremio.com*](https://web.stremio.com)*, which you* ***MUST*** *be signed in to for removing/installing the addons. Being signed in to* [*www.stremio.com*](https://www.stremio.com) *does not automatically sign you in to* [*web.stremio.com*](https://web.stremio.com)*, and your addons will not install on your account.*
   * *Obviously you need a browser to configure everything on this guide, including using the* ***Web*** *version of Stremio to remove and install addons. Don't worry though, after you set everything up* ***ONCE***, *you can use your setup everywhere you use Stremio (Smart TV, Android, iOS, Windows, everywhere).*
2. Go to "**Settings**" in [**Stremio Account**](https://www.stremio.com) and enable **Trakt Scrobbling** by connecting it to your Trakt account.
   * *This will allow Stremio to sync show progress and history with Trakt.*
3. Go to "**Addons**" and uninstall all addons.
   * *Also remove the* ***Trakt Integration*** *addon, it is separate from* ***Trakt Scrobbling*** *(which you need), and you don't need it because we will use something else for this.*
   * *Cinemeta and Local Files cannot be removed. Leave them, we will take care of this later.*

---

# 📚 3. AIOStreams [Find Streams]

Select an **AIOStreams** instance from [**this**](https://status.dinsden.top/status/stremio-addons) or [**this**](https://status.stremio-status.com/) link (they both show the same instances and their online status, it's just two different sources) and:

* ***WARNING**:*
   * *If you want to understand more what an instance means, go to [***🔰 Beginner Concepts***](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/0-Beginner-Concepts) on the extended guide.*
   * *[***Midnight's***](https://aiostreamsfortheweebsstable.midnightignite.me/) or [***Yeb's***](https://aiostreams.fortheweak.cloud/) are some of the most popular, so you can use these links directly, but almost all are viable options.*
   * *If you go with **Yeb's**, **DON'T** use the old [*aiostreamsfortheweak.nhyira.dev*](https://aiostreamsfortheweak.nhyira.dev/) link, but [*aiostreams.fortheweak.cloud*](https://aiostreams.fortheweak.cloud/), as linked right above.*
   * ***DON'T** choose an instance that says **Nightly**, since they may not be stable.*
   * ***DON'T** choose the **ElfHosted** instance because Torrentio doesn't work there.*
   * *Choose one of the instances and stick with it, you will store your configuration here, and if you change to the other instance, you'll need to do it again because it's not automatically transferred*
   * *You can keep the monitoring links above for later to check the instance online status, if it happens that it's not working and might be temporarily down.*

1. Select "**Advanced**" on the welcome screen if it shows up.
2. Copy [**this**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOStreams.json) link (right-click and "*Copy link address*").
3. Go to the "**Save & Install**" tab on AIOStreams (sidebar menu on the left), click "**Import**", "**Import Template**", paste the link you copied and click on "**Go**".
4. Click "**Use this Template Now**".
5. On the "**Select Services**" page that is shown, enable the Debrid services you want to use (or click "*Skip*" if you don't use any), and click "**Next**".
6. On the "**Enter Credentials**" page, enter all API keys you prepared earlier.
   * For **RPDB**, unless you have an account and a paid subscription with your own API key, you can also use the free standard API Key "*t0-free-rpdb*" directly.
7. Click on "**Load Template**".
8. **Optional**: At this point AIOStreams is ready, but you can keep configuring it however you like. For example, if you want to further configure the scrapers or subtitle languages, you can go to the "**Installed Addons**" tab, where you will see:
   * *You can configure each of them with the Pencil button on the right if needed.*
   1. **Torrentio, StremThru, Comet, MediaFusion, Jackettio** are the scrapers finding the sources.
   2. **SeaDex and AnimeTosho** are for Anime and initially disabled. **If you want Anime results** you need to enable these.
   3. **SubHero** is for the subtitles, you can edit the languages and any other subtitle preferences here.
   * *If you want to have a language other than English to show first on the results list, go to* ***Filters*** *tab, then* ***Language***, *and add your language to the* ***Preferred Languages*** *list, and put it first in the* ***Preference Order*** *list. You can also add the language in the ***Required Languages*** to ONLY show streams in that language, but keep in mind that streams that might have no language tags at all or tagged as "multi" will not be shown.*
   * *If you want to take it a step further and totally prioritize your language, even before Quality and Resolution, then go to the* ***Sorting*** *tab, select* ***Cached*** *on the* ***Sort Order Type*** *dropdown menu, and on the* ***Order*** *section, move* ***Language*** *to the top or wherever you want to have it. Do this also for the* ***Uncached*** *sort order type.*
9. Go to the "**Save & Install**" tab, enter a password on the "**Create Configuration**" section, and click "**Create**".
   * **ALWAYS SAVE IN THIS TAB EVERY TIME YOU MAKE CHANGES LATER.**
   * *Copy and store the* ***UUID*** *that is shown and the* ***Password*** *you set for later to access the configuration again. This is basically your AIOStreams account.*
   * *If you can't save the configuration with the error "Jackettio requires a debrid service", which happens in case you are not using any debrids, then just uninstall Jackettio from the "Installed Addons" tab.*
   * *If you can't save the configuration with errors like "Jackettio/SeaDex/AnimeTosho requires a debrid service...", which happens in case you are not using any debrids, then just disable Jackettio, SeaDex, and AnimeTosho from the "Installed Addons" tab. If you watch Anime, the other scrapers might still find results, but SeaDex and AnimeTosho increase the chances. You do need a debrid service to use them though.*
10. Click "**Install**" and install the add-on on Stremio.

* ***NOTE FOR LATER:***
   * *If you see that you are getting results too slowly, try changing the fetching strategy. Go to* ***Addons***, *scroll down to* ***Addon Fetching Strategy***. *and select* ***Dynamic***. *There should already be an exit condition pre-filled, which you can leave as is, and save the configuration. However, keep in mind that this might leave out relevant results, so try it yourself. On the other hand, if you feel you're not getting enough good results, do the opposite and select* ***Default*** *instead.*
   * *If you prefer results for a language other than English, and you are not happy with the results you're getting, try disabling matching. Go to* ***Filters***, *then* ***Matching***, *and switch off the* ***Enable*** *toggle in all three sections (Title Matching, Year Matching, Season/Episode Matching).*

---

# 🔎 4. AIOMetadata [Metadata & Catalogs]

Select an **AIOMetdata** instance from [**this**](https://status.dinsden.top/status/stremio-addons) or [**this**](https://status.stremio-status.com/) link (they both show the same instances and their online status, it's just two different sources) and:

* ***WARNING**:*
   * *If you want to understand more what an instance means, go to [***🔰 Beginner Concepts***](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/0-Beginner-Concepts) on the extended guide.*
   * *[***Viren's***](https://aiometadata.viren070.me/) or [***Midnight's***](https://aiometadatafortheweebs.midnightignite.me/) are some of the most popular, so you can use these links directly, but almost all are viable options.*
   * ***Yeb's** and **Kuu's** are not working with Trakt currently because Trakt has imposed strict rate limits lately, so **DON'T** use these instances for now.*
   * *Choose one of the instances and stick with it, you will store your configuration here, and if you change to the other instance, you'll need to configure it again because it's not automatically transferred.*
   * *You can keep the monitoring links above for later to check the instance online status, if it happens that it's not working and might be temporarily down.*

1. Download my configuration file [**here**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata.json) (right-click, "*Save As*", and save it as `.json`, not `.txt`).
2. Go to the "**Configuration**" tab, click on "**Import Configuration**", and load my configuration file.
3. Go to the "**Integrations**" tab, and enter the API keys for Gemini, TMDB, TheTVDB, RPDB.
   * For **RPDB**, unless you have an account and a paid subscription with your own API key, you can also use the free standard API Key "*t0-free-rpdb*" directly.
4. Go to the "**Catalogs**" tab, and near the "Quick Add" button, you will see the **Trakt** icon. Click on it and follow the steps to connect your Trakt account.
   * ***NOTES***: 
      * *If you encounter any issues with Trakt integration on AIOMetadata, it's probably because Trakt is rate limiting the instance you're using, or the instance provider has disabled it (if it says "Instance owner has not yet set up the Trakt integration."). In that case, try to do the AIOMetadata setup with another instance.*
      * *Alternatively, you can leave Trakt integration disabled, and hide the Trakt catalogs on the list (marked with a red **Trakt** tag on the right) by clicking the green eye icon for each. I know it's not ideal since you created a Trakt account already, but there's nothing we can do about it. You can still add other catalogs from the other sources there.*
      * *There are also good alternatives to Trakt if you disable it, both for watch history tracking, and curated catalogs, which you can check out in [***🛠️ Additional Stuff***](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff) on the extended guide.*
   * *If you want some ready-to-use and well-maintained lists, while on the Trakt tab, search for the lists from user "snoak", and you will be able to import a lot of interesting lists. I have already included some of them in the catalog, but you can add more.*
   * **For Anime users**: *If you want to enable search for Anime, make sure to go to to the "Search" tab and enable both "Anime Search Engine" switches.*
   * **For other languages**: *If you want the metadata (descriptions, titles, etc.) to show in a different language than English, go to the "General" tab and change the "Display Language".*
5. **Optional**: At this point AIOMetadata is ready, but you can keep configuring it however you like, but otherwise the configuration I provided is ready to be used. On the "**Catalogs**" tab you can add, remove, enable, disable catalogs depending on your preferences.
6. Go to the "**Configuration**" tab again and click on "**Save Configuration**".
   * **ALWAYS SAVE IN THIS TAB EVERY TIME YOU MAKE CHANGES LATER.**
   * *Copy and store the* ***UUID*** *that is shown and the* ***Password*** *you set for later to access the configuration again. This is basically your AIOMetadata account.*
7. Click "**Install**" and install the add-on on Stremio.
   * *If you get a "AddonsPushedToAPI Max descriptor size reached" error when installing, you probably have too many catalogs on AIOMetadata. Disable some, save the configuration, and try to install it again.*

* ***NOTE FOR LATER:***
   * *Keep in mind that if you want to change catalogs after you have installed AIOMetadata on Stremio, you need to refresh the installation, otherwise the catalogs with not show. You do that with Cinebye below.*

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
4. Scroll down to "**Manage Addons**" and change the order of the add-ons to this:
   1. *Cinemeta*
   2. *AIOMetadata*
   3. *AIOStreams*
   4. *Local Files*
5. Scroll back up to "**3 - Sync Addons**" and click on "**Sync to Stremio**".

* ***Note:*** *Keep in mind for later that if you change catalog structure in AIOMetadata after you installed it on Stremio, or if you add the CouchMoney lists from Step 6 below, then come back to Cinebye, authenticate again with Stremio credentials, and click the* ***Refresh*** *icon to the right of AIOMetadata in the* ***"Manage Addons"*** *section.*

---

# 🤖 6. Personalized & Automated Lists

At this point you are done, YAY!, so you can start enjoying it already OR you can do one more step if you want proper custom lists that are specifically made for you (like Netflix suggestions). There are two approaches for this:

1. **Watchly** on the other hand is a full-blown recommendations addon that provides real Netflix-like suggestions, and multiple dynamic catalogs depending on what you watch and like. I would recommend this more if you want extensive suggestions, but these catalogs are only on Stremio, they are not Trakt lists, so in case you need the lists for some purpose outside Stremio, you can't.
2. **CouchMoney** creates personalized Trakt lists, which is a good basic setup, but since Trakt allows only 2 lists for free users, it might be limiting for some.

So you can decide which you want to use (or both!) and here are the steps for each:

* **Watchly**:
   1. Go to [**this**](https://watchly.elfhosted.com/) **Watchly** instance.
   2. Click on "**Get Started**".
   3. Login with your Stremio account email and password (recommended), OR click on "**Login with Stremio**", sign in to your Stremio account, and click "**Accept**" to allow Watchly to connect to your account (the second approach may expire in the future and you may need to log in again).
   4. You will then land on the Watchly "**Preferences**" page. Configure according to your personal preferences here.
   5. In the "**Poster Rating Provider**" section, select RPDB, and enter "*t0-free-rpdb*" in the API key field.
   6. Click on "**Next: Catalogs**" and configure catalogs here also according to your personal preferences.
   7. Click on "**Next: Install**" and click on "**Save & Install**".
   8. Click "**Install on Web**" and install the add-on on Stremio.
   * ***Notes:***
      * *If you want these Watchly catalogs to show on top (which you'll probably want), go to Cinebye again and change the order of the addons by putting Watchly second, after Cinemeta and before AIOMetadata.*
      * *If your Stremio account is new, it will not have a watch history yet, so you may get "Failed to fetch" or similar issues on the Watchly catalogs when showing on Stremio. Don't worry, they should show up properly once it has enough information to personalize your lists.*

* **CouchMoney**:
   1. Go to [**CouchMoney**](https://couchmoney.tv/) and click "**Login with Trakt**".
   2. Follow the steps to connect your Trakt account.
   3. CouchMoney will create two lists for you based on your Trakt watch history and ratings, which you can customize further if you want on this page.
   4. Go to your AIOMetadata account and sign in if needed (top right there's a sign in button) with your AIOMetadata credentials.
   5. Go to the "**Catalogs**" tab and click on the Trakt icon.
   6. You should already be connected to your Trakt account here, so scroll down to the "**Import Lists from Trakt User**" section.
   7. Search for your Trakt username (which you can set/check in your Trakt account settings).
   8. The lists created by CouchMoney should show up here.
   9. Add them to your Catalog and order them as you wish.
   * ***Note:*** *As mentioned above, when you change catalog structure in AIOMetadata, go back to Cinebye, authenticate again with Stremio credentials, and click the* ***Refresh*** *icon to the right of AIOMetadata in the* ***"Manage Addons"*** *section.*

And now you're really done! Check out the Q&A further down if you want to tweak it further.

---

# 🙏 Thanks

**Since a few of you have asked about tipping me for helping**: I prepared the guide because I did it so many times and I realized there are a lot of people that are not doing it just because they need to learn a lot of things in order to get a good working setup. I'm really happy that my guide has been so useful, I really wasn't expecting it to gain so much traction. So I created [**this**](https://ko-fi.com/luckynumb3rs) link where you can tip if you feel like doing so, but I'm very happy you can enjoy Stremio either way!

I hope you like my configuration, but of course you can modify it any way you want. I had to set it up for a few friends lately, so I got my process streamlined now and I though I would share it to maybe help anyone struggling with the many options for configuring the best stream platform in the world: **STREMIO**.

**A special thanks** to the Stremio developers, and all the add-on developers that allow us to enjoy these, it's amazing how this solution exists among all the fragmentation among subscription services which has become very annoying even if you have all the money in the world.

---

# 🛠️ Additional Stuff

If you want to understand how the streams are sorted in the configuration donwloaded here, or want to understand what all the icons on the stream information view mean, or want more colorful icons in there, go to [**🛠️ Additional Stuff**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/7-Additional-Stuff) on the extended guide.

---

# ❓ Configuration Q&A

If you followed this guide and are encountering issues or have configuration questions, go to [**❓ Configuration Q&A**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/8-Configuration-QA) on the extended guide. If you're just starting, remember this for later in case you need it. **PLEASE avoid asking questions that are already answered there**.

---

# 🔔 Updates

To do a regular update when a new version of the template for **AIOStreams** is announced/released on this guide (*you can check the version number on the title of the guide*), unless described otherwise in specific updates listed further down, you can simply load the template again by following the same steps on the AIOStreams setup, but here's a short summary again:
1. Sign in to your **AIOStreams** instance with your **UUID** and **Password**.
   * *Just to make sure in case you have an old template, go to **Filters** tab, then both in **Stream Expression** and **Regex** respectively, delete all entries configured there (with the red "trash can" button to the right).*
2. Go to the **Save & Install** tab, click "**Import**", "**Import Template**", paste the [**template link**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOStreams.json) and click on "**Go**".
3. Click "**Use this Template Now**".
5. On the "**Select Services**" page that is shown, enable the Debrid services you are already using (or click "*Skip*" if you don't use any), and click "**Next**".
6. On the "**Enter Credentials**" page, since you're loading the template over your existing configuration, all API keys needed should already be filled. Otherwise, enter any missing ones.
7. Click on "**Load Template**" and the template is loaded.
8. **IMPORTANT**: If you made any changes to the configuration after you loaded it when you did the setup for the first time, you may need to do them again (e.g. language changes such as subtitles and language preferences, any addon modifications, etc.).
9. Click on "**Save**" on the "**Save & Install**". No need to install the addon on Stremio again.

As for **AIOMetadata**, there's normally not as many changes as AIOStreams so you shouldn't need to perform any updates unless explicitly required, so here are the steps if needed:
1. Sign in to your **AIOMetadata** instance with your **UUID** and **Password**.
2. Go to the "**Configuration**" tab, click "**Import Configuration**", and load the downloaded [**configuration file**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata.json).
3. **IMPORTANT**: If you made any changes to the configuration after you loaded it when you did the setup for the first time, you may need to do them again (e.g. enabled/disabled/added/removed catalogs, changed any anime settings, etc.).
4. On the same "**Configration**" tab, click "**Save Configuration**".

>**SPECIFIC UPDATES** 
>1. Since the new version of AIOStreams was just released, with a few new features, I have updated and of course improved my ready-to-use AIOStreams template used in this guide. If you already set up AIOStreams through this guide before this announcement, I would definitely recommend to update to the new template. Instructions are at the end of this post. 
>2. Also, **VERY IMPORTANT**, for those of you that configured **AIOStreams** and/or **AIOMetadata** on the *ForTheWeak* instances (compare your links with these: [*aiostreamsfortheweak.nhyira.dev*](https://aiostreamsfortheweak.nhyira.dev/) and [*aiometadatafortheweak.nhyira.dev*](https://aiometadatafortheweak.nhyira.dev/)), coincidentally it was also announced [here](https://www.reddit.com/r/StremioAddons/comments/1r0jgzm/fortheweak_domain_migration/) that those instances are being migrated to a new domain, so you're going to have to migrate your AIOStreams & AIOMetadata configurations on the new instances since the ones you used will be closed after a transitory phase. Not to worry though, it's easy. Read below.
>* Go to [**🔔 Updates**](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/Updates) on the extended guide for more information.