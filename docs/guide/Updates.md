---
layout: guide
title: "🔔 Updates"
---

# 🔔 Updates

## Regular Updates

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

## SPECIFIC UPDATES

> 1. Since the new version of AIOStreams was just released, with a few new features, I have updated and of course improved my ready-to-use AIOStreams template used in this guide. If you already set up AIOStreams through this guide before this announcement, I would definitely recommend to update to the new template. Instructions are at the end of this post. 
> 2. Also, **VERY IMPORTANT**, for those of you that configured **AIOStreams** and/or **AIOMetadata** on the *ForTheWeak* instances (compare your links with these: [*aiostreamsfortheweak.nhyira.dev*](https://aiostreamsfortheweak.nhyira.dev/) and [*aiometadatafortheweak.nhyira.dev*](https://aiometadatafortheweak.nhyira.dev/)), coincidentally it was also announced [here](https://www.reddit.com/r/StremioAddons/comments/1r0jgzm/fortheweak_domain_migration/) that those instances are being migrated to a new domain, so you're going to have to migrate your AIOStreams & AIOMetadata configurations on the new instances since the ones you used will be closed after a transitory phase. Not to worry though, it's easy. Read below.

1. The new AIOStreams release has many new features, which I'm not going to go into detail here, but I have updated my AIOStreams template that you can download from [here](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOStreams.json) to make use of these new goodies. In order to update your own configuration, you can create a new clean AIOStreams configuration this way:
   1. Log in to [www.stremio.com](https://www.stremio.com).
   2. Go to "**Addons**" tab and uninstall the "**AIOStreams**" addon.
   3. Repeat "**Step 3**" from the guide to configure AIOStreams again from scratch (if you used aiostreamsfortheweak.nhyira.dev for it, also see point 2 below) with the new template (already updated in same the link in the guide). Do not sign in to your existing AIOStreams configuration with your UUID and Password. Import the template as in the guide, enter your API keys again (Debrid, TMDB, TVDB, RPDB), and save with a password again. You will get a new UUID that will be used from now on (forget the old one), and then you can install the new AIOStreams in Stremio again. Basically the entire Step 3 in the guide from scratch. The rest remains as is, no need to do anything else.
2. As mentioned on the update at the beginning of the post, the *ForTheWeak* AIO instances are being migrated to a new domain, which means you will have to reinstall AIOStreams & AIOMetadata if you used aiostreamsfortheweak.nhyira.dev and/or aiometadatafortheweak.nhyira.dev when setting up. Not to worry though, it's pretty straightforward:
   1. For AIOStreams:
      * If you followed this guide before this announcement, which means you used the old AIOStreams template, then use the new template as described in point 1 above, but in the new instance (I have also updated the instance links in the guide, so use one of them).
   2. For AIOMetadata:
      1. Log in to [www.stremio.com](https://www.stremio.com).
      2. Go to "**Addons**" tab and uninstall the "**AIOMetadata**" addon.
      3. Go to the [**new**](https://aiometadata.fortheweak.cloud/) instance.
      4. Sign in with the existing **UUID** and **Password** you got when you set up AIOMetadata in the old instance (the accounts are migrated to the new domain, so you don't have to configure it again here).
      5. Go to the "**Configuration**" tab again and click on "**Save Configuration**".
      6. Click "**Install**" which will appear and install the add-on on Stremio.
      7. Go to the [**Cinebye**](https://cinebye.elfhosted.com/) instance, log in there with your Stremio account or with the AuthKey and reorder the addons again as described on the guide. You don't need to reapply the patches in section "**2 - Options**", just reorder the addons in the "**Manage Addons**" section, and "**Sync**".
