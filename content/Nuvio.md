# 🚀 [NUVIO FULL & EASY TOTAL BEGINNER'S GUIDE](https://numb3rs.stream/guide/Nuvio/)
**[⚡ DEBRID / 🧲 P2P / 🌐 HTTP]** (*WIP*)


![img](xggisjsbfh0h1 "Nuvio Perfect Setup (Collections)")

Since a few people asked about using my setup with **Nuvio**, and since my previous Nuvio collections post got removed by Reddit filters for whatever reason, I’m posting this again in a cleaner way.

I have now updated my popular [**🎬 Stremio/Nuvio Perfect Setup**](https://numb3rs.stream/) guide with instructions for *Nuvio* too, which is linked in the title above, or directly [**here**](https://numb3rs.stream/guide/Nuvio/). [**READ BEFORE ASKING QUESTIONS**]

**If this guide helps you, PLEASE UPVOTE this post so it remains relevant for others to find it and also benefit from it.** 😊

The new **Nuvio** guide explains how to use the same setup logic with Nuvio instead of Stremio, including how to install the addons through manifest URLs, configure the Nuvio app properly, and add the collection pack with dynamic backdrops. Nuvio is still in beta, so I marked the guide as a work in progress. Things may change, and I’ll update the page once Nuvio becomes more stable.

The guide uses the same core addon structure as my Stremio setup, but adapted for Nuvio:

* **AIOStreams** for finding streams
* **AIOMetadata** for metadata, catalogs, search, artwork, and integrations
* **Watchly** as an optional recommendation and personalized catalogs layer

# 🍿 Nuvio Perfect Collections (incl. Dynamic Backdrops)

One of the things I’m most excited about is my pack.

This collections pack is based the *AIOMetadata* catalogs included in the guide, which I have built from the ground up myself by using the *BYOC* option made possible through *TMDB Discover* catalog building filters on *AIOMetadata*, are as follows:

* **🔭 Discover**:
   * **🎯 Recommended**: Personalized recommendations coming directly from Trakt.
   * **🏆 Popular**: Most popular and recently released titles from TMDB.
   * **🔥 Trending**: Currently trending titles on TMDB.
   * **⭐ Top Rated**: Highest user-rated titles from TMDB.
* **🎬 Streaming**: Titles grouped by streaming provider or platform source.
* **🎭 Genres**: Catalogs grouped by genre and content type.
* **🍥 Anime**: Anime-focused catalogs across different styles and themes.
* **🎨 Themes**: Collections built around moods, topics, and story patterns.
* **🏰 Studios**: Catalogs grouped by well-known studios or franchises.
* **🎥 Decades**: Titles grouped by release decade and era.
* **🕒 Runtime**: Titles filtered by length, from short watches to longer sessions.
* **🌍 World**: International titles grouped by country or language.

The cool part is the **Dynamic Backdrops**: Something you would probably not notice at first glance, but what happens is that every month, the backdrops for all the catalogs included in my collections get regenerated with the most current titles the catalogs actually contain. This all happens automatically if you import my *AIOMetadata catalogs* and my *collections JSON* directly from my repo, as instructed further below, or you configure your collections to point to the image URLs from my repo, so that they get refreshed automatically. That's it!

# 🔗 Resources

Here are the main links:

* [**Full Guide**](https://numb3rs.stream/guide/Nuvio/) [**READ BEFORE ASKING QUESTIONS**]
* [**Collections Assets**](https://github.com/luckynumb3rs/stremio-perfect-setup/tree/main/collections)
* [**AIOMetadata Catalogs**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata-All-Catalogs.json) (*JSON*) [**Only catalogs** for existing setups, import into AIOMetadata *Catalogs* tab]
* [**AIOMetadata Full Configuration**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata-All.json) (*JSON*) [**Full** for new setups, import into AIOMetadata *Configuration* tab]
* [**Nuvio Community Collections Pack**](https://nuvioapp.space/community-collections/nuvio-perfect-collections-incl-dynamic-backdrops-2) [**Import directly** into Nuvio account]
* [**Nuvio Collections**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/collections/nuvio-collections.json) (*JSON*) [**Alternative** file for manual import]

Hope you like it. Enjoy!