# 🔔 Updates

1. The new AIOStreams release has many new features, which I'm not going to go into detail here, but I have updated my AIOStreams template that you can download from [./templates/AIOStreams.json](./templates/AIOStreams.json) to make use of these new goodies. In order to update your own configuration, you can create a new clean AIOStreams configuration this way:
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