---
layout: guide
title: "🔎 4. AIOMetadata [Metadata & Catalogs]"
---

# 🔎 4. AIOMetadata [Metadata & Catalogs]

**AIOMetadata** is the metadata and catalogs layer. It improves discovery by powering richer catalogs, search behavior, and integrations, so browsing titles in Stremio/Nuvio feels more complete and organized. The catalogs included in this setup, which you can enable/disable and modify as needed later, are as follows:
* **Default Catalogs**: 
   * **🎯 Trakt Recommendations**: Personalized recommendations coming directly from Trakt.
   * **🏆 Popular**: Most popular and recently released titles from TMDB.
   * **🔥 Trending**: Currently trending titles on TMDB.
   * **⭐ Top Rated**: Highest user-rated titles from TMDB.
   * **📚 TVDB**, ... (Disabled initially).
* **🎬 Streaming**: Titles grouped by streaming provider or platform source.
* **🎭 Genres**: Catalogs grouped by genre and content type.
* **🍥 Anime**: Anime-focused catalogs across different styles and themes (Partially disabled initially for *Stremio*).
* **🎨 Themes**: Collections built around moods, topics, and story patterns.
* **🏰 Studios**: Catalogs grouped by well-known studios or franchises (Disabled initially for *Stremio*).
* **🎥 Decades**: Titles grouped by release decade and era.
* **🕒 Runtime**: Titles filtered by length, from short watches to longer sessions.
* **🌍 World**: International titles grouped by country or language (Disabled initially for *Stremio*).

>**📢 NOTE**:
>If you already have an *AIOMetadata* setup and are only interested in the catalogs, you can use [**this**](../templates/AIOMetadata-Catalogs.json) file for *Stremio*, or [**here**](../templates/AIOMetadata-All-Catalogs.json) for *Nuvio*, which are catalog-only and can be imported directly in the *Catalogs* tab, avoiding the full *AIOMetadata* configuration.

Select an **AIOMetadata** instance from [**this**](https://uptime.ibbylabs.dev/aiometadata) or go directly to [**Viren's**](https://aiometadata.viren070.me/) or [**Midnight's**](https://aiometadatafortheweebs.midnightignite.me/) instance (two of the most popular ones) and:

>**WARNING:**
>* *If you want to understand more what an instance means, go to* [**🔰 Beginner Concepts**](0-Beginner-Concepts.md#what-does-an-addon-instance-mean).
>* *Choose one of the instances and stick with it, you will store your configuration here, and if you change to the other instance, you'll need to transfer your configuration because it's not automatically transferred.*
>* *You can keep the monitoring links above for later to check the instance online status, if it happens that it's not working and might be temporarily down.*

1. Download my configuration file [**here**](../templates/AIOMetadata.json) for *Stremio*, or [**here**](../templates/AIOMetadata-All.json) for *Nuvio* (right-click, "*Save As*", and save it as `.json`, not `.txt`).
   * *Both configurations contain the same catalogs, but on the Nuvio version, all are enabled already because Nuvio supports a higher amount per addon, whereas Stremio has a limit of around 120 catalogs, so some catalogs are initially disabled on its version, but you can enable them manually if you disable some others according to your preferences.*
2. Go to the "**Configuration**" tab, click on "**Import Configuration**", and load my configuration file.

   ![Import Configuration](images/4.2.png)

3. Go to the "**Integrations**" tab, and enter the API keys for Gemini, TMDB, TheTVDB, RPDB.
   * For **RPDB** enter "*t0-free-rpdb*".

   ![API Keys](images/4.3.png)

4. Go to the "**Catalogs**" tab, and near the "Quick Add" button, you will see the **Trakt** icon. Click on it and follow the steps to connect your Trakt account.

   ![Trakt Integration](images/4.4.png)

   * *If you want some ready-to-use and well-maintained lists, while on the Trakt tab, search for the lists from user "snoak", and you will be able to import a lot of interesting lists. I have already included some of them in the catalog, but you can add more.*
   * **For Anime users**: *If you want to enable search for Anime, make sure to go to to the "Search" tab and enable both "Anime Search Engine" switches.*

   ![Anime Search](images/4.4.2.png)

   * **For other languages**: *If you want the metadata (descriptions, titles, etc.) to show in a different language than English, go to the "General" tab and change the "Display Language".*

   ![Display Language](images/4.4.3.png)

   * **📢 NOTES**: 
      * *If you encounter any issues with Trakt integration on AIOMetadata, it's probably because Trakt is rate limiting the instance you're using, or the instance provider has disabled it (if it says "Instance owner has not yet set up the Trakt integration."). In that case, try to do the AIOMetadata setup with another instance.*
      * *Alternatively, you can leave Trakt integration disabled, and hide the Trakt catalogs on the list (marked with a red **Trakt** tag on the right) by clicking the green eye icon for each. I know it's not ideal since you created a Trakt account already, but there's nothing we can do about it. You can still add other catalogs from the other sources there.*
      * *There are also good alternatives to Trakt if you disable it, both for watch history tracking, and curated catalogs, which you can check out in [**🛠️ Additional Stuff**](7-Additional-Stuff.md#enriching-your-catalogs-trakt-alternatives).*

   ![Trakt Disable](images/4.4.1.png)


5. **Optional**: At this point AIOMetadata is ready, but you can keep configuring it however you like, but otherwise the configuration I provided is ready to be used. On the "**Catalogs**" tab you can add, remove, enable, disable catalogs depending on your preferences.
6. Go to the "**Configuration**" tab again and click on "**Save Configuration**".
   * **ALWAYS SAVE IN THIS TAB EVERY TIME YOU MAKE CHANGES LATER.**
   * *If you didn't want to get an API key for Gemini, go to the **Search** tab and disable **AI-Powered Search** to be able to save.*
   * *Copy and store the **UUID** that is shown and the **Password** you set for later to access the configuration again. This is basically your AIOMetadata account.*
7. **Installation**:
   * **🎞️ Stremio**: Click "**Install**" and install the addon on *Stremio Web* (recommended, but you can also install on Stremio app if you want, but make sure you're signed in to your Stremio account wherever you install it).
      * *If you get a "AddonsPushedToAPI Max descriptor size reached" error when installing, you probably have too many catalogs on AIOMetadata. Disable some, save the configuration, and try to install it again.*

         ![Install Addon](images/4.7.png)

   * **🚀 Nuvio**: Copy the *Manifest URL* shown when you click *Save* and proceed to [**🧹 5. Configuration**](5-Configuration.md#-nuvio) to install them.

>**📢 NOTES FOR LATER:**
>* *Keep in mind for later that if you change catalog structure in AIOMetadata after you installed it on Stremio, or if you add the CouchMoney lists from Step 6 below, then go to Cinebye, authenticate again with Stremio credentials, and click the **Refresh** icon to the right of AIOMetadata in the "**Manage Addons**" section.*
>![Refresh Addons](images/5.6.png)
