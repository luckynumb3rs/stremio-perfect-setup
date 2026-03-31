---
layout: guide
title: "🔔 Updates"
---

# 🔔 Updates

## AIOStreams

To do a regular update when a new version of the template for **AIOStreams** is released on this guide (*you can check the version number on the title of the guide*), unless described otherwise in specific updates listed further down, you can simply import the template again on your current AIOStreams account (**UUID**).

Depending on the version of the template you used initially, to avoid any conflicting changes when updating, especially before v2.0 where I had not yet started to track the changes, I would suggest to reset your current configuration before importing the latest template. From v2.0, you can check the [**📜 Changelog**](Changelog.md) to see whether you'll need to reset, otherwise just import it on top of your configuration. Also, after you import a template v2.0 (or higher) once, next time there is an update to the template version, you will be notified automatically when logging in to your AIOStreams account and you can decide whether to apply it or not.

Here's a quick summary on how to update to the latest **AIOStreams** template manually:
1. Sign in to your **AIOStreams** instance with your **UUID** and **Password**.
2. **Optional**:  As mentioned above, if upgrading from a template before v2.0, I suggest to reset your configuration by going to the **Save & Install** tab, click "**Reset Configuration**", and confirm it by clicking "**Reset**".
3. On the **Save & Install** tab still, click "**Import**", then "**Import Template**", and paste the [**template link**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOStreams.json) and click on "**Go**".
4. Click "**Use this Template Now**".
5. On the "**Select Services**" page that is shown, enable the Debrid services you are already using and click "**Next**". If you're not using any services and want to proceed with the **P2P/HTTP** setup, click "**Skip**".
6. On the "**Template Options**" page, you'll be able to personalize the configuration to match your preferences, as described on the [**📚 3. AIOStreams**](3-AIOStreams-Setup.md) step.
7. On the "**Enter Credentials**" page, since you're loading the template over your existing configuration, all API keys needed should already be filled. Otherwise, enter any missing/new ones.
8. Click on "**Load Template**" and the template is loaded.
9. **IMPORTANT**: If you made any changes to the configuration after you loaded it when you did the setup for the first time, you may need to do them again (e.g. language changes such as subtitles and language preferences, any addon modifications, etc.).
10. Click on "**Save**" on the "**Save & Install**" tab. No need to install the addon on Stremio again.

## AIOMetadata

For **AIOMetadata**, there's normally not as many changes as AIOStreams so you shouldn't need to perform any updates unless explicitly required, so here are the steps if needed:
1. Sign in to your **AIOMetadata** instance with your **UUID** and **Password**.
2. Go to the "**Configuration**" tab, click "**Import Configuration**", and load the downloaded [**configuration file**](https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata.json).
3. **IMPORTANT**: If you made any changes to the configuration after you loaded it when you did the setup for the first time, you may need to do them again (e.g. enabled/disabled/added/removed catalogs, changed any anime settings, etc.).
4. On the same "**Configuration**" tab, click "**Save Configuration**". No need to install the addon on Stremio again.
5. Keep in mind that if you change catalog structure in AIOMetadata after you installed it on Stremio, you need to go to Cinebye, authenticate again with Stremio credentials, and click the **Refresh** icon to the right of AIOMetadata in the "**Manage Addons**" section.*

![Refresh Addons](../images/5.6.png)

## SPECIFIC UPDATES

>**IMPORTANT**: For those of you that configured **AIOStreams** and/or **AIOMetadata** on the *ForTheWeak* instances (compare your links with these: [*aiostreamsfortheweak.nhyira.dev*](https://aiostreamsfortheweak.nhyira.dev/) and [*aiometadatafortheweak.nhyira.dev*](https://aiometadatafortheweak.nhyira.dev/)), it was recently announced [here](https://www.reddit.com/r/StremioAddons/comments/1r0jgzm/fortheweak_domain_migration/) that those instances are being migrated to a new domain, so you're going to have to migrate your AIOStreams & AIOMetadata configurations on the new instances since the ones you used will be closed after a transitory phase. Not to worry though, it's easy. Read below.

1. For **AIOStreams**:
   1. Log in to [web.stremio.com](https://web.stremio.com).
   2. Go to "**Addons**" tab and uninstall the "**AIOStreams**" addon.
   3. Go to the [**new**](https://aiostreams.fortheweak.cloud/) instance.
   4. Sign in with the existing **UUID** and **Password** you got when you set up AIOStreams in the old instance (the accounts are migrated to the new domain, so you don't have to configure it again here).
   5. Go to the "**Save & Install**" tab again and click on "**Save**".
   6. Click "**Install**" which will appear and install the addon on Stremio.
2. For **AIOMetadata**:
   1. Log in to [web.stremio.com](https://web.stremio.com).
   2. Go to "**Addons**" tab and uninstall the "**AIOMetadata**" addon.
   3. Go to the [**new**](https://aiometadata.fortheweak.cloud/) instance.
   4. Sign in with the existing **UUID** and **Password** you got when you set up AIOMetadata in the old instance (the accounts are migrated to the new domain, so you don't have to configure it again here).
   5. Go to the "**Configuration**" tab again and click on "**Save Configuration**".
   6. Click "**Install**" which will appear and install the addon on Stremio.
   7. Go to the [**Cinebye**](https://cinebye.elfhosted.com/) instance, log in there with your Stremio account or with the AuthKey and reorder the addons again as described on the guide. You don't need to reapply the patches in section "**2 - Options**", just reorder the addons in the "**Manage Addons**" section, and "**Sync**".
