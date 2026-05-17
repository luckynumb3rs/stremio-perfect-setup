---
layout: guide
title: "🧹 5. Configuration [Install & Clean-Up]"
---

# 🧹 5. Configuration [Install & Clean-Up]

For *Stremio* proceed directly [below](#️-stremio), for *Nuvio* scroll further [down](#-nuvio).

## **🎞️ Stremio**

Cinebye is the addon order and patch management layer for Stremio. It lets you apply cleanup patches and control addon priority so AIOMetadata and AIOStreams are used in the right order.

Go to [**this**](https://cinebye.elfhosted.com/) **Cinebye** instance and:

1. Sign in with your Stremio account details.
   1. OR if you don't want to use your credentials directly, there is a more complicated approach:
   2. Login to [**Stremio Web**](https://web.stremio.com/) using your credentials in your browser.
   3. Open the developer console (F12 on Chrome) and paste this code snippet: `JSON.parse(localStorage.getItem("profile")).auth.key`
   4. Take the output value and paste it in Cinebye where it says "*Paste Stremio AuthKey here...*".
   5. Press **Enter** or click **Login**.

   ![Sign In](../images/5.1.png)

2. Once authenticated and the options become available, in section "**2 - Options**" you can download a backup first just to be safe.
3. Enable all three patches: "**Remove Cinemeta Search**", "**Remove Cinemeta Catalogs**", and "**Remove Cinemeta Metadata**".

   ![Enable Patches](../images/5.3.png)

4. Scroll down to "**Manage Addons**" and change the order of the addons to this:
   1. *Cinemeta*
   2. *AIOMetadata*
   3. *AIOStreams*
   4. *Local Files*

   ![Order Addons](../images/5.4.png)

5. Scroll back up to "**3 - Sync Addons**" and click on "**Sync to Stremio**".

   ![Sync Addons](../images/5.5.png)

>**📢 NOTES FOR LATER:**
>* *Keep in mind for later that if you change catalog structure in AIOMetadata after you installed it on Stremio, or if you add the CouchMoney lists from Step 6 below, then go to Cinebye, authenticate again with Stremio credentials, and click the **Refresh** icon to the right of AIOMetadata in the "**Manage Addons**" section.*
>![Refresh Addons](../images/5.6.png)


---
## **🚀 Nuvio**

1. **Install Addons**: Once you have the Manifest URLs ready, go back to Nuvio in your browser.
   1. Open [**nuvioapp.space**](https://nuvioapp.space/).
   2. Go to your **Account** section.
   3. If you have more than one profile, make sure the profile you want to configure is selected from the top header menu.
      * *This is important because addons and collections can be profile-specific. If you configure the wrong profile, you may open the app later and think nothing worked, even though you simply added everything to another profile.*
   4. Click on **Addons**.
   5. Remove any existing addons if you want a clean setup.
      * *This is optional, but recommended if you are starting fresh.*
      * *At the very least, I recommend removing **Cinemeta**, because the whole point of this setup is to let AIOMetadata handle metadata and catalogs instead.*
      * *If you already have addons you intentionally want to keep, then you can keep them, but for beginners a clean setup is usually easier to troubleshoot.*
   6. Click on **Add Addon**.
   7. Paste the first **Manifest URL** into the addon URL field.
   8. Leave the **Enabled** toggle selected.
   9. Leave the **Name** field empty.
      * *Nuvio should autofill the addon name automatically from the manifest, so you normally don't need to type anything here.*
   10. Press **Save**.
   11. Repeat the same process for each addon.
      * *Ideally, add them directly in this order:*
         1. **Watchly** *(optional)*
         2. **AIOMetadata**
         3. **AIOStreams**
   12. **For 🌐 HTTP Users**: Go [**here**](https://nuvio-plugin-library.vercel.app/) to choose the *Plugins* that are suitable for you and to learn how to install them on Nuvio.
      * *In addition to supporting Stremio addons, such as **AIOStreams** you installed above, which also includes HTTP sources that are properly filtered and formatted, Nuvio also supports **Plugins**, which can provide many additional HTTP sources. They don't go through AIOStreams unfortunately, so you won't get the optimized sources list like that addon does, but you would get additional stream sources. This is not necessary if you go for the **P2P** or **Debrid** configuration on AIOStreams above, but recommended for **HTTP** if you notice you are not getting enough streams from it.*

2. **Collections Pack**: Now let's add the collections pack with *Dynamic Backdrops*, as described in [**🚀 Nuvio**](Nuvio.md), that organizes the installed *AIOMetadata* catalogs together into the groups described in [**🔎 AIOMetadata**](4-AIOMetadata.md).
   1. Go to [**this**](https://nuvioapp.space/community-collections/nuvio-perfect-collections-incl-dynamic-backdrops-2) **Nuvio Collections Pack**.
   2. Click **Add Pack**.
   3. Make sure the correct profile is selected.
      * *Again, if you have more than one profile, double-check this. Otherwise you may install the pack on the wrong profile.*
   4. Under **Install Mode**, choose the option you prefer.
      * **Merge by matching IDs** is usually the safest option if you already have some collections and want to keep them.
      * **Replace profile collections** is probably the cleanest option if your Nuvio account is new and you do not have existing collections you care about.
      * *If you are starting fresh, I would suggest choosing **Replace profile collections**, because it gives you a cleaner result and avoids duplicate or messy rows.*
   5. Click **Add Pack**/**Merge Pack**/**Replace Profile**, depending on the mode you selected.
      * *The exact button name may change depending on the install mode.*

3. **App Settings**: Lastly, open the **Nuvio** app and adjust a few settings to make the setup behave properly.
   1. Open the **Addons** tab.
   2. Go to **Reorder home catalogs** and enable the **Follow addons order** toggle.
      * *This keeps the catalog order consistent with the order configured in the addons for them, avoiding any confusion.*
   3. Go to **Settings**.
   4. Go to the **Trakt** tab and follow the steps to integrate your Trakt account.
      * *This is recommended if you want watch history, progress, and recommendations to work better across the setup. If you do not use Trakt, you can skip this, but some personalization features may be less useful.*
   5. Go to **Layout** → **Detail Page**, and enable the **Prefer meta from external addon** toggle.
      * *This tells Nuvio to prefer the metadata coming from your external metadata addon, which in this setup is AIOMetadata.*
   6. Go to **Integrations**, then **TMDB**.
   7. Enable all toggles in the **TMDB** integration section.
      * *This helps Nuvio use all TMDB-related features across the interface.*
   8. Configure the rest of the settings however you like.
