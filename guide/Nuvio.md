---
layout: guide
title: "🚀 Nuvio"
---

# 🚀 Nuvio

![Nuvio Collections](../../assets/images/screens/nuvio.webp)

**Nuvio** is a new alternative streaming platform that supports the same Stremio addon ecosystem, but is more feature-rich and offers many additional customization options. It has its own account, profiles, collections, layout settings, and app experience. As such, you can configure **AIOStreams**, **AIOMetadata**, and optionally **Watchly** like before, but instead of installing those addons on **Stremio**, you will copy their **Manifest URL** and install them directly on **Nuvio**.

>**WORK IN PROGRESS:**
>* *Nuvio is still in beta, so this page is currently a basic setup guide only.*
>* *A full and more detailed Nuvio guide is coming once Nuvio is out of beta and the installation flow is more stable across platforms.*
>* *For now, expect some parts to change, especially the app installation process, the available settings, and possibly how addon management works.*

If you are a beginner and want to set up **Nuvio** from scratch, start with [**📝 1. Accounts Preparation**](1-Accounts.md). If you already know what you're doing and only need the *assets* for the collections, check out the chapter below.

## 🍿 Nuvio Perfect Collections

If you don't want to follow the full setup above and only need the files, images, collections, or ready-made templates, this section is for you.

This includes:
   * title logos, 
   * cover and focused images, 
   * backdrop images, 
   * SVG files, 
   * and the pre-configured JSON files.

### Dynamic Backdrops

The collections also include **Dynamic Backdrops**, which are probably one of the coolest parts of this setup.

What this means is that the backdrop images for the included catalogs are not just static images that stay the same forever. Instead, they are regenerated regularly (currently once a month) based on the most current titles available inside the catalogs.

So, for example, if a streaming catalog, genre catalog, decade catalog, or theme catalog changes over time, the backdrop will also reflect its current titles automatically.

This works best if you use my **AIOMetadata Catalogs** catalogs and my **Nuvio Collections** directly from the repository, or if your own Nuvio collections point to the image URLs from my repo. This way, when the files are updated there, your setup can automatically benefit from the refreshed assets without you manually replacing images every time.

### Assets

Here are the main files and resources:

* [**Collections Assets**](https://github.com/luckynumb3rs/stremio-perfect-setup/tree/main/collections/)
   * This contains all collection assets, title logos, cover, focused, backdrops, SVG files, and related resources.
   * Use this if you want to browse, download, modify, or reuse individual assets.
* [**AIOMetadata Catalogs**](../templates/AIOMetadata-All-Catalogs.json) (*JSON*)
   * Use this if you already have your own AIOMetadata setup and only want to import the catalogs in the *Catalogs* tab.
   * This is useful if you don't want to overwrite your full AIOMetadata configuration.
* [**AIOMetadata Full Configuration**](../templates/AIOMetadata-All.json) (*JSON*)
   * Use this if you want the complete AIOMetadata configuration from this guide, import it in the *Configuration* tab.
   * This is the easiest option if you are starting fresh or want the closest match to the setup described here.
* [**Nuvio Community Collections Pack**](https://nuvioapp.space/community-collections/nuvio-perfect-collections-incl-dynamic-backdrops-2)
   * This is the easiest way to add the collections pack directly through Nuvio.
   * If you already followed the setup steps above, this is usually the simplest option.
* [**Nuvio Collections**](../templates/Nuvio-Collections.json) (*JSON*)
   * This is the pre-configured collections file for Nuvio, the same used in the community pack above.
   * You can import it manually into your Nuvio account, especially if you are using the matching AIOMetadata catalogs.

To give credit where it's due, I used [Tomato's Cover Pack](https://www.reddit.com/r/Nuvio/comments/1sk3ks6/transparent_covers_pack/) for the streaming services logos, and was inspired by user **bramstone**'s (from Discord) original script for generating the wonderful backdrops.
