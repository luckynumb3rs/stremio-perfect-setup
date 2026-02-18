# 🔎 4. AIOMetadata [Explore, Browse, and Search Movies/Shows]
----------------------------------

Go to [**this**](https://aiometadata.fortheweak.cloud/) or alternatively [**this**](https://aiometadata.viren070.me/) **AIOMetadata** instance and:

* *Choose one of the instances and stick with it, you will store your configuration here, and if you change to the other instance, you'll need to do it again because it's not automatically transferred*

1. Download my configuration file [**here**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata.json) (right-click, "*Save As*", and save it as `.json`, not `.txt`).
2. Go to the "**Configuration**" tab, click on "**Import Configuration**", and load my configuration file.

![Import Configuration](../images/4.2.png)

3. Go to the "**Integrations**" tab, and enter the API keys for Gemini, TMDB, TheTVDB, RPDB.
   * For **RPDB**, unless you have an account and a paid subscription with your own API key, you can also use the free standard API Key "*t0-free-rpdb*" directly.

![API Keys](../images/4.3.png)

4. Go to the "**Catalogs**" tab, and near the "Quick Add" button, you will see the **Trakt** icon. Click on it and follow the steps to connect your Trakt account.

![Trakt Integration](../images/4.4.png)

   * *If you want some ready-to-use and well-maintained lists, while on the Trakt tab, search for the lists from user "snoak", and you will be able to import a lot of interesting lists. I have already included some of them in the catalog, but you can add more.*
   * **For Anime users**: *If you want to enable search for Anime, make sure to go to to the "Search" tab and enable both "Anime Search Engine" switches.*

![Anime Search](../images/4.4.1.png)

   * **For other languages**: *If you want the metadata (descriptions, titles, etc.) to show in a different language than English, go to the "General" tab and change the "Display Language".*

![Display Language](../images/4.4.2.png)

5. **Optional**: At this point AIOMetadata is ready, but you can keep configuring it however you like, but otherwise the configuration I provided is ready to be used. On the "**Catalogs**" tab you can add, remove, enable, disable catalogs depending on your preferences.
6. Go to the "**Configuration**" tab again and click on "**Save Configuration**".
   * **ALWAYS SAVE IN THIS TAB EVERY TIME YOU MAKE CHANGES LATER.**
   * *Copy and store the* ***UUID*** *that is shown and the* ***Password*** *you set for later to access the configuration again. This is basically your AIOMetadata account.*
7. Click "**Install**" and install the add-on on Stremio.
   * *If you get a "AddonsPushedToAPI Max descriptor size reached" error when installing, you probably have too many catalogs on AIOMetadata. Disable some, save the configuration, and try to install it again.*

![Install Addon](../images/4.7.png)

* ***NOTE FOR LATER:***
   * *Keep in mind that if you want to change catalogs after you have installed AIOMetadata on Stremio, you need to refresh the installation, otherwise the catalogs with not show. You do that with Cinebye below.*

![Refresh Addons](../images/5.6.png)

----------------------------------

[← Previous [AIOStreams Setup]](3-AIOStreams-Setup.md)  |  [Next [Cinebye Cleanup] →](5-Cinebye-Cleanup.md)
